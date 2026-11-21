/** "JÁVEA/XÀBIA" -> "javea/xabia" (minúsculas, sin tildes). Igual que en scripts/importar.mts */
export function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}
