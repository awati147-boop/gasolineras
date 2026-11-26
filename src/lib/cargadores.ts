// Puntos de recarga de coche eléctrico (datos oficiales del MITECO vía DGT): tipos, colores y textos

export const ELECTRICO = "electrico"; // "carburante" especial en la pestaña Gasolina

export type Conector = { t: string; kw: number; n: number };
export type Cargador = {
  id: string; nombre: string | null; operador: string | null; direccion: string | null; municipio: string | null;
  horario: string | null; lat: number; lon: number; puntos: number; potencia_kw: number;
  conectores: Conector[]; tipos: string[]; pago: string[];
};

/** Colores por velocidad de carga (distintos de los de precio de la gasolina) */
export const COLORES_EV = { ultra: "#7c3aed", rapida: "#2563eb", media: "#0d9488", lenta: "#64748b" };
export type NivelEv = keyof typeof COLORES_EV;
export const nivelEv = (kw: number): NivelEv => (kw >= 150 ? "ultra" : kw >= 50 ? "rapida" : kw >= 22 ? "media" : "lenta");
export const NOMBRE_NIVEL: Record<NivelEv, string> = {
  ultra: "Ultrarrápido · 150 kW o más",
  rapida: "Rápido · 50–149 kW",
  media: "Semirrápido · 22–49 kW",
  lenta: "Lento · menos de 22 kW",
};

export const kwTexto = (kw: number) => `${Number.isInteger(kw) ? kw : String(kw).replace(".", ",")} kW`;

const NOMBRE_CONECTOR: Record<string, string> = {
  ccs: "CCS", tipo2: "Tipo 2", chademo: "CHAdeMO", schuko: "Enchufe normal", tipo1: "Tipo 1", otros: "Otro",
};
/** "CCS 150 kW ×2 · Tipo 2 22 kW" */
export const conectoresTexto = (cs: Conector[]) =>
  cs.map((c) => `${NOMBRE_CONECTOR[c.t] ?? c.t} ${kwTexto(c.kw)}${c.n > 1 ? ` ×${c.n}` : ""}`).join(" · ");

const PAGOS: Record<string, string> = { apps: "App", rfid: "Tarjeta del operador", tarjeta: "Tarjeta bancaria", nfc: "Móvil (NFC)" };
export const pagoTexto = (p: string[]) => p.map((x) => PAGOS[x]).filter(Boolean).join(", ");

export const VELOCIDADES = [
  { kw: 0, nombre: "Todos" },
  { kw: 50, nombre: "Rápidos (50 kW+)" },
  { kw: 150, nombre: "Ultrarrápidos (150 kW+)" },
];
export const CONECTORES_FILTRO = [
  { id: "ccs", nombre: "CCS" },
  { id: "tipo2", nombre: "Tipo 2" },
  { id: "chademo", nombre: "CHAdeMO" },
];
