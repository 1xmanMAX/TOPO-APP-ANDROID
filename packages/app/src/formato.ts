import { redondear3 } from '@topo/core'

/**
 * Cotas y lecturas siempre con 3 decimales, redondeando de forma estable.
 * `toFixed` por sí solo redondea el número tal como quedó en binario: una cota
 * de 3244.6274999999996 saldría como 3244.627 en vez de 3244.628, un milímetro
 * por debajo de lo que el topógrafo calculó.
 */
export function formatearCota(valor: number): string {
  return redondear3(valor).toFixed(3)
}
