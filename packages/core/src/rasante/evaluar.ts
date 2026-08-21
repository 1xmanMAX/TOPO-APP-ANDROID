import { claveCelda, construirGrilla, type CeldaGrilla } from '../grilla/grilla'
import type { Calle, Capa, Id, Plantilla, Rasante } from '../modelo/tipos'
import type { ResultadoCampania } from '../nivelacion/calcularCampania'
import { aMilimetros, redondear3 } from '../numero'
import { cotaTeoricaDeCapa } from './espesores'

export type EstadoTolerancia = 'conforme' | 'alLimite' | 'fuera' | 'sinRasante'

export interface CeldaEvaluada {
  clave: string
  progresiva: number
  elementoClave: string
  offset: number
  cotaReal: number | null
  cotaTeorica: number | null
  /** Real menos teórica, en milímetros. Positiva = sobra material, hay que cortar. */
  diferenciaMm: number | null
  estado: EstadoTolerancia
}

export interface ResultadoEvaluacion {
  celdas: Map<string, CeldaEvaluada>
  conformes: number
  alLimite: number
  fuera: number
  /** Medidas, pero en un punto donde el proyecto no define rasante. */
  fueraDeSeccion: number
  /** Sin medir todavía. */
  sinMedir: number
}

export interface EntradaEvaluacion {
  resultado: ResultadoCampania
  calle: Calle
  plantilla: Plantilla
  rasante: Rasante
  capas: Capa[]
  capaId: Id
}

/**
 * Compara lo medido contra lo que pide el proyecto, celda por celda.
 *
 * Ojo con lo que NO hace: no mira si el circuito cerró. Un semáforo verde sobre
 * una nivelación sin comprobar sigue siendo una cota sin comprobar, y decirlo es
 * responsabilidad de quien muestra o exporta esto — igual que ya pasa con las
 * cotas y con los espesores.
 */
export function evaluarContraRasante(entrada: EntradaEvaluacion): ResultadoEvaluacion {
  const { resultado, calle, plantilla, rasante, capas, capaId } = entrada

  let grilla: CeldaGrilla[] = []
  try {
    grilla = construirGrilla(calle, plantilla)
  } catch {
    grilla = []
  }

  const toleranciaMm = capas.find((capa) => capa.id === capaId)?.toleranciaMm ?? 0
  const celdas = new Map<string, CeldaEvaluada>()
  let conformes = 0
  let alLimite = 0
  let fuera = 0
  let fueraDeSeccion = 0
  let sinMedir = 0

  for (const celda of grilla) {
    const clave = claveCelda(celda.progresiva, celda.elementoClave)
    const medida = resultado.cotasPorCelda.get(clave)
    const cotaReal = medida ? medida.cota : null
    const cotaTeorica = cotaTeoricaDeCapa(
      rasante,
      capas,
      capaId,
      celda.progresiva,
      celda.offset,
    )

    let diferenciaMm: number | null = null
    let estado: EstadoTolerancia = 'sinRasante'

    if (cotaTeorica === null) {
      if (cotaReal !== null) fueraDeSeccion += 1
    } else if (cotaReal === null) {
      sinMedir += 1
    } else {
      // A milímetros enteros: la mira se lee al milímetro, y sin redondear
      // aquí `aMilimetros(-0.302)` devuelve -302.00000000000006, que acabaría
      // en pantalla y en el Excel.
      diferenciaMm = Math.round(aMilimetros(redondear3(cotaReal - cotaTeorica)))
      estado = estadoDeDiferencia(diferenciaMm, toleranciaMm)
      if (estado === 'conforme') conformes += 1
      else if (estado === 'alLimite') alLimite += 1
      else fuera += 1
    }

    celdas.set(clave, {
      clave,
      progresiva: celda.progresiva,
      elementoClave: celda.elementoClave,
      offset: celda.offset,
      cotaReal,
      cotaTeorica,
      diferenciaMm,
      estado,
    })
  }

  return { celdas, conformes, alLimite, fuera, fueraDeSeccion, sinMedir }
}

/**
 * Verde hasta la tolerancia, ámbar hasta su doble, rojo pasado eso. Los bordes
 * exactos caen del lado bueno: una diferencia igual a la tolerancia está
 * conforme, no al límite.
 */
export function estadoDeDiferencia(
  diferenciaMm: number,
  toleranciaMm: number,
): EstadoTolerancia {
  const magnitud = Math.abs(diferenciaMm)
  if (magnitud <= toleranciaMm) return 'conforme'
  if (magnitud <= toleranciaMm * 2) return 'alLimite'
  return 'fuera'
}
