// Distintivo de cada marca: iniciales + color (no son los logos oficiales, que son marcas registradas)
const MARCAS: [RegExp, string, string][] = [
  [/repsol/i, "R", "#f68b1f"],
  [/cepsa|moeve/i, "C", "#d6001c"],
  [/\bbp\b/i, "BP", "#009b3a"],
  [/galp/i, "G", "#f26522"],
  [/shell/i, "S", "#e8a800"],
  [/plenergy/i, "PL", "#0071bc"],
  [/ballenoil/i, "BA", "#00a0e3"],
  [/petroprix/i, "PP", "#e2001a"],
  [/carrefour/i, "CA", "#004e9f"],
  [/alcampo/i, "AL", "#e30613"],
  [/eroski/i, "ER", "#e2001a"],
  [/avia/i, "AV", "#c8102e"],
  [/petronor/i, "PN", "#f68b1f"],
  [/campsa/i, "CS", "#c8102e"],
  [/disa/i, "DI", "#005ca9"],
  [/tamoil/i, "TA", "#e30613"],
  [/esclatoil/i, "EO", "#00843d"],
  [/q8|kuwait/i, "Q8", "#003da5"],
  [/meroil/i, "ME", "#00529b"],
  [/costco/i, "CO", "#005daa"],
];

export type Distintivo = { texto: string; color: string };

export function distintivo(rotulo: string): Distintivo {
  for (const [patron, texto, color] of MARCAS) if (patron.test(rotulo)) return { texto, color };
  return { texto: "⛽", color: "#6b7280" }; // sin marca conocida
}
