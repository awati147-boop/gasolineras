// Calendario de los garajes: horario semanal, días bloqueados y huecos libres.
// Son las mismas reglas que comprueba la base de datos (garaje_disponible en supabase/garajes.sql).
// Todas las fechas y horas se calculan en la zona horaria del garaje (península o Canarias).

/** Tramo disponible de un día, en minutos desde las 00:00 (el final puede ser 1440 = medianoche) */
export type Tramo = [number, number];
/** Horario semanal: 7 días de lunes a domingo; null = ese día no se alquila */
export type Horario = (Tramo | null)[];
/** horario null = disponible siempre; bloqueados = días sueltos ("2026-12-24") en los que no se alquila */
export type Disponibilidad = { horario: Horario | null; bloqueados: string[] };
export type Ocupada = { inicio: Date; fin: Date };
export type EstadoDia = "libre" | "parcial" | "ocupado" | "cerrado" | "bloqueado" | "pasado";

export const DIA_COMPLETO = 1440;
export const DIAS_CORTOS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
export const DIAS_LARGOS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

/** Plantillas para rellenar el horario de un toque */
export const PLANTILLAS: { nombre: string; horario: Horario | null }[] = [
  { nombre: "Siempre (24 h)", horario: null },
  { nombre: "Laborables 8–20 h", horario: [...Array(5).fill([480, 1200]), null, null] },
  { nombre: "Fines de semana", horario: [...Array(5).fill(null), [0, DIA_COMPLETO], [0, DIA_COMPLETO]] },
  { nombre: "Todos los días 8–22 h", horario: Array(7).fill([480, 1320]) },
];

/** Zona horaria según la longitud: Canarias va una hora por detrás */
export const zonaGaraje = (lon: number) => (lon < -12 ? "Atlantic/Canary" : "Europe/Madrid");

const formatos = new Map<string, Intl.DateTimeFormat>();
function formato(zona: string) {
  let f = formatos.get(zona);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", {
      timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    });
    formatos.set(zona, f);
  }
  return f;
}

/** Fecha ("2026-11-27") y minuto del día (0–1439) de un instante, en la zona horaria del garaje */
export function enZona(d: Date, zona: string) {
  const p: Record<string, string> = {};
  for (const { type, value } of formato(zona).formatToParts(d)) p[type] = value;
  return { fecha: `${p.year}-${p.month}-${p.day}`, minuto: Number(p.hour) * 60 + Number(p.minute) };
}

const aUTC = (fecha: string) => {
  const [a, m, d] = fecha.split("-").map(Number);
  return Date.UTC(a, m - 1, d);
};
/** Suma (o resta) días a una fecha "AAAA-MM-DD" */
export const sumarDias = (fecha: string, n: number) => new Date(aUTC(fecha) + n * 864e5).toISOString().slice(0, 10);
/** Día de la semana: 0 = lunes … 6 = domingo */
export const diaSemana = (fecha: string) => (new Date(aUTC(fecha)).getUTCDay() + 6) % 7;

/** Instante en que el reloj del garaje marca esa fecha y minuto (el minuto 1440 es la medianoche siguiente) */
export function instante(fecha: string, minuto: number, zona: string): Date {
  const deseado = aUTC(fecha) + minuto * 60e3;
  let t = deseado;
  for (let i = 0; i < 3; i++) {
    const v = enZona(new Date(t), zona);
    const visto = aUTC(v.fecha) + v.minuto * 60e3;
    if (visto === deseado) break;
    t += deseado - visto;
  }
  return new Date(t);
}

export const horaTexto = (minuto: number) =>
  `${String(Math.floor(minuto / 60)).padStart(2, "0")}:${String(minuto % 60).padStart(2, "0")}`;
export const tramoTexto = (t: Tramo) =>
  t[0] === 0 && t[1] === DIA_COMPLETO ? "24 h" : `${horaTexto(t[0])}–${horaTexto(t[1])}`;

/** ¿Es un horario que acepta la base de datos? (7 días, tramos en múltiplos de 15 min, al menos un día) */
export function horarioValido(h: Horario | null): boolean {
  if (h === null) return true;
  if (!Array.isArray(h) || h.length !== 7) return false;
  const bien = (t: Tramo | null) =>
    t === null ||
    (Array.isArray(t) && t.length === 2 && Number.isInteger(t[0]) && Number.isInteger(t[1]) &&
      t[0] >= 0 && t[1] <= DIA_COMPLETO && t[0] < t[1] && t[0] % 15 === 0 && t[1] % 15 === 0);
  return h.every(bien) && h.some((t) => t !== null);
}

/** Tramo disponible de un día concreto (null = no se alquila ese día). Sin horario: todo el día */
export function tramoDelDia(d: Disponibilidad, fecha: string): Tramo | null {
  if (d.bloqueados.includes(fecha)) return null;
  if (!d.horario) return [0, DIA_COMPLETO];
  return d.horario[diaSemana(fecha)] ?? null;
}

/** ¿Está disponible durante todo [inicio, fin)? Misma regla que la base de datos */
export function disponibleEn(d: Disponibilidad, inicio: Date, fin: Date, zona: string): boolean {
  if (!(fin > inicio)) return false;
  let t = inicio;
  for (let vueltas = 0; t < fin; vueltas++) {
    if (vueltas > 400) return false;
    const { fecha, minuto } = enZona(t, zona);
    const tramo = tramoDelDia(d, fecha);
    if (!tramo || minuto < tramo[0] || minuto >= tramo[1]) return false;
    const siguiente = instante(fecha, tramo[1], zona);
    if (siguiente <= t) return false;
    t = siguiente;
  }
  return true;
}

/** Resta a unos tramos otro tramo [a, b) */
function restar(tramos: Tramo[], a: number, b: number): Tramo[] {
  const r: Tramo[] = [];
  for (const [x, y] of tramos) {
    if (b <= x || a >= y) r.push([x, y]);
    else {
      if (a > x) r.push([x, a]);
      if (b < y) r.push([b, y]);
    }
  }
  return r;
}

/** Huecos libres de un día: el horario menos las reservas aceptadas y, si es hoy, lo que ya ha pasado */
export function huecosLibres(d: Disponibilidad, ocupadas: Ocupada[], fecha: string, zona: string, ahora = new Date()): Tramo[] {
  const tramo = tramoDelDia(d, fecha);
  if (!tramo) return [];
  const hoy = enZona(ahora, zona);
  if (fecha < hoy.fecha) return [];
  let huecos: Tramo[] = [tramo];
  if (fecha === hoy.fecha) huecos = restar(huecos, 0, Math.ceil(hoy.minuto / 15) * 15);
  const ini = instante(fecha, 0, zona), fin = instante(fecha, DIA_COMPLETO, zona);
  for (const o of ocupadas) {
    if (o.fin <= ini || o.inicio >= fin) continue;
    const a = o.inicio <= ini ? 0 : enZona(o.inicio, zona).minuto;
    const b = o.fin >= fin ? DIA_COMPLETO : enZona(o.fin, zona).minuto;
    huecos = restar(huecos, a, b);
  }
  return huecos.filter(([a, b]) => b - a >= 15);
}

const minutos = (t: Tramo[]) => t.reduce((s, [a, b]) => s + b - a, 0);

/** Cómo está un día en el calendario */
export function estadoDia(d: Disponibilidad, ocupadas: Ocupada[], fecha: string, zona: string, ahora = new Date()): EstadoDia {
  if (fecha < enZona(ahora, zona).fecha) return "pasado";
  if (d.bloqueados.includes(fecha)) return "bloqueado";
  const posible = huecosLibres(d, [], fecha, zona, ahora);
  if (!posible.length) return "cerrado"; // no se alquila ese día (o hoy ya ha terminado su horario)
  const libre = huecosLibres(d, ocupadas, fecha, zona, ahora);
  if (!libre.length) return "ocupado";
  return minutos(libre) === minutos(posible) ? "libre" : "parcial";
}

/** "Lun–Vie 08:00–20:00 · Sáb–Dom 24 h" */
export function resumenHorario(h: Horario | null): string {
  if (!h || h.every((t) => t && t[0] === 0 && t[1] === DIA_COMPLETO)) return "Todos los días, 24 h";
  const grupos: { desde: number; hasta: number; t: Tramo }[] = [];
  h.forEach((t, i) => {
    if (!t) return;
    const ultimo = grupos.at(-1);
    if (ultimo && ultimo.hasta === i - 1 && ultimo.t[0] === t[0] && ultimo.t[1] === t[1]) ultimo.hasta = i;
    else grupos.push({ desde: i, hasta: i, t });
  });
  if (grupos.length === 1 && grupos[0].desde === 0 && grupos[0].hasta === 6) return `Todos los días, ${tramoTexto(grupos[0].t)}`;
  return grupos
    .map((g) => `${g.desde === g.hasta ? DIAS_CORTOS[g.desde] : `${DIAS_CORTOS[g.desde]}–${DIAS_CORTOS[g.hasta]}`} ${tramoTexto(g.t)}`)
    .join(" · ");
}

/** Lee la disponibilidad de un garaje tal como llega de la base de datos */
export function disponibilidadDe(g: { horario?: Horario | null; bloqueados?: string[] | null }): Disponibilidad {
  return { horario: g.horario ?? null, bloqueados: g.bloqueados ?? [] };
}
