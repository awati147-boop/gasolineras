import { NextRequest, NextResponse } from "next/server";
import { cuerpoJson, dependencias, respuestaError, tokenDe } from "@/lib/pagosApi";
import { ErrorPagos, esUuid, paginaDePago } from "@/lib/pagosServidor";

/** POST /api/pagos/checkout {reserva} — abre (o reutiliza) la página de pago segura de una reserva pendiente */
export async function POST(req: NextRequest) {
  try {
    const { reserva } = await cuerpoJson(req);
    if (!esUuid(reserva)) throw new ErrorPagos(400, "Falta la reserva.");
    const token = tokenDe(req);
    if (!token) throw new ErrorPagos(401, "Tienes que entrar en tu cuenta.");
    return NextResponse.json(await paginaDePago(dependencias(token), reserva, req.nextUrl.origin));
  } catch (e) {
    return respuestaError(e);
  }
}
