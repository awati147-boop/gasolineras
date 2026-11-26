// Pagos en la app: tarifas y textos (navegador y servidor). Las tarifas son las mismas que en supabase/pagos.sql.

/** Tarifa de servicio del conductor: 10 % del precio, mínimo 0,50 € */
export const TARIFA_PCT = 10;
export const TARIFA_MIN = 0.5;
/** Comisión que se descuenta al dueño */
export const COMISION_PCT = 3;
/** Horas que tiene el dueño para responder a una solicitud pagada */
export const RESPUESTA_H = 48;
/** Horas después del inicio en las que el dueño recibe su dinero */
export const TRANSFERENCIA_H = 24;

/** Euros → céntimos sin errores de coma flotante (1,15 € → 115) */
export const centimos = (euros: number) => Math.round(Number(euros) * 100);

/** Mismo redondeo que round(x, 2) de PostgreSQL con importes positivos */
const porcentaje = (euros: number, pct: number) => Math.round((centimos(euros) * pct) / 100) / 100;

export const tarifaServicio = (precio: number) => Math.max(porcentaje(precio, TARIFA_PCT), TARIFA_MIN);
export const comisionDueno = (precio: number) => porcentaje(precio, COMISION_PCT);

export type EstadoPago = "por_pagar" | "autorizado" | "cobrado" | "transferido" | "devuelto" | "anulado" | "fallido";

/** Lo que devuelve mi_pago() (comisión y lo que recibe el dueño solo los ve el dueño) */
export type Pago = {
  estado: EstadoPago;
  precio: number;
  tarifa: number;
  total: number;
  comision: number | null;
  para_dueno: number | null;
  devuelto: number;
  retener: boolean;
  es_real: boolean;
};

/** Texto corto del estado del pago para cada parte */
export const TEXTO_PAGO: Record<EstadoPago, { conductor: string; propietario: string }> = {
  por_pagar: { conductor: "Falta completar el pago", propietario: "Esperando a que el conductor pague" },
  autorizado: { conductor: "Importe retenido: solo se cobra si el dueño acepta", propietario: "Pago asegurado: acepta o rechaza" },
  cobrado: { conductor: "Pagado", propietario: "Cobrado" },
  transferido: { conductor: "Pagado", propietario: "Enviado a tu cuenta" },
  devuelto: { conductor: "Devuelto", propietario: "Devuelto al conductor" },
  anulado: { conductor: "No se te ha cobrado nada", propietario: "Sin cobro" },
  fallido: { conductor: "No se pudo cobrar (no se te ha cobrado nada)", propietario: "No se pudo cobrar" },
};

/**
 * Llama a las rutas de pagos de la web con la sesión del usuario.
 * Devuelve el JSON de la respuesta; si falla, lanza un Error con un mensaje en español.
 */
export async function llamarPagos<T>(
  token: string | undefined,
  ruta: "/api/pagos/checkout" | "/api/pagos/sincronizar" | "/api/pagos/cuenta",
  cuerpo?: Record<string, unknown>,
): Promise<T> {
  if (!token) throw new Error("Tienes que entrar en tu cuenta.");
  const res = await fetch(ruta, {
    method: cuerpo ? "POST" : "GET",
    headers: { Authorization: `Bearer ${token}`, ...(cuerpo ? { "Content-Type": "application/json" } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const datos = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(datos.error ?? "No se ha podido completar. Inténtalo de nuevo.");
  return datos;
}

/** Hasta cuándo puede responder el dueño a una solicitud pagada */
export const limiteRespuesta = (creada: string) => new Date(new Date(creada).getTime() + RESPUESTA_H * 3600e3);

/** Cuándo recibe el dueño su dinero */
export const fechaTransferencia = (inicio: string) => new Date(new Date(inicio).getTime() + TRANSFERENCIA_H * 3600e3);
