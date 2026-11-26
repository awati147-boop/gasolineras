// Vigila las fuentes oficiales de las tarifas (zona azul por ciudad y parkings) y avisa si cambian.
// Saca una «huella» de cada fuente: los importes (1,45 · 0,024187…) que aparecen cerca de palabras de
// aparcamiento. Si la huella cambia o la fuente deja de responder, hay que revisar la tarifa a mano.
// Nunca cambia precios por su cuenta.
// Uso:
//   npm run vigilar-tarifas                 (compara con scripts/datos/huellas-tarifas.json)
//   npm run vigilar-tarifas -- --guardar    (tras revisar: guarda las huellas actuales como buenas)
//   npm run vigilar-tarifas -- --informe=informe.md   (escribe el informe de cambios en un fichero)
// Necesita `pdftotext` (poppler-utils) para leer los PDF.
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { TARIFAS_ZONA_AZUL } from "../src/lib/tarifasZonaAzul.ts";
import { TARIFAS_PARKINGS } from "../src/lib/preciosParkings.ts";

const HUELLAS = new URL("./datos/huellas-tarifas.json", import.meta.url);
const UA = { "User-Agent": "Mozilla/5.0 (compatible; mevoy-vigilante-tarifas/1.0)" };
const ejecutar = promisify(execFile);
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Fuente = { url: string; nombre: string };
type Huella = { importes: string[]; revisado: string };

// Solo cuentan los importes cercanos a palabras de aparcamiento (los PDF de ordenanzas traen todos los impuestos)
const CLAVE = /estaciona|aparca|zona (azul|blava|verde|verda|naranja|roja)|parqu[ií]metro|\b(ORA|OTA|OLA|SER|SARE|ZEL|ESRO|AREA)\b|rotaci[oó]n|tique|ticket/i;
const IMPORTE = /\b\d{1,3},\d{2,6}\b/g;
const VENTANA = 40; // líneas alrededor de cada palabra clave

function fuentes(): Fuente[] {
  const todas = [
    ...TARIFAS_ZONA_AZUL.map((t) => ({ url: t.fuente, nombre: `Zona azul de ${t.ciudad}` })),
    ...TARIFAS_PARKINGS.map((t) => ({ url: t.fuente, nombre: t.nombre })),
  ];
  return [...new Map(todas.map((f) => [f.url, f])).values()];
}

async function texto(url: string): Promise<string> {
  let ultimo = "";
  for (let intento = 1; intento <= 3; intento++) {
    try {
      const res = await fetch(url, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(90_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bytes = Buffer.from(await res.arrayBuffer());
      if (bytes.subarray(0, 5).toString() === "%PDF-") {
        const dir = await mkdtemp(join(tmpdir(), "vigilar-"));
        try {
          await writeFile(join(dir, "f.pdf"), bytes);
          const { stdout } = await ejecutar("pdftotext", ["-layout", "-enc", "UTF-8", join(dir, "f.pdf"), "-"], { maxBuffer: 64 * 1024 * 1024 });
          return stdout;
        } finally {
          await rm(dir, { recursive: true, force: true });
        }
      }
      const tipo = res.headers.get("content-type") ?? "";
      const html = new TextDecoder(/iso-8859-1|latin1|windows-1252/i.test(tipo) ? "latin1" : "utf-8").decode(bytes);
      return html
        .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<(br|p|div|li|tr|h\d)[^>]*>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;|&#160;/g, " ")
        .replace(/&euro;/g, "€");
    } catch (e) {
      const causa = ((e as Error).cause as { code?: string } | undefined)?.code ?? "";
      // Webs municipales con la cadena de certificados incompleta: el navegador las abre, este script no.
      if (/CERT|SIGNATURE/.test(causa)) throw new Error(`certificado del servidor incompleto (${causa}): revisar a mano`);
      ultimo = (e as Error).message;
      await espera(5000 * intento);
    }
  }
  throw new Error(ultimo);
}

function huella(t: string): string[] {
  const lineas = t.split(/\r?\n/);
  const usar = new Set<number>();
  lineas.forEach((l, i) => {
    if (CLAVE.test(l)) for (let k = Math.max(0, i - VENTANA); k <= Math.min(lineas.length - 1, i + VENTANA); k++) usar.add(k);
  });
  const importes = new Set<string>();
  for (const i of usar) for (const m of lineas[i].matchAll(IMPORTE)) importes.add(m[0]);
  return [...importes].sort((a, b) => Number(a.replace(",", ".")) - Number(b.replace(",", ".")) || a.localeCompare(b));
}

async function main() {
  const args = process.argv.slice(2);
  const guardar = args.includes("--guardar");
  const informe = args.find((a) => a.startsWith("--informe="))?.slice(10);
  let previas: Record<string, Huella> = {};
  try {
    previas = JSON.parse(await readFile(HUELLAS, "utf8"));
  } catch { /* primera vez */ }

  const hoy = new Date().toISOString().slice(0, 10);
  const nuevas: Record<string, Huella> = {};
  const avisos: string[] = [];
  for (const f of fuentes()) {
    try {
      const h = huella(await texto(f.url));
      if (!h.length) throw new Error("no se encuentra ningún importe (¿ha cambiado la página?)");
      nuevas[f.url] = { importes: h, revisado: hoy };
      const antes = previas[f.url];
      if (!antes) {
        console.log(`· ${f.nombre}: nueva fuente (${h.length} importes)`);
        if (!guardar) avisos.push(`- **${f.nombre}**: fuente sin revisar todavía. ${f.url}`);
        continue;
      }
      const quitados = antes.importes.filter((x) => !h.includes(x));
      const puestos = h.filter((x) => !antes.importes.includes(x));
      if (quitados.length || puestos.length) {
        console.log(`✘ ${f.nombre}: CAMBIO (quitados ${quitados.join(" ") || "—"}; nuevos ${puestos.join(" ") || "—"})`);
        avisos.push(`- **${f.nombre}**: han cambiado los importes (antes ${antes.revisado}).` +
          ` Ya no están: ${quitados.join(" · ") || "—"}. Nuevos: ${puestos.join(" · ") || "—"}. ${f.url}`);
      } else console.log(`✔ ${f.nombre}: sin cambios`);
    } catch (e) {
      console.log(`✘ ${f.nombre}: NO RESPONDE (${(e as Error).message})`);
      avisos.push(`- **${f.nombre}**: la fuente no responde (${(e as Error).message}). ${f.url}`);
      if (previas[f.url]) nuevas[f.url] = previas[f.url]; // se conserva la última huella buena
    }
    await espera(1500); // sin prisas con las webs municipales
  }

  if (guardar) {
    await writeFile(HUELLAS, JSON.stringify(nuevas, null, 1) + "\n");
    console.log(`Huellas guardadas (${Object.keys(nuevas).length} fuentes).`);
  }
  if (avisos.length) {
    const md = `Revisar estas tarifas (precio orientativo de la app) y, si cambian, actualizar ` +
      `src/lib/tarifasZonaAzul.ts o src/lib/preciosParkings.ts; después \`npm run vigilar-tarifas -- --guardar\`.\n\n` +
      avisos.join("\n") + "\n";
    if (informe) await writeFile(informe, md);
    console.log(`\n${avisos.length} fuente(s) para revisar.`);
  } else console.log("\nTodo igual que en la última revisión.");
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
