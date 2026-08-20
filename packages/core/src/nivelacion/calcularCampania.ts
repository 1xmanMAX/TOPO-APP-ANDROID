import { construirGrilla } from '../grilla/grilla'
import { formatearProgresiva } from '../grilla/progresivas'
import type { BM, Calle, Campania, Plantilla } from '../modelo/tipos'
import { aMilimetros, redondear3 } from '../numero'
import { calcularCierre, calcularLongitudKAuto, type ResultadoCierre } from './cierre'
import { compensarPuntos, correccionesAcumuladas } from './compensacion'
import { calcularCotas } from './cotas'

/** Diferencia a partir de la cual dos lecturas de la misma celda merecen advertencia. */
const TOLERANCIA_REPETICION_MM = 5
/** Cuánto puede apartarse una cota de la mediana de su progresiva antes de avisar. */
const APARTAMIENTO_MAXIMO_M = 0.3

export interface CotaCelda {
  clave: string
  progresiva: number
  elementoClave: string
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
  campania: Campania
  calle: Calle
  plantilla: Plantilla
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

export function calcularCampania(entrada: EntradaCalculo): ResultadoCampania {
  const { campania, calle, plantilla, bms } = entrada
  const grilla = construirGrilla(calle, plantilla)
  const offsetPorClave = new Map(grilla.map((celda) => [celda.clave, celda.offset]))

  const longitudKKm = campania.cierre.longitudKAuto
    ? calcularLongitudKAuto(calle, campania.cierre.tipo)
    : campania.cierre.longitudK

  const cierreVacio: ResultadoCierre = {
    tipo: campania.cierre.tipo,
    cotaLlegadaCalculada: null,
    cotaLlegadaConocida: null,
    errorMm: null,
    longitudKKm,
    toleranciaMm: null,
    pasa: null,
  }

  let cotas
  try {
    cotas = calcularCotas(campania, bms)
  } catch (fallo) {
    return {
      cotasPorCelda: new Map(),
      cotasInstrumento: [],
      cierre: cierreVacio,
      avisos: [{ nivel: 'error', clave: null, mensaje: (fallo as Error).message }],
      celdasTotales: grilla.length,
      celdasLlenas: 0,
      error: (fallo as Error).message,
    }
  }

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
      offset: offsetPorClave.get(punto.claveDestino) ?? 0,
      cota: punto.cota,
      cotaCruda: punto.cotaCruda,
      correccion: punto.correccion,
      lecturas,
    })
  }

  agregarAvisosDeRepeticion(cotasPorCelda, compensados, avisos)
  agregarAvisosDeApartamiento(cotasPorCelda, avisos)
  agregarAvisosDeCierre(cierre, avisos)

  return {
    cotasPorCelda,
    cotasInstrumento: cotas.cotasInstrumento,
    cierre,
    avisos,
    celdasTotales: grilla.length,
    celdasLlenas: cotasPorCelda.size,
    error: null,
  }
}

function agregarAvisosDeRepeticion(
  cotasPorCelda: Map<string, CotaCelda>,
  compensados: { claveDestino: string; cota: number; destino: { tipo: string } }[],
  avisos: Aviso[],
): void {
  const cotasCrudasPorClave = new Map<string, number[]>()
  for (const punto of compensados) {
    if (punto.destino.tipo !== 'celda') continue
    const lista = cotasCrudasPorClave.get(punto.claveDestino) ?? []
    lista.push(punto.cota)
    cotasCrudasPorClave.set(punto.claveDestino, lista)
  }

  for (const [clave, celda] of cotasPorCelda) {
    if (celda.lecturas.length < 2) continue

    const valores = cotasCrudasPorClave.get(clave) ?? []
    const diferenciaMm = Math.abs(aMilimetros(Math.max(...valores) - Math.min(...valores)))
    const nivel = diferenciaMm > TOLERANCIA_REPETICION_MM ? 'advertencia' : 'informacion'

    avisos.push({
      nivel,
      clave,
      mensaje:
        `${formatearProgresiva(celda.progresiva)} ${celda.elementoClave}: ` +
        `se midió ${celda.lecturas.length} veces, con ${diferenciaMm.toFixed(1)} mm de diferencia. ` +
        'Vale la última lectura.',
    })
  }
}

function agregarAvisosDeApartamiento(
  cotasPorCelda: Map<string, CotaCelda>,
  avisos: Aviso[],
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
          `${formatearProgresiva(celda.progresiva)} ${celda.elementoClave} — lectura ${ultima.toFixed(3)}: ` +
          `se aparta ${redondear3(desvio).toFixed(3)} m de sus vecinas de la misma progresiva. ` +
          '¿La anotaste bien?',
      })
    }
  }
}

function agregarAvisosDeCierre(cierre: ResultadoCierre, avisos: Aviso[]): void {
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
