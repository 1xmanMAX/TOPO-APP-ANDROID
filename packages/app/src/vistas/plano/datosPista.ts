import {
  calcularCampania,
  clasificarCotasDePista,
  cotaEjeRasante,
  estacasDePista,
  formatearProgresiva,
  instrumentoCompleto,
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
  type Proyecto,
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

/**
 * Desde cuántos mm se avisa que una cota del plano no cae en la rasante
 * tomada: la mitad de la tolerancia más fina de fábrica (BASE, 10 mm). Por
 * debajo, el residuo se muestra igual en la lista, pero no se avisa.
 */
export const RESIDUO_AVISO_MM = 5

export interface ResiduoCota {
  progresiva: number
  /** En mm, al milímetro. */
  mm: number
}

export interface RasanteDesdeCotas {
  rasante: Rasante
  tramos: PendienteTramo[]
  /** Si el plano trae quiebres que la rasante de una sola pendiente no guarda, o cotas que se apartan de ella. */
  aviso: string | null
  /** Con quiebres, la progresiva hasta donde vale lo guardado (el primer quiebre); sin ellos, null. */
  valeHasta: number | null
  /**
   * Cota del plano − cota de la rasante tomada, en mm, en cada cota usada
   * (con quiebres, solo las que quedan dentro de lo que vale). Positivo: el
   * plano queda más alto que la rasante.
   */
  residuos: ResiduoCota[]
  /** El residuo mayor en valor absoluto, o null si no hay. */
  mayorResiduo: ResiduoCota | null
}

/** Metros a milímetros enteros, sin el ruido del punto flotante y sin −0. */
function aMm(metros: number): number {
  return Math.round(Number((metros * 1000).toPrecision(12))) + 0
}

/** «+10 mm», «-4 mm», «0 mm». */
export function textoMm(mm: number): string {
  return `${mm > 0 ? '+' : ''}${mm} mm`
}

/**
 * La rasante de la calle a partir de las cotas del plano. La rasante de la
 * app lleva UNA sola pendiente:
 * - Sin quiebres, la pendiente sale de la primera y la última cota, no del
 *   primer tramo: en Psje. Las Lomas, +7.37 % y +7.40 % no son un quiebre,
 *   pero tomar solo el primero deja 20 mm de error en 0+120, que es la
 *   tolerancia entera de la subrasante. Se dice cuánto se aparta cada cota
 *   intermedia y se avisa desde `RESIDUO_AVISO_MM`.
 * - Con quiebres, se toma la del primer tramo, que es donde se empieza a
 *   replantear, y se avisa hasta dónde vale en vez de promediar (una
 *   pendiente promedio daría lecturas de mira falsas).
 */
export function rasanteDesdeCotas(cotas: readonly CotaSobrePista[], base: Rasante | null): RasanteDesdeCotas | null {
  if (cotas.length < 2) return null
  const ordenadas = [...cotas].sort((a, b) => a.progresiva - b.progresiva)
  const tramos = pendientesPorTramo(ordenadas)
  const primero = tramos[0]!
  const primera = ordenadas[0]!
  const ultima = ordenadas[ordenadas.length - 1]!
  const conQuiebres = quiebres(ordenadas).length > 0
  const pendiente = conQuiebres
    ? primero.porcentaje
    : ((ultima.cota - primera.cota) / (ultima.progresiva - primera.progresiva)) * 100
  const rasante: Rasante = {
    ...(base ?? rasanteDeArranque()),
    progresivaArranque: primera.progresiva,
    cotaArranque: primera.cota,
    pendienteLongitudinal: pendiente + 0,
  }
  const valeHasta = conQuiebres ? primero.hasta : null
  const dentro = valeHasta === null ? ordenadas : ordenadas.filter((c) => c.progresiva <= valeHasta + 1e-9)
  const residuos = dentro.map((c) => ({ progresiva: c.progresiva, mm: aMm(c.cota - cotaEjeRasante(rasante, c.progresiva)) }))
  const mayorResiduo = residuos.reduce<ResiduoCota | null>(
    (mayor, r) => (mayor === null || Math.abs(r.mm) > Math.abs(mayor.mm) ? r : mayor),
    null,
  )

  let aviso: string | null = null
  if (valeHasta !== null) {
    aviso = `Solo vale de ${formatearProgresiva(primero.desde)} a ${formatearProgresiva(valeHasta)}: el plano tiene ${tramos.length} tramos con pendientes distintas y la rasante de la calle guarda una sola. Los quiebres se ven en Planificar, con la fuente «Plano».`
  } else if (mayorResiduo && Math.abs(mayorResiduo.mm) >= RESIDUO_AVISO_MM) {
    aviso = `Las cotas del plano no caen todas en una sola pendiente: la de ${formatearProgresiva(mayorResiduo.progresiva)} queda a ${textoMm(mayorResiduo.mm)} de la rasante tomada. Esa diferencia pasa a la cota de proyecto y a la lectura objetivo: revisa esa cota en el plano antes de reemplazar.`
  }
  return { rasante, tramos, aviso, valeHasta, residuos, mayorResiduo }
}

/**
 * Cuánto cambia la cota de proyecto del eje al reemplazar una rasante por
 * otra (nueva − actual, en mm) en cada progresiva. Positivo: el proyecto
 * sube, y lo ya medido pasa a cortar menos o rellenar más.
 */
export function cambioDeCotaProyecto(actual: Rasante, nueva: Rasante, progresivas: readonly number[]): ResiduoCota[] {
  return progresivas.map((progresiva) => ({
    progresiva,
    mm: aMm(cotaEjeRasante(nueva, progresiva) - cotaEjeRasante(actual, progresiva)),
  }))
}

/** «2026-10-02» → «02/10/2026», como en los informes. Lo que no viene en ISO se deja tal cual. */
export function fechaDeToma(fecha: string): string {
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha)
  return iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : fecha
}

export interface EstadoNivelacion {
  id: string
  /** «SUBRASANTE · 02/10/2026». */
  texto: string
  /** ✓ cerró, ✗ no cerró, · sin cerrar: nada comprobado (el △ es «al límite» y aquí no va). */
  simbolo: '✓' | '✗' | '·'
  estado: string
}

/**
 * La última toma de cada nivelación de la calle, con si cerró: lo calcula
 * el motor. Una nivelación sin cerrar (o que el motor no pudo calcular) no
 * está comprobada, y se dice con esas palabras.
 */
export function estadoDeNivelaciones(calle: Calle, proyecto: Proyecto): EstadoNivelacion[] {
  const largoMira = instrumentoCompleto(proyecto.instrumento).largoMira
  const salida: EstadoNivelacion[] = []
  for (const nivelacion of calle.nivelaciones) {
    const toma = nivelacion.tomas[nivelacion.tomas.length - 1]
    if (!toma) continue
    const capa = proyecto.capas.find((c) => c.id === toma.capaId)?.nombre ?? 'capa sin nombre'
    let pasa: boolean | null = null
    try {
      pasa = calcularCampania({ campania: toma, calle, bms: proyecto.bms, largoMira }).cierre.pasa
    } catch {
      pasa = null
    }
    salida.push({
      id: nivelacion.id,
      texto: `${capa} · ${fechaDeToma(toma.fecha)}`,
      simbolo: pasa === true ? '✓' : pasa === false ? '✗' : '·',
      estado:
        pasa === true
          ? 'cerró'
          : pasa === false
            ? 'no cerró, no comprobada'
            : 'sin cerrar, no comprobada',
    })
  }
  return salida
}
