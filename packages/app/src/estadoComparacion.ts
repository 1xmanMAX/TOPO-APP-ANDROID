import type { Campania, Capa, ResultadoCampania, ResultadoCierre } from '@topo/core'

/**
 * Lo mínimo que hace falta para saber si una comparación de espesores está
 * comprobada: las dos capas, sus campañas y el resultado (con su cierre) de
 * cada una. No hace falta la comparación en sí — el veredicto depende de si
 * las nivelaciones de origen cerraron, no de los espesores calculados.
 */
export interface DatosEstadoComparacion {
  capaInferior: Capa | undefined
  capaSuperior: Capa | undefined
  campaniaInferior: Campania
  campaniaSuperior: Campania
  resultadoInferior: ResultadoCampania
  resultadoSuperior: ResultadoCampania
}

export interface EstadoComparacion {
  /** `true` solo si las dos nivelaciones de origen cerraron dentro de tolerancia. */
  comprobado: boolean
  /** Frase completa: la misma que va a la cabecera del archivo exportado y a la pantalla. */
  texto: string
}

function etiquetaCapa(capa: Capa | undefined, campania: Campania): string {
  return `${capa?.nombre ?? '—'} · ${campania.fecha}`
}

function motivoNoComprobado(cierre: ResultadoCierre): string {
  if (cierre.pasa === false) return 'el cierre está fuera de tolerancia'
  return 'el circuito no se verificó'
}

/**
 * Un espesor sale de restar dos cotas. Si cualquiera de las dos campañas no
 * cerró, el espesor calculado sobre ella tampoco está comprobado — aunque la
 * resta en sí dé un número. El estado tiene que decir cuál de las dos falla,
 * porque de eso depende qué campaña hay que volver a nivelar.
 *
 * Única fuente de verdad para este veredicto: la usan tanto la cabecera del
 * archivo exportado (`archivo/exportar.ts`) como la pantalla de Resultados,
 * para que nunca puedan decir cosas distintas.
 */
export function calcularEstadoComparacion(datos: DatosEstadoComparacion): EstadoComparacion {
  const { capaInferior, capaSuperior, campaniaInferior, campaniaSuperior, resultadoInferior, resultadoSuperior } = datos
  const falloInferior = resultadoInferior.cierre.pasa !== true
  const falloSuperior = resultadoSuperior.cierre.pasa !== true

  if (!falloInferior && !falloSuperior) {
    return { comprobado: true, texto: 'ESPESORES VERIFICADOS — las dos campañas cierran dentro de tolerancia' }
  }

  const motivos: string[] = []
  if (falloInferior) {
    motivos.push(
      `la capa de abajo (${etiquetaCapa(capaInferior, campaniaInferior)}): ${motivoNoComprobado(resultadoInferior.cierre)}`,
    )
  }
  if (falloSuperior) {
    motivos.push(
      `la capa de arriba (${etiquetaCapa(capaSuperior, campaniaSuperior)}): ${motivoNoComprobado(resultadoSuperior.cierre)}`,
    )
  }

  return { comprobado: false, texto: `ESPESORES NO COMPROBADOS — ${motivos.join('; ')}` }
}
