// Descarga las zonas de aparcamiento regulado (azul, verde, naranja...) de los datos abiertos
// de Madrid, Barcelona y Valencia y las guarda en Supabase (tabla zonas_reguladas).
// Uso:
//   npm run importar-zonas                  (todas las ciudades)
//   npm run importar-zonas -- vlc bcn       (solo esas)
//   npm run importar-zonas -- --dry-run     (no escribe)
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type Tipo = "rotacion" | "mixta" | "residentes" | "larga" | "libre";
type Fila = {
  id: string; ciudad: string; tipo: Tipo; color: string; calle: string | null; plazas: number | null;
  lat: number; lon: number; lat2: number | null; lon2: number | null; fuente: string; actualizado: string;
};

const UA = { "User-Agent": "zonas-importador/1.0" };
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function descargar(url: string): Promise<Response> {
  for (let intento = 1; ; intento++) {
    try {
      const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(120_000) });
      if (res.ok) return res;
      if (intento >= 3) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      if (intento >= 3) throw e;
    }
    await espera(5000 * intento);
  }
}

/** CSV sencillo con comillas */
function leerCsv(texto: string, sep: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [], campo = "", comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') comillas = false;
      else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === sep) { fila.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      fila.push(campo); campo = "";
      if (fila.some((x) => x !== "")) filas.push(fila);
      fila = [];
    } else campo += c;
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila); }
  return filas;
}

/** UTM ETRS89 (≈WGS84) -> latitud/longitud */
function utmALatLon(x: number, y: number, huso: number): [number, number] {
  const a = 6378137, f = 1 / 298.257222101, k0 = 0.9996;
  const e2 = f * (2 - f), ep2 = e2 / (1 - e2);
  const m = y / k0;
  const mu = m / (a * (1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const p1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
    + (151 * e1 ** 3 / 96) * Math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
  const n1 = a / Math.sqrt(1 - e2 * Math.sin(p1) ** 2);
  const t1 = Math.tan(p1) ** 2, c1 = ep2 * Math.cos(p1) ** 2;
  const r1 = (a * (1 - e2)) / (1 - e2 * Math.sin(p1) ** 2) ** 1.5;
  const d = (x - 500000) / (n1 * k0);
  const lat = p1 - (n1 * Math.tan(p1) / r1) * (d ** 2 / 2 - (5 + 3 * t1 + 10 * c1 - 4 * c1 ** 2 - 9 * ep2) * d ** 4 / 24
    + (61 + 90 * t1 + 298 * c1 + 45 * t1 ** 2 - 252 * ep2 - 3 * c1 ** 2) * d ** 6 / 720);
  const lon = (d - (1 + 2 * t1 + c1) * d ** 3 / 6 + (5 - 2 * c1 + 28 * t1 - 3 * c1 ** 2 + 8 * ep2 + 24 * t1 ** 2) * d ** 5 / 120) / Math.cos(p1);
  return [(lat * 180) / Math.PI, ((huso - 1) * 6 - 180 + 3) + (lon * 180) / Math.PI];
}

const entero = (v: string | undefined) => {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) && n >= 0 && n < 10000 ? n : null;
};

// ---------- Madrid: SER, un punto por número de calle ----------
const MAD_TIPOS: Record<string, [Tipo, string]> = {
  azul: ["rotacion", "azul"], "alta rotación": ["rotacion", "azul"], rojo: ["rotacion", "roja"],
  verde: ["mixta", "verde"], naranja: ["larga", "naranja"],
};
async function madrid(marca: string): Promise<Fila[]> {
  // El nombre del fichero cambia con cada actualización: se busca el CSV más reciente en el catálogo
  const cat = (await (await descargar("https://datos.madrid.es/api/3/action/package_show?id=218228-0-ser-calles")).json()) as {
    result: { resources: { format: string; description: string; url: string }[] };
  };
  const csvs = cat.result.resources.filter((r) => r.format === "CSV");
  const anio = (r: { description: string }) => Number(r.description.match(/(20\d\d)/)?.[1] ?? 0);
  const ultimo = csvs.sort((a, b) => anio(b) - anio(a))[0];
  if (!ultimo) throw new Error("no se encuentra el CSV del SER");
  const texto = new TextDecoder("latin1").decode(await (await descargar(ultimo.url)).arrayBuffer());
  const [cab, ...datos] = leerCsv(texto, ";");
  const col = (n: string) => cab.indexOf(n);
  const [cx, cy, cCalle, cNum, cColor, cPlazas] = ["gis_x", "gis_y", "calle", "numero_finca", "color", "numero_plazas"].map(col);
  const filas: Fila[] = [];
  datos.forEach((f, i) => {
    const color = f[cColor]?.replace(/^\d+\s*/, "").trim().toLowerCase();
    const t = MAD_TIPOS[color];
    const x = Number(f[cx]), y = Number(f[cy]);
    if (!t || !x || !y) return;
    const [lat, lon] = utmALatLon(x, y, 30);
    // "AGUAS, CALLE, DE LAS" -> "Calle de las Aguas"
    const [nombre, via, art] = (f[cCalle] ?? "").split(",").map((s) => s.trim());
    const calle = [via, art, nombre].filter(Boolean).join(" ").toLowerCase().replace(/(^|\s)\p{L}/gu, (s) => s.toUpperCase());
    filas.push({
      id: `mad:${i}`, ciudad: "Madrid", tipo: t[0], color: t[1],
      calle: calle ? `${calle}${f[cNum] ? ", " + f[cNum] : ""}` : null, plazas: entero(f[cPlazas]),
      lat, lon, lat2: null, lon2: null, fuente: "Ayuntamiento de Madrid (datos.madrid.es)", actualizado: marca,
    });
  });
  return filas;
}

// ---------- Barcelona: tramos (línea de inicio a fin) ----------
const BCN_TIPOS: Record<string, [Tipo, string]> = {
  AZL: ["rotacion", "azul"], VM: ["mixta", "verde"], VR: ["residentes", "verde"],
};
async function barcelona(marca: string): Promise<Fila[]> {
  const url = "https://opendata-ajuntament.barcelona.cat/data/dataset/40743bb8-e4e0-457f-aa15-87007a0bdb6a/resource/26f6ecdd-b0ac-46c4-84f0-a312640913ca/download";
  const texto = (await (await descargar(url)).text()).replace(/^﻿/, "");
  const [cab, ...datos] = leerCsv(texto, ",");
  const c = (n: string) => cab.indexOf(n);
  const filas: Fila[] = [];
  const vistos = new Map<string, number>(); // el fichero repite algunos ID_TRAM
  for (const f of datos) {
    const t = BCN_TIPOS[f[c("TIPUS_TRAM")]];
    const lat = Number(f[c("LATITUD_I")]), lon = Number(f[c("LONGITUD_I")]);
    if (!t || !lat || !lon) continue;
    const calle = (f[c("ADREÇA")] ?? "").replace(/\s*,\s*C\s*$/i, "").trim().toLowerCase().replace(/(^|\s)\p{L}/gu, (s) => s.toUpperCase());
    const idTram = f[c("ID_TRAM")];
    const n = vistos.get(idTram) ?? 0;
    vistos.set(idTram, n + 1);
    filas.push({
      id: n ? `bcn:${idTram}-${n}` : `bcn:${idTram}`, ciudad: "Barcelona", tipo: t[0], color: t[1], calle: calle || null,
      plazas: entero(f[c("PLACES")]), lat, lon,
      lat2: Number(f[c("LATITUD_F")]) || null, lon2: Number(f[c("LONGITUD_F")]) || null,
      fuente: "Ajuntament de Barcelona, B:SM (CC BY 4.0)", actualizado: marca,
    });
  }
  return filas;
}

// ---------- Valencia: cada plaza dibujada (se guarda su centro) ----------
const VLC_TIPOS: Record<string, [Tipo, string]> = {
  Azul: ["rotacion", "azul"], Naranja: ["mixta", "naranja"], Verde: ["residentes", "verde"], Blanco: ["libre", "blanca"],
};
async function valencia(marca: string): Promise<Fila[]> {
  const base = "https://geoportal.valencia.es/server/rest/services/OPENDATA/Trafico/MapServer/205/query";
  const filas: Fila[] = [];
  for (let desde = 0; ; desde += 2000) {
    const url = `${base}?where=1%3D1&outFields=color,objectid&orderByFields=objectid&resultOffset=${desde}&resultRecordCount=2000&outSR=4326&f=geojson`;
    const g = (await (await descargar(url)).json()) as {
      features: { geometry: { type: string; coordinates: number[][] } | null; properties: { color: string; objectid: number } }[];
    };
    for (const f of g.features) {
      const t = VLC_TIPOS[f.properties.color];
      const pts = f.geometry?.coordinates;
      if (!t || !pts?.length) continue;
      const usar = pts.length > 2 ? pts.slice(0, -1) : pts; // el contorno se cierra repitiendo el primer punto
      const lon = usar.reduce((s, p) => s + p[0], 0) / usar.length;
      const lat = usar.reduce((s, p) => s + p[1], 0) / usar.length;
      filas.push({
        id: `vlc:${f.properties.objectid}`, ciudad: "Valencia", tipo: t[0], color: t[1], calle: null, plazas: 1,
        lat, lon, lat2: null, lon2: null, fuente: "Ajuntament de València, Geoportal (CC BY 4.0)", actualizado: marca,
      });
    }
    if (g.features.length < 2000) break;
    await espera(500);
  }
  return filas;
}

const CIUDADES: Record<string, { nombre: string; importar: (marca: string) => Promise<Fila[]> }> = {
  mad: { nombre: "Madrid", importar: madrid },
  bcn: { nombre: "Barcelona", importar: barcelona },
  vlc: { nombre: "Valencia", importar: valencia },
};

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const pedidas = args.filter((a) => !a.startsWith("--")).map((a) => a.toLowerCase());
  const codigos = pedidas.length ? pedidas : Object.keys(CIUDADES);
  const malas = codigos.filter((c) => !CIUDADES[c]);
  if (malas.length) throw new Error(`Ciudades desconocidas: ${malas.join(", ")} (usa: ${Object.keys(CIUDADES).join(", ")})`);

  let db: SupabaseClient | null = null;
  if (!dryRun) {
    const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    db = createClient(url, key, { auth: { persistSession: false } });
  }

  const fallidas: string[] = [];
  for (const codigo of codigos) {
    const { nombre, importar } = CIUDADES[codigo];
    const marca = new Date().toISOString();
    try {
      const filas = await importar(marca);
      if (filas.length < 100) throw new Error(`solo ${filas.length} filas: algo ha cambiado en la fuente`);
      const resumen: Record<string, number> = {};
      filas.forEach((f) => (resumen[`${f.tipo}/${f.color}`] = (resumen[`${f.tipo}/${f.color}`] ?? 0) + 1));
      console.log(`${nombre}: ${filas.length} tramos`, resumen);
      if (!db) continue;
      for (let i = 0; i < filas.length; i += 1000) {
        const { error } = await db.from("zonas_reguladas").upsert(filas.slice(i, i + 1000), { onConflict: "id" });
        if (error) throw new Error(`guardar: ${error.message}`);
      }
      // Lo de esta ciudad que no se ha vuelto a descargar ya no existe
      const { error, count } = await db.from("zonas_reguladas").delete({ count: "exact" })
        .eq("ciudad", nombre).lt("actualizado", marca);
      if (error) throw new Error(`limpieza: ${error.message}`);
      if (count) console.log(`  ${count} tramos antiguos borrados`);
    } catch (e) {
      fallidas.push(nombre);
      console.log(`${nombre}: ERROR ${(e as Error).message} (se conservan los datos anteriores)`);
    }
  }
  if (dryRun) console.log("--dry-run: no se ha escrito nada en Supabase.");
  if (fallidas.length) process.exit(1);
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
