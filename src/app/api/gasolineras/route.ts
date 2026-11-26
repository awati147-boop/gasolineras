import { NextRequest, NextResponse } from "next/server";
import { supabasePublico } from "@/lib/supabase";

const MAXIMO = 1000; // máximo de filas por consulta en Supabase

// GET /api/gasolineras?c=Gasoleo%20A&w=-0.7&s=38.2&e=-0.3&n=38.5
// Devuelve las gasolineras dentro del rectángulo visible, de más barata a más cara.
// GET /api/gasolineras?c=Gasoleo%20A&ids=123,456 → solo esas (las favoritas del usuario, máx. 20)
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const c = p.get("c") ?? "Gasolina 95 E5";

  if (p.has("ids")) {
    const ids = (p.get("ids") ?? "").split(",").map((x) => Number(x.trim()));
    if (!ids.length || ids.length > 20 || !ids.every((x) => Number.isInteger(x) && x > 0)) {
      return NextResponse.json({ error: "Lista de gasolineras no válida" }, { status: 400 });
    }
    const { data, error } = await supabasePublico()
      .from("precios")
      .select("precio, gasolineras!inner(id, rotulo, direccion, localidad, horario, lat, lon)")
      .eq("carburante", c)
      .in("gasolinera_id", ids);
    if (error) return NextResponse.json({ error: "No se han podido cargar los precios" }, { status: 502 });
    const gasolineras = (data as unknown as { precio: number; gasolineras: Record<string, unknown> }[]).map((f) => ({
      ...f.gasolineras,
      precio: Number(f.precio),
    }));
    return NextResponse.json({ gasolineras, recortado: false });
  }
  const crudos = ["w", "s", "e", "n"].map((k) => p.get(k)?.trim() ?? "");
  const [w, s, e, n] = crudos.map(Number); // ojo: Number("") es 0, por eso se comprueba antes que vengan
  if (crudos.some((v) => v === "") || ![w, s, e, n].every(Number.isFinite)) {
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
