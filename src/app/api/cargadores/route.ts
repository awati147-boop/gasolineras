import { NextRequest, NextResponse } from "next/server";
import { supabasePublico } from "@/lib/supabase";

const MAXIMO = 1000;
const TIPOS = new Set(["ccs", "tipo2", "chademo", "schuko"]);

// GET /api/cargadores?w=-0.7&s=38.2&e=-0.3&n=38.5[&kw=50][&tipo=ccs]
// Puntos de recarga dentro del rectángulo visible, de más potencia a menos, y la fecha de los datos.
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const crudos = ["w", "s", "e", "n"].map((k) => p.get(k)?.trim() ?? "");
  const [w, s, e, n] = crudos.map(Number);
  if (crudos.some((v) => v === "") || ![w, s, e, n].every(Number.isFinite)) {
    return NextResponse.json({ error: "Faltan los límites del mapa" }, { status: 400 });
  }
  const kw = Number(p.get("kw") ?? 0);
  const tipo = p.get("tipo");
  if (!Number.isFinite(kw) || kw < 0 || kw > 1000 || (tipo && !TIPOS.has(tipo))) {
    return NextResponse.json({ error: "Filtro no válido" }, { status: 400 });
  }

  const db = supabasePublico();
  let consulta = db
    .from("cargadores")
    .select("id, nombre, operador, direccion, municipio, horario, lat, lon, puntos, potencia_kw, conectores, tipos, pago")
    .gte("lat", s).lte("lat", n).gte("lon", w).lte("lon", e);
  if (kw > 0) consulta = consulta.gte("potencia_kw", kw);
  if (tipo) consulta = consulta.contains("tipos", [tipo]);
  const [{ data, error }, { data: ultima }] = await Promise.all([
    consulta.order("potencia_kw", { ascending: false }).limit(MAXIMO),
    db.from("cargadores_importaciones").select("fecha_datos").order("fecha_datos", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (error) return NextResponse.json({ error: "No se han podido cargar los puntos de recarga" }, { status: 502 });

  const cargadores = (data ?? []).map((c) => ({ ...c, potencia_kw: Number(c.potencia_kw) }));
  return NextResponse.json({ cargadores, recortado: cargadores.length >= MAXIMO, fecha: ultima?.fecha_datos ?? null });
}
