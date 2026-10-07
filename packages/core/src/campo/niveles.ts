/**
 * Niveles de la capa siguiente: la herramienta de Max «Pistas y veredas:
 * separación entre niveles», metida en el motor (spec 2026-10-06, módulo D).
 *
 * Su HTML hace tres cosas, y aquí se conservan con sus mismos números:
 *  1. Arma líneas (progresiva, cota) desde lecturas de mira o cotas escritas
 *     a mano, con una puesta (cota BM + lectura atrás → HI), lecturas en
 *     m/cm/mm, mira hacia abajo (Z = HI − L) o invertida (Z = HI + L) y un
 *     ajuste en cm por conjunto (`parse` y `zpts`).
 *  2. Compara dos líneas: separación mínima, punto crítico, puntos que no
 *     cumplen y un escáner por progresiva (`analyze`, `valuesAt`).
 *  3. Dice qué nivel registrar en las progresivas pedidas: cota, lectura y
 *     pendiente, interpolando, proyectando o extrapolando (`levelAt`,
 *     `levelFor`, `refreshCalc`).
 *
 * Lo que se mejora al traerla al motor: las líneas pueden salir de las tomas
 * que ya calcula la app (`lineaDeCapa`), cada punto sabe si está comprobado
 * (convención del rediseño §3: lo calculado sobre una nivelación sin cerrar,
 * sobre una puesta rápida, o lo que es una suposición geométrica —proyectado,
 * extrapolado o interpolado a ciegas sobre un hueco— no lo está), el
 * veredicto lleva símbolo con el mismo semáforo que la rasante, la capa
 * siguiente se da como «base + desplazamiento», la lectura se juzga con las
 * reglas de la mira del instrumento del proyecto, y la extrapolación tiene
 * un límite (una progresiva mal tecleada no da una cota).
 */
import { formatearProgresiva, parsearProgresiva } from '../grilla/progresivas'
import { INSTRUMENTO_DE_FABRICA, instrumentoCompleto, type Instrumento } from '../modelo/instrumento'
import type { Id, Proyecto } from '../modelo/tipos'
import { calcularCampania } from '../nivelacion/calcularCampania'
import { alturaInstrumentalDeEstacion, estacionComprobada, estacionesPorCelda } from '../nivelacion/estaciones'
import { redondear3 } from '../numero'
import { estadoDeDiferencia, type EstadoTolerancia } from '../rasante/evaluar'
import {
  clasificarLectura,
  diferenciaEnMm,
  lecturaMaximaLegible,
  reglasDeMira,
  toleranciaValida,
  type RangoLectura,
  type ReglasMira,
} from './avisoLectura'
import { alturaInstrumental as alturaDesdeVistaAtras } from './calculadora'

/** Lo que su HTML trata como «la misma progresiva». */
const EPS = 1e-9

/** Metros que se deja extrapolar por defecto más allá del último punto medido. */
export const EXTRAPOLACION_MAXIMA_M = 20

/**
 * Un tramo de línea sin puntos se tiene por «hueco» si mide más del doble del
 * espaciado normal de la línea y, además, más que esto.
 */
export const HUECO_MINIMO_M = 20

/** Metros en palabras: «360 m», «2.5 m». */
function textoMetros(m: number): string {
  return `${Number(m.toFixed(1))} m`
}

// ---------------------------------------------------------------------------
// Unidades y mira
// ---------------------------------------------------------------------------

export type UnidadLectura = 'm' | 'cm' | 'mm'
/** `normal`: la mira apoyada en el punto (Z = HI − L). `invertida`: colgada de un techo (Z = HI + L). */
export type SentidoMira = 'normal' | 'invertida'

export interface FormaDeLeer {
  unidad: UnidadLectura
  mira: SentidoMira
}

export const LECTURA_EN_METROS: Readonly<FormaDeLeer> = Object.freeze({ unidad: 'm', mira: 'normal' })

/** Cuántos metros vale una unidad de lectura (el `k` de su HTML). */
export function factorDeUnidad(unidad: UnidadLectura): number {
  return unidad === 'cm' ? 0.01 : unidad === 'mm' ? 0.001 : 1
}

/**
 * Z = HI − L con la mira hacia abajo, Z = HI + L invertida. La lectura va en
 * su unidad. Es la forma general de `cotaDesdeLectura` de la calculadora (que
 * solo conoce la mira hacia abajo en metros); no juzga la lectura: eso lo
 * hace quien la llama con las reglas de la mira.
 */
export function cotaDesdeLecturaDeMira(alturaInstrumental: number, lectura: number, forma: FormaDeLeer): number {
  const metros = lectura * factorDeUnidad(forma.unidad)
  return forma.mira === 'invertida' ? alturaInstrumental + metros : alturaInstrumental - metros
}

/**
 * La lectura, en metros, que deja el pie (o la cabeza, invertida) de la mira
 * en esa cota. La forma general de `lecturaObjetivo` de la calculadora.
 */
export function lecturaDeMiraParaCota(alturaInstrumental: number, cota: number, mira: SentidoMira): number {
  return mira === 'invertida' ? cota - alturaInstrumental : alturaInstrumental - cota
}

/** Metros a la unidad de lectura, al milímetro (lo que se lee en la mira). */
export function lecturaEnUnidad(metros: number, unidad: UnidadLectura): number {
  const mm = Math.round(redondear3(metros) * 1000)
  const valor = unidad === 'mm' ? mm : unidad === 'cm' ? mm / 10 : mm / 1000
  return valor === 0 ? 0 : valor
}

// ---------------------------------------------------------------------------
// Lectura del texto «progresiva, valor»
// ---------------------------------------------------------------------------

export interface ParLeido {
  progresiva: number
  valor: number
}

export interface TextoLeido {
  /** Ordenados por progresiva; las repetidas se conservan, en su orden. */
  pares: ParLeido[]
  /** Las líneas que no se usaron enteras, con su número. Nunca se descarta en silencio. */
  avisos: string[]
}

/** Un número escrito como se escribe en obra: con punto o coma decimal. Nada de 0x10 ni 1e3. */
const NUMERO = /^[-+]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/
const ENTERO = /^[-+]?\d+$/

function numeroDeCampo(campo: string): number | null {
  if (!NUMERO.test(campo)) return null
  const v = Number(campo.replace(',', '.'))
  return Number.isFinite(v) ? v : null
}

/**
 * Parte una línea en campos. Con punto y coma o tabulador, esos separan (y la
 * coma queda libre para el decimal). Si no, separan los espacios, y una coma
 * pegada al borde de un campo («10, 1,260») es solo el separador. Sin espacios
 * («10,1.260»), separa la coma.
 */
function camposDeLinea(s: string): string[] {
  if (/[;\t]/.test(s)) return s.split(/[;\t]+/).map((t) => t.trim()).filter(Boolean)
  const palabras = s
    .split(/\s+/)
    .map((t) => t.replace(/^,+|,+$/g, ''))
    .filter(Boolean)
  if (palabras.length >= 2) return palabras
  return s.split(',').map((t) => t.trim()).filter(Boolean)
}

/**
 * El formato de su HTML: una línea por punto, progresiva y valor separados
 * por coma, punto y coma, tabulador o espacios. Además:
 * - la progresiva puede ir como la escribe Max, «0+020» (`parsearProgresiva`);
 * - el valor puede llevar coma decimal: «10, 1,260» es 1.260, no 1;
 * - si hay más de dos números y dos seguidos son enteros («10, 1, 260» o
 *   «10,1,260»), puede ser una coma decimal partida: la línea NO se usa y se
 *   pide escribirla con punto. Tomar «1» movería la cota decímetros;
 * - lo que no se entiende se avisa con su número de línea, nunca en silencio.
 */
export function lineaDesdeTexto(texto: string): TextoLeido {
  const pares: ParLeido[] = []
  const avisos: string[] = []
  String(texto)
    .split(/\r?\n/)
    .forEach((linea, indice) => {
      const s = linea.trim()
      if (!s) return
      const donde = `Línea ${indice + 1}: «${s}»`
      const campos = camposDeLinea(s)
      const progresiva = campos.length >= 2 ? parsearProgresiva(campos[0]!) : null
      const valor = campos.length >= 2 ? numeroDeCampo(campos[1]!) : null
      if (progresiva === null || valor === null) {
        avisos.push(`${donde} no se entiende como «progresiva, valor» (p. ej. «0+020, 1.250»); no se usó.`)
        return
      }
      if (campos.length > 2) {
        const partida =
          (ENTERO.test(campos[1]!) && /^\d+$/.test(campos[2]!)) || (ENTERO.test(campos[0]!) && /^\d+$/.test(campos[1]!))
        if (partida) {
          avisos.push(
            `${donde} tiene más de dos números y puede ser una coma decimal partida; no se usó. ` +
              'Escriba el valor con punto (p. ej. «10, 1.260») para confirmarlo.',
          )
          return
        }
        avisos.push(`${donde} tiene más de dos números; se tomaron los dos primeros.`)
      }
      pares.push({ progresiva, valor })
    })
  pares.sort((a, b) => a.progresiva - b.progresiva)
  return { pares, avisos }
}

// ---------------------------------------------------------------------------
// Puestas
// ---------------------------------------------------------------------------

/**
 * De dónde sale la altura instrumental:
 * - `rapida`: la de su HTML, cota BM + lectura atrás (en metros). Nadie la
 *   cerró, así que lo que se calcule con ella NO está comprobado.
 * - `libreta`: la AI de una estación de la libreta, compensada si el circuito
 *   cerró (`puestaDeLibreta`); trae su propia comprobación y sus avisos.
 */
export type Puesta =
  | { tipo: 'rapida'; nombre?: string; cotaBM: number; lecturaAtras: number }
  | {
      tipo: 'libreta'
      nombre?: string
      alturaInstrumental: number
      comprobado: boolean
      correccionMm?: number
      /** Lo que hay que saber antes de leer con esta AI (p. ej. que el equipo no se haya movido). */
      avisos?: string[]
    }

export interface AlturaDePuesta {
  alturaInstrumental: number
  comprobado: boolean
  avisos: string[]
}

export const AVISO_PUESTA_RAPIDA =
  'Puesta rápida (cota BM + lectura atrás) sin cierre: las cotas y lecturas que salgan de ella quedan no comprobadas.'

/**
 * Null si algún dato no es un número o la lectura atrás no puede ser de una
 * mira: la misma regla que la calculadora (`alturaInstrumental`, al mm).
 */
export function alturaDePuesta(puesta: Puesta, instrumento?: Partial<Instrumento> | null): AlturaDePuesta | null {
  if (puesta.tipo === 'libreta') {
    if (!Number.isFinite(puesta.alturaInstrumental)) return null
    return {
      alturaInstrumental: puesta.alturaInstrumental,
      comprobado: puesta.comprobado === true,
      avisos: [...(puesta.avisos ?? [])],
    }
  }
  const largo = instrumentoCompleto(instrumento).largoMira
  const hi = alturaDesdeVistaAtras(puesta.cotaBM, puesta.lecturaAtras, largo)
  if (hi === null) return null
  return { alturaInstrumental: hi, comprobado: false, avisos: [AVISO_PUESTA_RAPIDA] }
}

/** Dónde está una toma dentro del proyecto. */
function buscarToma(proyecto: Proyecto, tomaId: Id) {
  for (const calle of proyecto.calles)
    for (const nivelacion of calle.nivelaciones)
      for (const toma of nivelacion.tomas) if (toma.id === tomaId) return { calle, toma }
  return null
}

/**
 * La puesta de una estación de la libreta, con la misma AI que el resto de la
 * app (`alturaInstrumentalDeEstacion`: compensada si el circuito cerró).
 *
 * Una AI vale mientras el equipo siga plantado en esa estación. Si la libreta
 * ya pasó a la estación siguiente, el equipo se movió y esa AI no sirve para
 * leer ahora: sale NO comprobada y con el aviso. Solo la última estación de
 * una toma que cerró sale comprobada, y aun así con el aviso de que vale solo
 * si el equipo no se tocó desde entonces. Null si la toma o la estación no
 * existen o no tienen AI.
 */
export function puestaDeLibreta(proyecto: Proyecto, tomaId: Id, indiceEstacion: number): Puesta | null {
  const hallada = buscarToma(proyecto, tomaId)
  if (!hallada) return null
  const { calle, toma } = hallada
  if (!Number.isInteger(indiceEstacion) || indiceEstacion < 0 || indiceEstacion >= toma.estaciones.length) return null
  const resultado = calcularCampania({
    campania: toma,
    calle,
    bms: proyecto.bms,
    largoMira: instrumentoCompleto(proyecto.instrumento).largoMira,
  })
  const { altura, correccionMm } = alturaInstrumentalDeEstacion(resultado, toma, indiceEstacion)
  if (!Number.isFinite(altura)) return null
  const nombre = `Estación ${indiceEstacion + 1} (${toma.fecha})`
  const ultima = indiceEstacion === toma.estaciones.length - 1
  const avisos = ultima
    ? [
        `${nombre}: esta AI vale solo si el equipo sigue plantado ahí, sin tocarlo. ` +
          'Si lo movió o es otro día, plante y tome una vista atrás nueva.',
      ]
    : [
        `${nombre}: la libreta ya pasó a la estación ${indiceEstacion + 2}, así que el equipo se movió y esta AI ` +
          'no sirve para leer ahora. Plante y tome una vista atrás nueva. No se da por comprobada.',
      ]
  return {
    tipo: 'libreta',
    nombre,
    alturaInstrumental: altura,
    comprobado: ultima && estacionComprobada(resultado, indiceEstacion),
    correccionMm,
    avisos,
  }
}

// ---------------------------------------------------------------------------
// Líneas
// ---------------------------------------------------------------------------

export interface PuntoLinea {
  progresiva: number
  cota: number
  /** Sale de una nivelación que cerró (o de una cota que se declaró comprobada). */
  comprobado: boolean
}

/**
 * Una línea de niveles a lo largo de la calle. Se espera ordenada por
 * progresiva y con números; si no lo está, las funciones que la reciben la
 * ordenan y dejan fuera lo que no es número, avisando.
 */
export interface LineaNivel {
  nombre: string
  puntos: PuntoLinea[]
}

/** Un «conjunto» de su HTML: lo que se escribe a mano. */
export interface ConjuntoNiveles {
  nombre: string
  /** `lectura`: lecturas de mira con su puesta. `cota`: el valor tal cual, en metros. */
  tipo: 'lectura' | 'cota'
  /** «progresiva, valor», una línea por punto. */
  texto: string
  /** Hace falta para `lectura`; en `cota` no se usa. */
  puesta?: Puesta
  /** Sube (+) o baja (−) la línea entera, en cm. */
  ajusteCm?: number
  /** Solo para `cota`: si esas cotas vienen de algo comprobado. Por defecto no. */
  cotasComprobadas?: boolean
}

export interface LineaLeida {
  linea: LineaNivel
  avisos: string[]
}

function textoAjuste(ajusteCm: number): string {
  return ajusteCm ? ` (${ajusteCm > 0 ? '+' : ''}${ajusteCm} cm)` : ''
}

function reglasDelInstrumento(instrumento?: Partial<Instrumento> | null): ReglasMira | null {
  const i = instrumentoCompleto(instrumento)
  return reglasDeMira({ largoMira: i.largoMira, lecturaMin: i.lecturaMin, margenSuperior: i.margenSuperior })
}

const REGLAS_DE_FABRICA: ReglasMira = {
  largoMira: INSTRUMENTO_DE_FABRICA.largoMira,
  lecturaMin: INSTRUMENTO_DE_FABRICA.lecturaMin,
  margenSuperior: INSTRUMENTO_DE_FABRICA.margenSuperior,
}

/**
 * `zpts` de su HTML: (cota o HI ± lectura) + ajuste. Además, la lectura que
 * no cabe en la mira no se convierte en cota (es un error de anotación, igual
 * que en la libreta) y la poco precisa se usa avisando.
 */
export function lineaDeConjunto(
  conjunto: ConjuntoNiveles,
  forma: FormaDeLeer = LECTURA_EN_METROS,
  instrumento?: Partial<Instrumento> | null,
): LineaLeida {
  const ajusteCm = Number.isFinite(conjunto.ajusteCm) ? conjunto.ajusteCm! : 0
  const ajuste = ajusteCm / 100
  const nombre = conjunto.nombre + textoAjuste(ajusteCm)
  const leido = lineaDesdeTexto(conjunto.texto)
  const avisos = [...leido.avisos]

  if (conjunto.tipo === 'cota') {
    const comprobado = conjunto.cotasComprobadas === true
    return {
      linea: {
        nombre,
        puntos: leido.pares.map((p) => ({ progresiva: p.progresiva, cota: p.valor + ajuste, comprobado })),
      },
      avisos,
    }
  }

  const puesta = conjunto.puesta ? alturaDePuesta(conjunto.puesta, instrumento) : null
  if (!puesta) {
    avisos.push(`${conjunto.nombre}: sin una puesta válida (cota BM y lectura atrás) no hay cotas.`)
    return { linea: { nombre, puntos: [] }, avisos }
  }
  avisos.push(...puesta.avisos)
  const reglas = reglasDelInstrumento(instrumento) ?? REGLAS_DE_FABRICA
  const k = factorDeUnidad(forma.unidad)
  const puntos: PuntoLinea[] = []
  for (const p of leido.pares) {
    const metros = p.valor * k
    const rango = clasificarLectura(metros, reglas)
    const donde = `${conjunto.nombre}, ${formatearProgresiva(p.progresiva)}`
    if (rango === 'imposible' || rango === 'noEsNumero') {
      avisos.push(
        `${donde}: la lectura ${p.valor} ${forma.unidad} no cabe en la mira de ${reglas.largoMira} m; no se usa. ` +
          '¿Está bien la unidad?',
      )
      continue
    }
    if (rango === 'pocoPrecisa') {
      avisos.push(
        `${donde}: la lectura ${metros.toFixed(3)} m está fuera de ${reglas.lecturaMin.toFixed(3)} … ` +
          `${lecturaMaximaLegible(reglas).toFixed(3)} m: poco precisa.`,
      )
    }
    puntos.push({
      progresiva: p.progresiva,
      cota: cotaDesdeLecturaDeMira(puesta.alturaInstrumental, p.valor, forma) + ajuste,
      comprobado: puesta.comprobado,
    })
  }
  return { linea: { nombre, puntos }, avisos }
}

export interface OpcionesLineaDeCapa {
  /** Solo las tomas de esta nivelación. Por defecto, todas las de la calle en esa capa. */
  nivelacionId?: Id
}

/**
 * La línea de un punto de la sección (borde izquierdo, eje, vereda…) en una
 * capa, armada con las cotas que ya calcula el motor (`calcularCampania`,
 * compensadas si el circuito cerró) en todas las tomas de esa capa. Un punto
 * está comprobado si la estación que lo leyó lo está (`estacionComprobada`,
 * la misma regla que la pantalla).
 *
 * Si dos tomas midieron la misma progresiva vale la más reciente (por fecha),
 * y se avisa. `puntoSeccion` es el id del punto o su nombre. Null si la calle
 * o el punto no existen.
 */
export function lineaDeCapa(
  proyecto: Proyecto,
  calleId: Id,
  capaId: Id,
  puntoSeccion: string,
  opciones: OpcionesLineaDeCapa = {},
): LineaLeida | null {
  const calle = proyecto.calles.find((c) => c.id === calleId)
  if (!calle) return null
  const buscado = puntoSeccion.trim().toLowerCase()
  const punto =
    calle.seccion.puntos.find((p) => p.id === puntoSeccion) ??
    calle.seccion.puntos.find((p) => p.nombre.trim().toLowerCase() === buscado)
  if (!punto) return null
  const capa = proyecto.capas.find((c) => c.id === capaId)
  const nombre = `${capa?.nombre ?? 'Capa'} · ${punto.nombre}`
  const largoMira = instrumentoCompleto(proyecto.instrumento).largoMira

  const tomas = calle.nivelaciones
    .filter((n) => opciones.nivelacionId === undefined || n.id === opciones.nivelacionId)
    .flatMap((n) => n.tomas)
    .filter((t) => t.capaId === capaId)
    // Estable: a igual fecha, manda la que va después en la lista.
    .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0))

  const avisos: string[] = []
  if (tomas.length === 0) {
    avisos.push(`${capa?.nombre ?? 'Esa capa'} no tiene tomas en ${calle.nombre}: la línea queda vacía.`)
    return { linea: { nombre, puntos: [] }, avisos }
  }

  const porProgresiva = new Map<number, PuntoLinea & { fecha: string }>()
  const repetidas = new Set<number>()
  for (const toma of tomas) {
    const resultado = calcularCampania({ campania: toma, calle, bms: proyecto.bms, largoMira })
    if (resultado.error) avisos.push(`Toma del ${toma.fecha}: ${resultado.error}`)
    // Una vez por toma, no una vez por celda.
    const estaciones = estacionesPorCelda(toma)
    for (const celda of resultado.cotasPorCelda.values()) {
      if (celda.elementoClave !== punto.id) continue
      const estacion = estaciones.get(celda.clave)
      const comprobado = estacion !== undefined && estacionComprobada(resultado, estacion)
      if (porProgresiva.has(celda.progresiva)) repetidas.add(celda.progresiva)
      porProgresiva.set(celda.progresiva, {
        progresiva: celda.progresiva,
        cota: celda.cota,
        comprobado,
        fecha: toma.fecha,
      })
    }
  }

  for (const x of [...repetidas].sort((a, b) => a - b)) {
    avisos.push(
      `${formatearProgresiva(x)} ${punto.nombre}: medida en varias tomas; vale la más reciente ` +
        `(${porProgresiva.get(x)!.fecha}).`,
    )
  }
  const puntos = [...porProgresiva.values()]
    .sort((a, b) => a.progresiva - b.progresiva)
    .map(({ progresiva, cota, comprobado }) => ({ progresiva, cota, comprobado }))
  const sinComprobar = puntos.filter((p) => !p.comprobado).length
  if (sinComprobar > 0) {
    avisos.push(
      `${nombre}: ${sinComprobar} ${sinComprobar === 1 ? 'punto' : 'puntos'} no comprobados ` +
        '(su nivelación no cerró).',
    )
  }
  return { linea: { nombre, puntos }, avisos }
}

// ---------------------------------------------------------------------------
// Líneas listas para calcular
// ---------------------------------------------------------------------------

/** Una línea ordenada, solo con números, y con su umbral de hueco ya calculado. */
interface LineaNormal {
  nombre: string
  puntos: PuntoLinea[]
  /** Un tramo más largo que esto es un hueco (Infinity si no se sabe el espaciado). */
  umbralHueco: number
  avisos: string[]
}

/**
 * El espaciado normal de la línea: la mediana baja del largo de sus tramos.
 * Null si tiene menos de dos tramos (con uno solo, no hay con qué comparar).
 */
function espaciado(puntos: PuntoLinea[]): number | null {
  const largos: number[] = []
  for (let i = 0; i < puntos.length - 1; i++) {
    const dx = puntos[i + 1]!.progresiva - puntos[i]!.progresiva
    if (dx > EPS) largos.push(dx)
  }
  if (largos.length < 2) return null
  largos.sort((a, b) => a - b)
  return largos[Math.floor((largos.length - 1) / 2)]!
}

function umbralDeHueco(espaciadoNormal: number | null): number {
  return espaciadoNormal === null ? Number.POSITIVE_INFINITY : Math.max(2 * espaciadoNormal, HUECO_MINIMO_M)
}

/**
 * Lo que toda función pública hace al recibir una línea: deja fuera los
 * puntos que no son números y ordena por progresiva (estable: las repetidas
 * conservan su orden), avisando de las dos cosas. `respaldo` es el espaciado
 * que se usa si la línea no tiene el suyo (p. ej. el de otra línea).
 */
function normalizarLinea(linea: LineaNivel, respaldo: number | null = null): LineaNormal {
  const avisos: string[] = []
  const todos = Array.isArray(linea.puntos) ? linea.puntos : []
  const finitos = todos
    .filter((p) => p != null && Number.isFinite(p.progresiva) && Number.isFinite(p.cota))
    .map((p) => ({ progresiva: p.progresiva, cota: p.cota, comprobado: p.comprobado === true }))
  const fuera = todos.length - finitos.length
  if (fuera > 0) {
    avisos.push(
      `${linea.nombre}: ${fuera} ${fuera === 1 ? 'punto' : 'puntos'} sin progresiva o cota numérica; no se usan.`,
    )
  }
  let ordenada = true
  for (let i = 1; i < finitos.length && ordenada; i++) {
    if (finitos[i]!.progresiva < finitos[i - 1]!.progresiva) ordenada = false
  }
  if (!ordenada) {
    finitos.sort((a, b) => a.progresiva - b.progresiva)
    avisos.push(`${linea.nombre}: los puntos no venían en orden de progresiva; se ordenaron.`)
  }
  return {
    nombre: linea.nombre,
    puntos: finitos,
    umbralHueco: umbralDeHueco(espaciado(finitos) ?? respaldo),
    avisos,
  }
}

/** El menor espaciado de varias líneas: el respaldo de las que no tienen el suyo. */
function menorEspaciado(lineas: PuntoLinea[][]): number | null {
  let menor: number | null = null
  for (const p of lineas) {
    const e = espaciado(p)
    if (e !== null && (menor === null || e < menor)) menor = e
  }
  return menor
}

/** El primer índice cuya progresiva es ≥ x (búsqueda binaria; los puntos van ordenados). */
function primeroDesde(puntos: PuntoLinea[], x: number): number {
  let lo = 0
  let hi = puntos.length
  while (lo < hi) {
    const mitad = (lo + hi) >>> 1
    if (puntos[mitad]!.progresiva < x) lo = mitad + 1
    else hi = mitad
  }
  return lo
}

// ---------------------------------------------------------------------------
// Valores sobre una línea
// ---------------------------------------------------------------------------

interface Hueco {
  desde: number
  hasta: number
}

interface Valor {
  z: number
  comprobado: boolean
  /** El tramo sin puntos sobre el que se interpoló, si lo era. */
  hueco: Hueco | null
}

/**
 * `valuesAt` de su HTML: los valores exactos en x, o el interpolado entre
 * vecinos. Interpolar sobre un hueco no está comprobado: es una recta que no
 * ve lo que hay en medio.
 */
function valoresEn(linea: LineaNormal, x: number): Valor[] {
  const P = linea.puntos
  const i = primeroDesde(P, x - EPS)
  const exactos: Valor[] = []
  for (let j = i; j < P.length && P[j]!.progresiva < x + EPS; j++) {
    exactos.push({ z: P[j]!.cota, comprobado: P[j]!.comprobado, hueco: null })
  }
  if (exactos.length) return exactos
  if (i === 0 || i >= P.length) return []
  const a = P[i - 1]!
  const b = P[i]!
  const largo = b.progresiva - a.progresiva
  const enHueco = largo > linea.umbralHueco
  return [
    {
      z: a.cota + ((b.cota - a.cota) * (x - a.progresiva)) / largo,
      comprobado: a.comprobado && b.comprobado && !enHueco,
      hueco: enHueco ? { desde: a.progresiva, hasta: b.progresiva } : null,
    },
  ]
}

interface Nivel {
  z: number
  /** En %. */
  pendiente: number
  extra: boolean
  comprobado: boolean
  /** El tramo usado. */
  a: PuntoLinea
  b: PuntoLinea
  /** Metros más allá del punto extremo, si se extrapoló (0 si no). */
  alejamiento: number
  /** El tramo usado era un hueco (solo si no se extrapoló). */
  hueco: boolean
}

/**
 * `levelAt` de su HTML: interpola en el tramo que contiene x o prolonga el
 * extremo. Lo extrapolado no está comprobado: nadie lo midió.
 */
function nivelEn(linea: LineaNormal, x: number): Nivel | null {
  const P = linea.puntos
  if (P.length < 2) return null
  const valido = (i: number) => P[i + 1]!.progresiva - P[i]!.progresiva > EPS
  let tramo = -1
  let extra = false
  for (let i = Math.max(0, primeroDesde(P, x - EPS) - 1); i < P.length - 1 && P[i]!.progresiva <= x + EPS; i++) {
    if (valido(i) && P[i + 1]!.progresiva >= x - EPS) {
      tramo = i
      break
    }
  }
  let alejamiento = 0
  if (tramo < 0) {
    extra = true
    if (x < P[0]!.progresiva) {
      alejamiento = P[0]!.progresiva - x
      for (let i = 0; i < P.length - 1; i++) if (valido(i)) { tramo = i; break }
    } else {
      alejamiento = x - P[P.length - 1]!.progresiva
      for (let i = P.length - 2; i >= 0; i--) if (valido(i)) { tramo = i; break }
    }
    if (tramo < 0) return null
  }
  const a = P[tramo]!
  const b = P[tramo + 1]!
  const s = (b.cota - a.cota) / (b.progresiva - a.progresiva)
  const hueco = !extra && b.progresiva - a.progresiva > linea.umbralHueco
  return {
    z: a.cota + s * (x - a.progresiva),
    pendiente: s * 100,
    extra,
    comprobado: a.comprobado && b.comprobado && !extra && !hueco,
    a,
    b,
    alejamiento,
    hueco,
  }
}

export interface TramoPendiente {
  desde: number
  hasta: number
  /** Positiva sube al avanzar. */
  pendientePct: number
  comprobado: boolean
}

/**
 * La pendiente de cada tramo, como la rotula su gráfica. Salta los tramos de
 * largo cero (progresiva repetida). La línea se ordena antes y se dejan fuera
 * los puntos que no son números, así no hay tramos «hacia atrás».
 */
export function pendientesDeLinea(linea: LineaNivel): TramoPendiente[] {
  const salida: TramoPendiente[] = []
  const p = normalizarLinea(linea).puntos
  for (let i = 0; i < p.length - 1; i++) {
    const dx = p[i + 1]!.progresiva - p[i]!.progresiva
    if (dx < EPS) continue
    salida.push({
      desde: p[i]!.progresiva,
      hasta: p[i + 1]!.progresiva,
      pendientePct: ((p[i + 1]!.cota - p[i]!.cota) / dx) * 100,
      comprobado: p[i]!.comprobado && p[i + 1]!.comprobado,
    })
  }
  return salida
}

// ---------------------------------------------------------------------------
// Separación entre dos líneas
// ---------------------------------------------------------------------------

/** El mismo semáforo que la rasante, el drenaje y el replanteo (`estadoDeDiferencia`). */
export type EstadoSeparacion = Exclude<EstadoTolerancia, 'sinRasante' | 'sinMedir'>
export type SimboloSeparacion = '✓' | '△' | '✗'

export const SIMBOLO_SEPARACION: Readonly<Record<EstadoSeparacion, SimboloSeparacion>> = Object.freeze({
  conforme: '✓',
  alLimite: '△',
  fuera: '✗',
})

export interface OpcionesSeparacion {
  /**
   * Milímetros (≥ 0). Se juzga lo que le falta a la separación para llegar al
   * mínimo, al milímetro, con el criterio de siempre (`estadoDeDiferencia`):
   * ✓ si falta hasta la tolerancia, △ hasta el doble, ✗ pasado eso. Sin ella
   * (o con 0) no hay △: solo ✓ o ✗, como en su HTML.
   */
  toleranciaMm?: number
}

export interface PuntoSeparacion {
  progresiva: number
  /** La más baja de la línea superior en esa progresiva. */
  cotaSuperior: number
  /** La más alta de la línea inferior. */
  cotaInferior: number
  /** Superior − inferior, en metros. */
  separacion: number
  /** Igual a `estado === 'conforme'`: lo △ tampoco cumple, está por poco. */
  cumple: boolean
  estado: EstadoSeparacion
  simbolo: SimboloSeparacion
  /** Las dos líneas están comprobadas en ese punto (y ninguna se interpoló sobre un hueco). */
  comprobado: boolean
  /** La superior quedó por debajo de la inferior (al milímetro). */
  seCruzan: boolean
}

export type ResultadoSeparacion =
  | {
      ok: true
      /** Tramo común evaluado. */
      desde: number
      hasta: number
      minimoM: number
      /** El de menor separación (el primero, si hay empate). */
      critico: PuntoSeparacion
      /** Uno por cada vértice de cualquiera de las dos líneas dentro del tramo común. */
      puntos: PuntoSeparacion[]
      /** Los que no están ✓ (△ y ✗). */
      noCumplen: PuntoSeparacion[]
      cumple: boolean
      /** El peor estado de todos los puntos. */
      estado: EstadoSeparacion
      simbolo: SimboloSeparacion
      comprobado: boolean
      avisos: string[]
    }
  | { ok: false; error: string }

export const ERROR_MINIMO = 'El mínimo de separación no es un número válido (≥ 0 m).'
export const ERROR_TOLERANCIA = 'La tolerancia no es un número válido (≥ 0 mm).'

function juzgarSeparacion(separacion: number, minimoM: number, toleranciaMm: number): EstadoSeparacion {
  if (diferenciaEnMm(separacion) < 0) return 'fuera'
  const falta = minimoM - separacion
  if (falta <= 0) return 'conforme'
  return estadoDeDiferencia(diferenciaEnMm(falta), toleranciaMm) as EstadoSeparacion
}

function puntoDeSeparacion(
  x: number,
  sup: Valor[],
  inf: Valor[],
  minimoM: number,
  toleranciaMm: number,
): PuntoSeparacion {
  const cotaSuperior = Math.min(...sup.map((v) => v.z))
  const cotaInferior = Math.max(...inf.map((v) => v.z))
  const separacion = cotaSuperior - cotaInferior
  const estado = juzgarSeparacion(separacion, minimoM, toleranciaMm)
  return {
    progresiva: x,
    cotaSuperior,
    cotaInferior,
    separacion,
    cumple: estado === 'conforme',
    estado,
    simbolo: SIMBOLO_SEPARACION[estado],
    comprobado: sup.every((v) => v.comprobado) && inf.every((v) => v.comprobado),
    seCruzan: diferenciaEnMm(separacion) < 0,
  }
}

function tramoComun(U: PuntoLinea[], L: PuntoLinea[]): { desde: number; hasta: number } | string {
  if (U.length < 2 || L.length < 2) return 'Cada línea necesita al menos 2 puntos válidos.'
  const desde = Math.max(U[0]!.progresiva, L[0]!.progresiva)
  const hasta = Math.min(U[U.length - 1]!.progresiva, L[L.length - 1]!.progresiva)
  if (desde > hasta) return 'Las dos líneas no se superponen en progresiva.'
  return { desde, hasta }
}

/** Valida el mínimo y la tolerancia; devuelve el error o la tolerancia a usar. */
function validarSeparacion(minimoM: number, opciones: OpcionesSeparacion): string | number {
  if (typeof minimoM !== 'number' || !Number.isFinite(minimoM) || minimoM < 0) return ERROR_MINIMO
  const tol = opciones.toleranciaMm
  if (tol === undefined) return 0
  if (typeof tol !== 'number' || !toleranciaValida(tol)) return ERROR_TOLERANCIA
  return tol
}

/** Las dos líneas listas: cada una toma el espaciado de la otra si no tiene el suyo. */
function normalizarPar(superior: LineaNivel, inferior: LineaNivel): [LineaNormal, LineaNormal] {
  const u = normalizarLinea(superior)
  const l = normalizarLinea(inferior)
  const eU = espaciado(u.puntos)
  const eL = espaciado(l.puntos)
  if (eU === null) u.umbralHueco = umbralDeHueco(eL)
  if (eL === null) l.umbralHueco = umbralDeHueco(eU)
  return [u, l]
}

const PEOR: Record<EstadoSeparacion, number> = { conforme: 0, alLimite: 1, fuera: 2 }

/**
 * `analyze` de su HTML: en cada vértice de cualquiera de las dos líneas
 * dentro del tramo común, la separación = superior − inferior. Más el
 * semáforo con símbolo, la comprobación por punto y los avisos de lo que la
 * vuelve dudosa (líneas cruzadas, huecos, puntos sin número o desordenados).
 * Un mínimo o una tolerancia que no son números dan error, no un veredicto.
 */
export function separacionEntreLineas(
  superior: LineaNivel,
  inferior: LineaNivel,
  minimoM: number,
  opciones: OpcionesSeparacion = {},
): ResultadoSeparacion {
  const validado = validarSeparacion(minimoM, opciones)
  if (typeof validado === 'string') return { ok: false, error: validado }
  const toleranciaMm = validado
  const [u, l] = normalizarPar(superior, inferior)
  const tramo = tramoComun(u.puntos, l.puntos)
  if (typeof tramo === 'string') return { ok: false, error: tramo }
  const { desde, hasta } = tramo
  const xs = [
    ...new Set(
      [...u.puntos, ...l.puntos].map((p) => p.progresiva).filter((x) => x >= desde - EPS && x <= hasta + EPS),
    ),
  ].sort((a, b) => a - b)

  const puntos: PuntoSeparacion[] = []
  const huecos = new Map<string, { linea: string; hueco: Hueco }>()
  let critico: PuntoSeparacion | null = null
  for (const x of xs) {
    const vu = valoresEn(u, x)
    const vl = valoresEn(l, x)
    if (!vu.length || !vl.length) continue
    for (const [linea, valores] of [[u.nombre, vu], [l.nombre, vl]] as const) {
      for (const v of valores) {
        if (v.hueco) huecos.set(`${linea}|${v.hueco.desde}|${v.hueco.hasta}`, { linea, hueco: v.hueco })
      }
    }
    const p = puntoDeSeparacion(x, vu, vl, minimoM, toleranciaMm)
    puntos.push(p)
    if (!critico || p.separacion < critico.separacion) critico = p
  }
  if (!critico) return { ok: false, error: 'No hay puntos comparables.' }

  const estado = puntos.reduce<EstadoSeparacion>((peor, p) => (PEOR[p.estado] > PEOR[peor] ? p.estado : peor), 'conforme')
  const noCumplen = puntos.filter((p) => !p.cumple)
  const avisos: string[] = [...u.avisos, ...l.avisos]
  const cruces = puntos.filter((p) => p.seCruzan)
  if (cruces.length) {
    avisos.push(
      `Las líneas se cruzan en ${cruces.map((p) => formatearProgresiva(p.progresiva)).join(', ')}: ` +
        `${superior.nombre} queda por debajo de ${inferior.nombre}. ¿Están bien elegidas?`,
    )
  }
  for (const { linea, hueco } of huecos.values()) {
    avisos.push(
      `${linea}: tramo sin puntos de ${textoMetros(hueco.hasta - hueco.desde)} ` +
        `(${formatearProgresiva(hueco.desde)} – ${formatearProgresiva(hueco.hasta)}); ahí se compara contra una ` +
        'recta entre sus extremos, que no ve lo que hay en medio: no comprobado.',
    )
  }
  const sinComprobar = puntos.filter((p) => !p.comprobado).length
  if (sinComprobar) {
    avisos.push(
      `${sinComprobar} de ${puntos.length} puntos no comprobados: alguna de las dos líneas sale de una ` +
        'nivelación sin cerrar o de una puesta rápida, o se interpoló sobre un hueco.',
    )
  }
  return {
    ok: true,
    desde,
    hasta,
    minimoM,
    critico,
    puntos,
    noCumplen,
    cumple: noCumplen.length === 0,
    estado,
    simbolo: SIMBOLO_SEPARACION[estado],
    comprobado: sinComprobar === 0,
    avisos,
  }
}

/**
 * El escáner de su HTML: la separación en cualquier progresiva del tramo
 * común. Fuera de ese tramo, o con un mínimo o una tolerancia que no son
 * números, da null (su deslizador no podía salirse; aquí no se inventa un
 * valor).
 */
export function separacionEn(
  superior: LineaNivel,
  inferior: LineaNivel,
  progresiva: number,
  minimoM: number,
  opciones: OpcionesSeparacion = {},
): PuntoSeparacion | null {
  const validado = validarSeparacion(minimoM, opciones)
  if (typeof validado === 'string' || !Number.isFinite(progresiva)) return null
  const [u, l] = normalizarPar(superior, inferior)
  const tramo = tramoComun(u.puntos, l.puntos)
  if (typeof tramo === 'string') return null
  if (progresiva < tramo.desde - EPS || progresiva > tramo.hasta + EPS) return null
  const vu = valoresEn(u, progresiva)
  const vl = valoresEn(l, progresiva)
  if (!vu.length || !vl.length) return null
  return puntoDeSeparacion(progresiva, vu, vl, minimoM, validado)
}

// ---------------------------------------------------------------------------
// Nivel a registrar
// ---------------------------------------------------------------------------

export type ComoSeObtuvo = 'interpolado' | 'proyectado' | 'extrapolado'

interface NivelObtenido {
  z: number
  pendiente: number
  comprobado: boolean
  como: ComoSeObtuvo
  desde: string | null
  /** El punto propio desde el que se proyectó. */
  ancla: number | null
  /** El extremo propio desde el que se extrapoló. */
  extremo: number | null
  /** Metros que se prolongó una línea más allá de su punto extremo (0 si ninguna). */
  alejamiento: number
  /** El hueco de la línea propia en el que cae la progresiva, si cae en uno. */
  hueco: Hueco | null
}

/** El punto propio más cercano a x; a igual distancia, el primero (como su HTML). */
function puntoMasCercano(P: PuntoLinea[], x: number): PuntoLinea {
  const k = primeroDesde(P, x)
  if (k >= P.length) return P[primeroDesde(P, P[P.length - 1]!.progresiva)]!
  if (k === 0) return P[0]!
  const izquierdo = P[primeroDesde(P, P[k - 1]!.progresiva)]!
  return Math.abs(izquierdo.progresiva - x) <= Math.abs(P[k]!.progresiva - x) ? izquierdo : P[k]!
}

/**
 * Un hueco de la línea propia (de a a b) que otra línea sí midió por dentro:
 * se sigue la forma de esa otra línea y lo que no cierra en b se reparte a lo
 * largo del tramo, así la cota pasa por los dos extremos medidos. Elige, como
 * su HTML, la línea más cercana en cota en a. Null si ninguna tiene puntos ahí.
 */
function seguirHueco(r: Nivel, x: number, otras: LineaNormal[]): NivelObtenido | null {
  const { a, b } = r
  let mejor: { d: number; o: LineaNormal; oa: Nivel; ob: Nivel; ox: Nivel } | null = null
  for (const o of otras) {
    const P = o.puntos
    if (P[0]!.progresiva > a.progresiva + EPS || P[P.length - 1]!.progresiva < b.progresiva - EPS) continue
    const dentro = primeroDesde(P, a.progresiva + EPS)
    if (dentro >= P.length || P[dentro]!.progresiva >= b.progresiva - EPS) continue
    const oa = nivelEn(o, a.progresiva)
    const ob = nivelEn(o, b.progresiva)
    const ox = nivelEn(o, x)
    if (!oa || !ob || !ox) continue
    const d = Math.abs(oa.z - a.cota)
    if (!mejor || d < mejor.d) mejor = { d, o, oa, ob, ox }
  }
  if (!mejor) return null
  const largo = b.progresiva - a.progresiva
  const cierre = b.cota - a.cota - (mejor.ob.z - mejor.oa.z)
  return {
    z: a.cota + (mejor.ox.z - mejor.oa.z) + ((x - a.progresiva) / largo) * cierre,
    pendiente: mejor.ox.pendiente + (cierre / largo) * 100,
    comprobado: false,
    como: 'proyectado',
    desde: mejor.o.nombre,
    ancla: null,
    extremo: null,
    alejamiento: 0,
    hueco: { desde: a.progresiva, hasta: b.progresiva },
  }
}

/** `levelFor` de su HTML, punto por punto, más el seguimiento de los huecos. */
function nivelPara(propia: LineaNormal, x: number, otras: LineaNormal[]): NivelObtenido | null {
  const P = propia.puntos
  if (P.length >= 2 && x >= P[0]!.progresiva - EPS && x <= P[P.length - 1]!.progresiva + EPS) {
    const r = nivelEn(propia, x)
    if (r) {
      // En un punto medido no hay hueco que valga: la cota es la medida.
      const enVertice = Math.abs(x - r.a.progresiva) < EPS || Math.abs(x - r.b.progresiva) < EPS
      const hueco = r.hueco && !enVertice
      if (hueco) {
        const seguido = seguirHueco(r, x, otras)
        if (seguido) return seguido
      }
      const vertice = Math.abs(x - r.a.progresiva) < EPS ? r.a : r.b
      return {
        z: r.z,
        pendiente: r.pendiente,
        comprobado: r.hueco && enVertice ? vertice.comprobado : r.comprobado,
        como: 'interpolado',
        desde: null,
        ancla: null,
        extremo: null,
        alejamiento: 0,
        hueco: hueco ? { desde: r.a.progresiva, hasta: r.b.progresiva } : null,
      }
    }
  }
  if (!P.length) return null

  const ancla = puntoMasCercano(P, x)

  const proyectar = (estricto: boolean): NivelObtenido | null => {
    let mejor: { d: number; o: LineaNormal; ra: Nivel; rx: Nivel } | null = null
    for (const o of otras) {
      const lo = o.puntos[0]!.progresiva
      const hi = o.puntos[o.puntos.length - 1]!.progresiva
      if (
        estricto &&
        (x < lo - EPS || x > hi + EPS || ancla.progresiva < lo - EPS || ancla.progresiva > hi + EPS)
      )
        continue
      const ra = nivelEn(o, ancla.progresiva)
      const rx = nivelEn(o, x)
      if (!ra || !rx) continue
      const d = Math.abs(ra.z - ancla.cota)
      if (!mejor || d < mejor.d) mejor = { d, o, ra, rx }
    }
    if (!mejor) return null
    return {
      z: ancla.cota + mejor.rx.z - mejor.ra.z,
      pendiente: mejor.rx.pendiente,
      // Una suposición: la capa sigue paralela a otra. Nadie la midió aquí.
      comprobado: false,
      como: 'proyectado',
      desde: mejor.o.nombre,
      ancla: ancla.progresiva,
      extremo: null,
      alejamiento: Math.max(mejor.ra.alejamiento, mejor.rx.alejamiento),
      hueco: null,
    }
  }

  // La línea más cercana que cubre ambas progresivas.
  const r1 = proyectar(true)
  if (r1) return r1
  if (P.length >= 2) {
    const r = nivelEn(propia, x)
    if (r) {
      return {
        z: r.z,
        pendiente: r.pendiente,
        comprobado: false,
        como: 'extrapolado',
        desde: null,
        ancla: null,
        extremo: x < P[0]!.progresiva ? P[0]!.progresiva : P[P.length - 1]!.progresiva,
        alejamiento: r.alejamiento,
        hueco: null,
      }
    }
  }
  // Un solo punto: la línea ajena más cercana, aunque haya que prolongarla.
  return proyectar(false)
}

export interface EntradaNivelARegistrar {
  /** La línea base (p. ej. la subrasante medida). */
  linea: LineaNivel
  /** Las líneas de las que se pueden tomar pendientes. La propia se descarta si viene. */
  otras?: LineaNivel[]
  progresivas: number[]
  /** La puesta desde la que se va a leer. */
  ai: Puesta
  /** Metros que se suman a la base: la capa siguiente = base + desplazamiento. */
  desplazamientoM?: number
  /** Para las reglas de la mira; lo que falte, de fábrica. */
  instrumento?: Partial<Instrumento> | null
  /** Por defecto, metros y mira hacia abajo. */
  forma?: FormaDeLeer
  /**
   * Cuántos metros se deja prolongar una línea más allá de su punto extremo
   * (por defecto `EXTRAPOLACION_MAXIMA_M`). Más lejos no se da cota: casi
   * siempre es una progresiva mal tecleada.
   */
  extrapolacionMaximaM?: number
}

export interface FilaNivel {
  progresiva: number
  /** Cota a registrar, al mm. Null si no hay de dónde sacarla (ver `motivoSinCota`). */
  cota: number | null
  /** Lectura de mira en metros, al mm. Null sin cota o sin altura instrumental. */
  lecturaM: number | null
  /** La misma lectura en la unidad elegida. */
  lectura: number | null
  /** Pendiente del tramo que dio la cota, en %. */
  pendientePct: number | null
  como: ComoSeObtuvo | null
  /** Nombre de la línea de la que se tomaron las pendientes, si se proyectó. */
  desde: string | null
  /** Dónde cae la lectura en la mira. Una negativa cuenta como imposible. */
  rango: RangoLectura | null
  /** Solo lo interpolado entre puntos comprobados, con una puesta comprobada. */
  comprobado: boolean
  /** Por qué no hay cota, en pocas palabras (null si la hay). */
  motivoSinCota: string | null
  avisos: string[]
}

export interface ResultadoNivelARegistrar {
  /** Nombre de la línea registrada, con el desplazamiento escrito. */
  linea: string
  alturaInstrumental: number | null
  comprobado: boolean
  forma: FormaDeLeer
  mira: ReglasMira
  desplazamientoM: number
  filas: FilaNivel[]
  avisos: string[]
}

function textoDesplazamiento(d: number): string {
  return d ? ` ${d > 0 ? '+' : '-'} ${Math.abs(d).toFixed(3)} m` : ''
}

function avisosDeLectura(lecturaM: number, rango: RangoLectura, reglas: ReglasMira, mira: SentidoMira): string[] {
  const m = lecturaM.toFixed(3)
  if (lecturaM < 0) {
    const donde = mira === 'invertida' ? 'por debajo' : 'por encima'
    return [`Lectura negativa (${m} m): la cota queda ${donde} del instrumento; cambie de estación.`]
  }
  if (rango === 'imposible') {
    return lecturaM > reglas.largoMira
      ? [`La lectura ${m} m no cabe en la mira de ${reglas.largoMira} m: cambie de estación.`]
      : [`La lectura ${m} m es imposible (el hilo no cae en el cero de la mira): cambie de estación.`]
  }
  if (rango === 'pocoPrecisa') {
    return [
      `La lectura ${m} m está fuera de ${reglas.lecturaMin.toFixed(3)} … ` +
        `${lecturaMaximaLegible(reglas).toFixed(3)} m: poco precisa, cambie de estación.`,
    ]
  }
  return []
}

function filaSinCota(x: number, motivo: string, avisos: string[], r?: NivelObtenido): FilaNivel {
  return {
    progresiva: x,
    cota: null,
    lecturaM: null,
    lectura: null,
    pendientePct: null,
    como: r?.como ?? null,
    desde: r?.desde ?? null,
    rango: null,
    comprobado: false,
    motivoSinCota: motivo,
    avisos,
  }
}

/** Cómo se obtuvo la cota, en palabras, con las distancias. */
function avisosDeComo(r: NivelObtenido, nombre: string, x: number): string[] {
  const avisos: string[] = []
  if (r.como === 'proyectado' && r.hueco) {
    avisos.push(
      `proyectado desde ${r.desde}: ${nombre} no tiene puntos en ${textoMetros(r.hueco.hasta - r.hueco.desde)} ` +
        `(${formatearProgresiva(r.hueco.desde)} – ${formatearProgresiva(r.hueco.hasta)}); se sigue la forma de ` +
        `${r.desde}, ajustada para pasar por los dos extremos medidos.`,
    )
  } else if (r.como === 'proyectado') {
    avisos.push(
      `proyectado desde ${r.desde}: no hay línea en esa progresiva; se parte de su punto más cercano ` +
        `(${formatearProgresiva(r.ancla!)}, a ${textoMetros(Math.abs(x - r.ancla!))}) y se siguen las ` +
        `pendientes de ${r.desde}.`,
    )
  } else if (r.como === 'extrapolado') {
    avisos.push(
      `extrapolado a ${textoMetros(r.alejamiento)} del punto extremo (${formatearProgresiva(r.extremo!)}): ` +
        'ninguna otra línea cubre esa progresiva; se prolonga la pendiente del tramo extremo.',
    )
  } else if (r.hueco) {
    avisos.push(
      `interpolado sobre un tramo sin puntos de ${textoMetros(r.hueco.hasta - r.hueco.desde)} ` +
        `(${formatearProgresiva(r.hueco.desde)} – ${formatearProgresiva(r.hueco.hasta)}): es una recta que no ve ` +
        'lo que hay en medio, y ninguna otra línea tiene puntos ahí para seguir su forma.',
    )
  }
  if (r.como === 'proyectado' && r.alejamiento > 0) {
    avisos.push(`${r.desde} se prolongó ${textoMetros(r.alejamiento)} más allá de su punto extremo.`)
  }
  return avisos
}

/**
 * Qué nivel registrar en cada progresiva pedida, como el recuadro de su HTML:
 * sobre la línea si la cubre; si no, proyectando desde su punto más cercano
 * con las pendientes de la línea más cercana que cubra ambas progresivas; si
 * ninguna cubre, prolongando su tramo extremo. Además: la capa siguiente
 * como base + desplazamiento; la lectura juzgada con las reglas de la mira
 * del instrumento; un hueco de la línea que otra línea midió se recorre con
 * la forma de esa otra; la extrapolación dice cuánto se alejó y pasado el
 * máximo no da cota; y «no comprobado» por la puesta, por la línea o porque
 * la cota es una suposición (proyectada, extrapolada o sobre un hueco).
 */
export function nivelARegistrar(entrada: EntradaNivelARegistrar): ResultadoNivelARegistrar {
  const forma = entrada.forma ?? LECTURA_EN_METROS
  const d = Number.isFinite(entrada.desplazamientoM) ? entrada.desplazamientoM! : 0
  const maxima =
    Number.isFinite(entrada.extrapolacionMaximaM) && entrada.extrapolacionMaximaM! >= 0
      ? entrada.extrapolacionMaximaM!
      : EXTRAPOLACION_MAXIMA_M
  const reglasValidas = reglasDelInstrumento(entrada.instrumento)
  const reglas = reglasValidas ?? REGLAS_DE_FABRICA
  const puesta = alturaDePuesta(entrada.ai, entrada.instrumento)
  const ai = puesta?.alturaInstrumental ?? null
  const avisos: string[] = []
  if (!reglasValidas) avisos.push('Las reglas de la mira del instrumento no son válidas: se usan las de fábrica.')
  if (puesta) avisos.push(...puesta.avisos)
  else avisos.push('Sin altura instrumental válida (cota BM y lectura atrás): se dan las cotas, no las lecturas.')

  const otrasNormales = (entrada.otras ?? []).filter((o) => o !== entrada.linea).map((o) => normalizarLinea(o))
  const respaldo = menorEspaciado(otrasNormales.map((o) => o.puntos))
  const propia = normalizarLinea(
    {
      nombre: entrada.linea.nombre,
      puntos: (entrada.linea.puntos ?? []).map((p) => (p == null ? p : { ...p, cota: p.cota + d })),
    },
    respaldo,
  )
  avisos.push(...propia.avisos)
  for (const o of otrasNormales) avisos.push(...o.avisos)
  const otras = otrasNormales.filter((o) => o.puntos.length >= 2)

  const filas = entrada.progresivas.map((x): FilaNivel => {
    if (!Number.isFinite(x)) return filaSinCota(x, 'progresiva no válida', ['La progresiva no es un número.'])
    const r = nivelPara(propia, x, otras)
    if (!r) return filaSinCota(x, 'sin línea para proyectar', ['sin línea para proyectar'])
    if (r.alejamiento > maxima + EPS) {
      const quien = r.como === 'proyectado' ? r.desde : entrada.linea.nombre
      return filaSinCota(
        x,
        `a ${textoMetros(r.alejamiento)} de lo medido (máx. ${textoMetros(maxima)})`,
        [
          `${formatearProgresiva(x)} queda a ${textoMetros(r.alejamiento)} del punto extremo de ${quien}: no se ` +
            `extrapola más de ${textoMetros(maxima)}. ¿Está bien escrita la progresiva?`,
        ],
        r,
      )
    }
    const cota = redondear3(r.z)
    const filaAvisos = avisosDeComo(r, entrada.linea.nombre, x)
    let lecturaM: number | null = null
    let rango: RangoLectura | null = null
    if (ai !== null) {
      lecturaM = redondear3(lecturaDeMiraParaCota(ai, cota, forma.mira))
      if (lecturaM === 0) lecturaM = 0
      rango = lecturaM < 0 ? 'imposible' : clasificarLectura(lecturaM, reglas)
      filaAvisos.push(...avisosDeLectura(lecturaM, rango, reglas, forma.mira))
    }
    const comprobado = r.comprobado && puesta?.comprobado === true
    if (!comprobado) filaAvisos.push('no comprobada')
    return {
      progresiva: x,
      cota,
      lecturaM,
      lectura: lecturaM === null ? null : lecturaEnUnidad(lecturaM, forma.unidad),
      pendientePct: r.pendiente,
      como: r.como,
      desde: r.desde,
      rango,
      comprobado,
      motivoSinCota: null,
      avisos: filaAvisos,
    }
  })

  const conCota = filas.filter((f) => f.cota !== null)
  const comprobado = puesta?.comprobado === true && conCota.length > 0 && conCota.every((f) => f.comprobado)
  if (puesta?.comprobado === true && conCota.some((f) => !f.comprobado)) {
    avisos.push(
      `${entrada.linea.nombre}: hay filas no comprobadas (puntos de una nivelación sin cerrar, o cotas ` +
        'proyectadas, extrapoladas o sobre un hueco de la línea).',
    )
  }
  return {
    linea: entrada.linea.nombre + textoDesplazamiento(d),
    alturaInstrumental: ai,
    comprobado,
    forma,
    mira: reglas,
    desplazamientoM: d,
    filas,
    avisos,
  }
}
