import { construirGrilla, progresivasDeLaToma, type CeldaGrilla } from '../grilla/grilla'
import { formatearProgresiva } from '../grilla/progresivas'
import type { BM, Calle, Toma, DestinoLectura } from '../modelo/tipos'
import { aMilimetros, redondear3 } from '../numero'
import { calcularCierre, calcularLongitudKAuto, type ResultadoCierre } from './cierre'
import { compensarPuntos, correccionesAcumuladas } from './compensacion'
import { calcularCotas, esLecturaUsable } from './cotas'

/** Diferencia a partir de la cual dos lecturas de la misma celda merecen advertencia. */
const TOLERANCIA_REPETICION_MM = 5
/** Cuánto puede apartarse una cota de la mediana de su progresiva antes de avisar. */
const APARTAMIENTO_MAXIMO_M = 0.3

export interface CotaCelda {
  clave: string
  progresiva: number
  elementoClave: string
  /**
   * Cómo se llamaba el punto en la sección al calcular: es lo que se escribe
   * cuando hay que nombrar esta celda por escrito, para no enseñar el id.
   * Opcional porque un resultado armado a mano —una prueba— puede no traerlo;
   * quien lo escriba cae de vuelta a la clave.
   */
  elementoNombre?: string
  offset: number
  cota: number
  cotaCruda: number
  correccion: number
  lecturas: number[]
}

export interface Aviso {
  nivel: 'informacion' | 'advertencia' | 'error'
  clave: string | null
  mensaje: string
}

export interface EntradaCalculo {
  campania: Toma
  calle: Calle
  bms: BM[]
}

export interface ResultadoCampania {
  cotasPorCelda: Map<string, CotaCelda>
  /** Cota instrumento de cada estación, en el orden de la libreta. */
  cotasInstrumento: number[]
  cierre: ResultadoCierre
  avisos: Aviso[]
  celdasTotales: number
  celdasLlenas: number
  error: string | null
}

/**
 * Cómo se nombra un elemento en los avisos: el nombre del punto de la sección
 * («Vereda izquierda»), nunca su id, que es jerga de programador.
 */
type NombreDeElemento = (elementoClave: string) => string

/**
 * Cómo se nombra una celda cuya clave ya no corresponde a ningún punto. De
 * ese punto no queda guardado más que la clave, y la clave es la llave
 * interna: no se enseña. Así que en su lugar se dice qué le pasa, que es lo
 * que el topógrafo necesita saber para arreglarlo.
 */
const PUNTO_FUERA_DE_LA_SECCION = 'un punto que ya no está en la sección'

function nombradorDeElementos(calle: Calle): NombreDeElemento {
  const nombres = new Map(calle.seccion.puntos.map((punto) => [punto.id, punto.nombre]))
  return (elementoClave) => nombres.get(elementoClave) ?? PUNTO_FUERA_DE_LA_SECCION
}

export function calcularCampania(entrada: EntradaCalculo): ResultadoCampania {
  const { campania, calle, bms } = entrada
  const nombreDe = nombradorDeElementos(calle)

  let grilla: CeldaGrilla[] = []
  let longitudKKm = campania.cierre.longitudK

  try {
    grilla = construirGrilla(calle, progresivasDeLaToma(campania))
    longitudKKm = campania.cierre.longitudKAuto
      ? calcularLongitudKAuto(campania, campania.cierre.tipo)
      : campania.cierre.longitudK

    const offsetPorClave = new Map(grilla.map((celda) => [celda.clave, celda.offset]))

    const cotas = calcularCotas(campania, bms)
    const cierre = calcularCierre(campania, bms, cotas, longitudKKm)
    const acumuladas =
      cierre.pasa === true && cierre.errorMm !== null
        ? correccionesAcumuladas(cierre.errorMm, campania.estaciones.length)
        : []
    const compensados = compensarPuntos(cotas.puntos, acumuladas)

    const avisos: Aviso[] = []
    const cotasPorCelda = new Map<string, CotaCelda>()

    for (const punto of compensados) {
      if (punto.destino.tipo !== 'celda') continue

      const existente = cotasPorCelda.get(punto.claveDestino)
      const lecturas = existente ? [...existente.lecturas, punto.lectura] : [punto.lectura]

      cotasPorCelda.set(punto.claveDestino, {
        clave: punto.claveDestino,
        progresiva: punto.destino.celda.progresiva,
        elementoClave: punto.destino.celda.elementoClave,
        elementoNombre: nombreDe(punto.destino.celda.elementoClave),
        offset: offsetPorClave.get(punto.claveDestino) ?? 0,
        cota: punto.cota,
        cotaCruda: punto.cotaCruda,
        correccion: punto.correccion,
        lecturas,
      })
    }

    agregarAvisosDeLecturasNoUsables(campania, avisos, nombreDe)
    agregarAvisosDeRepeticion(cotasPorCelda, compensados, avisos, nombreDe)
    agregarAvisosDeApartamiento(cotasPorCelda, avisos, nombreDe)
    agregarAvisosDeCierre(cierre, campania, bms, avisos)
    agregarAvisosDeHuerfanas(grilla, cotasPorCelda, avisos, nombreDe)

    return {
      cotasPorCelda,
      cotasInstrumento: cotas.cotasInstrumento,
      cierre,
      avisos,
      celdasTotales: grilla.length,
      celdasLlenas: cotasPorCelda.size,
      error: null,
    }
  } catch (fallo) {
    const mensaje = (fallo as Error).message
    return {
      cotasPorCelda: new Map(),
      cotasInstrumento: [],
      cierre: {
        tipo: campania.cierre.tipo,
        cotaLlegadaCalculada: null,
        cotaLlegadaConocida: null,
        errorMm: null,
        longitudKKm,
        toleranciaMm: null,
        pasa: null,
      },
      avisos: [{ nivel: 'error', clave: null, mensaje }],
      celdasTotales: grilla.length,
      celdasLlenas: 0,
      error: mensaje,
    }
  }
}

function descripcionLectura(destino: DestinoLectura, nombreDe: NombreDeElemento): string {
  switch (destino.tipo) {
    case 'celda':
      return `${formatearProgresiva(destino.celda.progresiva)} ${nombreDe(destino.celda.elementoClave)}`
    case 'bm':
      return 'BM'
    case 'cambio':
      return destino.nombre
    case 'suelto':
      return destino.punto.etiqueta
  }
}

function mensajeLecturaNoUsable(descripcion: string, valor: number): string {
  return (
    `${descripcion}: la lectura ${valor.toFixed(3)} no puede ser de una mira ` +
    '(tiene que estar entre 0 y 5 m). Queda pendiente hasta que la corrijas.'
  )
}

/**
 * Avisa de cada lectura fuera del rango físico de una mira (§8 del diseño).
 * Si la vista atrás de una estación no es usable, esa estación entera queda
 * pendiente: avisar además de sus intermedias sería ruido, así que se omiten.
 */
function agregarAvisosDeLecturasNoUsables(
  campania: Toma,
  avisos: Aviso[],
  nombreDe: NombreDeElemento,
): void {
  campania.estaciones.forEach((estacion, indice) => {
    if (!esLecturaUsable(estacion.vistaAtras.valor)) {
      avisos.push({
        nivel: 'advertencia',
        clave: null,
        mensaje: mensajeLecturaNoUsable(`Estación ${indice + 1}, vista atrás`, estacion.vistaAtras.valor),
      })
      return
    }

    for (const lectura of estacion.intermedias) {
      if (esLecturaUsable(lectura.valor)) continue
      avisos.push({
        nivel: 'advertencia',
        clave: null,
        mensaje: mensajeLecturaNoUsable(descripcionLectura(lectura.destino, nombreDe), lectura.valor),
      })
    }

    if (estacion.vistaAdelante && !esLecturaUsable(estacion.vistaAdelante.valor)) {
      avisos.push({
        nivel: 'advertencia',
        clave: null,
        mensaje: mensajeLecturaNoUsable(
          `Estación ${indice + 1}, vista adelante`,
          estacion.vistaAdelante.valor,
        ),
      })
    }
  })
}

function agregarAvisosDeRepeticion(
  cotasPorCelda: Map<string, CotaCelda>,
  compensados: { claveDestino: string; cota: number; destino: { tipo: string } }[],
  avisos: Aviso[],
  nombreDe: NombreDeElemento,
): void {
  const cotasFinalesPorClave = new Map<string, number[]>()
  for (const punto of compensados) {
    if (punto.destino.tipo !== 'celda') continue
    const lista = cotasFinalesPorClave.get(punto.claveDestino) ?? []
    lista.push(punto.cota)
    cotasFinalesPorClave.set(punto.claveDestino, lista)
  }

  for (const [clave, celda] of cotasPorCelda) {
    if (celda.lecturas.length < 2) continue

    const valores = cotasFinalesPorClave.get(clave) ?? []
    const diferenciaMm = Math.abs(aMilimetros(Math.max(...valores) - Math.min(...valores)))
    const nivel = diferenciaMm > TOLERANCIA_REPETICION_MM ? 'advertencia' : 'informacion'

    avisos.push({
      nivel,
      clave,
      mensaje:
        `${formatearProgresiva(celda.progresiva)} ${nombreDe(celda.elementoClave)}: ` +
        `se midió ${celda.lecturas.length} veces, con ${diferenciaMm.toFixed(1)} mm de diferencia. ` +
        'Vale la última lectura.',
    })
  }
}

function agregarAvisosDeApartamiento(
  cotasPorCelda: Map<string, CotaCelda>,
  avisos: Aviso[],
  nombreDe: NombreDeElemento,
): void {
  const porProgresiva = new Map<number, CotaCelda[]>()
  for (const celda of cotasPorCelda.values()) {
    const lista = porProgresiva.get(celda.progresiva) ?? []
    lista.push(celda)
    porProgresiva.set(celda.progresiva, lista)
  }

  for (const celdas of porProgresiva.values()) {
    if (celdas.length < 3) continue

    const ordenadas = celdas.map((c) => c.cota).sort((a, b) => a - b)
    const mediana = ordenadas[Math.floor(ordenadas.length / 2)]!

    for (const celda of celdas) {
      const desvio = Math.abs(celda.cota - mediana)
      if (desvio <= APARTAMIENTO_MAXIMO_M) continue

      const ultima = celda.lecturas[celda.lecturas.length - 1]!
      avisos.push({
        nivel: 'advertencia',
        clave: celda.clave,
        mensaje:
          `${formatearProgresiva(celda.progresiva)} ${nombreDe(celda.elementoClave)} — lectura ${ultima.toFixed(3)}: ` +
          `se aparta ${redondear3(desvio).toFixed(3)} m de sus vecinas de la misma progresiva. ` +
          '¿La anotaste bien?',
      })
    }
  }
}

/**
 * Las lecturas apuntan a su elemento por la clave que quedó guardada con
 * ellas, y ese punto puede desaparecer de la sección de la calle después de
 * que ya se tomaron. El dato crudo no se pierde, pero deja de caer en la
 * grilla: desaparece de la tabla y de la exportación sin que nada lo diga.
 * Esto avisa.
 */
function agregarAvisosDeHuerfanas(
  grilla: CeldaGrilla[],
  cotasPorCelda: Map<string, CotaCelda>,
  avisos: Aviso[],
  nombreDe: NombreDeElemento,
): void {
  const clavesDeLaGrilla = new Set(grilla.map((celda) => celda.clave))
  const huerfanas = [...cotasPorCelda.values()].filter((celda) => !clavesDeLaGrilla.has(celda.clave))

  if (huerfanas.length > 0) {
    // Cada huérfana se nombra por lo único suyo que sí se puede leer —su
    // progresiva— más lo que le pasa. El elemento no se puede nombrar: de él
    // solo quedó la clave, que es la llave interna y no se enseña.
    const nombres = huerfanas.map(
      (celda) => `${formatearProgresiva(celda.progresiva)}, ${nombreDe(celda.elementoClave)}`,
    )

    avisos.push({
      nivel: 'advertencia',
      clave: null,
      mensaje:
        `Hay ${huerfanas.length} ${huerfanas.length === 1 ? 'lectura' : 'lecturas'} que ya no ` +
        'caen en la grilla de esta calle, así que no salen en la tabla ni en la exportación: ' +
        `${nombres.slice(0, 5).join('; ')}${nombres.length > 5 ? '…' : ''}. ` +
        'Suele pasar al quitar un punto de la sección de la calle.',
    })
  }
}

function agregarAvisosDeCierre(
  cierre: ResultadoCierre,
  campania: Toma,
  bms: BM[],
  avisos: Aviso[],
): void {
  const bmFinalId = campania.cierre.bmFinalId
  const bmDeCierreExiste = bmFinalId ? bms.some((bm) => bm.id === bmFinalId) : false

  if (cierre.tipo !== 'abierto' && bmFinalId && !bmDeCierreExiste) {
    avisos.push({
      nivel: 'advertencia',
      clave: null,
      mensaje:
        'El banco de nivel de cierre de esta campaña ya no existe en el proyecto. ' +
        'Elige otro para poder verificar el circuito.',
    })
  }

  if (
    cierre.tipo !== 'abierto' &&
    bmDeCierreExiste &&
    cierre.cotaLlegadaCalculada !== null &&
    cierre.pasa === null
  ) {
    avisos.push({
      nivel: 'advertencia',
      clave: null,
      mensaje:
        'La última estación no cierra contra el banco de nivel configurado para esta campaña, ' +
        'así que no se puede verificar el circuito.',
    })
  }

  if (cierre.tipo === 'abierto') {
    avisos.push({
      nivel: 'advertencia',
      clave: null,
      mensaje:
        'Circuito abierto: sin verificación. Las cotas quedan marcadas como NO COMPROBADAS.',
    })
    return
  }

  if (cierre.pasa === false && cierre.errorMm !== null && cierre.toleranciaMm !== null) {
    avisos.push({
      nivel: 'error',
      clave: null,
      mensaje:
        `Cierre fuera de tolerancia: ${cierre.errorMm > 0 ? '+' : ''}${cierre.errorMm.toFixed(1)} mm ` +
        `(máximo ±${cierre.toleranciaMm.toFixed(1)} mm). Revisa la libreta o repite el circuito. ` +
        'Las cotas quedan marcadas como NO COMPROBADAS.',
    })
  }
}
