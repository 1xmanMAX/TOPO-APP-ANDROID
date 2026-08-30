/**
 * Deja la palabra en su forma comparable: sin mayúsculas, sin tildes y sin
 * espacios de sobra. Así `VEREDA`, `vereda` y ` Vereda ` son la misma
 * palabra, que es lo que espera cualquiera que escriba a mano en una hoja de
 * cálculo.
 */
export function normalizarPalabra(bruta: string): string {
  return bruta
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

/** Compara dos palabras ya normalizadas por los dos lados. */
export function mismaPalabra(a: string, b: string): boolean {
  return normalizarPalabra(a) === normalizarPalabra(b)
}
