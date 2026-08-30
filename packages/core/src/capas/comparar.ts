import { formatearProgresiva } from '../grilla/progresivas'
import type { Aviso, CotaCelda, ResultadoCampania } from '../nivelacion/calcularCampania'

export interface CeldaComparada {
  clave: string
  progresiva: number
  /** El id del punto de la sección. Llave interna: no se enseña. */
  elementoClave: string
  /** Cómo se llama el punto en pantalla, tal como venía en la cota comparada. */
  elementoNombre: string
  offset: number
  /** Cota de la capa de abajo, o null si esa celda no se midió en ella. */
  cotaInferior: number | null
  /** Cota de la capa de arriba, o null. */
  cotaSuperior: number | null
  /** Superior − inferior. Null si falta alguna de las dos. */
  espesor: number | null
}

export interface ResultadoComparacion {
  celdas: Map<string, CeldaComparada>
  /** Celdas con espesor calculable. */
  comparables: number
  /** Medidas en una capa pero no en la otra. */
  sinPareja: number
  espesorMinimo: number | null
  espesorMaximo: number | null
  espesorMedio: number | null
  avisos: Aviso[]
}

/** El aviso nombra el punto como se lee («Borde izquierdo»), nunca por su id. */
function mensajeEspesorNegativo(celda: CeldaComparada, espesor: number): string {
  return (
    `${formatearProgresiva(celda.progresiva)} ${celda.elementoNombre}: la capa de arriba quedó ` +
    `${Math.abs(espesor * 1000).toFixed(0)} mm por debajo de la de abajo. ` +
    'Revisa cuál es cuál, o si hubo una excavación.'
  )
}

export function compararCapas(
  inferior: ResultadoCampania,
  superior: ResultadoCampania,
): ResultadoComparacion {
  const claves = new Set<string>([
    ...inferior.cotasPorCelda.keys(),
    ...superior.cotasPorCelda.keys(),
  ])

  const celdas = new Map<string, CeldaComparada>()
  const avisos: Aviso[] = []
  let comparables = 0
  let sinPareja = 0
  let espesorMinimo: number | null = null
  let espesorMaximo: number | null = null
  let sumaEspesores = 0

  for (const clave of claves) {
    const celdaInferior: CotaCelda | undefined = inferior.cotasPorCelda.get(clave)
    const celdaSuperior: CotaCelda | undefined = superior.cotasPorCelda.get(clave)
    const base = celdaInferior ?? celdaSuperior!

    const cotaInferior = celdaInferior ? celdaInferior.cota : null
    const cotaSuperior = celdaSuperior ? celdaSuperior.cota : null
    const espesor = cotaInferior !== null && cotaSuperior !== null ? cotaSuperior - cotaInferior : null

    const celdaComparada: CeldaComparada = {
      clave,
      progresiva: base.progresiva,
      elementoClave: base.elementoClave,
      elementoNombre: base.elementoNombre ?? base.elementoClave,
      offset: base.offset,
      cotaInferior,
      cotaSuperior,
      espesor,
    }
    celdas.set(clave, celdaComparada)

    if (espesor === null) {
      sinPareja += 1
      continue
    }

    comparables += 1
    sumaEspesores += espesor
    espesorMinimo = espesorMinimo === null ? espesor : Math.min(espesorMinimo, espesor)
    espesorMaximo = espesorMaximo === null ? espesor : Math.max(espesorMaximo, espesor)

    if (espesor < 0) {
      avisos.push({
        nivel: 'advertencia',
        clave,
        mensaje: mensajeEspesorNegativo(celdaComparada, espesor),
      })
    }
  }

  return {
    celdas,
    comparables,
    sinPareja,
    espesorMinimo,
    espesorMaximo,
    espesorMedio: comparables > 0 ? sumaEspesores / comparables : null,
    avisos,
  }
}
