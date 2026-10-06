import {
  clasificarCotasDePista,
  cotaEjeRasante,
  estacasDePista,
  formatearProgresiva,
  largoPolilinea,
  pendientesPorTramo,
  progresivasSobrePolilinea,
  puntoEnProgresiva,
  quiebres,
  redondear3,
  type Calibracion,
  type Calle,
  type ControlPlaneado,
  type CotaSobrePista,
  type EstacaSobrePlano,
  type PendienteTramo,
  type PistaCalibrada,
  type Punto2,
  type PuntoConRumbo,
  type Rasante,
  type TextoCota,
} from '@topo/core'

/**
 * Lo que el plano dice de una pista, armado con el motor (`@topo/core`):
 * largo, estacas, pendientes por tramo y dónde caen los controles. La
 * pantalla solo lo dibuja.
 */

/** Desde esta pendiente (en valor absoluto, %) la pista se marca como empinada: ahí la precisión manda. */
export const PENDIENTE_EMPINADA = 5

export type FuentePendientes = 'plano' | 'rasante'

export interface TramoDibujado {
  tramo: PendienteTramo
  /** El trozo de la pista que cubre el tramo, en unidades del plano. */
  puntos: Punto2[]
  /** Dónde va el rótulo y hacia dónde apunta la flecha (hacia donde baja). */
  rotulo: PuntoConRumbo | null
  empinada: boolean
}

export interface ControlDibujado {
  control: ControlPlaneado
  punto: PuntoConRumbo | null
}

export interface DatosPista {
  largoM: number
  inicio: number
  fin: number
  estacas: EstacaSobrePlano[]
  /** Cotas del plano que son de esta pista (una por estaca). */
  cotasDelPlano: CotaSobrePista[]
  /** Estacas del plano con cotas distintas que la app no decide sola. */
  conflictos: number
  tramos: TramoDibujado[]
  /** De dónde salen las pendientes; null si no hay de dónde. */
  fuente: FuentePendientes | null
  controles: ControlDibujado[]
}

/** Progresiva (m) de cada vértice de la polilínea. */
function progresivasDeVertices(pista: PistaCalibrada): number[] {
  const salida = [pista.progresivaInicio]
  for (let i = 1; i < pista.polilinea.length; i++) {
    const tramo = largoPolilinea([pista.polilinea[i - 1]!, pista.polilinea[i]!])
    salida.push(salida[i - 1]! + tramo * pista.calibracion.metrosPorUnidad)
  }
  return salida
}

/** El trozo de la pista entre dos progresivas, con los vértices que quedan dentro. */
export function trozoDePista(pista: PistaCalibrada, desde: number, hasta: number): Punto2[] {
  const inicio = puntoEnProgresiva(pista, desde)
  const fin = puntoEnProgresiva(pista, hasta)
  const puntos: Punto2[] = []
  if (inicio) puntos.push({ x: inicio.x, y: inicio.y })
  progresivasDeVertices(pista).forEach((progresiva, i) => {
    if (progresiva > desde && progresiva < hasta) puntos.push(pista.polilinea[i]!)
  })
  if (fin) puntos.push({ x: fin.x, y: fin.y })
  return puntos
}

/**
 * Todo lo que se dibuja y se cuenta de una pista. `textosCota` son los
 * textos del plano en el mismo sistema que la pista (los del DXF tal cual,
 * los del PDF en puntos). Las pendientes salen de las cotas del plano si
 * hay al menos dos de esta pista; si no, de la rasante de su calle.
 */
export function datosDePista(
  pista: PistaCalibrada,
  textosCota: readonly TextoCota[],
  calle: Calle | undefined,
): DatosPista {
  const largoM = redondear3(largoPolilinea(pista.polilinea) * pista.calibracion.metrosPorUnidad)
  const inicio = pista.progresivaInicio
  const fin = redondear3(inicio + largoM)

  let cotasDelPlano: CotaSobrePista[] = []
  let conflictos = 0
  if (textosCota.length > 0 && largoM > 0) {
    const clasificacion = clasificarCotasDePista(pista, textosCota)
    cotasDelPlano = clasificacion.cercanas
    conflictos = clasificacion.conflictos.length
  }

  let tramos: PendienteTramo[] = []
  let fuente: FuentePendientes | null = null
  if (cotasDelPlano.length >= 2) {
    tramos = pendientesPorTramo(cotasDelPlano)
    fuente = 'plano'
  } else if (calle?.rasante && largoM > 0) {
    const r = calle.rasante
    tramos = pendientesPorTramo([
      { progresiva: inicio, cota: cotaEjeRasante(r, inicio) },
      { progresiva: fin, cota: cotaEjeRasante(r, fin) },
    ])
    fuente = 'rasante'
  }

  return {
    largoM,
    inicio,
    fin,
    estacas: largoM > 0 ? estacasDePista(pista, 20) : [],
    cotasDelPlano,
    conflictos,
    fuente,
    tramos: tramos.map((tramo) => ({
      tramo,
      puntos: trozoDePista(pista, tramo.desde, tramo.hasta),
      rotulo: puntoEnProgresiva(pista, (tramo.desde + tramo.hasta) / 2),
      empinada: Math.abs(tramo.porcentaje) >= PENDIENTE_EMPINADA,
    })),
    controles: (calle?.planControles?.controles ?? []).map((control) => ({
      control,
      punto: puntoEnProgresiva(pista, control.progresiva),
    })),
  }
}

/** Las estacas cada 20 m de un croquis a medio dibujar; sin escala o con menos de dos vértices, ninguna. */
export function estacasDeCroquis(puntos: Punto2[], calibracion: Calibracion | null | undefined): EstacaSobrePlano[] {
  if (!calibracion || puntos.length < 2) return []
  try {
    return progresivasSobrePolilinea(puntos, calibracion, 20, 0)
  } catch {
    return []
  }
}

/**
 * Ángulo (grados, en el plano) hacia donde BAJA el tramo: hacia adelante si
 * baja al avanzar, hacia atrás si sube. Null si es plano.
 */
export function anguloHaciaDondeBaja(tramo: PendienteTramo, rumbo: number): number | null {
  if (tramo.sentido === 'plano') return null
  return tramo.sentido === 'baja' ? rumbo : rumbo + 180
}

/** Tramo transversal de arranque: una calzada con el bombeo típico de +2.0 % (lo mismo que EditorRasante). */
function rasanteDeArranque(): Rasante {
  return {
    progresivaArranque: 0,
    cotaArranque: 0,
    pendienteLongitudinal: 0,
    simetrica: true,
    tramos: [{ nombre: 'Calzada', hastaOffset: 4.2, tipo: 'pendiente', valor: 2 }],
    tramosIzquierda: null,
  }
}

/** La rasante de un croquis: cota en su 0+000 y una sola pendiente. Conserva la sección transversal si ya había rasante. */
export function rasanteDeCroquis(cotaArranque: number, pendiente: number, base: Rasante | null): Rasante {
  return {
    ...(base ?? rasanteDeArranque()),
    progresivaArranque: 0,
    cotaArranque,
    pendienteLongitudinal: pendiente,
  }
}

export interface RasanteDesdeCotas {
  rasante: Rasante
  tramos: PendienteTramo[]
  /** Si el plano trae quiebres que la rasante de una sola pendiente no guarda. */
  aviso: string | null
  /** Con quiebres, la progresiva hasta donde vale lo guardado (el primer quiebre); sin ellos, null. */
  valeHasta: number | null
}

/**
 * La rasante de la calle a partir de las cotas del plano. La rasante de la
 * app lleva UNA sola pendiente: se toma la del primer tramo, que es donde se
 * empieza a replantear, y si el plano trae quiebres se avisa en vez de
 * promediarlos (una pendiente promedio daría lecturas de mira falsas).
 */
export function rasanteDesdeCotas(cotas: readonly CotaSobrePista[], base: Rasante | null): RasanteDesdeCotas | null {
  if (cotas.length < 2) return null
  const tramos = pendientesPorTramo(cotas)
  const primero = tramos[0]!
  const rasante: Rasante = {
    ...(base ?? rasanteDeArranque()),
    progresivaArranque: cotas[0]!.progresiva,
    cotaArranque: cotas[0]!.cota,
    pendienteLongitudinal: primero.porcentaje,
  }
  const enQuiebre = quiebres(cotas)
  const valeHasta = enQuiebre.length > 0 ? primero.hasta : null
  const aviso =
    valeHasta !== null
      ? `Solo vale de ${formatearProgresiva(primero.desde)} a ${formatearProgresiva(valeHasta)}: el plano tiene ${tramos.length} tramos con pendientes distintas y la rasante de la calle guarda una sola. Los quiebres se ven en Planificar, con la fuente «Plano».`
      : null
  return { rasante, tramos, aviso, valeHasta }
}
