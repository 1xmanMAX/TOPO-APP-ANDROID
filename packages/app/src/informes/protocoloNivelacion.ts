import { cuenta } from '../formato'
import {
  componerInforme,
  conSigno,
  diferenciaMm,
  esNumero,
  estadoDe,
  faltaDato,
  textoCota,
  textoProgresiva,
  DATO_INVALIDO,
  type Celda,
  type Columna,
} from './maquetacion'
import type { DatosProtocolo, EstadoPunto, FilaProtocolo } from './tipos'

/** Lo que el protocolo y el control calculan de cada punto. `difMm` es null si no hay diferencia que dar. */
export interface PuntoEvaluado {
  fila: FilaProtocolo
  difMm: number | null
  estado: EstadoPunto
}

/**
 * El mismo reparto que la pantalla (`evaluarContraRasante`): lo primero es si
 * el punto se midió; si se midió pero el proyecto no da cota ahí, «sin
 * rasante». Un número que no es número (en la progresiva, la medida o el
 * proyecto) es «dato inválido»: nunca FUERA ni «en cota», porque eso sería
 * una orden falsa para la máquina.
 */
export function evaluarPuntos(filas: FilaProtocolo[], toleranciaMm: number): PuntoEvaluado[] {
  return filas.map((fila) => {
    const { cotaMedida, cotaProyecto } = fila
    if (!esNumero(fila.progresiva)) return { fila, difMm: null, estado: 'datoInvalido' }
    if (faltaDato(cotaMedida)) return { fila, difMm: null, estado: 'sinMedir' }
    if (!esNumero(cotaMedida)) return { fila, difMm: null, estado: 'datoInvalido' }
    if (faltaDato(cotaProyecto)) return { fila, difMm: null, estado: 'sinRasante' }
    if (!esNumero(cotaProyecto)) return { fila, difMm: null, estado: 'datoInvalido' }
    const difMm = diferenciaMm(cotaMedida, cotaProyecto)
    return { fila, difMm, estado: estadoDe(difMm, toleranciaMm) }
  })
}

/**
 * «4 puntos: 1 conforme, 1 al límite, 1 fuera, 0 sin rasante, 1 sin medir».
 * Las cinco categorías de la pantalla, siempre, para que las cifras se puedan
 * cotejar; los datos inválidos se añaden solo si los hay. La suma de las
 * partes es el total.
 */
export function resumenDePuntos(puntos: PuntoEvaluado[]): string {
  const n = (e: EstadoPunto) => puntos.filter((p) => p.estado === e).length
  const invalidos = n('datoInvalido')
  return (
    `${cuenta(puntos.length, 'punto', 'puntos')}: ${n('conforme')} conforme, ` +
    `${n('alLimite')} al límite, ${n('fuera')} fuera, ${n('sinRasante')} sin rasante, ${n('sinMedir')} sin medir` +
    (invalidos > 0 ? `, ${invalidos} con ${DATO_INVALIDO}` : '')
  )
}

/** La celda de estado: el semáforo con su símbolo, o las otras categorías en palabras. */
export function celdaDeEstado(estado: EstadoPunto): Celda {
  if (estado === 'sinMedir') return 'sin medir'
  if (estado === 'sinRasante') return 'sin rasante'
  if (estado === 'datoInvalido') return DATO_INVALIDO
  return { estado }
}

const COLUMNAS: Columna[] = [
  { titulo: 'Progresiva', ancho: 25 },
  { titulo: 'Punto', ancho: 45 },
  { titulo: 'Cota proyecto', ancho: 27, alinear: 'der' },
  { titulo: 'Cota medida', ancho: 27, alinear: 'der' },
  { titulo: 'Dif. (mm)', ancho: 20, alinear: 'der' },
  { titulo: 'Estado', ancho: 36 },
]

/** Protocolo de nivelación: todos los puntos de la capa contra el proyecto. */
export function protocoloNivelacion(datos: DatosProtocolo): Uint8Array {
  const puntos = evaluarPuntos(datos.filas, datos.encabezado.toleranciaMm)
  const filas: Celda[][] = puntos.map(({ fila, difMm, estado }) => [
    textoProgresiva(fila.progresiva),
    fila.punto,
    textoCota(fila.cotaProyecto),
    textoCota(fila.cotaMedida),
    difMm === null ? '-' : conSigno(difMm),
    celdaDeEstado(estado),
  ])
  return componerInforme({
    titulo: 'Protocolo de nivelación',
    base: datos,
    secciones: [
      {
        tipo: 'parrafo',
        texto:
          'Diferencia = cota medida - cota de proyecto. Positiva: sobra material (corta); ' +
          'negativa: falta (rellena).',
      },
      { tipo: 'tabla', columnas: COLUMNAS, filas },
      { tipo: 'parrafo', texto: resumenDePuntos(puntos), resaltado: true },
    ],
  })
}
