// Utilidades compartidas de reservas (navegador)
import type { EstadoPago } from "./pagos";

export type Reserva = {
  id: string;
  garaje_id: string;
  titulo: string;
  foto: string | null;
  rol: "conductor" | "propietario";
  modalidad: "horas" | "dias" | "mes";
  inicio: string;
  fin: string;
  precio: number;
  estado: "pendiente" | "aceptada" | "rechazada" | "cancelada";
  cancelada_por: "conductor" | "propietario" | "sistema" | null;
  creada: string;
  ultimo_mensaje: string | null;
  matricula: string | null;
  /** Se paga en la app (el dueño cobra por la app) */
  con_pago: boolean;
  /** Estado del pago en la app (null si no se paga en la app) */
  pago: EstadoPago | null;
  /** Se aceptó sola (reserva instantánea) */
  instantanea?: boolean;
  /** Mis estrellas para esta reserva y, si soy el dueño, la nota del conductor (null si no hay valoraciones aún) */
  valoracion?: { mia: number | null; nota_conductor: number | null; num_conductor: number } | null;
};

/** Días que hay para valorar una reserva desde que termina (como en supabase/valoraciones.sql) */
export const DIAS_PARA_VALORAR = 30;

/** ¿Puedo valorarla ya? (aceptada, terminada hace menos de 30 días y aún sin valorar) */
export function porValorar(r: Pick<Reserva, "estado" | "fin" | "valoracion">, ahora = Date.now()) {
  const fin = new Date(r.fin).getTime();
  return r.estado === "aceptada" && Boolean(r.valoracion) && r.valoracion!.mia == null &&
    fin <= ahora && fin > ahora - DIAS_PARA_VALORAR * 864e5;
}

/** Tarifa de servicio con pago directo al dueño: gratis (con pago en la app, ver tarifaServicio() en pagos.ts) */
export const TARIFA_SERVICIO = 0;

/** Horas antes del inicio hasta las que se puede cancelar gratis */
export const CANCELACION_GRATIS_H = 24;

/** Código corto de la reserva para identificarse con el dueño ("7F3A2C") */
export const codigoReserva = (id: string) => id.replace(/-/g, "").slice(0, 6).toUpperCase();

/** Matrícula normalizada: mayúsculas, sin espacios ni guiones ("1234 abc" -> "1234ABC") */
export const limpiarMatricula = (m: string) => m.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Archivo .ics para añadir la reserva al calendario del móvil (sin servidor) */
export function archivoCalendario(e: { id: string; titulo: string; inicio: string; fin: string; lugar?: string | null; notas?: string }) {
  const fecha = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const texto = (s: string) => s.replace(/\\/g, "\\\\").replace(/([,;])/g, "\\$1").replace(/\r?\n/g, "\\n");
  const lineas = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Reservas de garaje//ES",
    "BEGIN:VEVENT",
    `UID:${e.id}@reservas`,
    `DTSTAMP:${fecha(new Date().toISOString())}`,
    `DTSTART:${fecha(e.inicio)}`,
    `DTEND:${fecha(e.fin)}`,
    `SUMMARY:${texto(`Garaje: ${e.titulo}`)}`,
    e.lugar ? `LOCATION:${texto(e.lugar)}` : "",
    e.notas ? `DESCRIPTION:${texto(e.notas)}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  return new Blob([lineas.join("\r\n")], { type: "text/calendar;charset=utf-8" });
}

export const ESTADOS: Record<Reserva["estado"], { texto: string; clase: string }> = {
  pendiente: { texto: "Pendiente de respuesta", clase: "estadoPendiente" },
  aceptada: { texto: "Aceptada", clase: "estadoAceptada" },
  rechazada: { texto: "Rechazada", clase: "estadoRechazada" },
  cancelada: { texto: "Cancelada", clase: "estadoRechazada" },
};

/** Texto del estado de una reserva para quien la mira */
export function textoEstado(r: Pick<Reserva, "estado" | "rol" | "con_pago" | "pago" | "cancelada_por" | "instantanea">) {
  if (r.estado === "pendiente" && r.con_pago && r.pago !== "autorizado") {
    return r.rol === "propietario" ? "Esperando el pago del conductor" : "Falta completar el pago";
  }
  if (r.estado === "pendiente" && r.rol === "propietario") return "Nueva solicitud: responde";
  if (r.estado === "cancelada" && r.cancelada_por === "sistema") return "Cancelada automáticamente";
  if (r.estado === "aceptada" && r.instantanea) return "Confirmada ⚡";
  return ESTADOS[r.estado].texto;
}

/** ¿Tiene que hacer algo el dueño? (solicitud nueva, y si es con pago, ya pagada) */
export const pendienteDeResponder = (r: Pick<Reserva, "estado" | "rol" | "con_pago" | "pago">) =>
  r.rol === "propietario" && r.estado === "pendiente" && (!r.con_pago || r.pago === "autorizado");

/** "sáb, 29 nov, 10:00" (con hora solo si es por horas) */
export const fechaReserva = (iso: string, conHora: boolean) =>
  new Date(iso).toLocaleString("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(conHora ? { hour: "2-digit", minute: "2-digit" } : {}),
  });

export const eurosReserva = (n: number) => `${Number(n).toFixed(2).replace(".", ",").replace(",00", "")} €`;

/** ¿Ya ha pasado la reserva? */
export const terminada = (r: Pick<Reserva, "fin">) => new Date(r.fin).getTime() < Date.now();

/** Reservas de una pestaña ordenadas para gestionarlas: lo que hay que hacer, lo que viene y lo que ya pasó */
export function agruparReservas(lista: Reserva[], ahora = Date.now()) {
  const fin = (r: Reserva) => new Date(r.fin).getTime();
  const inicio = (r: Reserva) => new Date(r.inicio).getTime();
  const pendientes = lista
    .filter((r) => r.estado === "pendiente" && fin(r) > ahora)
    .sort((a, b) => new Date(a.creada).getTime() - new Date(b.creada).getTime());
  const proximas = lista.filter((r) => r.estado === "aceptada" && fin(r) > ahora).sort((a, b) => inicio(a) - inicio(b));
  const anteriores = lista.filter((r) => !pendientes.includes(r) && !proximas.includes(r)).sort((a, b) => inicio(b) - inicio(a));
  return { pendientes, proximas, anteriores };
}

/** Lo que recibe el dueño por una reserva (con pago en la app se descuenta la comisión) */
export const netoDueno = (r: Pick<Reserva, "precio" | "con_pago">, comision: (precio: number) => number) =>
  Math.round((Number(r.precio) - (r.con_pago ? comision(Number(r.precio)) : 0)) * 100) / 100;

/** Resumen para el panel de Mi cuenta */
export function resumenReservas(reservas: Reserva[], comision: (precio: number) => number, ahora = new Date()) {
  const t = ahora.getTime();
  const mes = (iso: string) => {
    const d = new Date(iso);
    return d.getFullYear() === ahora.getFullYear() && d.getMonth() === ahora.getMonth();
  };
  const recibidas = reservas.filter((r) => r.rol === "propietario");
  const delMes = recibidas.filter((r) => r.estado === "aceptada" && mes(r.inicio));
  const proxima = reservas
    .filter((r) => r.estado === "aceptada" && new Date(r.fin).getTime() > t)
    .sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime())[0] ?? null;
  return {
    porResponder: recibidas.filter(pendienteDeResponder).length,
    porValorar: reservas.filter((r) => porValorar(r, t)),
    esperando: reservas.filter((r) => r.rol === "conductor" && r.estado === "pendiente" && new Date(r.fin).getTime() > t).length,
    proxima,
    ganadoMes: Math.round(delMes.reduce((s, r) => s + netoDueno(r, comision), 0) * 100) / 100,
    reservasMes: delMes.length,
    esDueno: recibidas.length > 0,
  };
}
