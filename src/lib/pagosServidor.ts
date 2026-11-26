// Lógica de los pagos en el servidor (sin dependencias de Next ni de Supabase: se prueba con datos falsos).
//
// La base de datos (supabase/pagos.sql) dice en qué estado está cada pago y qué ha pasado con la reserva.
// sincronizarPago() mira en Stripe cómo está DE VERDAD y da el siguiente paso:
//   por_pagar → autorizado (importe retenido) → cobrado (el dueño aceptó) → transferido (24 h tras el inicio)
//                         ↘ anulado (rechazada, cancelada o caducada: se libera)      ↘ devuelto (cancelación con devolución)
// Se puede llamar las veces que haga falta y desde varios sitios a la vez (la web, el aviso de Stripe, la tarea
// de cada 10 minutos): cada paso comprueba primero lo que ya hay en Stripe y los cambios se guardan solo si nadie
// los ha tocado mientras tanto (versión).

import type { LlamarStripe, Parametros } from "./stripe";
import { TRANSFERENCIA_H, centimos } from "./pagos";

export type Rpc = <T = unknown>(funcion: string, args: Record<string, unknown>) => Promise<T>;

export type Dependencias = {
  rpc: Rpc;
  stripe: LlamarStripe;
  secreto: string;
  /** true si la clave de Stripe es de modo real */
  real: boolean;
  ahora?: () => number;
  log?: (mensaje: string) => void;
};

export class ErrorPagos extends Error {
  estado: number;
  constructor(estado: number, mensaje: string) {
    super(mensaje);
    this.estado = estado;
  }
}

type EstadoReserva = "pendiente" | "aceptada" | "rechazada" | "cancelada";

export type PagoLeido = {
  reserva_id: string;
  estado: "por_pagar" | "autorizado" | "cobrado" | "transferido" | "devuelto" | "anulado" | "fallido";
  es_real: boolean;
  cuenta: string;
  precio: number;
  tarifa: number;
  comision: number;
  total: number;
  para_dueno: number;
  devuelto: number;
  a_devolver: number;
  /** El conductor canceló tarde una reserva ya aceptada: se cobra aunque no se hubiera llegado a cobrar */
  cobrar_cancelada: boolean;
  retener: boolean;
  por_revisar: boolean;
  version: number;
  sesion: string | null;
  pago: string | null;
  cargo: string | null;
  transferencia: string | null;
  error: string | null;
  soy: "conductor" | "propietario" | null;
  reserva: {
    estado: EstadoReserva;
    cancelada_por: string | null;
    inicio: string;
    fin: string;
    modalidad: "horas" | "dias" | "mes";
    creada: string;
    titulo: string | null;
  } | null;
};

type Sesion = { id: string; status: "open" | "complete" | "expired"; url: string | null; payment_intent: string | null };
type IntentoPago = {
  id: string;
  status: string;
  amount: number;
  currency: string;
  latest_charge: string | null;
  metadata?: Record<string, string>;
};
type Lista<T> = { data: T[] };

type Cambios = {
  estado?: PagoLeido["estado"];
  sesion?: string;
  pago?: string;
  cargo?: string | null;
  transferencia?: string;
  devuelto?: number;
  error?: string | null;
  por_revisar?: boolean;
};
type Paso = { cambios: Cambios; cancelarReserva?: boolean };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const esUuid = (s: unknown): s is string => typeof s === "string" && UUID.test(s);
export const codigoDe = (id: string) => id.replace(/-/g, "").slice(0, 6).toUpperCase();

export async function leerPago(d: Dependencias, reserva: string) {
  return d.rpc<PagoLeido | null>("pago_leer", { p_secreto: d.secreto, p_reserva: reserva });
}

async function guardar(d: Dependencias, p: PagoLeido, cambios: Cambios) {
  return d.rpc<boolean>("pago_cambiar", {
    p_secreto: d.secreto,
    p_reserva: p.reserva_id,
    p_version: p.version,
    p_cambios: cambios,
  });
}

// ---------- Operaciones en Stripe (cada una mira antes lo que ya está hecho) ----------

async function leerIntento(d: Dependencias, id: string) {
  return d.stripe<IntentoPago>("GET", `/v1/payment_intents/${id}`);
}

/** Cobrar lo retenido. Si falla, se devuelve el estado real (por si otro proceso ya lo cobró o caducó). */
async function capturar(d: Dependencias, pi: IntentoPago) {
  try {
    return await d.stripe<IntentoPago>("POST", `/v1/payment_intents/${pi.id}/capture`, undefined, `capturar-${pi.id}`);
  } catch {
    return leerIntento(d, pi.id);
  }
}

/** Liberar lo retenido (no se cobra nada) */
async function anular(d: Dependencias, pi: IntentoPago) {
  try {
    return await d.stripe<IntentoPago>("POST", `/v1/payment_intents/${pi.id}/cancel`, undefined, `anular-${pi.id}`);
  } catch {
    return leerIntento(d, pi.id);
  }
}

/** Devolver al conductor lo que falte hasta `a_devolver` (sin repetir devoluciones ya hechas) */
async function devolver(d: Dependencias, p: PagoLeido) {
  if (!p.pago) throw new ErrorPagos(500, "Falta el pago que hay que devolver");
  const hechas = await d.stripe<Lista<{ amount: number; status: string }>>("GET", "/v1/refunds", { payment_intent: p.pago, limit: 100 });
  const ya = hechas.data.filter((x) => x.status !== "failed" && x.status !== "canceled").reduce((s, x) => s + x.amount, 0);
  const falta = centimos(p.a_devolver) - ya;
  if (falta > 0) {
    await d.stripe("POST", "/v1/refunds",
      { payment_intent: p.pago, amount: falta, reason: "requested_by_customer", metadata: { reserva: p.reserva_id } },
      `devolver-${p.reserva_id}-${centimos(p.a_devolver)}`);
  }
}

/** Transferir al dueño su parte (una sola vez por reserva) */
async function transferir(d: Dependencias, p: PagoLeido) {
  const hechas = await d.stripe<Lista<{ id: string; metadata?: Record<string, string> }>>("GET", "/v1/transfers",
    { transfer_group: p.reserva_id, limit: 10 });
  const hecha = hechas.data.find((t) => t.metadata?.reserva === p.reserva_id);
  if (hecha) return hecha.id;
  if (centimos(p.para_dueno) <= 0) return undefined;
  const t = await d.stripe<{ id: string }>("POST", "/v1/transfers", {
    amount: centimos(p.para_dueno),
    currency: "eur",
    destination: p.cuenta,
    source_transaction: p.cargo ?? undefined,
    transfer_group: p.reserva_id,
    description: `Reserva ${codigoDe(p.reserva_id)}${p.reserva?.titulo ? `: ${p.reserva.titulo}` : ""}`.slice(0, 200),
    metadata: { reserva: p.reserva_id },
  }, `transferir-${p.reserva_id}`);
  return t.id;
}

/** Recuperar del dueño lo transferido (cuando el dueño cancela después de cobrar) */
async function revertirTransferencia(d: Dependencias, p: PagoLeido) {
  if (!p.transferencia) return;
  const t = await d.stripe<{ id: string; amount_reversed: number }>("GET", `/v1/transfers/${p.transferencia}`);
  const objetivo = Math.min(centimos(p.para_dueno), centimos(p.a_devolver));
  const falta = objetivo - (t.amount_reversed ?? 0);
  if (falta > 0) {
    await d.stripe("POST", `/v1/transfers/${t.id}/reversals`, { amount: falta, metadata: { reserva: p.reserva_id } },
      `revertir-${p.reserva_id}-${objetivo}`);
  }
}

/** Qué significa para nosotros el estado de un pago recién completado en la página de pago */
async function trasPagar(d: Dependencias, p: PagoLeido, pi: IntentoPago, sigue: boolean): Promise<Paso | null> {
  // El pago tiene que ser exactamente el de esta reserva
  if (pi.metadata?.reserva !== p.reserva_id || pi.currency !== "eur" || pi.amount !== centimos(p.total)) {
    if (pi.status === "requires_capture") await anular(d, pi);
    return { cambios: { estado: "anulado", pago: pi.id, error: "El pago no coincide con la reserva" }, cancelarReserva: sigue };
  }
  if (pi.status === "requires_capture") return { cambios: { estado: "autorizado", pago: pi.id, error: null } };
  // Cobrado sin que el dueño aceptara (no debería pasar: se cobra solo al aceptar). Se cancela y se devuelve todo.
  if (pi.status === "succeeded") return { cambios: { estado: "cobrado", pago: pi.id, cargo: pi.latest_charge }, cancelarReserva: sigue };
  if (pi.status === "canceled") return { cambios: { estado: "anulado", pago: pi.id }, cancelarReserva: sigue };
  return null; // aún procesándose
}

/** El siguiente paso para este pago (o null si no hay nada que hacer ahora) */
async function siguientePaso(d: Dependencias, p: PagoLeido): Promise<Paso | null> {
  const r = p.reserva;
  const ahora = d.ahora?.() ?? Date.now();

  switch (p.estado) {
    case "por_pagar": {
      const sigue = r?.estado === "pendiente";
      if (!p.sesion) return sigue ? null : { cambios: { estado: "anulado" } };
      const s = await d.stripe<Sesion>("GET", `/v1/checkout/sessions/${p.sesion}`);
      if (s.status === "complete" && s.payment_intent) return trasPagar(d, p, await leerIntento(d, s.payment_intent), sigue);
      if (s.status === "expired") return { cambios: { estado: "anulado" }, cancelarReserva: sigue };
      if (sigue) return null; // todavía pagando
      // La reserva ya no sigue (cancelada, rechazada o borrada): se cierra la página de pago y se vuelve a mirar
      try {
        await d.stripe("POST", `/v1/checkout/sessions/${s.id}/expire`);
      } catch {
        /* se acaba de completar o caducar: lo verá la siguiente vuelta */
      }
      return { cambios: {} };
    }

    case "autorizado": {
      if (!p.pago) return { cambios: { estado: "fallido", error: "Falta el pago retenido" }, cancelarReserva: true };
      let pi = await leerIntento(d, p.pago);
      // Se cobra si está aceptada, o si el conductor la canceló tarde justo después de aceptarse (política de 24 h)
      if (r?.estado === "aceptada" || p.cobrar_cancelada) {
        if (pi.status === "requires_capture") pi = await capturar(d, pi);
        if (pi.status === "succeeded") return { cambios: { estado: "cobrado", cargo: pi.latest_charge, error: null } };
        if (pi.status === "canceled") {
          return { cambios: { estado: "fallido", error: "La retención del pago caducó antes de cobrarla" }, cancelarReserva: true };
        }
        // No se pudo cobrar ahora (red, Stripe…): queda pendiente y se reintenta
        if (pi.status === "requires_capture") throw new ErrorPagos(502, "No se ha podido cobrar el importe retenido; se reintentará");
        return null;
      }
      if (r?.estado === "pendiente") {
        // La retención caducó (o se anuló) antes de que el dueño respondiera
        if (pi.status === "canceled") return { cambios: { estado: "anulado" }, cancelarReserva: true };
        return null;
      }
      // Rechazada, cancelada o borrada: se libera el importe
      if (pi.status === "requires_capture") pi = await anular(d, pi);
      if (pi.status === "succeeded") return { cambios: { estado: "cobrado", cargo: pi.latest_charge } }; // se llegó a cobrar: se devolverá
      if (pi.status === "canceled") return { cambios: { estado: "anulado" } };
      if (pi.status === "requires_capture") throw new ErrorPagos(502, "No se ha podido liberar el importe retenido; se reintentará");
      return null;
    }

    case "cobrado": {
      if (p.a_devolver > 0) {
        await devolver(d, p);
        return { cambios: { estado: "devuelto", devuelto: p.a_devolver, error: null } };
      }
      if (p.retener || !r) return null;
      const toca = (r.estado === "aceptada" || r.estado === "cancelada") &&
        ahora >= new Date(r.inicio).getTime() + TRANSFERENCIA_H * 3600e3;
      if (!toca) return null;
      const transferencia = await transferir(d, p);
      return { cambios: { estado: "transferido", ...(transferencia ? { transferencia } : {}), error: null } };
    }

    case "transferido": {
      if (p.a_devolver > p.devuelto) {
        await revertirTransferencia(d, p);
        await devolver(d, p);
        return { cambios: { estado: "devuelto", devuelto: p.a_devolver, error: null } };
      }
      return null;
    }

    default:
      return null; // devuelto, anulado, fallido: terminado
  }
}

/** Lleva el pago de una reserva hasta donde se pueda ahora. Devuelve cómo ha quedado. */
export async function sincronizarPago(d: Dependencias, reserva: string): Promise<PagoLeido | null> {
  let p = await leerPago(d, reserva);
  for (let vuelta = 0; vuelta < 6 && p; vuelta++) {
    if (p.es_real !== d.real) return p; // pago de prueba con clave real o al revés: no se toca
    let paso: Paso | null;
    try {
      paso = await siguientePaso(d, p);
    } catch (e) {
      const mensaje = (e as Error).message.slice(0, 300);
      d.log?.(`Pago ${reserva}: ${mensaje}`);
      await guardar(d, p, { error: mensaje, por_revisar: true }).catch(() => false);
      return leerPago(d, reserva);
    }
    if (!paso) {
      // Nada que hacer ahora. Si estaba marcado para revisar (o es una página de pago aún abierta), se apunta la
      // revisión para que la tarea de cada 10 minutos pase antes a los demás pagos
      if (p.por_revisar || (p.estado === "por_pagar" && p.sesion)) {
        await guardar(d, p, { por_revisar: false });
        return leerPago(d, reserva);
      }
      return p;
    }
    const guardado = await guardar(d, p, paso.cambios);
    if (guardado && paso.cancelarReserva) {
      await d.rpc("reserva_cancelar_sistema", { p_secreto: d.secreto, p_reserva: reserva });
    }
    p = await leerPago(d, reserva);
  }
  return p;
}

// ---------- Página de pago (Checkout) ----------

const fechaCorta = (iso: string, conHora: boolean) =>
  new Date(iso).toLocaleString("es-ES", {
    timeZone: "Europe/Madrid",
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(conHora ? { hour: "2-digit", minute: "2-digit" } : {}),
  });

/** Crea (o reutiliza) la página de pago de una reserva. Solo para el conductor y mientras está pendiente. */
export async function paginaDePago(d: Dependencias, reserva: string, origen: string): Promise<{ url?: string; pagado?: boolean }> {
  const p = await leerPago(d, reserva);
  if (!p) throw new ErrorPagos(404, "Esta reserva no se paga en la app.");
  if (p.soy !== "conductor") throw new ErrorPagos(403, "Solo quien reserva puede pagar.");
  if (p.es_real !== d.real) throw new ErrorPagos(409, "Esta reserva es de otro modo de pago (prueba o real).");
  if (p.estado !== "por_pagar") return { pagado: true };
  if (p.reserva?.estado !== "pendiente") throw new ErrorPagos(409, "Esta reserva ya no está pendiente.");

  // ¿Ya hay una página de pago abierta? Se reutiliza (así no se paga dos veces con dos pestañas)
  if (p.sesion) {
    const s = await d.stripe<Sesion>("GET", `/v1/checkout/sessions/${p.sesion}`);
    if (s.status === "open" && s.url) return { url: s.url };
    if (s.status === "complete") {
      await sincronizarPago(d, reserva);
      return { pagado: true };
    }
  }

  const ahora = d.ahora?.() ?? Date.now();
  const r = p.reserva;
  const conHora = r.modalidad === "horas";
  const parametros: Parametros = {
    mode: "payment",
    locale: "es",
    client_reference_id: reserva,
    metadata: { reserva },
    success_url: `${origen}/cuenta/reservas/${reserva}?pago=ok`,
    cancel_url: `${origen}/cuenta/reservas/${reserva}?pago=no`,
    // Stripe exige entre 30 min y 24 h. Redondeado al minuto: dos clics seguidos dan la misma página
    expires_at: Math.ceil((ahora + 35 * 60e3) / 60e3) * 60,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "eur",
          unit_amount: centimos(p.precio),
          product_data: {
            name: `Reserva: ${r.titulo ?? "garaje"}`.slice(0, 120),
            description: `${fechaCorta(r.inicio, conHora)} → ${fechaCorta(r.fin, conHora)} · Código ${codigoDe(reserva)}`,
          },
        },
      },
      {
        quantity: 1,
        price_data: {
          currency: "eur",
          unit_amount: centimos(p.tarifa),
          product_data: { name: "Tarifa de servicio", description: "Pago seguro y gestión de la reserva" },
        },
      },
    ],
    payment_intent_data: {
      capture_method: "manual", // solo se retiene; se cobra si el dueño acepta
      transfer_group: reserva,
      description: `Reserva ${codigoDe(reserva)}`,
      metadata: { reserva },
    },
  };
  // La clave incluye la caducidad (cambia cada minuto): un doble clic da la misma página y un reintento posterior
  // no choca con la petición anterior (Stripe rechaza reutilizar una clave con otros datos)
  const s = await d.stripe<Sesion>("POST", "/v1/checkout/sessions", parametros, `pagina-${reserva}-${p.version}-${parametros.expires_at}`);
  if (await guardar(d, p, { sesion: s.id, por_revisar: false })) return { url: s.url ?? undefined };

  // Otra petición a la vez (doble clic): si guardó otra página distinta, se usa esa y se cierra la nuestra
  const otra = await leerPago(d, reserva);
  if (otra?.sesion === s.id) return { url: s.url ?? undefined };
  try {
    await d.stripe("POST", `/v1/checkout/sessions/${s.id}/expire`);
  } catch {
    /* nada */
  }
  if (otra?.sesion) {
    const s2 = await d.stripe<Sesion>("GET", `/v1/checkout/sessions/${otra.sesion}`);
    if (s2.status === "open" && s2.url) return { url: s2.url };
  }
  throw new ErrorPagos(409, "No se ha podido abrir el pago. Inténtalo de nuevo.");
}

// ---------- Cuenta de cobro del dueño (Accounts v2 de Stripe, configuración "recipient") ----------

type CuentaLeida = { usuario: string; cuenta?: string; es_real?: boolean; activa?: boolean };
type CuentaStripe = {
  id: string;
  configuration?: { recipient?: { capabilities?: { stripe_balance?: { stripe_transfers?: { status?: string } } } } };
  requirements?: { entries?: { awaiting_action_from?: string }[] };
};
export type EstadoCuenta = { estado: "sin_cuenta" | "incompleta" | "revision" | "activa"; prueba: boolean };

/** Lista para recibir transferencias (lo único que necesita el dueño: el cobro con tarjeta lo hace la plataforma) */
const cuentaActiva = (a: CuentaStripe) => a.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status === "active";
/** ¿Le falta al dueño rellenar algo? (si no, es Stripe quien lo está revisando) */
const faltanDatos = (a: CuentaStripe) => (a.requirements?.entries ?? []).some((e) => e.awaiting_action_from === "user");

const leerCuentaStripe = (d: Dependencias, id: string) =>
  d.stripe<CuentaStripe>("GET", `/v2/core/accounts/${id}`, { include: ["configuration.recipient", "requirements"] });

async function miCuenta(d: Dependencias) {
  const c = await d.rpc<CuentaLeida>("cuenta_cobro_leer", { p_secreto: d.secreto });
  return { usuario: c.usuario, cuenta: c.cuenta && c.es_real === d.real ? c.cuenta : null, activa: Boolean(c.activa) };
}

/** Estado de la cuenta de cobro del usuario (lo pregunta a Stripe y lo apunta en la base de datos) */
export async function estadoCuenta(d: Dependencias): Promise<EstadoCuenta> {
  const c = await miCuenta(d);
  if (!c.cuenta) return { estado: "sin_cuenta", prueba: !d.real };
  const a = await leerCuentaStripe(d, c.cuenta);
  const activa = cuentaActiva(a);
  if (activa !== c.activa) {
    await d.rpc("cuenta_cobro_guardar", { p_secreto: d.secreto, p_cuenta: c.cuenta, p_es_real: d.real, p_activa: activa });
  }
  return { estado: activa ? "activa" : faltanDatos(a) ? "incompleta" : "revision", prueba: !d.real };
}

/**
 * Enlace para dar de alta (o completar) la cuenta de cobro en la página segura de Stripe.
 * `email`: el de la cuenta del dueño (Stripe lo exige como email de contacto de quien recibe transferencias).
 */
export async function enlaceAltaCuenta(d: Dependencias, origen: string, email: string | undefined) {
  const c = await miCuenta(d); // comprueba también que la sesión es válida
  let cuenta = c.cuenta;
  if (!cuenta) {
    if (!email) throw new ErrorPagos(400, "Tu cuenta no tiene email. Entra con Google o con tu email para activar los cobros.");
    // Particular en España que solo RECIBE transferencias (configuración "recipient"). La plataforma paga las
    // comisiones de Stripe y responde de las pérdidas; el dueño tiene el panel Express para ver sus cobros.
    const alta: Parametros = {
      contact_email: email,
      identity: { country: "es", entity_type: "individual" },
      dashboard: "express",
      defaults: { responsibilities: { fees_collector: "application", losses_collector: "application" } },
      configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } } },
      metadata: { usuario: c.usuario },
      include: ["configuration.recipient"],
    };
    // Misma petición → misma clave (un doble clic no crea dos cuentas); si cambian los datos, clave nueva
    const huella = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(alta)));
    const clave = [...new Uint8Array(huella).slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
    const a = await d.stripe<CuentaStripe>("POST", "/v2/core/accounts", alta, `alta-${c.usuario}-${clave}`);
    await d.rpc("cuenta_cobro_guardar", { p_secreto: d.secreto, p_cuenta: a.id, p_es_real: d.real, p_activa: false });
    cuenta = a.id;
  }
  const enlace = await d.stripe<{ url: string }>("POST", "/v2/core/account_links", {
    account: cuenta,
    use_case: {
      type: "account_onboarding",
      account_onboarding: {
        refresh_url: `${origen}/cuenta?cobros=repetir#cobros`,
        return_url: `${origen}/cuenta?cobros=vuelta#cobros`,
      },
    },
  });
  return enlace.url;
}

/** Enlace al panel de cobros del dueño (pagos recibidos, transferencias al banco). Caduca a los 5 minutos. */
export async function enlacePanelCuenta(d: Dependencias, origen: string) {
  const c = await miCuenta(d);
  if (!c.cuenta) throw new ErrorPagos(404, "Aún no tienes cuenta de cobro.");
  const enlace = await d.stripe<{ url: string }>("POST", "/v2/core/account_links", {
    account: c.cuenta,
    use_case: { type: "account_dashboard", account_dashboard: { refresh_url: `${origen}/cuenta#cobros` } },
  });
  return enlace.url;
}

// ---------- Avisos de Stripe y tarea periódica ----------

export type Evento = { id: string; type: string; account?: string; data?: { object: Record<string, unknown> }; related_object?: { id?: string } };

/** Aviso de Stripe (webhook). No se fía de lo que trae: solo lo usa para saber qué reserva mirar. */
export async function procesarEvento(d: Dependencias, e: Evento) {
  const o = e.data?.object ?? {}; // los avisos v2 ("thin") no traen el objeto
  // Cambios en la cuenta de un dueño (v1 account.updated o avisos v2 de la cuenta): se vuelve a leer de Stripe
  if (e.type === "account.updated" || e.type.startsWith("v2.core.account")) {
    const id = e.type === "account.updated" ? o.id : (e as { related_object?: { id?: string } }).related_object?.id;
    if (typeof id === "string" && id.startsWith("acct_")) {
      const a = await leerCuentaStripe(d, id);
      await d.rpc("cuenta_cobro_guardar", { p_secreto: d.secreto, p_cuenta: id, p_es_real: d.real, p_activa: cuentaActiva(a) });
    }
    return;
  }
  const reserva = (o.metadata as Record<string, string> | undefined)?.reserva ?? o.client_reference_id;
  if (!esUuid(reserva)) return;
  const p = await sincronizarPago(d, reserva);
  // Una página de pago antigua (otra pestaña) que se completó después: ese pago sobra y se libera
  const pi = o.payment_intent;
  if (e.type === "checkout.session.completed" && p && o.id !== p.sesion && typeof pi === "string" && pi !== p.pago) {
    const suelto = await leerIntento(d, pi);
    if (suelto.status === "requires_capture") await anular(d, suelto);
  }
}

/** Revisa los pagos con algo pendiente (o solo uno). Devuelve cuántos ha revisado. */
export async function revisarPendientes(d: Dependencias, reserva?: string) {
  const ids = reserva ? [reserva] : await d.rpc<string[]>("pagos_por_revisar", { p_secreto: d.secreto, p_limite: 8 });
  let revisados = 0;
  for (const id of ids ?? []) {
    try {
      await sincronizarPago(d, id);
      revisados++;
    } catch (e) {
      d.log?.(`Pago ${id}: ${(e as Error).message}`);
    }
  }
  return revisados;
}
