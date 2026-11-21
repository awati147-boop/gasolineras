import { NextRequest, NextResponse } from "next/server";
import { supabasePublico } from "@/lib/supabase";

const MAXIMO = 1000; // máximo de filas por consulta en Supabase

// GET /api/gasolineras?c=Gasoleo%20A&w=-0.7&s=38.2&e=-0.3&n=38.5
// Devuelve las gasolineras dentro del rectángulo visible, de más barata a más cara.
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const c = p.get("c") ?? "Gasolina 95 E5";
  const [w, s, e, n] = ["w", "s", "e", "n"].map((k) => Number(p.get(k)));
  if (![w, s, e, n].every(Number.isFinite)) {
    return NextResponse.json({ error: "Faltan los límites del mapa" }, { status: 400 });
  }

  const { data, error } = await supabasePublico()
    .from("precios")
    .select("precio, gasolineras!inner(id, rotulo, direccion, localidad, horario, lat, lon)")
    .eq("carburante", c)
    .gte("gasolineras.lat", s)
    .lte("gasolineras.lat", n)
    .gte("gasolineras.lon", w)
    .lte("gasolineras.lon", e)
    .order("precio", { ascending: true })
    .limit(MAXIMO);

  if (error) return NextResponse.json({ error: "No se han podido cargar los precios" }, { status: 502 });

  const gasolineras = (data as unknown as { precio: number; gasolineras: Record<string, unknown> }[]).map((f) => ({
    ...f.gasolineras,
    precio: Number(f.precio),
  }));
  return NextResponse.json({ gasolineras, recortado: gasolineras.length >= MAXIMO });
}
