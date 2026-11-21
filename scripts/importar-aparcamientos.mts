// Descarga parkings y parquímetros de OpenStreetMap (Overpass API) por provincias y los guarda en Supabase.
// Uso:
//   npm run importar-aparcamientos                 (las 52 provincias, ~30-60 min)
//   npm run importar-aparcamientos -- A V MU       (solo esas provincias, por código ISO sin "ES-")
//   npm run importar-aparcamientos -- A --dry-run  (no escribe)
// Datos © colaboradores de OpenStreetMap (ODbL).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Servidores Overpass (si uno está saturado se prueba el siguiente)
const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

// Códigos ISO 3166-2 de las 50 provincias + Ceuta y Melilla
const PROVINCIAS: Record<string, string> = {
  C: "A Coruña", VI: "Álava", AB: "Albacete", A: "Alicante", AL: "Almería", O: "Asturias", AV: "Ávila",
  BA: "Badajoz", PM: "Baleares", B: "Barcelona", BI: "Bizkaia", BU: "Burgos", CC: "Cáceres", CA: "Cádiz",
  S: "Cantabria", CS: "Castellón", CR: "Ciudad Real", CO: "Córdoba", CU: "Cuenca", SS: "Gipuzkoa",
  GI: "Girona", GR: "Granada", GU: "Guadalajara", H: "Huelva", HU: "Huesca", J: "Jaén", LO: "La Rioja",
  GC: "Las Palmas", LE: "León", L: "Lleida", LU: "Lugo", M: "Madrid", MA: "Málaga", MU: "Murcia",
  NA: "Navarra", OR: "Ourense", P: "Palencia", PO: "Pontevedra", SA: "Salamanca", TF: "Santa Cruz de Tenerife",
  SG: "Segovia", SE: "Sevilla", SO: "Soria", T: "Tarragona", TE: "Teruel", TO: "Toledo", V: "Valencia",
  VA: "Valladolid", ZA: "Zamora", Z: "Zaragoza", CE: "Ceuta", ML: "Melilla",
};
const PAUSA_ENTRE_PROVINCIAS_MS = 10_000; // ser amables con el servidor gratuito de OSM

type Elemento = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

type Fila = {
  id: string; clase: "parking" | "parquimetro"; nombre: string | null; tipo: string | null; acceso: string | null;
  de_pago: boolean | null; plazas: number | null; plazas_pmr: number | null; horario: string | null;
  operador: string | null; precio: string | null; lat: number; lon: number; fuente: string; actualizado: string;
};

const entero = (v?: string) => {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) && n >= 0 && n < 100000 ? n : null;
};

const TIPOS: Record<string, string> = {
  surface: "superficie",
  underground: "subterraneo",
  "multi-storey": "varias_plantas",
  rooftop: "azotea",
  street_side: "calle",
  lane: "calle",
  on_street: "calle",
};
const NO_PUBLICO = ["private", "no", "permit", "employees", "delivery"];
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function descargar(consulta: string): Promise<Elemento[]> {
  for (const servidor of OVERPASS) {
    for (let intento = 1; intento <= 2; intento++) {
      try {
        const res = await fetch(servidor, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "aparcamientos-importador/1.0" },
          body: new URLSearchParams({ data: consulta }),
          signal: AbortSignal.timeout(300_000),
        });
        if (res.ok) return ((await res.json()) as { elements: Elemento[] }).elements;
        console.log(`    ${new URL(servidor).host} respondió ${res.status} (intento ${intento})`);
      } catch (e) {
        console.log(`    ${new URL(servidor).host} falló: ${(e as Error).message} (intento ${intento})`);
      }
      await espera(20_000);
    }
  }
  throw new Error("ningún servidor de OpenStreetMap ha respondido");
}

/** Convierte los elementos de OSM en filas para la tabla (descarta los privados) */
function aFilas(elementos: Elemento[], marca: string) {
  const filas: Fila[] = [];
  let privados = 0;
  for (const el of elementos) {
    const t = el.tags ?? {};
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null) continue;
    const esParquimetro = t.vending === "parking_tickets";
    if (!esParquimetro && NO_PUBLICO.includes(t.access ?? "")) {
      privados++;
      continue;
    }
    filas.push({
      id: `osm:${el.type}/${el.id}`,
      clase: esParquimetro ? "parquimetro" : "parking",
      nombre: t.name ?? null,
      tipo: esParquimetro ? null : (TIPOS[t.parking ?? ""] ?? t.parking ?? null),
      acceso: esParquimetro ? null : t.access === "customers" ? "clientes" : "publico",
      de_pago: esParquimetro ? true : t.fee === "yes" ? true : t.fee === "no" ? false : null,
      plazas: entero(t.capacity),
      plazas_pmr: entero(t["capacity:disabled"]),
      horario: t.opening_hours ?? null,
      operador: t.operator ?? null,
      precio: t.charge ?? null,
      lat,
      lon,
      fuente: "osm",
      actualizado: marca,
    });
  }
  return { filas, privados };
}

async function guardar(db: SupabaseClient, filas: Fila[]) {
  for (let i = 0; i < filas.length; i += 1000) {
    const { error } = await db.from("aparcamientos").upsert(filas.slice(i, i + 1000), { onConflict: "id" });
    if (error) throw new Error(`guardar: ${error.message}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const pedidas = args.filter((a) => !a.startsWith("--")).map((a) => a.toUpperCase());
  const desconocidas = pedidas.filter((c) => !PROVINCIAS[c]);
  if (desconocidas.length) throw new Error(`Códigos de provincia desconocidos: ${desconocidas.join(", ")}`);
  const codigos = pedidas.length ? pedidas : Object.keys(PROVINCIAS);
  const todas = codigos.length === Object.keys(PROVINCIAS).length;

  let db: SupabaseClient | null = null;
  if (!dryRun) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    db = createClient(url, key, { auth: { persistSession: false } });
  }

  // Una sola marca de tiempo para toda la importación: lo que no la tenga al final ya no existe en OSM
  const marca = new Date().toISOString();
  const fallidas: string[] = [];
  let total = 0;

  for (const [i, codigo] of codigos.entries()) {
    const nombre = PROVINCIAS[codigo];
    const consulta = `
      [out:json][timeout:280];
      area["ISO3166-2"="ES-${codigo}"]->.p;
      (
        nwr["amenity"="parking"](area.p);
        node["vending"="parking_tickets"](area.p);
      );
      out center tags;`;
    try {
      const elementos = await descargar(consulta);
      const { filas, privados } = aFilas(elementos, marca);
      if (db) await guardar(db, filas);
      total += filas.length;
      const parq = filas.filter((f) => f.clase === "parquimetro").length;
      console.log(`[${i + 1}/${codigos.length}] ${nombre}: ${filas.length} guardables (${parq} parquímetros, ${privados} privados descartados)`);
    } catch (e) {
      fallidas.push(nombre);
      console.log(`[${i + 1}/${codigos.length}] ${nombre}: ERROR ${(e as Error).message}`);
    }
    if (i < codigos.length - 1) await espera(PAUSA_ENTRE_PROVINCIAS_MS);
  }

  console.log(`\nTotal: ${total} aparcamientos en ${codigos.length - fallidas.length}/${codigos.length} provincias.`);
  if (dryRun) return console.log("--dry-run: no se ha escrito nada en Supabase.");

  // Limpieza de los que ya no están en OSM: solo si se han descargado TODAS las provincias sin fallos
  if (todas && fallidas.length === 0 && db) {
    const { error, count } = await db
      .from("aparcamientos")
      .delete({ count: "exact" })
      .eq("fuente", "osm")
      .lt("actualizado", marca);
    if (error) throw new Error(`limpieza: ${error.message}`);
    console.log(`Limpieza: ${count ?? 0} aparcamientos que ya no existen en OSM borrados.`);
  } else {
    console.log("Limpieza omitida (importación parcial o con fallos): se conservan los datos anteriores.");
  }

  if (fallidas.length) {
    console.log(`Provincias con error: ${fallidas.join(", ")}`);
    process.exit(1); // que GitHub avise por correo
  }
  console.log("Guardado en Supabase ✔");
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
