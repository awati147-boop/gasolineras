// Gasolineras favoritas: se guardan SOLO en este móvil (localStorage), con el último precio visto de cada
// carburante para decir si ha bajado o subido desde la visita anterior.

type PrecioVisto = { ultimo: number; visto: string; anterior?: number; anteriorVisto?: string };
export type Favorita = { id: number; rotulo: string; localidad: string; precios: Record<string, PrecioVisto> };
export type Cambio = { diferencia: number; desde: string } | null;

const CLAVE = "gasolineras-favoritas";
const EVENTO = "gasolineras-favoritas";
export const MAX_FAVORITAS = 10;
const NUEVA_VISITA_MS = 12 * 3600e3; // una visita nueva si han pasado más de 12 h

export function leerFavoritas(): Favorita[] {
  try {
    const l = JSON.parse(localStorage.getItem(CLAVE) ?? "[]");
    return Array.isArray(l) ? l.filter((f) => Number.isInteger(f?.id)) : [];
  } catch {
    return [];
  }
}

function guardar(l: Favorita[], avisar = true) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(l));
  } catch {
    // sin almacenamiento (modo privado): dura lo que la pestaña
  }
  if (avisar) window.dispatchEvent(new CustomEvent(EVENTO, { detail: l }));
}

export const esFavorita = (id: number) => leerFavoritas().some((f) => f.id === id);

/** Guarda o quita una gasolinera. Devuelve si queda guardada (false también si ya había el máximo) */
export function alternarFavorita(g: { id: number; rotulo: string; localidad: string }): boolean {
  const l = leerFavoritas();
  if (l.some((f) => f.id === g.id)) {
    guardar(l.filter((f) => f.id !== g.id));
    return false;
  }
  if (l.length >= MAX_FAVORITAS) return false;
  guardar([...l, { id: g.id, rotulo: g.rotulo, localidad: g.localidad, precios: {} }]);
  return true;
}

export function alCambiarFavoritas(fn: (l: Favorita[]) => void) {
  const local = (e: Event) => fn((e as CustomEvent<Favorita[]>).detail);
  const otraPestana = (e: StorageEvent) => e.key === CLAVE && fn(leerFavoritas());
  window.addEventListener(EVENTO, local);
  window.addEventListener("storage", otraPestana);
  return () => {
    window.removeEventListener(EVENTO, local);
    window.removeEventListener("storage", otraPestana);
  };
}

/**
 * Apunta los precios de ahora y calcula el cambio desde la visita anterior (hace más de 12 h).
 * Dentro de la misma visita el cambio no se pierde: se compara siempre con lo visto en la visita anterior.
 */
export function apuntarPrecios(lista: Favorita[], carburante: string, actuales: Map<number, number>, ahora = new Date()) {
  const cambios = new Map<number, Cambio>();
  const nueva = lista.map((f) => {
    const actual = actuales.get(f.id);
    if (actual === undefined) {
      cambios.set(f.id, null);
      return f;
    }
    const p = f.precios[carburante];
    let q: PrecioVisto;
    if (!p) q = { ultimo: actual, visto: ahora.toISOString() };
    else if (ahora.getTime() - new Date(p.visto).getTime() > NUEVA_VISITA_MS) {
      q = { ultimo: actual, visto: ahora.toISOString(), anterior: p.ultimo, anteriorVisto: p.visto };
    } else q = { ...p, ultimo: actual };
    cambios.set(f.id, q.anterior !== undefined ? { diferencia: Math.round((actual - q.anterior) * 1000) / 1000, desde: q.anteriorVisto! } : null);
    return { ...f, precios: { ...f.precios, [carburante]: q } };
  });
  return { lista: nueva, cambios };
}

/** Guarda los precios apuntados sin avisar a las pantallas (no cambia qué gasolineras son favoritas) */
export function guardarPreciosVistos(l: Favorita[]) {
  guardar(l, false);
}
