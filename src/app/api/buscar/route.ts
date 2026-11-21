import { NextRequest, NextResponse } from "next/server";
import { supabasePublico } from "@/lib/supabase";
import { normalizar } from "@/lib/texto";

// GET /api/buscar?q=javea  ->  { zona: [oeste, sur, este, norte] } con las gasolineras que coinciden
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 60);
  if (!q) return NextResponse.json({ zona: null });

  let consulta = supabasePublico().from("gasolineras").select("lat, lon, busqueda").not("lat", "is", null);
  if (/^\d{2,5}$/.test(q)) {
    consulta = consulta.like("cp", `${q}%`);
  } else {
    consulta = consulta.ilike("busqueda", `%${normalizar(q).replace(/[%_,()]/g, " ")}%`);
  }
  const { data, error } = await consulta.limit(1000);
  if (error) return NextResponse.json({ error: "Error al buscar" }, { status: 502 });
  if (!data?.length) return NextResponse.json({ zona: null });

  // Si hay coincidencias exactas de localidad (p.ej. "madrid" y no "humanes de madrid"), usar solo esas
  const exacto = normalizar(q);
  const exactas = data.filter((g) => g.busqueda?.split(/[ /]/).includes(exacto) && g.busqueda.startsWith(exacto));
  const puntos = exactas.length ? exactas : data;

  const lons = puntos.map((g) => g.lon as number);
  const lats = puntos.map((g) => g.lat as number);
  return NextResponse.json({ zona: [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)] });
}
