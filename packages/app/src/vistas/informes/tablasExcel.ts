import {
  calcularCampania,
  compararCapas,
  evaluarContraRasante,
  formatearProgresiva,
  instrumentoCompleto,
  progresivasDeLaToma,
  type Id,
  type Proyecto,
} from '@topo/core'
import {
  armarCabecera,
  armarCabeceraComparacion,
  armarCabeceraDiferencias,
  armarTabla,
  armarTablaDiferencias,
  armarTablaEspesores,
} from '../../archivo/exportar'
import { tomasDeAbajo, type TipoInforme } from './adaptadores'

/*
 * Las tablas que ya se exportaban desde Revisar (cotas, diferencias contra el
 * proyecto y espesores), armadas con los mismos exportadores de
 * archivo/exportar.ts —misma cabecera, mismo veredicto de cierre—, pero para
 * la calle y la jornada que se eligen aquí y no solo para la toma activa.
 */

export interface TablaExcel {
  filas: string[][]
  /** Sin extensión. */
  nombre: string
  hoja: string
}

export interface TablasDeLaJornada {
  cotas: TablaExcel | null
  diferencias: TablaExcel | null
  espesores: TablaExcel | null
}

const NINGUNA: TablasDeLaJornada = { cotas: null, diferencias: null, espesores: null }

/** El tramo del informe, en metros; sin límite si falta. */
export interface TramoExcel {
  desde?: number | null
  hasta?: number | null
}

function dentroDe(tramo: TramoExcel) {
  return (p: number) =>
    (typeof tramo.desde !== 'number' || p >= tramo.desde - 1e-9) &&
    (typeof tramo.hasta !== 'number' || p <= tramo.hasta + 1e-9)
}

/** « (0+010 a 0+030)» en el nombre del archivo recortado; nada si va entero. */
function sufijoTramo(tramo: TramoExcel): string {
  const { desde, hasta } = tramo
  if (typeof desde !== 'number' && typeof hasta !== 'number') return ''
  const d = typeof desde === 'number' ? formatearProgresiva(desde) : 'inicio'
  const h = typeof hasta === 'number' ? formatearProgresiva(hasta) : 'fin'
  return ` (${d} a ${h})`
}

export function tablasDeLaJornada(
  proyecto: Proyecto,
  calleId: Id | null,
  tomaId: Id | null,
  tomaAbajoId?: Id | null,
  /**
   * Recorta las filas al mismo tramo que el PDF, para que el PDF y el Excel
   * que se mandan juntos digan lo mismo. Sin él, la jornada entera.
   */
  tramo: TramoExcel = {},
): TablasDeLaJornada {
  const calle = proyecto.calles.find((c) => c.id === calleId)
  const toma = calle?.nivelaciones.flatMap((n) => n.tomas).find((t) => t.id === tomaId)
  if (!calle || !toma) return NINGUNA
  const { largoMira } = instrumentoCompleto(proyecto.instrumento)
  const calcular = (t: typeof toma) => calcularCampania({ campania: t, calle, bms: proyecto.bms, largoMira })
  const resultado = calcular(toma)
  if (resultado.error !== null) return NINGUNA

  const capa = proyecto.capas.find((c) => c.id === toma.capaId)
  const bmInicial = proyecto.bms.find((bm) => bm.id === toma.bmInicialId)
  const enTramo = dentroDe(tramo)
  const progresivas = progresivasDeLaToma(toma).filter(enTramo)
  const sufijo = `${capa?.nombre ?? ''}${sufijoTramo(tramo)}`

  const cotas: TablaExcel = {
    filas: [
      ...armarCabecera({ calle, capa, campania: toma, bmInicial, resultado }),
      [],
      ...armarTabla(resultado, calle, progresivas),
    ],
    nombre: `${calle.nombre} — ${sufijo}`.trim(),
    hoja: 'Cotas',
  }

  let diferencias: TablaExcel | null = null
  if (calle.rasante) {
    const evaluacion = evaluarContraRasante({
      resultado,
      calle,
      toma,
      rasante: calle.rasante,
      capas: proyecto.capas,
      capaId: toma.capaId,
    })
    diferencias = {
      filas: [
        ...armarCabeceraDiferencias({ calle, capa, campania: toma, rasante: calle.rasante, resultado }),
        [],
        ...armarTablaDiferencias(evaluacion, calle, progresivas),
      ],
      nombre: `${calle.nombre} — Diferencias ${sufijo}`.trim(),
      hoja: 'Diferencias',
    }
  }

  let espesores: TablaExcel | null = null
  const candidatas = tomasDeAbajo(proyecto, calleId, tomaId)
  const abajo = candidatas.find((t) => t.toma.id === tomaAbajoId) ?? candidatas[0]
  if (abajo) {
    const resultadoAbajo = calcular(abajo.toma)
    if (resultadoAbajo.error === null) {
      const comparacion = compararCapas(resultadoAbajo, resultado)
      espesores = {
        filas: [
          ...armarCabeceraComparacion({
            calle,
            capaInferior: abajo.capa,
            capaSuperior: capa,
            campaniaInferior: abajo.toma,
            campaniaSuperior: toma,
            resultadoInferior: resultadoAbajo,
            resultadoSuperior: resultado,
            comparacion,
          }),
          [],
          ...armarTablaEspesores(comparacion, calle, progresivasDeLaToma(abajo.toma).filter(enTramo)),
        ],
        nombre: `${calle.nombre} — Espesores ${abajo.capa?.nombre ?? '—'} a ${capa?.nombre ?? '—'}${sufijoTramo(tramo)}`,
        hoja: 'Espesores',
      }
    }
  }

  return { cotas, diferencias, espesores }
}

/**
 * Qué lleva el Excel que acompaña a cada informe, dicho junto al botón: así
 * se sabe qué se manda a la supervisión. Null si el informe no tiene Excel.
 */
export function queLlevaElExcel(tipo: TipoInforme): string | null {
  switch (tipo) {
    case 'protocolo':
    case 'control':
      return 'El Excel lleva las diferencias contra proyecto del mismo tramo.'
    case 'metrado':
      return 'El Excel lleva las diferencias contra proyecto del mismo tramo; las áreas y los volúmenes van solo en el PDF.'
    case 'libreta':
      return 'El Excel lleva las cotas de la jornada entera.'
    case 'espesores':
      return 'El Excel lleva los espesores del mismo tramo.'
    case 'estacas':
      return null
  }
}

/** La tabla de Excel que acompaña a cada informe; null si ese informe no tiene una. */
export function tablaDeInforme(tipo: TipoInforme, tablas: TablasDeLaJornada): TablaExcel | null {
  switch (tipo) {
    case 'protocolo':
    case 'control':
    case 'metrado':
      return tablas.diferencias
    case 'libreta':
      return tablas.cotas
    case 'espesores':
      return tablas.espesores
    case 'estacas':
      return null
  }
}
