import { NextRequest, NextResponse } from "next/server";

// GET /api/lugares?q=estadio rico perez&lat=38.3&lon=-0.5
// Sugerencias de direcciones y lugares (datos de OpenStreetMap). La consulta pasa por nuestro servidor para no
// exponer la IP del usuario a terceros; no se guarda nada. lat/lon es el centro del mapa redondeado (~10 km),
// solo para dar prioridad a lo cercano.
type Lugar = { nombre: string; detalle: string; lat: number; lon: number };

type Propiedades = {
  name?: string; street?: string; housenumber?: string; postcode?: string;
  locality?: string; district?: string; city?: string; state?: string; country?: string; countrycode?: string;
};

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const q = (p.get("q") ?? "").trim().slice(0, 80);
  if (q.length < 3) return NextResponse.json({ lugares: [] });

  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", q);
  url.searchParams.set("limit", "6");
  const lat = Number(p.get("lat"));
  const lon = Number(p.get("lon"));
  if (Number.isFinite(lat) && Number.isFinite(lon) && lat && lon) {
    url.searchParams.set("lat", lat.toFixed(1));
    url.searchParams.set("lon", lon.toFixed(1));
  }

  try {
    const res = await fetch(url, { headers: { "User-Agent": "buscador-aparcamiento/1.0" }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(String(res.status));
    const datos = (await res.json()) as { features: { properties: Propiedades; geometry: { coordinates: [number, number] } }[] };

    const vistos = new Set<string>();
    const lugares: Lugar[] = [];
    for (const f of datos.features) {
      const pr = f.properties;
      const calle = pr.street ? `${pr.street}${pr.housenumber ? ` ${pr.housenumber}` : ""}` : "";
      const ciudad = pr.city ?? pr.locality ?? pr.district ?? "";
      const nombre = pr.name || calle || ciudad;
      if (!nombre) continue;
      const detalle = [pr.name ? calle : "", ciudad, pr.countrycode === "ES" ? pr.state : pr.country]
        .filter((x) => x && x !== nombre)
        .join(", ");
      const clave = `${nombre}|${detalle}`;
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      const [lo, la] = f.geometry.coordinates;
      lugares.push({ nombre, detalle, lat: la, lon: lo });
    }
    return NextResponse.json({ lugares }, { headers: { "Cache-Control": "public, max-age=86400" } });
  } catch {
    return NextResponse.json({ error: "Error al buscar" }, { status: 502 });
  }
}
