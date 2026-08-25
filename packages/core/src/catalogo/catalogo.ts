import { CODIGOS_DE_FABRICA, type Concepto } from './conceptos'

/**
 * Qué código significa qué. Viaja en el archivo del proyecto, porque sin él
 * reimportar la misma hoja daría otro resultado.
 */
export interface Catalogo {
  /** Del código ya normalizado al concepto. */
  codigos: Record<string, Concepto>
}

/**
 * Deja el código en su forma comparable: sin mayúsculas, sin tildes y sin
 * espacios de sobra. Así `ZKJ`, `zkj` y ` Zkj ` son el mismo código, que es lo
 * que espera cualquiera que escriba a mano en una hoja de cálculo.
 */
export function normalizarCodigo(bruto: string): string {
  return bruto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

export function catalogoDeFabrica(): Catalogo {
  const codigos: Record<string, Concepto> = {}
  for (const [concepto, lista] of Object.entries(CODIGOS_DE_FABRICA)) {
    for (const codigo of lista) codigos[normalizarCodigo(codigo)] = concepto as Concepto
  }
  return { codigos }
}

/** El concepto de un código, o null si no se conoce — para poder preguntar. */
export function conceptoDe(catalogo: Catalogo, codigo: string): Concepto | null {
  return catalogo.codigos[normalizarCodigo(codigo)] ?? null
}

/** Igual que `conceptoDe`, con nombre propio para leerse bien donde se avisa. */
export function conceptoAnteriorDe(catalogo: Catalogo, codigo: string): Concepto | null {
  return conceptoDe(catalogo, codigo)
}

/** Devuelve un catálogo nuevo: el de entrada no se toca. */
export function aprenderCodigo(catalogo: Catalogo, codigo: string, concepto: Concepto): Catalogo {
  return { codigos: { ...catalogo.codigos, [normalizarCodigo(codigo)]: concepto } }
}
