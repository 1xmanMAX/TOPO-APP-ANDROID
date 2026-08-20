import { aMetros } from '../numero'
import type { PuntoCalculado } from './cotas'

export type PuntoCompensado = PuntoCalculado & {
  /** Corrección aplicada, en metros. */
  correccion: number
  /** Cota compensada, en metros. */
  cota: number
}

/**
 * Reparte el error de cierre proporcionalmente entre estaciones.
 * Devuelve la corrección ACUMULADA en metros aplicable a los puntos de cada
 * estación: el índice i lleva la suma de las correcciones de las estaciones 0..i.
 * Por construcción, la última acumulada cancela exactamente el error.
 */
export function correccionesAcumuladas(errorMm: number, numeroEstaciones: number): number[] {
  if (numeroEstaciones <= 0) return []

  const correccionTotal = aMetros(-errorMm)
  const acumuladas: number[] = []
  for (let i = 0; i < numeroEstaciones; i += 1) {
    const valor = (correccionTotal * (i + 1)) / numeroEstaciones
    // Normalizar -0 a 0 para consistencia
    acumuladas.push(valor === 0 ? 0 : valor)
  }
  return acumuladas
}

export function compensarPuntos(
  puntos: PuntoCalculado[],
  acumuladas: number[],
): PuntoCompensado[] {
  return puntos.map((punto) => {
    const correccion = acumuladas[punto.estacionIndice] ?? 0
    return { ...punto, correccion, cota: punto.cotaCruda + correccion }
  })
}
