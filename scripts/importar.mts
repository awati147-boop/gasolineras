// Descarga precios del Ministerio y los guarda en Supabase.
// Uso:
//   node --env-file=.env.local scripts/importar.mts [idProvincia]      (03 = Alicante; sin arg = toda España)
//   node scripts/importar.mts 03 --dry-run                              (no escribe, solo muestra)
import { createClient } from "@supabase/supabase-js";

const BASE =
  "https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/";

type EstacionApi = Record<string, string>;

/** "1,869" -> 1.869 ; "" -> null */
export function numero(valor: string | undefined): number | null {
  if (!valor || !valor.trim()) return null;
  const n = Number(valor.trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * Coordenada dentro de España (península, islas, Ceuta y Melilla) o null. El Ministerio manda a veces "0,000000"
 * en estaciones sin ubicar: guardarlas como 0,0 las pondría en el océano y estropearía el buscador.
 */
export function coordenada(valor: string | undefined, min: number, max: number): number | null {
  const n = numero(valor);
  return n !== null && n >= min && n <= max ? n : null;
}

/** "JÁVEA/XÀBIA" -> "javea/xabia" (minúsculas, sin tildes) */
export function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

/** "21/11/2026 1:28:12" (hora de Madrid) -> ISO con zona */
export function fechaApi(texto: string): string {
  const [d, h] = texto.split(" ");
  const [dia, mes, anio] = d.split("/").map(Number);
  const [hh, mm, ss] = h.split(":").map(Number);
  const comoUtc = Date.UTC(anio, mes - 1, dia, hh, mm, ss);
  // desfase de Europe/Madrid en ese instante
  const madrid = new Date(new Date(comoUtc).toLocaleString("en-US", { timeZone: "Europe/Madrid" }));
  const utc = new Date(new Date(comoUtc).toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(comoUtc - (madrid.getTime() - utc.getTime())).toISOString();
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const provincia = args.find((a) => !a.startsWith("--"));
  const url = provincia ? `${BASE}FiltroProvincia/${provincia}` : BASE;

  console.log(`Descargando ${url} ...`);
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`La API respondió ${res.status}`);
  const json = (await res.json()) as { Fecha: string; ListaEESSPrecio: EstacionApi[] };
  const fecha = fechaApi(json.Fecha);

  const gasolineras = [];
  const precios = [];
  const restringidas: number[] = []; // "Tipo Venta" R = solo socios/flotas: no se muestran
  for (const e of json.ListaEESSPrecio) {
    const id = Number(e["IDEESS"]);
    // Las dos coordenadas o ninguna (una estación con solo una no se puede situar)
    let lat = coordenada(e["Latitud"], 27, 44.5);
    let lon = coordenada(e["Longitud (WGS84)"], -19, 5);
    if (lat === null || lon === null) lat = lon = null;
    if (e["Tipo Venta"] === "R") {
      restringidas.push(id);
      continue;
    }
    gasolineras.push({
      id,
      rotulo: e["Rótulo"]?.trim(),
      direccion: e["Dirección"]?.trim(),
      localidad: e["Localidad"]?.trim(),
      municipio: e["Municipio"]?.trim(),
      provincia: e["Provincia"]?.trim(),
      id_provincia: e["IDProvincia"],
      cp: e["C.P."],
      horario: e["Horario"],
      lat,
      lon,
      busqueda: normalizar(`${e["Localidad"] ?? ""} ${e["Municipio"] ?? ""}`),
      actualizado: fecha,
    });
    for (const [clave, valor] of Object.entries(e)) {
      if (!clave.startsWith("Precio ")) continue;
      const precio = numero(valor);
      if (precio === null) continue;
      precios.push({ gasolinera_id: id, carburante: clave.slice(7), precio, fecha });
    }
  }

  console.log(`Fecha de los datos: ${json.Fecha} (${fecha})`);
  console.log(`Gasolineras: ${gasolineras.length} · Precios: ${precios.length} · Restringidas (omitidas): ${restringidas.length}`);
  resumen(gasolineras, precios);

  if (dryRun) {
    console.log("\n--dry-run: no se ha escrito nada en Supabase.");
    return;
  }

  const supaUrl = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supaUrl || !key) throw new Error("Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env.local");
  const db = createClient(supaUrl, key, { auth: { persistSession: false } });

  await subirEnLotes(db, "gasolineras", gasolineras, "id");
  await subirEnLotes(db, "precios", precios, "gasolinera_id,carburante");
  // Borrar las de venta restringida que se hubieran guardado antes (sus precios se borran en cascada)
  for (let i = 0; i < restringidas.length; i += 200) {
    const { error } = await db.from("gasolineras").delete().in("id", restringidas.slice(i, i + 200));
    if (error) throw new Error(`borrar restringidas: ${error.message}`);
  }
  const { error } = await db.from("importaciones").insert({
    fecha_api: fecha,
    provincia: provincia ?? "todas",
    gasolineras: gasolineras.length,
    precios: precios.length,
  });
  if (error) throw error;
  console.log("\nGuardado en Supabase ✔");
}

async function subirEnLotes(db: any, tabla: string, filas: object[], conflicto: string) {
  for (let i = 0; i < filas.length; i += 1000) {
    const { error } = await db.from(tabla).upsert(filas.slice(i, i + 1000), { onConflict: conflicto });
    if (error) throw new Error(`${tabla}: ${error.message}`);
  }
}

function resumen(gasolineras: { id: number; rotulo?: string; localidad?: string }[],
                 precios: { gasolinera_id: number; carburante: string; precio: number }[]) {
  const porId = new Map(gasolineras.map((g) => [g.id, g]));
  for (const carb of ["Gasolina 95 E5", "Gasoleo A"]) {
    const top = precios.filter((p) => p.carburante === carb).sort((a, b) => a.precio - b.precio).slice(0, 10);
    console.log(`\nTop 10 más baratas · ${carb}`);
    console.table(top.map((p) => ({
      precio: p.precio.toFixed(3) + " €",
      rotulo: porId.get(p.gasolinera_id)?.rotulo,
      localidad: porId.get(p.gasolinera_id)?.localidad,
    })));
  }
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
