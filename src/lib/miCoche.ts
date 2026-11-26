// "He aparcado aquí": dónde está el coche y hasta cuándo dura el ticket de la ORA.
// Se guarda SOLO en este móvil (localStorage): nunca se envía al servidor.

export type MiCoche = {
  lat: number;
  lon: number;
  aparcado: string; // ISO
  ticketHasta?: string | null; // ISO, fin del ticket de la ORA o del parquímetro
  precision?: number | null; // metros (lo que dice el GPS); null = colocado a mano en el mapa
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

/** Precisión a partir de la cual avisamos de que conviene comprobar el sitio en el mapa */
export const PRECISION_MALA_M = 100;

/**
 * Posición lo más precisa posible: escucha el GPS unos segundos y se queda con la mejor lectura.
 * (La primera que da el móvil suele venir del wifi o la red y puede fallar por cientos de metros.)
 * Termina antes si llega una lectura buena (±20 m). Solo se usa en el navegador.
 */
export function localizarPreciso(alAvanzar?: (precisionM: number) => void, { maxMs = 12000, buenaM = 20 } = {}) {
  return new Promise<{ lat: number; lon: number; precision: number }>((ok, mal) => {
    let mejor: GeolocationPosition | null = null;
    let hecho = false;
    let id = -1;
    const terminar = (error?: Error) => {
      if (hecho) return;
      hecho = true;
      navigator.geolocation.clearWatch(id);
      clearTimeout(espera);
      if (mejor) ok({ lat: mejor.coords.latitude, lon: mejor.coords.longitude, precision: Math.round(mejor.coords.accuracy) });
      else mal(error ?? new Error("No se ha podido obtener tu ubicación."));
    };
    const espera = setTimeout(() => terminar(), maxMs);
    id = navigator.geolocation.watchPosition(
      (pos) => {
        if (!mejor || pos.coords.accuracy < mejor.coords.accuracy) mejor = pos;
        alAvanzar?.(Math.round(mejor.coords.accuracy));
        if (mejor.coords.accuracy <= buenaM) terminar();
      },
      (e) => {
        // Sin permiso no hay nada que esperar; otros fallos (sin señal todavía) se reintentan hasta el límite
        if (e.code === e.PERMISSION_DENIED) terminar(new Error("Sin permiso de ubicación: actívalo para este navegador."));
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: maxMs },
    );
  });
}

/** Pide al mapa de Aparcar que enseñe el coche (si estás en otra pantalla, se usa /aparcar#coche) */
export const verCocheEnMapa = () => window.dispatchEvent(new Event("ver-coche"));

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
