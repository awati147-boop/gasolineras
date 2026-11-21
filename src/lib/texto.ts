/** "JÁVEA/XÀBIA" -> "javea/xabia" (minúsculas, sin tildes). Igual que en scripts/importar.mts */
export function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

const MINUSCULAS = new Set(["de", "del", "la", "las", "los", "el", "y", "e", "en", "a", "s/n", "km."]);

/** "VILLAJOYOSA / VILA JOIOSA (LA)" -> "Villajoyosa / Vila Joiosa (La)" */
export function nombrePropio(texto: string): string {
  return texto
    .toLowerCase()
    .split(/(\s+|\/|\(|-)/)
    .map((p, i) => (i > 0 && MINUSCULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join("")
    .replace(/\bS\/n\b/gi, "s/n");
}
