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

/**
 * Una cuenta con su sustantivo en el número que le toca: «7 progresivas»,
 * «1 progresiva». Un plural falso —«1 progresivas»— se lee como un descuido
 * y le quita crédito a la cifra que va al lado.
 */
export function cuenta(cuantas: number, singular: string, plural: string): string {
  return `${cuantas} ${cuantas === 1 ? singular : plural}`
}
