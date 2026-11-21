// Descarga parkings y parquímetros de OpenStreetMap (Overpass API) y los guarda en Supabase.
// Uso:
//   node --env-file=.env.local scripts/importar-aparcamientos.mts            (provincia de Alicante)
//   node scripts/importar-aparcamientos.mts --dry-run                          (no escribe)
// Datos © colaboradores de OpenStreetMap (ODbL).
import { createClient } from "@supabase/supabase-js";

// Servidores Overpass (si uno está saturado se prueba el siguiente)
const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];
// Provincia de Alicante (sur, oeste, norte, este). Ampliable a otras provincias más adelante.
const ZONA = [37.84, -1.13, 38.96, 0.25];

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

async function descargar(consulta: string): Promise<Elemento[]> {
  for (const servidor of OVERPASS) {
    for (let intento = 1; intento <= 2; intento++) {
      console.log(`Descargando de OpenStreetMap (${new URL(servidor).host}, intento ${intento})…`);
      try {
        const res = await fetch(servidor, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "aparcamientos-importador/1.0" },
          body: new URLSearchParams({ data: consulta }),
          signal: AbortSignal.timeout(200_000),
        });
        if (res.ok) return ((await res.json()) as { elements: Elemento[] }).elements;
        console.log(`  respondió ${res.status}`);
      } catch (e) {
        console.log(`  fallo: ${(e as Error).message}`);
      }
      await new Promise((r) => setTimeout(r, 15_000));
    }
  }
  throw new Error("Ningún servidor de OpenStreetMap ha respondido. Se mantienen los datos anteriores.");
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const [s, w, n, e] = ZONA;
  const consulta = `
    [out:json][timeout:180];
    (
      nwr["amenity"="parking"](${s},${w},${n},${e});
      node["vending"="parking_tickets"](${s},${w},${n},${e});
    );
    out center tags;`;

  const elements = await descargar(consulta);

  // Una sola marca de tiempo para toda la importación: lo que no la tenga al final ya no existe en OSM
  const marca = new Date().toISOString();
  const filas: Fila[] = [];
  let privados = 0;
  for (const el of elements) {
    const t = el.tags ?? {};
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null) continue;

    const esParquimetro = t.vending === "parking_tickets";
    // Fuera los privados (garajes de comunidad, empresas…): no sirven al público
    if (!esParquimetro && ["private", "no", "permit", "employees", "delivery"].includes(t.access ?? "")) {
      privados++;
      continue;
    }
    filas.push({
      id: `osm:${el.type}/${el.id}`,
      clase: esParquimetro ? "parquimetro" : "parking",
      nombre: t.name ?? null,
      tipo: esParquimetro ? null : (TIPOS[t.parking ?? ""] ?? (t.parking ? t.parking : null)),
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

  const cuenta = (f: (x: Fila) => boolean) => filas.filter(f).length;
  console.log(`Elementos: ${elements.length} · guardables: ${filas.length} · privados descartados: ${privados}`);
  console.log(`  parkings: ${cuenta((x) => x.clase === "parking")} (de pago: ${cuenta((x) => x.clase === "parking" && x.de_pago === true)}, gratis: ${cuenta((x) => x.de_pago === false)}, sin dato: ${cuenta((x) => x.clase === "parking" && x.de_pago === null)})`);
  console.log(`  parquímetros: ${cuenta((x) => x.clase === "parquimetro")}`);
  console.log(`  con nº de plazas: ${cuenta((x) => x.plazas !== null)} · con horario: ${cuenta((x) => x.horario !== null)} · con precio: ${cuenta((x) => x.precio !== null)}`);

  if (dryRun) return console.log("\n--dry-run: no se ha escrito nada en Supabase.");

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  const db = createClient(url, key, { auth: { persistSession: false } });


  for (let i = 0; i < filas.length; i += 1000) {
    const { error } = await db.from("aparcamientos").upsert(filas.slice(i, i + 1000), { onConflict: "id" });
    if (error) throw new Error(`aparcamientos: ${error.message}`);
  }
  // Borrar los que ya no existen en OSM (solo de esta fuente; no toca los metidos a mano)
  const { error, count } = await db
    .from("aparcamientos")
    .delete({ count: "exact" })
    .eq("fuente", "osm")
    .lt("actualizado", marca)
    .gte("lat", s).lte("lat", n).gte("lon", w).lte("lon", e);
  if (error) throw new Error(`limpieza: ${error.message}`);
  console.log(`\nGuardado en Supabase ✔ (${count ?? 0} antiguos borrados)`);
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
