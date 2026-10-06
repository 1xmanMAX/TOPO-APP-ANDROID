import type { Toma } from '../modelo/tipos'
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

export interface TramoComprobado {
  /** Índices de estación (desde 0), ambos incluidos. */
  primeraEstacion: number
  ultimaEstacion: number
}

/**
 * Las estaciones que el cierre de la toma respalda.
 *
 * Una estación que arranca de un BM toma su cota CONOCIDA (calcularCotas no
 * arrastra la de antes): ahí empieza un circuito nuevo. El error de cierre
 * sale de comparar la llegada con el BM final, y solo las estaciones desde
 * ese último arranque contribuyeron a él; las de antes nunca se compararon
 * con nada que las cierre. Por eso el error pertenece al último circuito y
 * solo en él se reparte.
 */
export function tramoQueCierra(toma: Toma): TramoComprobado {
  let primeraEstacion = 0
  toma.estaciones.forEach((estacion, indice) => {
    if (estacion.vistaAtras.destino.tipo === 'bm') primeraEstacion = indice
  })
  return { primeraEstacion, ultimaEstacion: toma.estaciones.length - 1 }
}

/**
 * La compensación de una toma: corrección ACUMULADA en metros para cada
 * estación (un valor por estación). El error se reparte solo en el último
 * circuito (`tramoQueCierra`); las estaciones anteriores reciben 0 porque el
 * cierre no dice nada de ellas.
 *
 * Es la ÚNICA regla de compensación: la usan calcularCampania (las cotas que
 * se guardan y se exportan) y el cierre en vivo (la vista previa en campo),
 * para que el topógrafo vea en campo lo mismo que saldrá en gabinete.
 */
export function correccionesDeLaToma(errorMm: number, toma: Toma): number[] {
  const estaciones = toma.estaciones.length
  if (estaciones === 0) return []
  const tramo = tramoQueCierra(toma)
  const delTramo = correccionesAcumuladas(errorMm, tramo.ultimaEstacion - tramo.primeraEstacion + 1)
  return Array.from({ length: estaciones }, (_, indice) =>
    indice < tramo.primeraEstacion ? 0 : delTramo[indice - tramo.primeraEstacion]!,
  )
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
