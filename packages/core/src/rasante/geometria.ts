import type { Rasante, TramoTransversal } from '../modelo/tipos'
import { redondear3 } from '../numero'

/** Cota de la rasante en el eje de la calle, a esa progresiva. */
export function cotaEjeRasante(rasante: Rasante, progresiva: number): number {
  const avance = progresiva - rasante.progresivaArranque
  return redondear3(rasante.cotaArranque + (avance * rasante.pendienteLongitudinal) / 100)
}

function tramosDelLado(rasante: Rasante, offset: number): TramoTransversal[] {
  if (offset < 0 && !rasante.simetrica && rasante.tramosIzquierda !== null) {
    return rasante.tramosIzquierda
  }
  return rasante.tramos
}

/**
 * Cuánto sube o baja la rasante desde el eje hasta ese offset.
 *
 * Devuelve `null` si el offset cae más allá del último tramo: el proyecto no
 * define rasante ahí, y prolongar la última pendiente sería inventarse una
 * cota que nadie proyectó. Quien llame lo trata como «esta celda queda fuera
 * de la sección definida», no como un cero.
 */
export function desnivelTransversal(rasante: Rasante, offset: number): number | null {
  const tramos = tramosDelLado(rasante, offset)
  if (tramos.length === 0) return null

  const distancia = Math.abs(offset)
  const ultimo = tramos[tramos.length - 1]!
  if (distancia > ultimo.hastaOffset) return null

  let desnivel = 0
  let anterior = 0

  for (const tramo of tramos) {
    if (distancia <= anterior) break

    if (tramo.tipo === 'salto') {
      // El salto entra entero al alcanzar el tramo, no repartido: es la cara
      // vertical del sardinel.
      if (distancia >= tramo.hastaOffset) desnivel -= tramo.valor
    } else {
      const recorrido = Math.min(distancia, tramo.hastaOffset) - anterior
      desnivel -= (recorrido * tramo.valor) / 100
    }

    anterior = tramo.hastaOffset
  }

  return redondear3(desnivel)
}

/** Cota que el proyecto pide en ese punto de la calle. Null si cae fuera de la sección. */
export function cotaRasante(
  rasante: Rasante,
  progresiva: number,
  offset: number,
): number | null {
  const desnivel = desnivelTransversal(rasante, offset)
  if (desnivel === null) return null

  return redondear3(cotaEjeRasante(rasante, progresiva) + desnivel)
}
