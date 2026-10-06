import {
  claveCelda,
  instrumentoCompleto,
  type Accion,
  type EstadoAviso,
  type Instrumento,
  type Lectura,
  type Proyecto,
  type ReglasMira,
  type ResultadoCampania,
  type Toma,
} from '@topo/core'
import { ETIQUETA_ESTADO } from '../../estadoRasante'

/**
 * Cómo se ve cada estado en las fichas de la calle: símbolo, palabra y
 * color, siempre los tres juntos (el color nunca va solo). Los tres de
 * tolerancia usan los mismos símbolos y palabras que la tabla de diferencias
 * y el mapa, para que el mismo punto no se lea distinto según dónde se mire.
 */
export const VISUAL_ESTADO: Record<EstadoAviso, { simbolo: string; texto: string; clases: string }> = {
  conforme: { simbolo: '✓', texto: ETIQUETA_ESTADO.conforme, clases: 'border-pasa bg-pasa/10 text-pasa' },
  alLimite: { simbolo: '△', texto: ETIQUETA_ESTADO.alLimite, clases: 'border-aviso bg-aviso/10 text-aviso' },
  fuera: { simbolo: '✗', texto: ETIQUETA_ESTADO.fuera, clases: 'border-falla bg-falla/10 text-falla' },
  sinRasante: {
    simbolo: '—',
    texto: 'sin rasante de proyecto en este punto',
    clases: 'border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
  },
  sinMedir: {
    simbolo: '·',
    texto: ETIQUETA_ESTADO.sinMedir,
    clases: 'border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
  },
  // Un dato que no se pudo juzgar no es un punto fuera de tolerancia: lleva
  // su propio símbolo para no pintar una ✗ roja sobre una cuenta que no se hizo.
  datoInvalido: {
    simbolo: '?',
    texto: 'dato no válido: vuelve a leer',
    clases: 'border-dashed border-aviso bg-slate-50 text-slate-800 dark:bg-slate-900 dark:text-slate-100',
  },
}

/** «corta 12 mm», «rellena 4 mm», «en cota»: lo que se hace en el terreno, sin signos que interpretar. */
export function textoAccion(accion: Accion | null): string | null {
  if (!accion) return null
  if (accion.tipo === 'enCota') return 'en cota'
  return `${accion.tipo === 'corta' ? 'corta' : 'rellena'} ${accion.mm} mm`
}

/** El instrumento del proyecto, completo con los valores de fábrica: una sola fuente para las tres fichas. */
export function instrumentoDe(proyecto: Proyecto): Instrumento {
  return instrumentoCompleto(proyecto.instrumento)
}

/** Las tres reglas de la mira que piden el aviso al anotar y el replanteo. */
export function reglasMiraDe(instrumento: Instrumento): ReglasMira {
  return {
    largoMira: instrumento.largoMira,
    lecturaMin: instrumento.lecturaMin,
    margenSuperior: instrumento.margenSuperior,
  }
}

/** Lo que se escribe en un campo de lectura: acepta la coma decimal del teclado del celular. */
export function leerNumero(texto: string): number {
  if (texto.trim() === '') return Number.NaN
  return Number(texto.replace(',', '.'))
}

/**
 * ¿El texto ya llega al milímetro? Mientras se escribe «1.425», los pasos
 * «1» y «1.4» todavía no son lecturas: juzgarlos haría parpadear una ✗ en
 * casi cada tecla, y una alarma que salta siempre se deja de mirar.
 */
export function llegaAlMilimetro(texto: string): boolean {
  return /^\s*\d+[.,]\d{3,}\s*$/.test(texto)
}

/**
 * Si lo calculado en una estación está respaldado por el cierre. No basta
 * con que el cierre pase: si la toma vuelve a arrancar en un BM a mitad de
 * camino, el cierre solo comprueba desde esa estación (`tramoComprobado`), y
 * las de antes siguen sin comprobar.
 */
export function estacionComprobada(resultado: ResultadoCampania, indiceEstacion: number): boolean {
  if (resultado.cierre.pasa !== true) return false
  const primera = resultado.tramoComprobado?.primeraEstacion
  return primera !== undefined && indiceEstacion >= primera
}

/** La estación de la última lectura que cayó en la celda: es la que manda en su cota. Null si no se midió. */
export function estacionDeCelda(toma: Toma, clave: string): number | null {
  const cae = (lectura: Lectura | undefined) =>
    lectura?.destino.tipo === 'celda' &&
    claveCelda(lectura.destino.celda.progresiva, lectura.destino.celda.elementoClave) === clave
  let hallada: number | null = null
  toma.estaciones.forEach((estacion, indice) => {
    if (estacion.intermedias.some(cae) || cae(estacion.vistaAdelante)) hallada = indice
  })
  return hallada
}

/** Botones de la calle: 44 px de alto como mínimo, que se tocan con el dedo y con guantes. */
export const BOTON = 'min-h-11 rounded px-3 py-1 text-sm'
export const BOTON_SECUNDARIO = `${BOTON} border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800`
export const BOTON_PRINCIPAL = `${BOTON} bg-marca font-medium text-white disabled:opacity-50`
