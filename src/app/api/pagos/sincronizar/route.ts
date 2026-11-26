import { NextRequest, NextResponse } from "next/server";
import { cuerpoJson, dependencias, respuestaError, tokenDe } from "@/lib/pagosApi";
import { ErrorPagos, esUuid, sincronizarPago } from "@/lib/pagosServidor";

/**
 * POST /api/pagos/sincronizar {reserva} — la llama la pantalla de la reserva (al volver de pagar, al aceptar,
 * cancelar…) para hacer al momento lo que toque en el proveedor de pagos. Solo el conductor o el dueño.
 */
export async function POST(req: NextRequest) {
  try {
    const { reserva } = await cuerpoJson(req);
    if (!esUuid(reserva)) throw new ErrorPagos(400, "Falta la reserva.");
    const token = tokenDe(req);
    if (!token) throw new ErrorPagos(401, "Tienes que entrar en tu cuenta.");
    const p = await sincronizarPago(dependencias(token), reserva);
    return NextResponse.json({ estado: p?.estado ?? null });
  } catch (e) {
    return respuestaError(e);
  }
}
