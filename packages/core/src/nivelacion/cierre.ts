import type { BM, Calle, Campania, TipoCierre } from '../modelo/tipos'
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

/** Un circuito cerrado recorre la calle de ida y de vuelta; enlace y abierto, una sola vez. */
export function calcularLongitudKAuto(calle: Calle, tipo: TipoCierre): number {
  const longitudMetros = Math.abs(calle.progresivaFin - calle.progresivaInicio)
  const recorridos = tipo === 'cerrado' ? 2 : 1
  return (longitudMetros * recorridos) / 1000
}

export function calcularCierre(
  campania: Campania,
  bms: BM[],
  cotas: ResultadoCotas,
  longitudKKm: number,
): ResultadoCierre {
  const base: ResultadoCierre = {
    tipo: campania.cierre.tipo,
    cotaLlegadaCalculada: cotas.cotaLlegada,
    cotaLlegadaConocida: null,
    errorMm: null,
    longitudKKm,
    toleranciaMm: null,
    pasa: null,
  }

  if (campania.cierre.tipo === 'abierto') return base

  const bmFinal = bms.find((bm) => bm.id === campania.cierre.bmFinalId)
  if (!bmFinal || cotas.cotaLlegada === null) return base

  const errorMm = aMilimetros(cotas.cotaLlegada - bmFinal.cota)
  const toleranciaMm = calcularToleranciaMm(campania.cierre.coeficiente, longitudKKm)

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
