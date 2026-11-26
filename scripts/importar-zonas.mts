// Descarga las zonas de aparcamiento regulado (azul, verde, naranja...) de los datos abiertos
// de Madrid, Barcelona y Valencia y las guarda en Supabase (tabla zonas_reguladas).
// Uso:
//   npm run importar-zonas                  (todas las ciudades)
//   npm run importar-zonas -- vlc bcn       (solo esas)
//   npm run importar-zonas -- --dry-run     (no escribe)
//   npm run importar-zonas -- ali --dry-run --json=ora.json   (guarda lo que importaría, para revisarlo)
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

// ---------- Alicante: tramos de los decretos del Ayuntamiento, dibujados sobre las calles de OpenStreetMap ----------
// El Ayuntamiento no publica un mapa de la ORA: las calles salen de sus decretos en el BOP ("calle X, desde Y
// hasta Z, lado par/impar") y de la relación oficial de calles del centro. Ver scripts/datos/ora-alicante.json.
type TramoOra = { calle: string; desde: string; hasta: string; lado: "par" | "impar"; tipo: "basica" | "media" | "naranja"; plazas: number | null; fuente: string };
type DatosOra = { fuentes: Record<string, { texto: string; url: string }>; tramos: TramoOra[]; callesCentro2006: string[] };
const ALI_TIPOS: Record<TramoOra["tipo"], [Tipo, string]> = { basica: ["rotacion", "azul"], media: ["larga", "azul"], naranja: ["mixta", "naranja"] };
const ALI_ZONA = "38.330,-0.505,38.372,-0.468"; // centro, Mercado y Carolinas
const ALI_CENTRO = { s: 38.336, n: 38.352, o: -0.5, e: -0.476 }; // ámbito de la relación de 2006
const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter"];

// Nombres de los decretos que no coinciden con ningún nombre de OSM (calles renombradas sin old_name).
// El resto se encuentra por name, name:es, alt_name:es u old_name (OSM guarda el castellano y los nombres antiguos).
const ALI_ALIAS: Record<string, string> = {
  "cardenal j. cisneros": "catedrático daniel jiménez de cisneros", "plaza del mar": "porta mar",
};
const NOMBRES_OSM = ["name", "name:es", "alt_name", "alt_name:es", "old_name", "old_name:es", "official_name"];
const VACIAS = new Set(["calle", "carrer", "avenida", "avinguda", "av", "avda", "plaza", "placa", "paseo", "passeig", "de", "del",
  "la", "el", "l", "d", "los", "las", "els", "dels", "y", "i", "en", "na", "c", "pl"]);
// Títulos que OSM puede añadir o quitar ("Poeta Quintana" / "Carrer del Poeta Quintana")
const TITULOS = new Set(["poeta", "pintor", "doctor", "dr", "general", "gral", "capitan", "padre", "arquitecto", "medico", "camarada",
  "cardenal", "maestro", "mestre", "musico", "benito", "jose", "josep", "san", "sant", "j"]);
const palabras = (s: string) => {
  const base = ALI_ALIAS[s.toLowerCase()] ?? s;
  return base.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’'.·-]/g, " ")
    .replace(/\bdr\b/g, "doctor").replace(/\bgral\b/g, "general")
    .split(/\s+/).filter((p) => p && !VACIAS.has(p));
};
/** ¿El nombre de OSM corresponde a la calle del decreto? (mismas palabras, salvo títulos) */
function mismaCalle(decreto: string, osm: string) {
  const d = palabras(decreto), o = palabras(osm);
  const clave = d.filter((p) => !TITULOS.has(p));
  return clave.length > 0 && clave.every((p) => o.includes(p)) && o.every((p) => d.includes(p) || TITULOS.has(p));
}

type Nodo = { lat: number; lon: number };
async function overpass(consulta: string) {
  for (let ronda = 0; ronda < 3; ronda++) for (const servidor of OVERPASS) {
    try {
      const res = await fetch(servidor, {
        method: "POST", headers: { ...UA, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ data: consulta }), signal: AbortSignal.timeout(180_000),
      });
      if (res.ok) return (await res.json()) as { elements: { type: string; id: number; lat?: number; lon?: number; nodes?: number[]; tags?: Record<string, string> }[] };
    } catch { /* se prueba el siguiente */ }
    await espera(20_000 * (ronda + 1));
  }
  throw new Error("OpenStreetMap (Overpass) no responde");
}

function metros(a: Nodo, b: Nodo) {
  const r = Math.PI / 180, x = (b.lon - a.lon) * r * Math.cos(((a.lat + b.lat) / 2) * r), y = (b.lat - a.lat) * r;
  return Math.sqrt(x * x + y * y) * 6_371_000;
}

async function alicante(marca: string): Promise<Fila[]> {
  const { readFileSync } = await import("node:fs");
  const datos = JSON.parse(readFileSync(new URL("./datos/ora-alicante.json", import.meta.url), "utf8")) as DatosOra;
  const osm = await overpass(`[out:json][timeout:150];way["highway"]["name"]["highway"!~"footway|path|cycleway|steps|pedestrian|service"](${ALI_ZONA});out body;>;out skel qt;`);
  const nodos = new Map<number, Nodo>();
  const vias: { nombres: string[]; nodos: number[] }[] = [];
  for (const e of osm.elements) {
    if (e.type === "node") nodos.set(e.id, { lat: e.lat!, lon: e.lon! });
    else if (e.type === "way" && e.nodes && e.tags?.name) {
      // official_name viene como "Carrer de X / Calle X"
      const nombres = NOMBRES_OSM.flatMap((k) => (e.tags![k] ?? "").split(" / ")).filter(Boolean);
      vias.push({ nombres, nodos: e.nodes });
    }
  }
  const viasDe = new Map<string, typeof vias>();
  const buscar = (calle: string) => {
    if (!viasDe.has(calle)) viasDe.set(calle, vias.filter((v) => v.nombres.some((n) => mismaCalle(calle, n))));
    return viasDe.get(calle)!;
  };

  /** Camino más corto por la calle entre su cruce con `desde` y su cruce con `hasta` (lista de nodos) */
  function tramo(calle: string, desde: string, hasta: string): number[] | null {
    const propias = buscar(calle);
    if (!propias.length) return null;
    const vecinos = new Map<number, number[]>();
    for (const v of propias) v.nodos.forEach((n, i) => {
      const l = vecinos.get(n) ?? [];
      if (i > 0) l.push(v.nodos[i - 1]);
      if (i < v.nodos.length - 1) l.push(v.nodos[i + 1]);
      vecinos.set(n, l);
    });
    const cruces = (otra: string) => {
      const suyos = new Set(buscar(otra).flatMap((v) => v.nodos));
      const exactos = [...vecinos.keys()].filter((n) => suyos.has(n));
      if (exactos.length) return exactos;
      // Sin nodo común (plaza, desfase, cruce por un paso peatonal): el punto más cercano, si está a menos de 60 m
      let mejor: [number, number] | null = null;
      for (const n of vecinos.keys()) for (const s of suyos) {
        const d = metros(nodos.get(n)!, nodos.get(s)!);
        if (d < 60 && (!mejor || d < mejor[1])) mejor = [n, d];
      }
      return mejor ? [mejor[0]] : [];
    };
    const inicios = cruces(desde), finales = new Set(cruces(hasta));
    if (!inicios.length || !finales.size) return null;
    // Dijkstra desde todos los cruces de inicio a la vez
    const dist = new Map<number, number>(), previo = new Map<number, number>();
    const pendientes = new Set(inicios);
    inicios.forEach((n) => dist.set(n, 0));
    while (pendientes.size) {
      let u = -1, du = Infinity;
      for (const n of pendientes) if (dist.get(n)! < du) { u = n; du = dist.get(n)!; }
      pendientes.delete(u);
      if (finales.has(u)) {
        const camino = [u];
        while (previo.has(camino[0])) camino.unshift(previo.get(camino[0])!);
        return du < 900 ? camino : null; // un tramo entre dos cruces no mide casi un kilómetro
      }
      for (const v of vecinos.get(u) ?? []) {
        const d = du + metros(nodos.get(u)!, nodos.get(v)!);
        if (d < (dist.get(v) ?? Infinity)) { dist.set(v, d); previo.set(v, u); pendientes.add(v); }
      }
    }
    return null;
  }

  const filas: Fila[] = [];
  const segmentos = (base: string, camino: number[], t: [Tipo, string], calle: string, plazas: number | null, fuente: string) => {
    for (let k = 1; k < camino.length; k++) {
      const a = nodos.get(camino[k - 1])!, b = nodos.get(camino[k])!;
      filas.push({ id: `${base}-${k}`, ciudad: "Alicante", tipo: t[0], color: t[1], calle, plazas, lat: a.lat, lon: a.lon,
        lat2: b.lat, lon2: b.lon, fuente, actualizado: marca });
    }
  };

  // 1) Tramos de los decretos: se juntan los dos lados de un tramo si son del mismo tipo
  const grupos = new Map<string, TramoOra[]>();
  for (const t of datos.tramos) {
    const k = [t.fuente, t.calle, ...[t.desde, t.hasta].sort()].join("|");
    grupos.set(k, [...(grupos.get(k) ?? []), t]);
  }
  const sinDibujar: string[] = [];
  let g = 0;
  for (const lados of grupos.values()) {
    g++;
    const t0 = lados[0];
    const camino = tramo(t0.calle, t0.desde, t0.hasta);
    if (!camino) { sinDibujar.push(`${t0.calle} (${t0.desde} – ${t0.hasta})`); continue; }
    const tipos = [...new Set(lados.map((l) => l.tipo))];
    const fuente = datos.fuentes[t0.fuente].texto;
    for (const tipo of tipos) {
      const suyos = lados.filter((l) => l.tipo === tipo);
      const lado = suyos.length > 1 ? "ambos lados" : suyos[0].lado === "par" ? "números pares" : "números impares";
      const plazas = suyos.some((l) => l.plazas != null) ? suyos.reduce((s, l) => s + (l.plazas ?? 0), 0) : null;
      // Si cada lado es de un tipo distinto, el id lleva el lado para dibujarlos uno junto al otro
      const sufijo = tipos.length > 1 ? (suyos[0].lado === "par" ? "~p" : "~i") : "";
      segmentos(`ali:${t0.fuente}:${g}${sufijo}`, camino, ALI_TIPOS[tipo], `${t0.calle} · de ${t0.desde} a ${t0.hasta} (${lado})`, plazas, fuente);
    }
  }

  // 2) Calles del centro de la relación de 2006 (sin tramos: la calle entera dentro del centro)
  const centro = (n: Nodo) => n.lat >= ALI_CENTRO.s && n.lat <= ALI_CENTRO.n && n.lon >= ALI_CENTRO.o && n.lon <= ALI_CENTRO.e;
  datos.callesCentro2006.forEach((calle, i) => {
    const propias = buscar(calle);
    if (!propias.length) return sinDibujar.push(calle);
    propias.forEach((v, j) => {
      const dentro = v.nodos.filter((n) => centro(nodos.get(n)!));
      if (dentro.length > 1) segmentos(`ali:2006:${i}-${j}`, dentro, ALI_TIPOS.basica, `${calle} (zona azul)`, null, datos.fuentes["2006"].texto);
    });
  });
  if (sinDibujar.length) console.log(`  Alicante: sin encontrar en el mapa (${sinDibujar.length}): ${sinDibujar.join("; ")}`);
  return filas;
}

const CIUDADES: Record<string, { nombre: string; importar: (marca: string) => Promise<Fila[]> }> = {
  mad: { nombre: "Madrid", importar: madrid },
  bcn: { nombre: "Barcelona", importar: barcelona },
  vlc: { nombre: "Valencia", importar: valencia },
  ali: { nombre: "Alicante", importar: alicante },
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
      const json = args.find((a) => a.startsWith("--json="))?.slice(7);
      if (json) (await import("node:fs")).writeFileSync(json.replace(".json", `-${codigo}.json`), JSON.stringify(filas));
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
