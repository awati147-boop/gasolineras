import { NextRequest, NextResponse } from "next/server";
import { dependencias, respuestaError } from "@/lib/pagosApi";
import { procesarEvento, type Evento } from "@/lib/pagosServidor";
import { firmaValida } from "@/lib/stripe";

/**
 * POST /api/pagos/webhook — avisos de Stripe (pago completado, caducado, cuenta verificada…).
 * Opcional: sin él todo funciona igual, porque la pantalla y la tarea de cada 10 minutos preguntan a Stripe.
 * La firma se comprueba con STRIPE_WEBHOOK_SECRET; el contenido no se usa más que para saber qué reserva mirar.
 */
export async function POST(req: NextRequest) {
  const secreto = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secreto) return NextResponse.json({ error: "Webhook sin configurar" }, { status: 503 });
  const cuerpo = await req.text();
  if (!(await firmaValida(cuerpo, req.headers.get("stripe-signature"), secreto))) {
    return NextResponse.json({ error: "Firma no válida" }, { status: 400 });
  }
  try {
    await procesarEvento(dependencias(), JSON.parse(cuerpo) as Evento);
    return NextResponse.json({ recibido: true });
  } catch (e) {
    return respuestaError(e); // con error, Stripe lo vuelve a intentar más tarde
  }
}
