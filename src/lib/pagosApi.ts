// Piezas comunes de las rutas /api/pagos/* (solo servidor)
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { claveReal, crearStripe, ErrorStripe } from "./stripe";
import { ErrorPagos, type Dependencias } from "./pagosServidor";

/** ¿Están configurados los pagos en este servidor? (sin clave de Stripe, la web funciona como siempre) */
export const pagosActivos = () =>
  Boolean(process.env.STRIPE_SECRET_KEY && process.env.PAGOS_SECRETO && process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY);

/** Token de la sesión del usuario (cabecera Authorization: Bearer …) */
export function tokenDe(req: Request) {
  const h = req.headers.get("authorization");
  return h?.startsWith("Bearer ") ? h.slice(7) : undefined;
}

/**
 * Dependencias para pagosServidor. Con `token`, la base de datos sabe quién llama (auth.uid())
 * y comprueba que la reserva es suya; sin token, solo vale la clave secreta (avisos de Stripe y tareas).
 */
export function dependencias(token?: string): Dependencias {
  if (!pagosActivos()) throw new ErrorPagos(503, "Los pagos en la app no están disponibles ahora mismo.");
  const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...(token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : {}),
  });
  const clave = process.env.STRIPE_SECRET_KEY!;
  return {
    rpc: async <T,>(funcion: string, args: Record<string, unknown>) => {
      const { data, error } = await db.rpc(funcion, args);
      if (error) {
        if (/no es tuya/i.test(error.message)) throw new ErrorPagos(403, "Esta reserva no es tuya.");
        if (/Necesitas una cuenta|JWT|token/i.test(error.message)) throw new ErrorPagos(401, "Tienes que entrar en tu cuenta.");
        if (/Clave de pagos/i.test(error.message)) throw new ErrorPagos(503, "Los pagos no están bien configurados.");
        throw new ErrorPagos(502, `Base de datos: ${error.message}`);
      }
      return data as T;
    },
    // STRIPE_API_URL solo se usa en pruebas (servidor de Stripe falso)
    stripe: crearStripe(clave, process.env.STRIPE_API_URL || undefined),
    secreto: process.env.PAGOS_SECRETO!,
    real: claveReal(clave),
    log: (m) => console.error(m),
  };
}

/** Respuesta de error en español, sin detalles internos para el usuario */
export function respuestaError(e: unknown) {
  if (e instanceof ErrorPagos) {
    const mensaje = e.estado === 502 ? "No se ha podido completar. Inténtalo de nuevo." : e.message;
    if (e.estado >= 500) console.error(e.message);
    return NextResponse.json({ error: mensaje }, { status: e.estado });
  }
  if (e instanceof ErrorStripe) {
    console.error(`Stripe ${e.estado} ${e.codigo ?? ""}: ${e.message}`);
    return NextResponse.json({ error: "El proveedor de pagos no ha respondido bien. Inténtalo de nuevo." }, { status: 502 });
  }
  console.error(e);
  return NextResponse.json({ error: "Error inesperado. Inténtalo de nuevo." }, { status: 500 });
}

/**
 * Email de la sesión (dato del token de Supabase). Solo se usa DESPUÉS de una llamada a la base de datos con ese
 * mismo token: si el token fuera falso, esa llamada ya habría fallado.
 */
export function emailDelToken(token: string) {
  try {
    const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const datos = JSON.parse(new TextDecoder().decode(bytes)) as { email?: unknown };
    return typeof datos.email === "string" && datos.email.includes("@") ? datos.email : undefined;
  } catch {
    return undefined;
  }
}

/** Lee el JSON del cuerpo sin romper si viene vacío o mal formado */
export const cuerpoJson = async (req: Request) => (await req.json().catch(() => ({}))) as Record<string, unknown>;
