/**
 * Calculadora de campo: las cuentas que el topógrafo hace con la libreta en la
 * mano. Todas son puras y devuelven null cuando un dato no es un número finito
 * o una distancia es cero: en campo es preferible no mostrar nada antes que
 * mostrar una cota inventada a partir de un casillero vacío.
 *
 * Cotas, lecturas y desniveles salen redondeados al milímetro (redondear3),
 * porque es la menor división que se lee en la mira y así 3246.632 − 2.640
 * da 3243.992 y no 3243.9919999999997. Porcentajes y grados NO se redondean:
 * cuántos decimales mostrar lo decide la pantalla.
 */
import { redondear3 } from '../numero'
import { esLecturaUsable } from '../nivelacion/cotas'

function finitos(...valores: number[]): boolean {
  return valores.every((v) => Number.isFinite(v))
}

// ---------------------------------------------------------------------------
// Nivelación y replanteo
// ---------------------------------------------------------------------------

/**
 * AI = cota del punto conocido + vista atrás. La vista atrás pasa por la misma
 * regla que la libreta (esLecturaUsable: 0 < lectura ≤ mira): un 19.02 escrito
 * en vez de 1.902 no debe dar una AI con 17 m de error sin que nadie avise.
 */
export function alturaInstrumental(cotaPunto: number, vistaAtras: number): number | null {
  if (!finitos(cotaPunto) || !esLecturaUsable(vistaAtras)) return null
  return redondear3(cotaPunto + vistaAtras)
}

/**
 * Cota = AI − lectura (vista adelante o intermedia). Una lectura que la mira no
 * puede dar devuelve null, igual que en la libreta queda pendiente: la misma
 * lectura no puede ser «pendiente» allá y una cota aquí.
 */
export function cotaDesdeLectura(alturaInstrumental: number, lectura: number): number | null {
  if (!finitos(alturaInstrumental) || !esLecturaUsable(lectura)) return null
  return redondear3(alturaInstrumental - lectura)
}

/**
 * Lectura que debe marcar la mira para que el pie quede a la cota de proyecto:
 * AI − cota de proyecto. Puede salir negativa o mayor que la mira; no se
 * recorta aquí porque eso es un aviso (avisoLectura), no un error de cuenta.
 */
export function lecturaObjetivo(alturaInstrumental: number, cotaProyecto: number): number | null {
  if (!finitos(alturaInstrumental, cotaProyecto)) return null
  return redondear3(alturaInstrumental - cotaProyecto)
}

// ---------------------------------------------------------------------------
// Pendiente
// ---------------------------------------------------------------------------

export type SentidoPendiente = 'sube' | 'baja' | 'plano'

export interface Pendiente {
  /** Positivo sube en el sentido del avance; negativo baja. */
  porcentaje: number
  pormil: number
  /** Cota final − cota inicial, al milímetro. */
  desnivel: number
  sentido: SentidoPendiente
}

/**
 * Pendiente entre dos cotas separadas una distancia horizontal (> 0).
 * El desnivel se lleva al milímetro antes de dividir: una diferencia que no se
 * puede leer en la mira no debe aparecer como una pendiente de 0.002 %.
 */
export function pendiente(cotaInicial: number, cotaFinal: number, distancia: number): Pendiente | null {
  if (!finitos(cotaInicial, cotaFinal, distancia) || distancia <= 0) return null
  const desnivel = redondear3(cotaFinal - cotaInicial)
  const sentido: SentidoPendiente = desnivel > 0 ? 'sube' : desnivel < 0 ? 'baja' : 'plano'
  // `+ 0` convierte un posible −0 en 0 para que «plano» se vea siempre igual.
  const porcentaje = (desnivel / distancia) * 100 + 0
  return { porcentaje, pormil: porcentaje * 10, desnivel: desnivel + 0, sentido }
}

// ---------------------------------------------------------------------------
// Interpolación por progresiva
// ---------------------------------------------------------------------------

export interface CotaInterpolada {
  cota: number
  /** true si la progresiva buscada cae fuera del tramo A–B. */
  extrapolada: boolean
}

/**
 * Cota en una progresiva por interpolación lineal entre A y B. Fuera del tramo
 * también calcula (a veces es lo único que hay), pero lo marca para que la
 * pantalla advierta que la rasante podría quebrar antes.
 */
export function interpolarCota(
  progA: number,
  cotaA: number,
  progB: number,
  cotaB: number,
  progBuscada: number,
): CotaInterpolada | null {
  if (!finitos(progA, cotaA, progB, cotaB, progBuscada) || progA === progB) return null
  const cota = redondear3(cotaA + ((progBuscada - progA) / (progB - progA)) * (cotaB - cotaA))
  const menor = Math.min(progA, progB)
  const mayor = Math.max(progA, progB)
  return { cota, extrapolada: progBuscada < menor || progBuscada > mayor }
}

// ---------------------------------------------------------------------------
// Volumen
// ---------------------------------------------------------------------------

/**
 * Volumen por áreas medias: (A1 + A2) / 2 × d, en m³ redondeado a 3 decimales.
 * Un área negativa no existe (corte y relleno se cuentan por separado), así que
 * se rechaza en vez de restar volumen en silencio.
 */
export function volumenAreasMedias(areaInicial: number, areaFinal: number, distancia: number): number | null {
  if (!finitos(areaInicial, areaFinal, distancia)) return null
  if (distancia <= 0 || areaInicial < 0 || areaFinal < 0) return null
  return redondear3(((areaInicial + areaFinal) / 2) * distancia)
}

// ---------------------------------------------------------------------------
// Conversiones de pendiente: porcentaje <-> grados <-> relación 1:n
// ---------------------------------------------------------------------------

const RADIANES_A_GRADOS = 180 / Math.PI

/** Ángulo con la horizontal, conservando el signo. */
export function porcentajeAGrados(porcentaje: number): number | null {
  if (!finitos(porcentaje)) return null
  return Math.atan(porcentaje / 100) * RADIANES_A_GRADOS
}

/** Una pared vertical (|grados| ≥ 90) no tiene porcentaje: devuelve null. */
export function gradosAPorcentaje(grados: number): number | null {
  if (!finitos(grados) || Math.abs(grados) >= 90) return null
  return Math.tan(grados / RADIANES_A_GRADOS) * 100
}

export interface RelacionPendiente {
  /** Metros horizontales por cada metro vertical, sin redondear: es el valor
   *  con el que se sigue calculando, así la ida y vuelta no altera el número. */
  n: number
  /** "1:n" para mostrar: n a tres decimales, o con las cifras que hagan falta
   *  si a tres decimales se volvería 0 (pendientes casi verticales). */
  texto: string
  /** La relación «1:n» no lleva signo; el sentido se devuelve aparte. */
  sentido: 'sube' | 'baja'
}

/** n para leer en pantalla. Nunca "0": eso parecería un dato inválido. */
function textoDeN(n: number): string {
  const aTresDecimales = redondear3(n)
  return aTresDecimales !== 0 ? String(aTresDecimales) : String(Number(n.toPrecision(4)))
}

/**
 * Relación 1:n entendida como 1 vertical por n horizontales (la forma en que se
 * anotan taludes y pendientes de cuneta). null solo si el dato no es finito o
 * es 0 (n sería infinito); una pendiente muy empinada sí tiene relación.
 */
export function porcentajeARelacion(porcentaje: number): RelacionPendiente | null {
  if (!finitos(porcentaje) || porcentaje === 0) return null
  const n = 100 / Math.abs(porcentaje)
  if (!finitos(n) || n === 0) return null
  return { n, texto: `1:${textoDeN(n)}`, sentido: porcentaje > 0 ? 'sube' : 'baja' }
}

// Número positivo con punto decimal (la coma ya se cambió): "2", "1.5", ".5", "3."
const NUMERO_POSITIVO = /^\s*(\d+(\.\d*)?|\.\d+)\s*$/

/**
 * Porcentaje a partir de:
 * - un RelacionPendiente (lo que da porcentajeARelacion): lleva el signo de su
 *   sentido, para que porcentaje → relación → porcentaje vuelva al mismo valor;
 * - un texto "v:h" o solo "n" (= 1:n), con espacios y coma decimal, como lo
 *   entrega un campo de pantalla;
 * - el número n de "1:n".
 * Texto y número no llevan signo y dan porcentaje positivo. Lo que no se
 * entiende, lleva cero o negativos, o está vacío, devuelve null sin lanzar.
 */
export function relacionAPorcentaje(relacion: string | number | RelacionPendiente): number | null {
  let vertical = 1
  let horizontal: number
  let signo = 1
  if (typeof relacion === 'number') {
    horizontal = relacion
  } else if (typeof relacion === 'string') {
    const partes = relacion.replace(/,/g, '.').split(':')
    if (partes.length === 1) {
      if (!NUMERO_POSITIVO.test(partes[0]!)) return null
      horizontal = Number(partes[0])
    } else if (partes.length === 2) {
      if (!NUMERO_POSITIVO.test(partes[0]!) || !NUMERO_POSITIVO.test(partes[1]!)) return null
      vertical = Number(partes[0])
      horizontal = Number(partes[1])
    } else {
      return null
    }
  } else if (relacion !== null && typeof relacion === 'object' && typeof relacion.n === 'number') {
    horizontal = relacion.n
    signo = relacion.sentido === 'baja' ? -1 : 1
  } else {
    // null, undefined u otra cosa: lo que da un formulario vacío.
    return null
  }
  if (!finitos(vertical, horizontal) || vertical <= 0 || horizontal <= 0) return null
  return signo * (vertical / horizontal) * 100
}

export function gradosARelacion(grados: number): RelacionPendiente | null {
  const porcentaje = gradosAPorcentaje(grados)
  return porcentaje === null ? null : porcentajeARelacion(porcentaje)
}

/** Grados con signo si recibe un RelacionPendiente; positivos desde texto o número. */
export function relacionAGrados(relacion: string | number | RelacionPendiente): number | null {
  const porcentaje = relacionAPorcentaje(relacion)
  return porcentaje === null ? null : porcentajeAGrados(porcentaje)
}
