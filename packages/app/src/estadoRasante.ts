import type { EstadoTolerancia } from '@topo/core'

/**
 * Mismo texto en cualquier vista que hable de una celda evaluada contra la
 * rasante — la tabla de diferencias y el mapa de la calle, por ahora — para
 * que el mismo estado nunca se lea distinto según dónde se mire.
 */
export const ETIQUETA_ESTADO: Record<EstadoTolerancia, string> = {
  conforme: 'conforme',
  alLimite: 'al límite de tolerancia',
  fuera: 'fuera de tolerancia',
  sinRasante: 'fuera de la sección definida por el proyecto',
  sinMedir: 'sin medir',
}

/**
 * El símbolo es el segundo canal, además del color: solo lo llevan los tres
 * estados de tolerancia, que son los que de verdad tienen algo que decir. Una
 * celda sin medir o fuera de sección no tiene un semáforo que mostrar — cada
 * vista decide aparte cómo marcar esas dos, si es que lo necesita.
 */
export const SIMBOLO_ESTADO_TOLERANCIA: Partial<Record<EstadoTolerancia, string>> = {
  conforme: '✓',
  alLimite: '△',
  fuera: '✗',
}

/**
 * Milímetros con signo, tal como se leen en obra: "+18 mm" sobra material,
 * "−7 mm" falta. El cero no lleva signo.
 */
export function formatearDiferencia(diferenciaMm: number): string {
  const signo = diferenciaMm > 0 ? '+' : diferenciaMm < 0 ? '−' : ''
  return `${signo}${Math.abs(diferenciaMm)} mm`
}

export function textoAccion(diferenciaMm: number): string {
  if (diferenciaMm > 0) return 'cortar'
  if (diferenciaMm < 0) return 'rellenar'
  return 'clavado en la cota del proyecto'
}
