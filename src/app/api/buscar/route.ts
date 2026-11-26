import { NextRequest, NextResponse } from "next/server";
import { supabasePublico } from "@/lib/supabase";
import { normalizar } from "@/lib/texto";

/** "VALENCIA/VALÈNCIA" -> ["valencia/valencia", "valencia", "valencia"]: el nombre completo y cada variante */
const variantes = (nombre: string | null) => {
  if (!nombre) return [];
  const n = normalizar(nombre);
  return [n, ...n.split("/").map((p) => p.trim())];
};

// GET /api/buscar?q=javea  ->  { zona: [oeste, sur, este, norte] } con las gasolineras que coinciden
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 60);
  if (!q) return NextResponse.json({ zona: null });

  let consulta = supabasePublico()
    .from("gasolineras")
    .select("lat, lon, localidad, municipio")
    // Solo estaciones bien ubicadas en España (hay alguna con 0,0 que alejaría el mapa hasta África)
    .gte("lat", 27).lte("lat", 44.5)
    .gte("lon", -19).lte("lon", 5);
  if (/^\d{2,5}$/.test(q)) {
    consulta = consulta.like("cp", `${q}%`);
  } else {
    consulta = consulta.ilike("busqueda", `%${normalizar(q).replace(/[%_,()]/g, " ")}%`);
  }
  const { data, error } = await consulta.limit(1000);
  if (error) return NextResponse.json({ error: "Error al buscar" }, { status: 502 });
  if (!data?.length) return NextResponse.json({ zona: null });

  // Prioridad a la localidad o municipio que se llama EXACTAMENTE así
  // ("valencia" -> Valencia ciudad, no Valencia de Don Juan ni Valencia de Alcántara)
  const buscado = normalizar(q);
  const exactas = data.filter(
    (g) => variantes(g.localidad).includes(buscado) || variantes(g.municipio).includes(buscado),
  );
  const puntos = exactas.length ? exactas : data;

  const lons = puntos.map((g) => g.lon as number);
  const lats = puntos.map((g) => g.lat as number);
  return NextResponse.json({ zona: [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)] });
}
