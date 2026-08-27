import { claveCelda, construirGrilla, progresivasMedidas, type CeldaGrilla } from '../grilla/grilla'
import type { Calle, Capa, Id, Rasante, Toma } from '../modelo/tipos'
import type { ResultadoCampania } from '../nivelacion/calcularCampania'
import { aMilimetros, redondear3 } from '../numero'
import { cotaTeoricaDeCapa } from './espesores'

export type EstadoTolerancia = 'conforme' | 'alLimite' | 'fuera' | 'sinRasante' | 'sinMedir'

export interface CeldaEvaluada {
  clave: string
  progresiva: number
  elementoClave: string
  offset: number
  cotaReal: number | null
  cotaTeorica: number | null
  /** Real menos teórica, en milímetros. Positiva = sobra material, hay que cortar. */
  diferenciaMm: number | null
  /**
   * Espejo por celda del reparto de `ResultadoEvaluacion`: mismas cinco
   * categorías, misma frontera. `'sinRasante'` es solo para una celda medida
   * en un punto sin rasante — si además no está medida, manda `'sinMedir'`.
   */
  estado: EstadoTolerancia
}

export interface ResultadoEvaluacion {
  celdas: Map<string, CeldaEvaluada>
  /**
   * Estos cinco contadores son exhaustivos y no se solapan: cada celda de la
   * grilla cae en exactamente uno, así que su suma es siempre el total de
   * celdas evaluadas. El criterio de reparto: lo primero que importa de una
   * celda es si ya se midió. `sinMedir` se lleva toda celda sin medir, tenga
   * o no rasante definida ahí — que además caiga fuera de la sección es una
   * segunda noticia, no la primera.
   */
  conformes: number
  alLimite: number
  fuera: number
  /** Medidas, pero en un punto donde el proyecto no define rasante. */
  fueraDeSeccion: number
  /** Sin medir todavía, tenga o no rasante definida en ese punto. */
  sinMedir: number
  /**
   * Por qué no hay nada que evaluar. Ahora mismo `construirGrilla` no puede
   * fallar —recibe las progresivas ya medidas, no un rango que alguien pueda
   * escribir al revés— así que este campo sale siempre null: se conserva
   * porque quien llama todavía lo lee, y porque una fuente de progresivas más
   * exigente en el futuro (por ejemplo, validar el archivo importado) puede
   * volver a necesitarlo.
   */
  error: string | null
}

export interface EntradaEvaluacion {
  resultado: ResultadoCampania
  calle: Calle
  toma: Toma
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
  const { resultado, calle, toma, rasante, capas, capaId } = entrada

  const grilla = construirGrilla(calle, progresivasMedidas(toma.estaciones))
  const error: string | null = null

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
    let estado: EstadoTolerancia

    // Mismo criterio que en los contadores: de una celda sin medir, lo
    // primero que le importa al topógrafo es que no la ha medido. Que
    // además caiga fuera de la sección es una segunda noticia — por eso
    // `cotaReal === null` se revisa antes que `cotaTeorica === null`, y una
    // celda sin medir y sin rasante sale igual que una sin medir con
    // rasante: las dos son `'sinMedir'`.
    if (cotaReal === null) {
      sinMedir += 1
      estado = 'sinMedir'
    } else if (cotaTeorica === null) {
      fueraDeSeccion += 1
      estado = 'sinRasante'
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

  return { celdas, conformes, alLimite, fuera, fueraDeSeccion, sinMedir, error }
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
