import type { Capa, Id, Rasante } from '../modelo/tipos'
import { redondear3 } from '../numero'
import { cotaRasante } from './geometria'

/**
 * Cuánto material va por encima de esta capa. La rasante describe la
 * superficie terminada, así que la cota teórica de cualquier capa de debajo se
 * obtiene restando lo que se le va a poner encima.
 */
export function espesoresPorEncimaDe(capas: Capa[], capaId: Id): number {
  const capa = capas.find((c) => c.id === capaId)
  if (!capa) return 0

  const suma = capas
    .filter((c) => c.orden > capa.orden)
    .reduce((total, c) => total + c.espesor, 0)

  return redondear3(suma)
}

/** Cota que el proyecto pide para ESTA capa en ese punto. Null si cae fuera de la sección. */
export function cotaTeoricaDeCapa(
  rasante: Rasante,
  capas: Capa[],
  capaId: Id,
  progresiva: number,
  offset: number,
): number | null {
  const cota = cotaRasante(rasante, progresiva, offset)
  if (cota === null) return null

  return redondear3(cota - espesoresPorEncimaDe(capas, capaId))
}
