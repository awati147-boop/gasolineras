// Utilidades compartidas de reservas (navegador)

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
  cancelada_por: "conductor" | "propietario" | null;
  creada: string;
  ultimo_mensaje: string | null;
};

export const ESTADOS: Record<Reserva["estado"], { texto: string; clase: string }> = {
  pendiente: { texto: "Pendiente de respuesta", clase: "estadoPendiente" },
  aceptada: { texto: "Aceptada", clase: "estadoAceptada" },
  rechazada: { texto: "Rechazada", clase: "estadoRechazada" },
  cancelada: { texto: "Cancelada", clase: "estadoRechazada" },
};

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
