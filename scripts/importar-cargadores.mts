// Descarga los puntos de recarga de coche eléctrico (datos oficiales del MITECO publicados por la DGT en el
// Punto de Acceso Nacional, formato DATEX II) y los guarda en Supabase.
// Uso:
//   npm run importar-cargadores                         (descarga y guarda)
//   npm run importar-cargadores -- --dry-run            (descarga y comprueba, sin escribir)
//   npm run importar-cargadores -- --archivo=ruta.xml   (usa un archivo ya descargado)
// Si la descarga falla, no se toca nada: la web sigue mostrando el último dato guardado con su fecha.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const URL_DATOS = "https://nap.dgt.es/datex2/v3/miterd/EnergyInfrastructureTablePublication/electrolineras.xml";
const MINIMO_SITIOS = 5000; // si llegan muchos menos, el archivo está mal: no se borra nada

type Conector = { t: string; kw: number; n: number };
type Fila = {
  id: string; nombre: string | null; operador: string | null; direccion: string | null; municipio: string | null;
  provincia: string | null; cp: string | null; horario: string | null; lat: number; lon: number; puntos: number;
  potencia_kw: number; conectores: Conector[]; tipos: string[]; pago: string[]; actualizado: string | null; visto: string;
};

// Tipos de conector de DATEX II → nombre corto
const TIPO: Record<string, string> = {
  iec62196T2COMBO: "ccs", iec62196T2: "tipo2", chademo: "chademo", iec62196T1: "tipo1", iec62196T1COMBO: "ccs",
  domesticA: "schuko", domesticE: "schuko", domesticF: "schuko", domesticL: "schuko",
};
const PAGO: Record<string, string> = { rfid: "rfid", apps: "apps", debitCard: "tarjeta", creditCard: "tarjeta", nfc: "nfc", pinpad: "tarjeta" };

const texto = (s: string | undefined) =>
  s === undefined ? null : s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&")
    .replace(/\s+/g, " ").trim() || null;
const uno = (bloque: string, re: RegExp) => texto(bloque.match(re)?.[1]);
const linea = (bloque: string, etiqueta: string) => uno(bloque, new RegExp(`<com:value[^>]*>${etiqueta}: ([^<]*)</com:value>`));

const DIAS = ["Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado", "Domingo"];
const CORTOS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/** "Jueves (08:30 - 20:00) Lunes (00:00 - 23:59) …" → "Lun 24 h · Mar–Sáb 08:30–20:00 · Dom 24 h" */
export function horarioLegible(crudo: string | null) {
  if (!crudo) return null;
  const tramos = DIAS.map((d) => {
    const m = crudo.match(new RegExp(`${d} \\((\\d{2}:\\d{2}) - (\\d{2}:\\d{2})\\)`));
    if (!m) return null;
    return m[1] === "00:00" && (m[2] === "23:59" || m[2] === "24:00") ? "24 h" : `${m[1]}–${m[2]}`;
  });
  if (tramos.every((t) => t === null)) return crudo; // formato desconocido: tal cual
  if (tramos.every((t) => t === "24 h")) return "24 h, todos los días";
  const partes: string[] = [];
  for (let i = 0; i < 7; ) {
    let j = i;
    while (j + 1 < 7 && tramos[j + 1] === tramos[i]) j++;
    if (tramos[i]) partes.push(`${i === j ? CORTOS[i] : `${CORTOS[i]}–${CORTOS[j]}`} ${tramos[i]}`);
    i = j + 1;
  }
  return partes.join(" · ") || null;
}

/** Convierte el XML en filas (una por electrolinera) */
export function aFilas(xml: string, visto: string) {
  const filas: Fila[] = [];
  let descartados = 0;
  for (const bloque of xml.split("<egi:energyInfrastructureSite ").slice(1)) {
    const id = bloque.match(/^id="([^"]+)"/)?.[1];
    const lat = Number(bloque.match(/<loc:latitude>([^<]+)/)?.[1]);
    const lon = Number(bloque.match(/<loc:longitude>([^<]+)/)?.[1]);
    if (!id || !(lat >= 27 && lat <= 44.5) || !(lon >= -19 && lon <= 5)) {
      descartados++;
      continue;
    }
    // Conectores agrupados por tipo y potencia ("CCS 150 kW × 2")
    const grupos = new Map<string, Conector>();
    for (const c of bloque.matchAll(/<egi:connector>([\s\S]*?)<\/egi:connector>/g)) {
      const t = TIPO[c[1].match(/<egi:connectorType>([^<]+)/)?.[1] ?? ""] ?? "otros";
      const kw = Math.round((Number(c[1].match(/<egi:maxPowerAtSocket>([^<]+)/)?.[1]) || 0) / 100) / 10; // W → kW con 1 decimal
      const clave = `${t}|${kw}`;
      const g = grupos.get(clave);
      if (g) g.n++;
      else grupos.set(clave, { t, kw, n: 1 });
    }
    const conectores = [...grupos.values()].sort((a, b) => b.kw - a.kw || b.n - a.n);
    const nombre = uno(bloque, /<fac:name>\s*<com:values>\s*<com:value[^>]*>([^<]*)<\/com:value>/);
    const operador = uno(bloque, /<fac:operator[\s\S]*?<com:value[^>]*>([^<]*)<\/com:value>/);
    filas.push({
      id, nombre, operador,
      direccion: linea(bloque, "Dirección"),
      municipio: linea(bloque, "Municipio"),
      provincia: linea(bloque, "Provincia"),
      cp: uno(bloque, /<locx:postcode>([^<]*)/)?.replace(/^(\d{4})$/, "0$1") ?? null, // 3006 → 03006
      horario: horarioLegible(uno(bloque, /<fac:label>([^<]*)<\/fac:label>/)),
      lat, lon,
      puntos: (bloque.match(/<egi:refillPoint /g) ?? []).length,
      potencia_kw: conectores[0]?.kw ?? 0,
      conectores,
      tipos: [...new Set(conectores.map((c) => c.t))],
      pago: [...new Set([...bloque.matchAll(/<egi:authenticationAndIdentificationMethods>([^<]+)/g)].map((m) => PAGO[m[1]] ?? "otros"))],
      actualizado: uno(bloque, /<fac:lastUpdated>([^<]*)/),
      visto,
    });
  }
  return { filas, descartados, publicado: uno(xml.slice(0, 5000), /<com:publicationTime>([^<]*)/) };
}

async function descargar() {
  for (let intento = 1; intento <= 3; intento++) {
    try {
      const res = await fetch(URL_DATOS, { headers: { "User-Agent": "Mozilla/5.0 (importador de datos abiertos)" }, signal: AbortSignal.timeout(180_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const xml = await res.text();
      if (!xml.includes("energyInfrastructureSite")) throw new Error("respuesta sin electrolineras");
      return xml;
    } catch (e) {
      console.log(`Descarga, intento ${intento}: ${(e as Error).message}`);
      if (intento < 3) await new Promise((r) => setTimeout(r, 30_000));
    }
  }
  throw new Error("No se ha podido descargar el archivo oficial. Se mantienen los datos anteriores.");
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const archivo = args.find((a) => a.startsWith("--archivo="))?.slice("--archivo=".length);

  const xml = archivo ? readFileSync(archivo, "utf8") : await descargar();
  const visto = new Date().toISOString();
  const { filas, descartados, publicado } = aFilas(xml, visto);
  const rapidas = filas.filter((f) => f.potencia_kw >= 50).length;
  console.log(`Electrolineras: ${filas.length} (${rapidas} rápidas de 50 kW o más; ${descartados} descartadas sin coordenadas válidas). Publicado: ${publicado}`);
  if (filas.length < MINIMO_SITIOS) throw new Error(`Solo ${filas.length} electrolineras: el archivo parece incompleto. No se guarda nada.`);
  if (dryRun) {
    console.log("Ejemplo:", JSON.stringify(filas.find((f) => f.provincia?.startsWith("Alicante")) ?? filas[0]));
    return console.log("--dry-run: no se ha escrito nada en Supabase.");
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  const db = createClient(url, key, { auth: { persistSession: false } });

  for (let i = 0; i < filas.length; i += 1000) {
    const { error } = await db.from("cargadores").upsert(filas.slice(i, i + 1000), { onConflict: "id" });
    if (error) throw new Error(`guardar: ${error.message}`);
  }
  // Las que ya no están en el archivo oficial se borran (el archivo trae todas las de España)
  const { error: e2, count } = await db.from("cargadores").delete({ count: "exact" }).lt("visto", visto);
  if (e2) throw new Error(`limpieza: ${e2.message}`);
  const { error: e3 } = await db.from("cargadores_importaciones").insert({ fecha_datos: publicado ?? visto, total: filas.length });
  if (e3) throw new Error(`registro: ${e3.message}`);
  console.log(`Guardado en Supabase ✔ (${count ?? 0} que ya no existen, borradas)`);
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
