// "He aparcado aquí": dónde está el coche y hasta cuándo dura el ticket de la ORA.
// Se guarda SOLO en este móvil (localStorage): nunca se envía al servidor.

export type MiCoche = {
  lat: number;
  lon: number;
  aparcado: string; // ISO
  ticketHasta?: string | null; // ISO, fin del ticket de la ORA o del parquímetro
  avisado?: boolean; // ya se avisó de que quedan 10 min
};

const CLAVE = "mi-coche";
const EVENTO = "mi-coche"; // para que el mapa y las tarjetas se enteren de los cambios
export const AVISO_MIN = 10; // minutos antes del fin del ticket

export function leerCoche(): MiCoche | null {
  try {
    const c = JSON.parse(localStorage.getItem(CLAVE) ?? "null") as MiCoche | null;
    if (!c || typeof c.lat !== "number" || typeof c.lon !== "number") return null;
    // Pasados 3 días ya no sirve de nada: se olvida solo
    if (Date.now() - new Date(c.aparcado).getTime() > 3 * 864e5) {
      localStorage.removeItem(CLAVE);
      return null;
    }
    return c;
  } catch {
    return null;
  }
}

export function guardarCoche(c: MiCoche | null) {
  try {
    if (c) localStorage.setItem(CLAVE, JSON.stringify(c));
    else localStorage.removeItem(CLAVE);
  } catch {
    // modo privado o almacenamiento lleno: se pierde al cerrar, pero la pantalla sigue funcionando
  }
  window.dispatchEvent(new CustomEvent(EVENTO, { detail: c }));
}

/** Escucha los cambios (desde otra tarjeta, el mapa u otra pestaña) */
export function alCambiarCoche(fn: (c: MiCoche | null) => void) {
  const local = (e: Event) => fn((e as CustomEvent<MiCoche | null>).detail);
  const otraPestana = (e: StorageEvent) => e.key === CLAVE && fn(leerCoche());
  window.addEventListener(EVENTO, local);
  window.addEventListener("storage", otraPestana);
  return () => {
    window.removeEventListener(EVENTO, local);
    window.removeEventListener("storage", otraPestana);
  };
}

/** Distancia en metros entre dos puntos (aproximada, suficiente para "a 300 m") */
export function distanciaM(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const r = 6371e3, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(x));
}

/** Archivo de calendario con una alarma 10 min antes del fin del ticket (funciona con la web cerrada) */
export function alarmaTicket(hasta: Date) {
  const f = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const fin = new Date(hasta.getTime() + 5 * 60e3);
  const lineas = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Mevoy//Ticket ORA//ES", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:ticket-${hasta.getTime()}@mevoy`,
    `DTSTAMP:${f(new Date())}`,
    `DTSTART:${f(hasta)}`,
    `DTEND:${f(fin)}`,
    "SUMMARY:🚗 Se acaba el ticket de aparcamiento",
    "DESCRIPTION:Renueva el ticket o mueve el coche para evitar la multa.",
    "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Quedan 10 minutos de ticket", `TRIGGER:-PT${AVISO_MIN}M`, "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ];
  return new Blob([lineas.join("\r\n")], { type: "text/calendar;charset=utf-8" });
}
