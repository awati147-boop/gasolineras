import { NextRequest, NextResponse } from "next/server";
import { cuerpoJson, dependencias, respuestaError } from "@/lib/pagosApi";
import { esUuid, revisarPendientes } from "@/lib/pagosServidor";

/** Comparación en tiempo constante */
function iguales(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/**
 * POST /api/pagos/tareas {secreto, reserva?} — la llama la base de datos (pg_cron cada 10 minutos y al cambiar una
 * reserva con pago) para hacer lo pendiente: cobrar al aceptar, liberar, devolver y transferir a los dueños.
 */
export async function POST(req: NextRequest) {
  const { secreto, reserva } = await cuerpoJson(req);
  const esperado = process.env.PAGOS_SECRETO;
  if (!esperado || typeof secreto !== "string" || !iguales(secreto, esperado)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const revisados = await revisarPendientes(dependencias(), esUuid(reserva) ? reserva : undefined);
    return NextResponse.json({ revisados });
  } catch (e) {
    return respuestaError(e);
  }
}
