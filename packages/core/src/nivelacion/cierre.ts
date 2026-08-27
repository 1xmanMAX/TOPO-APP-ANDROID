import { progresivasMedidas } from '../grilla/grilla'
import type { BM, Toma, TipoCierre } from '../modelo/tipos'
import { aMilimetros } from '../numero'
import type { ResultadoCotas } from './cotas'

export interface ResultadoCierre {
  tipo: TipoCierre
  cotaLlegadaCalculada: number | null
  cotaLlegadaConocida: number | null
  errorMm: number | null
  longitudKKm: number
  toleranciaMm: number | null
  pasa: boolean | null
}

export function calcularToleranciaMm(coeficiente: number, longitudKKm: number): number {
  if (longitudKKm < 0) throw new Error('La longitud del circuito no puede ser negativa')
  return coeficiente * Math.sqrt(longitudKKm)
}

/**
 * Un circuito cerrado recorre la calle de ida y de vuelta; enlace y abierto,
 * una sola vez. La longitud sale del propio recorrido de esta toma —del
 * primero al último de sus puntos medidos—, no de un rango configurado en la
 * calle: dos tomas de la misma calle pueden cubrir tramos de largo distinto.
 */
export function calcularLongitudKAuto(toma: Toma, tipo: TipoCierre): number {
  const progresivas = progresivasMedidas(toma.estaciones)
  const longitudMetros = progresivas.length > 0 ? Math.max(...progresivas) - Math.min(...progresivas) : 0
  const recorridos = tipo === 'cerrado' ? 2 : 1
  return (longitudMetros * recorridos) / 1000
}

export function calcularCierre(
  toma: Toma,
  bms: BM[],
  cotas: ResultadoCotas,
  longitudKKm: number,
): ResultadoCierre {
  const base: ResultadoCierre = {
    tipo: toma.cierre.tipo,
    cotaLlegadaCalculada: cotas.cotaLlegada,
    cotaLlegadaConocida: null,
    errorMm: null,
    longitudKKm,
    toleranciaMm: null,
    pasa: null,
  }

  if (toma.cierre.tipo === 'abierto') return base

  const bmFinal = bms.find((bm) => bm.id === toma.cierre.bmFinalId)
  // Cerrar contra un BM distinto del configurado no es cerrar: sería comparar
  // la llegada con la cota de otro punto.
  if (!bmFinal || cotas.cotaLlegada === null || cotas.bmLlegadaId !== bmFinal.id) return base

  const errorMm = aMilimetros(cotas.cotaLlegada - bmFinal.cota)
  const toleranciaMm = calcularToleranciaMm(toma.cierre.coeficiente, longitudKKm)

  return {
    ...base,
    cotaLlegadaConocida: bmFinal.cota,
    errorMm,
    toleranciaMm,
    // Una milésima de milímetro de holgura evita que el punto flotante rechace
    // un cierre que es exactamente igual a la tolerancia.
    pasa: Math.abs(errorMm) <= toleranciaMm + 1e-3,
  }
}
