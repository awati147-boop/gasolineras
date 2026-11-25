import { NextRequest, NextResponse } from "next/server";
import { buildPushPayload, type VapidKeys } from "@block65/webcrypto-web-push";
import { supabasePublico } from "@/lib/supabase";

type Peticion = { secreto?: string; usuario?: string; titulo?: string; cuerpo?: string; enlace?: string; etiqueta?: string };

/**
 * POST /api/avisos — la llama la base de datos (pg_net) cuando hay que avisar a alguien.
 * La clave secreta la valida Supabase en push_destino(): sin la clave correcta no devuelve dispositivos.
 */
export async function POST(req: NextRequest) {
  const p = (await req.json().catch(() => ({}))) as Peticion;
  if (!p.secreto || !p.usuario || !p.titulo) return NextResponse.json({ error: "Petición incompleta" }, { status: 400 });

  const vapid: VapidKeys = {
    subject: process.env.VAPID_SUBJECT ?? "mailto:avisos@example.com",
    publicKey: process.env.VAPID_PUBLIC_KEY ?? "",
    privateKey: process.env.VAPID_PRIVATE_KEY ?? "",
  };
  if (!vapid.publicKey || !vapid.privateKey) return NextResponse.json({ error: "Avisos sin configurar" }, { status: 503 });

  const db = supabasePublico();
  const { data: dispositivos, error } = await db.rpc("push_destino", { p_secreto: p.secreto, p_usuario: p.usuario });
  if (error) return NextResponse.json({ error: "No se han podido leer los dispositivos" }, { status: 502 });

  // Solo rutas internas como destino del clic
  // ("//otra-web.com" también empieza por "/" pero llevaría fuera: no se acepta)
  const enlace = p.enlace && /^\/(?![/\\])/.test(p.enlace) ? p.enlace : "/cuenta";
  const datos = { titulo: p.titulo, cuerpo: p.cuerpo ?? "", enlace, etiqueta: p.etiqueta ?? "aviso" };

  let enviados = 0;
  for (const d of (dispositivos as { endpoint: string; p256dh: string; auth: string }[]) ?? []) {
    try {
      const envio = await buildPushPayload(
        { data: datos, options: { ttl: 60 * 60 * 24, urgency: "high" } },
        { endpoint: d.endpoint, expirationTime: null, keys: { p256dh: d.p256dh, auth: d.auth } },
        vapid,
      );
      const res = await fetch(d.endpoint, envio);
      if (res.status === 404 || res.status === 410) {
        // El dispositivo ya no existe (desinstalada, permisos retirados…): se borra
        await db.rpc("push_borrar", { p_secreto: p.secreto, p_endpoint: d.endpoint });
      } else if (res.ok) {
        enviados++;
      }
    } catch {
      /* un dispositivo que falla no impide avisar a los demás */
    }
  }
  return NextResponse.json({ enviados });
}
