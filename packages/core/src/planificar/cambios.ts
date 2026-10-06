import { formatearProgresiva } from '../grilla/progresivas'
import {
  cotaEnPerfilValido,
  finDelPerfil,
  inicioDelPerfil,
  primerVerticeDespues,
  revisarPerfil,
  type Perfil,
} from './perfil'

/**
 * Reglas de la nivelación de una pista. Los valores de fábrica son los de la
 * sección 2 del diseño (docs/superpowers/specs/2026-10-05-rediseno-design.md):
 * no buscan la menor cantidad de estaciones, sino que cada lectura sea fiable.
 */
export interface OpcionesNivelacion {
  /** Largo de la mira, en metros. */
  largoMira: number
  /** Altura del anteojo sobre el suelo donde se planta el trípode. */
  alturaInstrumento: number
  /** Cerca del suelo la refracción engaña: no se lee por debajo de esto. */
  lecturaMin: number
  /** La punta de la mira oscila: no se lee por encima de largoMira − esto. */
  margenSuperior: number
  /** Visual más larga, aunque el equipo alcance más (precisión de lectura). */
  visualMax: number
  /** |atrás − adelante| permitido en una estación. */
  desequilibrioMax: number
  /**
   * Visual más corta con la que se acepta avanzar. Si la pendiente obliga a
   * menos, la pista no se puede nivelar así: plantar el trípode cada metro
   * sería otro trabajo (y otro error), y se dice en vez de proponerlo.
   */
  visualMin: number
  /** Cada cuánto se dan las lecturas esperadas («progresivas redondas»). */
  intervaloEsperadas: number
  /**
   * Margen que el plan intenta dejar sobre la lectura mínima y bajo la
   * máxima. El plan supone el anteojo exactamente a `alturaInstrumento` y el
   * suelo exactamente en el perfil; en campo el trípode varía unos
   * centímetros y el terreno no es la rasante. No cambia las reglas (una
   * lectura de 0.30 sigue siendo válida): solo se prefiere un reparto que
   * deje este margen y, si no lo hay, se marcan las lecturas que quedan más
   * cerca del límite.
   */
  holguraPlan: number
}

export const OPCIONES_NIVELACION: Readonly<OpcionesNivelacion> = Object.freeze({
  largoMira: 4,
  alturaInstrumento: 1.5,
  lecturaMin: 0.3,
  margenSuperior: 0.3,
  visualMax: 50,
  desequilibrioMax: 5,
  visualMin: 1,
  intervaloEsperadas: 10,
  holguraPlan: 0.05,
})

/** Qué regla impidió estirar más la visual. */
export type Limitante = 'lecturaMin' | 'lecturaMax' | 'visualMax' | 'finDelTramo'

export interface Visual {
  progresiva: number
  cota: number
  /** Lo que debe marcar la mira, en metros. */
  lectura: number
  /** Distancia horizontal de la estación a la mira. */
  distancia: number
  /** La lectura queda a menos de `holguraPlan` de la mínima o de la máxima. */
  alLimite: boolean
}

export interface EstacionPlan {
  /** Desde 1, en el orden en que se recorren. */
  numero: number
  /** Dónde se planta el trípode. */
  progresiva: number
  cotaSuelo: number
  alturaInstrumental: number
  atras: Visual
  adelante: Visual
  /** |distancia atrás − distancia adelante|: cero, porque la estación va al medio. */
  desequilibrio: number
  /**
   * Lo más que podía estirarse cada visual desde el punto de atrás de la
   * ida, con las reglas justas (sin la holgura del plan).
   */
  visualMaxima: number
  /** Qué regla puso ese máximo. */
  limitante: Limitante
  /**
   * El menor margen, en metros, entre lo que marca la mira y el límite más
   * cercano (mínima o máxima), en atrás, adelante y en los quiebres que la
   * visual cruza. Es lo que la guía de campo debe advertir si es chico.
   */
  holguraMinima: number
  /** `holguraMinima` es menor que `holguraPlan`. */
  alLimite: boolean
}

/** Punto de cambio: se lee adelante desde una estación y atrás desde la siguiente. */
export interface PuntoCambio {
  /** Desde 1: el cambio n queda entre la estación n y la n + 1. */
  numero: number
  progresiva: number
  cota: number
  lecturaAdelante: number
  lecturaAtras: number
}

/** Lo que debe marcar la mira en una progresiva redonda, y desde qué estación. */
export interface LecturaEsperada {
  progresiva: number
  cota: number
  lectura: number
  /** Número de la estación desde la que se lee. */
  estacion: number
}

export type SentidoNivelacion = 'ida' | 'vuelta'

export interface PlanNivelacion {
  /** Donde empieza este recorrido (en la vuelta, la progresiva mayor). */
  desde: number
  hasta: number
  sentido: SentidoNivelacion
  posible: boolean
  /** Por qué no se puede, en palabras; null si se puede. */
  motivo: string | null
  /**
   * 'parejo': todas las estaciones con el mismo paso (los cambios caen en
   * progresivas fáciles de ubicar). 'maximo': cada estación avanza lo más que
   * puede, cuando repartir parejo no cabía en alguna parte del perfil.
   */
  reparto: 'parejo' | 'maximo'
  estaciones: EstacionPlan[]
  cambios: PuntoCambio[]
  /** En el orden en que se caminan. */
  esperadas: LecturaEsperada[]
}

export interface VisualMaxima {
  distancia: number
  limitante: Limitante
}

export interface RevisionEstacion {
  ok: boolean
  problemas: string[]
  /** NaN si los datos no permitieron calcularlo. */
  desequilibrio: number
  lecturaAtras: number
  lecturaAdelante: number
}

// Holgura frente al punto flotante en progresivas y distancias (una
// milésima de milímetro).
const HOLGURA = 1e-9

// Lo que revisarEstacion deja pasar de una regla: una milésima de milímetro,
// nada que se vea en la mira. Es más que el redondeo de recalcular una
// estación del plan con cotas de 3000 m, así que una estación que el plan
// puso en el límite no sale rechazada por billonésimas.
const TOLERANCIA_REVISION = 1e-6

const NOMBRES: Readonly<Record<keyof OpcionesNivelacion, string>> = {
  largoMira: 'el largo de la mira',
  alturaInstrumento: 'la altura del instrumento',
  lecturaMin: 'la lectura mínima',
  margenSuperior: 'el margen superior de la mira',
  visualMax: 'la visual más larga',
  desequilibrioMax: 'el desequilibrio máximo',
  visualMin: 'la visual más corta',
  intervaloEsperadas: 'el intervalo de las lecturas esperadas',
  holguraPlan: 'la holgura del plan',
}

const POSITIVAS: ReadonlySet<keyof OpcionesNivelacion> = new Set([
  'largoMira',
  'alturaInstrumento',
  'visualMax',
  'visualMin',
  'intervaloEsperadas',
] as const)

/**
 * Junta los valores de fábrica con los que llegan, saltándose las claves
 * que llegan como undefined: un formulario con un campo vacío no debe borrar
 * el valor de fábrica.
 */
export function completarOpciones<T extends object>(fabrica: Readonly<T>, parciales?: Partial<T>): T {
  const resultado = { ...fabrica } as T
  if (parciales) {
    for (const [clave, valor] of Object.entries(parciales)) {
      if (valor !== undefined) (resultado as Record<string, unknown>)[clave] = valor
    }
  }
  return resultado
}

function m3(valor: number): string {
  return valor.toFixed(3)
}

function m2(valor: number): string {
  return valor.toFixed(2)
}

function lecturaMaxima(o: OpcionesNivelacion): number {
  return o.largoMira - o.margenSuperior
}

/**
 * Lo que impide usar estas opciones, en palabras. Vacío si sirven. Así un
 * valor imposible (negativo, NaN, cero donde no cabe) se dice como motivo en
 * vez de romper el cálculo más adelante con un error que nadie entiende.
 */
export function revisarOpciones(parciales?: Partial<OpcionesNivelacion>): string[] {
  const o = completarOpciones(OPCIONES_NIVELACION, parciales)
  const problemas: string[] = []
  for (const clave of Object.keys(NOMBRES) as (keyof OpcionesNivelacion)[]) {
    const valor: unknown = o[clave]
    const nombre = NOMBRES[clave]
    if (typeof valor !== 'number' || !Number.isFinite(valor)) {
      problemas.push(`${nombre} no es un número (llegó ${String(valor)})`)
    } else if (POSITIVAS.has(clave) && valor <= 0) {
      problemas.push(`${nombre} debe ser mayor que cero (llegó ${valor})`)
    } else if (!POSITIVAS.has(clave) && valor < 0) {
      problemas.push(`${nombre} debe ser cero o más (llegó ${valor})`)
    }
  }
  if (problemas.length > 0) return problemas

  // Menos de un metro entre lecturas esperadas no ayuda en campo y llena la
  // guía de miles de filas.
  if (o.intervaloEsperadas < 1) {
    problemas.push(`el intervalo de las lecturas esperadas debe ser de 1 m o más (llegó ${o.intervaloEsperadas})`)
  }
  if (o.visualMin > o.visualMax) {
    problemas.push(`la visual más corta (${o.visualMin} m) pasa de la más larga (${o.visualMax} m)`)
  }
  if (o.lecturaMin >= lecturaMaxima(o)) {
    problemas.push(
      `no queda nada legible en la mira: la lectura mínima (${m3(o.lecturaMin)} m) no es menor que la máxima (${m3(lecturaMaxima(o))} m)`,
    )
  }
  return problemas
}

/** Lo que el planificador necesita saber de las reglas para medir una visual. */
interface Reglas {
  h: number
  min: number
  max: number
  visualMax: number
  visualMin: number
}

/** Las reglas tal cual (`holgura` 0) o apretadas `holgura` metros por cada lado. */
function reglas(o: OpcionesNivelacion, holgura: number): Reglas {
  return {
    h: o.alturaInstrumento,
    min: o.lecturaMin + holgura,
    max: lecturaMaxima(o) - holgura,
    visualMax: o.visualMax,
    visualMin: o.visualMin,
  }
}

function legible(r: Reglas): boolean {
  return r.h >= r.min && r.h <= r.max
}

/**
 * Puntos del perfil que la visual recorre entre atrás y adelante (en
 * cualquier sentido): los dos extremos y los vértices de en medio. En un
 * perfil de tramos rectos la cota más alta y la más baja entre dos puntos
 * caen siempre en uno de estos, así que si todos se leen bien, cualquier
 * punto intermedio también.
 */
function puntosDeLaVisual(perfil: Perfil, atras: number, adelante: number): number[] {
  const bajo = Math.min(atras, adelante)
  const alto = Math.max(atras, adelante)
  const interiores: number[] = []
  for (let i = primerVerticeDespues(perfil, bajo + HOLGURA); i < perfil.length; i++) {
    const p = perfil[i]!.progresiva
    if (p >= alto - HOLGURA) break
    interiores.push(p)
  }
  if (atras > adelante) interiores.reverse()
  return [atras, ...interiores, adelante]
}

/**
 * La primera regla de lectura que se rompe, o null si todas se cumplen. Sin
 * holgura a favor: lo que el plan acepta aquí debe pasar después
 * revisarEstacion aunque se recalcule con otro redondeo.
 */
function reglaRota(
  perfil: Perfil,
  atras: number,
  estacion: number,
  adelante: number,
  r: Reglas,
): 'lecturaMin' | 'lecturaMax' | null {
  const ai = cotaEnPerfilValido(perfil, estacion) + r.h
  for (const p of puntosDeLaVisual(perfil, atras, adelante)) {
    const lectura = ai - cotaEnPerfilValido(perfil, p)
    if (lectura < r.min) return 'lecturaMin'
    if (lectura > r.max) return 'lecturaMax'
  }
  return null
}

/**
 * Lo más que puede estirarse cada visual (iguales atrás y adelante) con el
 * punto de atrás en `desde`, sin pasar de `hasta`. Perfil ya validado.
 *
 * Con el perfil real, no con una pendiente única. Las lecturas son lineales
 * en d mientras la estación (desde + d) y el punto de adelante (desde + 2d)
 * no crucen un vértice; dentro de cada uno de esos trozos lo que se cumple
 * es un solo intervalo, que se saca de las rectas. Se recorren TODOS los
 * trozos, del más lejano al más cercano, y se queda con la d más larga que
 * cumple: junto a un escalón una visual corta falla y una más larga (con la
 * estación ya arriba) vuelve a cumplir.
 */
function visualMaxima(perfil: Perfil, desde: number, hasta: number, r: Reglas): VisualMaxima {
  if (!legible(r)) return { distancia: 0, limitante: r.h < r.min ? 'lecturaMin' : 'lecturaMax' }

  const mitadRestante = (hasta - desde) / 2
  // Sin tramo por delante no hay visual que estirar.
  if (!(mitadRestante > 0)) return { distancia: 0, limitante: 'finDelTramo' }
  const porFin = mitadRestante < r.visualMax
  const tope = porFin ? mitadRestante : r.visualMax

  // Al final del tramo el adelante es `hasta` tal cual, como lo pondrá el
  // plan; sumar 2·d podría dejarlo una billonésima corrido.
  const adelanteDe = (d: number) => (porFin && d === tope ? hasta : desde + 2 * d)
  const estacionDe = (d: number) => {
    const adelante = adelanteDe(d)
    return desde + (adelante - desde) / 2
  }
  const rota = (d: number) => reglaRota(perfil, desde, estacionDe(d), adelanteDe(d), r)
  const lecturas = (d: number) => {
    const ai = cotaEnPerfilValido(perfil, estacionDe(d)) + r.h
    return puntosDeLaVisual(perfil, desde, adelanteDe(d)).map((p) => ai - cotaEnPerfilValido(perfil, p))
  }

  const cortes = [0, tope]
  for (let i = primerVerticeDespues(perfil, desde); i < perfil.length; i++) {
    const delante = perfil[i]!.progresiva - desde
    if (delante / 2 >= tope) break
    for (const d of [delante, delante / 2]) {
      if (d > 0 && d < tope) cortes.push(d)
    }
  }
  cortes.sort((a, b) => a - b)

  /** La d más larga que cumple dentro de [c0, c1], o null si ninguna. */
  const mayorEnTrozo = (c0: number, c1: number): number | null => {
    if (rota(c1) === null) return c1
    const ancho = c1 - c0
    if (ancho <= 1e-12) return null
    const dA = c0 + ancho / 4
    const dB = c0 + (3 * ancho) / 4
    const la = lecturas(dA)
    const lb = lecturas(dB)
    if (la.length !== lb.length) return null
    let bajo = c0
    let alto = c1
    for (let j = 0; j < la.length; j++) {
      const a = la[j]!
      const pendiente = (lb[j]! - a) / (dB - dA)
      // Un cambio que no llega a una billonésima en todo el trozo es ruido
      // del punto flotante: la lectura es constante.
      if (Math.abs(pendiente) * ancho < 1e-12) {
        if (a < r.min || a > r.max) return null
        continue
      }
      const enMin = dA + (r.min - a) / pendiente
      const enMax = dA + (r.max - a) / pendiente
      if (pendiente > 0) {
        bajo = Math.max(bajo, enMin)
        alto = Math.min(alto, enMax)
      } else {
        alto = Math.min(alto, enMin)
        bajo = Math.max(bajo, enMax)
      }
    }
    if (bajo > alto + 1e-12) return null
    // La recta da el borde exacto; el punto flotante puede dejarlo una
    // billonésima afuera. Se retrocede hasta el lado seguro.
    let paso = 1e-12 * (1 + alto)
    for (let d = alto; d >= bajo - 1e-12; d = alto - paso, paso *= 2) {
      if (rota(d) === null) return d
    }
    return null
  }

  let mejor = 0
  for (let k = cortes.length - 1; k >= 1; k--) {
    const d = mayorEnTrozo(cortes[k - 1]!, cortes[k]!)
    if (d !== null) {
      mejor = d
      break
    }
  }

  if (mejor >= tope - HOLGURA) return { distancia: mejor, limitante: porFin ? 'finDelTramo' : 'visualMax' }
  // Qué regla se rompe justo después del máximo.
  for (const mas of [1e-6, 1e-4, 1e-2]) {
    const regla = rota(Math.min(tope, mejor + mas))
    if (regla !== null) return { distancia: mejor, limitante: regla }
  }
  return { distancia: mejor, limitante: 'lecturaMin' }
}

/**
 * Lo más que puede estirarse cada visual con el punto de atrás en `desde`.
 * Lanza si el perfil, el tramo o las opciones no sirven (los planes, en
 * cambio, lo devuelven como motivo).
 */
export function visualMaximaDesde(
  perfil: Perfil,
  desde: number,
  hasta: number,
  opciones?: Partial<OpcionesNivelacion>,
): VisualMaxima {
  const o = completarOpciones(OPCIONES_NIVELACION, opciones)
  const problemas = [...revisarOpciones(o), ...revisarPerfil(perfil)]
  if (problemas.length === 0) problemas.push(...problemasDelTramo(perfil, desde, Math.max(desde, hasta)))
  if (problemas.length > 0) throw new RangeError(`No se puede calcular la visual máxima: ${problemas.join('; ')}`)
  return visualMaxima(perfil, desde, hasta, reglas(o, 0))
}

/** Progresivas que no son número o salen del perfil (ya validado). */
function problemasDelTramo(perfil: Perfil, desde: number, hasta: number): string[] {
  if (!Number.isFinite(desde) || !Number.isFinite(hasta)) {
    return ['el tramo necesita progresivas de inicio y fin que sean números']
  }
  const inicio = inicioDelPerfil(perfil)
  const fin = finDelPerfil(perfil)
  if (desde < inicio - HOLGURA || hasta > fin + HOLGURA) {
    return [
      `el tramo ${formatearProgresiva(desde)} a ${formatearProgresiva(hasta)} sale del perfil (${formatearProgresiva(inicio)} a ${formatearProgresiva(fin)})`,
    ]
  }
  return []
}

/**
 * Revisa una estación cualquiera —la del plan, la de la vuelta o una que Max
 * movió en campo— contra las reglas: visuales equilibradas, mira legible en
 * los dos puntos y visual despejada del suelo en todo lo que hay en medio.
 * Los datos que no sirven (progresivas NaN o fuera del perfil, opciones
 * imposibles) se devuelven como problemas, con lecturas NaN: no se inventa
 * ninguna cota.
 */
export function revisarEstacion(
  perfil: Perfil,
  atras: number,
  estacion: number,
  adelante: number,
  opciones?: Partial<OpcionesNivelacion>,
): RevisionEstacion {
  const o = completarOpciones(OPCIONES_NIVELACION, opciones)
  const problemas: string[] = [...revisarOpciones(o), ...revisarPerfil(perfil)]
  if (problemas.length === 0) {
    const inicio = inicioDelPerfil(perfil)
    const fin = finDelPerfil(perfil)
    for (const [nombre, valor] of [
      ['el punto de atrás', atras],
      ['la estación', estacion],
      ['el punto de adelante', adelante],
    ] as const) {
      if (!Number.isFinite(valor)) problemas.push(`${nombre} no es un número`)
      else if (valor < inicio - HOLGURA || valor > fin + HOLGURA) {
        problemas.push(
          `${nombre} (${formatearProgresiva(valor)}) está fuera del perfil (${formatearProgresiva(inicio)} a ${formatearProgresiva(fin)})`,
        )
      }
    }
  }
  if (problemas.length > 0) {
    return { ok: false, problemas, desequilibrio: Number.NaN, lecturaAtras: Number.NaN, lecturaAdelante: Number.NaN }
  }

  const maxima = lecturaMaxima(o)
  const ai = cotaEnPerfilValido(perfil, estacion) + o.alturaInstrumento
  const lecturaAtras = ai - cotaEnPerfilValido(perfil, atras)
  const lecturaAdelante = ai - cotaEnPerfilValido(perfil, adelante)
  const distanciaAtras = Math.abs(estacion - atras)
  const distanciaAdelante = Math.abs(adelante - estacion)
  const desequilibrio = Math.abs(distanciaAtras - distanciaAdelante)

  // En la ida atrás < estación < adelante; en la vuelta, al revés.
  const entre = (atras < estacion && estacion < adelante) || (atras > estacion && estacion > adelante)
  if (!entre) problemas.push('la estación debe quedar entre el punto de atrás y el de adelante')
  if (desequilibrio > o.desequilibrioMax + TOLERANCIA_REVISION) {
    problemas.push(
      `atrás mide ${m2(distanciaAtras)} m y adelante ${m2(distanciaAdelante)} m: se desequilibran ${m2(desequilibrio)} m (máximo ${m2(o.desequilibrioMax)} m)`,
    )
  }
  for (const [lado, distancia] of [
    ['atrás', distanciaAtras],
    ['adelante', distanciaAdelante],
  ] as const) {
    if (distancia > o.visualMax + TOLERANCIA_REVISION) {
      problemas.push(`la visual de ${lado} mide ${m2(distancia)} m, más que el máximo de ${m2(o.visualMax)} m`)
    }
  }

  for (const p of puntosDeLaVisual(perfil, atras, adelante)) {
    const lectura = ai - cotaEnPerfilValido(perfil, p)
    const extremo = p === atras ? 'atrás' : p === adelante ? 'adelante' : null
    const donde = formatearProgresiva(p)
    if (lectura < o.lecturaMin - TOLERANCIA_REVISION) {
      problemas.push(
        extremo
          ? `${extremo}, en la ${donde}, la mira marcaría ${m3(lectura)} m, menos de ${m3(o.lecturaMin)} m`
          : `en la ${donde} la visual pasa a ${m3(lectura)} m del suelo, menos de ${m3(o.lecturaMin)} m: la refracción engaña o el terreno tapa la mira`,
      )
    } else if (lectura > maxima + TOLERANCIA_REVISION) {
      problemas.push(
        extremo
          ? `${extremo}, en la ${donde}, la mira marcaría ${m3(lectura)} m, más de ${m3(maxima)} m`
          : `en la ${donde} la mira marcaría ${m3(lectura)} m, más de ${m3(maxima)} m: el terreno baja demasiado entre los puntos`,
      )
    }
  }

  return { ok: problemas.length === 0, problemas, desequilibrio, lecturaAtras, lecturaAdelante }
}

function planVacio(desde: number, hasta: number, motivo: string): PlanNivelacion {
  return {
    desde,
    hasta,
    sentido: 'ida',
    posible: false,
    motivo,
    reparto: 'maximo',
    estaciones: [],
    cambios: [],
    esperadas: [],
  }
}

interface Avance {
  atrases: number[]
  /** Hasta dónde llega el adelante de la última estación. */
  llegaA: number
  motivo: string | null
}

/** Avance máximo: cada estación estira sus visuales hasta donde lo permite el perfil. */
function avanceMaximo(perfil: Perfil, desde: number, hasta: number, r: Reglas): Avance {
  const atrases: number[] = []
  let punto = desde
  // Cada vuelta avanza al menos 2·visualMin (o termina), así que más vueltas
  // que esto es un perfil que no deja avanzar: se dice en vez de amontonar
  // estaciones.
  const vueltasMax = Math.ceil((hasta - desde) / (2 * r.visualMin)) + 2
  for (let vuelta = 0; hasta - punto > HOLGURA; vuelta++) {
    if (vuelta > vueltasMax) {
      return { atrases, llegaA: punto, motivo: `desde la ${formatearProgresiva(punto)} la visual no avanza` }
    }
    const { distancia, limitante } = visualMaxima(perfil, punto, hasta, r)
    if (limitante !== 'finDelTramo' && distancia < r.visualMin - HOLGURA) {
      return {
        atrases,
        llegaA: punto,
        motivo: `desde la ${formatearProgresiva(punto)} la pendiente obliga a visuales de ${m2(distancia)} m, menos que el mínimo de ${m2(r.visualMin)} m`,
      }
    }
    atrases.push(punto)
    punto = limitante === 'finDelTramo' ? hasta : punto + 2 * distancia
  }
  return sinUltimaRidicula(perfil, atrases, hasta, r)
}

/**
 * Si lo que queda para la última estación da visuales más cortas que
 * `visualMin` (el avance máximo dejó un resto de centímetros), se reparte
 * con la anterior: primero en dos mitades, luego dejando a la última
 * exactamente 2·visualMin, y si no, en una sola estación. Plantar el trípode
 * para leer a 7 cm no tiene sentido en campo.
 */
function sinUltimaRidicula(perfil: Perfil, atrases: number[], hasta: number, r: Reglas): Avance {
  const n = atrases.length
  const ultima = atrases[n - 1]
  if (n < 2 || ultima === undefined || (hasta - ultima) / 2 >= r.visualMin - HOLGURA) {
    return { atrases, llegaA: hasta, motivo: null }
  }
  const a = atrases[n - 2]!
  const cabe = (atras: number, adelante: number) => {
    const d = (adelante - atras) / 2
    return (
      d >= r.visualMin - HOLGURA &&
      d <= r.visualMax + HOLGURA &&
      reglaRota(perfil, atras, atras + d, adelante, r) === null
    )
  }
  for (const corte of [(a + hasta) / 2, hasta - 2 * r.visualMin]) {
    if (corte > a && cabe(a, corte) && cabe(corte, hasta)) {
      return { atrases: [...atrases.slice(0, n - 1), corte], llegaA: hasta, motivo: null }
    }
  }
  const d = (hasta - a) / 2
  if (d <= r.visualMax + HOLGURA && reglaRota(perfil, a, a + d, hasta, r) === null) {
    return { atrases: atrases.slice(0, n - 1), llegaA: hasta, motivo: null }
  }
  return {
    atrases,
    llegaA: hasta,
    motivo: `la última estación (desde la ${formatearProgresiva(ultima)}) quedaría con visuales de ${m2((hasta - ultima) / 2)} m, menos que el mínimo de ${m2(r.visualMin)} m, y no se pudo repartir con la anterior`,
  }
}

/**
 * `cantidad` estaciones, todas con el mismo paso. Así los cambios suelen
 * caer en progresivas que se ubican sin dudar (0+020, 0+040…).
 */
function repartoParejo(perfil: Perfil, desde: number, hasta: number, cantidad: number, r: Reglas): number[] | null {
  const paso = (hasta - desde) / cantidad
  if (paso / 2 > r.visualMax + HOLGURA) return null
  if (cantidad > 1 && paso / 2 < r.visualMin - HOLGURA) return null
  const atrases: number[] = []
  for (let i = 0; i < cantidad; i++) {
    const atras = desde + i * paso
    const adelante = i === cantidad - 1 ? hasta : desde + (i + 1) * paso
    // La estación con la misma cuenta que usará construirEstaciones.
    if (reglaRota(perfil, atras, atras + (adelante - atras) / 2, adelante, r) !== null) return null
    atrases.push(atras)
  }
  return atrases
}

function margen(lectura: number, o: OpcionesNivelacion): number {
  return Math.min(lectura - o.lecturaMin, lecturaMaxima(o) - lectura)
}

/**
 * `ultimoAdelante` es donde cae el adelante de la última estación (el fin del
 * tramo, o hasta donde se llegó si el plan se trabó); `hasta` es el fin del
 * tramo, contra el que se mide la visual máxima.
 */
function construirEstaciones(
  perfil: Perfil,
  atrases: number[],
  ultimoAdelante: number,
  hasta: number,
  o: OpcionesNivelacion,
): EstacionPlan[] {
  const justas = reglas(o, 0)
  const alLimite = (holgura: number) => holgura < o.holguraPlan - HOLGURA
  return atrases.map((atras, i) => {
    const adelante = atrases[i + 1] ?? ultimoAdelante
    // Una sola distancia para los dos lados: restar por separado dejaría un
    // desequilibrio de billonésimas que no existe.
    const distancia = (adelante - atras) / 2
    const progresiva = atras + distancia
    const cotaSuelo = cotaEnPerfilValido(perfil, progresiva)
    const alturaInstrumental = cotaSuelo + o.alturaInstrumento
    const cotaAtras = cotaEnPerfilValido(perfil, atras)
    const cotaAdelante = cotaEnPerfilValido(perfil, adelante)
    const lecturaAtras = alturaInstrumental - cotaAtras
    const lecturaAdelante = alturaInstrumental - cotaAdelante
    const holguraMinima = Math.min(
      ...puntosDeLaVisual(perfil, atras, adelante).map((p) =>
        margen(alturaInstrumental - cotaEnPerfilValido(perfil, p), o),
      ),
    )
    const maxima = visualMaxima(perfil, atras, hasta, justas)
    return {
      numero: i + 1,
      progresiva,
      cotaSuelo,
      alturaInstrumental,
      atras: {
        progresiva: atras,
        cota: cotaAtras,
        lectura: lecturaAtras,
        distancia,
        alLimite: alLimite(margen(lecturaAtras, o)),
      },
      adelante: {
        progresiva: adelante,
        cota: cotaAdelante,
        lectura: lecturaAdelante,
        distancia,
        alLimite: alLimite(margen(lecturaAdelante, o)),
      },
      desequilibrio: 0,
      visualMaxima: maxima.distancia,
      limitante: maxima.limitante,
      holguraMinima,
      alLimite: alLimite(holguraMinima),
    }
  })
}

function puntosDeCambio(estaciones: EstacionPlan[]): PuntoCambio[] {
  const cambios: PuntoCambio[] = []
  for (let i = 0; i < estaciones.length - 1; i++) {
    const actual = estaciones[i]!
    const siguiente = estaciones[i + 1]!
    cambios.push({
      numero: i + 1,
      progresiva: actual.adelante.progresiva,
      cota: actual.adelante.cota,
      lecturaAdelante: actual.adelante.lectura,
      lecturaAtras: siguiente.atras.lectura,
    })
  }
  return cambios
}

/**
 * La estación que cubre una progresiva en el sentido de la marcha: la
 * primera cuyo adelante la alcanza. La que coincide con un cambio se da una
 * sola vez, desde la estación que llega a ella.
 */
function estacionQueCubre(estaciones: EstacionPlan[], progresiva: number, sentido: SentidoNivelacion): EstacionPlan {
  return (
    estaciones.find((e) =>
      sentido === 'ida'
        ? progresiva <= e.adelante.progresiva + HOLGURA
        : progresiva >= e.adelante.progresiva - HOLGURA,
    ) ?? estaciones[estaciones.length - 1]!
  )
}

/** Cada progresiva redonda entre el primer atrás y el último adelante, en orden de ida. */
function lecturasEsperadas(perfil: Perfil, estaciones: EstacionPlan[], o: OpcionesNivelacion): LecturaEsperada[] {
  const primera = estaciones[0]
  const ultima = estaciones[estaciones.length - 1]
  if (!primera || !ultima) return []
  const desde = primera.atras.progresiva
  const hasta = ultima.adelante.progresiva
  const esperadas: LecturaEsperada[] = []
  const primeraRedonda = Math.ceil(desde / o.intervaloEsperadas - HOLGURA)
  for (let k = primeraRedonda; k * o.intervaloEsperadas <= hasta + HOLGURA; k++) {
    const progresiva = Math.min(Math.max(k * o.intervaloEsperadas, desde), hasta)
    const estacion = estacionQueCubre(estaciones, progresiva, 'ida')
    const cota = cotaEnPerfilValido(perfil, progresiva)
    esperadas.push({ progresiva, cota, lectura: estacion.alturaInstrumental - cota, estacion: estacion.numero })
  }
  return esperadas
}

function armarPlan(
  perfil: Perfil,
  desde: number,
  hasta: number,
  estaciones: EstacionPlan[],
  reparto: 'parejo' | 'maximo',
  motivo: string | null,
  o: OpcionesNivelacion,
): PlanNivelacion {
  return {
    desde,
    hasta,
    sentido: 'ida',
    posible: motivo === null,
    motivo,
    reparto,
    estaciones,
    cambios: puntosDeCambio(estaciones),
    esperadas: lecturasEsperadas(perfil, estaciones, o),
  }
}

/**
 * Plan de estaciones y puntos de cambio de `desde` a `hasta`, avanzando en el
 * sentido de la progresiva, con las visuales equilibradas (la estación en
 * medio de atrás y adelante). Sirve igual subiendo, bajando o a nivel: en
 * pendiente manda lo que se puede leer en la mira, y a nivel la visual más
 * larga.
 *
 * Cómo elige el reparto, de lo más seguro a lo más justo:
 * 1. parejo con el número de estaciones del avance máximo, o una o dos más,
 *    dejando `holguraPlan` de margen en todas las lecturas;
 * 2. avance máximo con ese margen;
 * 3. parejo con las reglas justas;
 * 4. avance máximo con las reglas justas (las lecturas al límite quedan
 *    marcadas con `alLimite`).
 */
export function planificarNivelacion(
  perfil: Perfil,
  desde: number,
  hasta: number,
  opciones?: Partial<OpcionesNivelacion>,
): PlanNivelacion {
  const o = completarOpciones(OPCIONES_NIVELACION, opciones)

  const malas = revisarOpciones(o)
  if (malas.length > 0) return planVacio(desde, hasta, malas.join('; '))

  const problemas = revisarPerfil(perfil)
  if (problemas.length > 0) return planVacio(desde, hasta, problemas.join('; '))

  if (!Number.isFinite(desde) || !Number.isFinite(hasta)) {
    return planVacio(desde, hasta, 'el tramo necesita progresivas de inicio y fin que sean números')
  }
  if (hasta < desde) {
    return planVacio(
      desde,
      hasta,
      `el tramo debe avanzar en el sentido de la progresiva (de ${formatearProgresiva(desde)} a ${formatearProgresiva(hasta)} retrocede)`,
    )
  }
  if (hasta - desde <= HOLGURA) {
    return planVacio(desde, hasta, `el tramo no tiene largo (de ${formatearProgresiva(desde)} a ${formatearProgresiva(hasta)})`)
  }
  const fuera = problemasDelTramo(perfil, desde, hasta)
  if (fuera.length > 0) return planVacio(desde, hasta, fuera.join('; '))

  const justas = reglas(o, 0)
  if (!legible(justas)) {
    return planVacio(
      desde,
      hasta,
      `la altura del instrumento (${m3(o.alturaInstrumento)} m) queda fuera de lo que se lee en la mira (${m3(o.lecturaMin)} a ${m3(lecturaMaxima(o))} m)`,
    )
  }

  const maximo = avanceMaximo(perfil, desde, hasta, justas)
  if (maximo.motivo !== null) {
    // Lo que sí se alcanzó a planificar se devuelve: sirve para ver dónde se
    // traba la pista. El motivo dice desde qué progresiva no se pudo seguir.
    const estaciones = construirEstaciones(perfil, maximo.atrases, maximo.llegaA, hasta, o)
    return armarPlan(perfil, desde, hasta, estaciones, 'maximo', maximo.motivo, o)
  }

  const n = maximo.atrases.length
  const holgadas = reglas(o, o.holguraPlan)
  let elegido: { atrases: number[]; reparto: 'parejo' | 'maximo' } | null = null
  if (legible(holgadas)) {
    for (let cantidad = n; cantidad <= n + 2 && !elegido; cantidad++) {
      const parejo = repartoParejo(perfil, desde, hasta, cantidad, holgadas)
      if (parejo) elegido = { atrases: parejo, reparto: 'parejo' }
    }
    if (!elegido) {
      const holgado = avanceMaximo(perfil, desde, hasta, holgadas)
      if (holgado.motivo === null) elegido = { atrases: holgado.atrases, reparto: 'maximo' }
    }
  }
  if (!elegido) {
    const parejo = repartoParejo(perfil, desde, hasta, n, justas)
    elegido = parejo ? { atrases: parejo, reparto: 'parejo' } : { atrases: maximo.atrases, reparto: 'maximo' }
  }

  const estaciones = construirEstaciones(perfil, elegido.atrases, hasta, hasta, o)
  return armarPlan(perfil, desde, hasta, estaciones, elegido.reparto, null, o)
}

/**
 * El plan de la vuelta, para cerrar el tramo: las mismas estaciones y puntos
 * de cambio recorridos al revés, con atrás y adelante cruzados y todo vuelto
 * a numerar. Cada tramo entre controles se nivela ida y vuelta (sección 2
 * del diseño), y estas cuentas no deben quedar en la interfaz.
 *
 * `visualMaxima` y `limitante` de cada estación se dejan como en la ida: se
 * calcularon avanzando desde su punto de atrás de la ida.
 */
export function planDeVuelta(plan: PlanNivelacion): PlanNivelacion {
  const sentido: SentidoNivelacion = plan.sentido === 'ida' ? 'vuelta' : 'ida'
  const estaciones = [...plan.estaciones].reverse().map((e, i) => ({
    ...e,
    numero: i + 1,
    atras: e.adelante,
    adelante: e.atras,
  }))
  const esperadas = [...plan.esperadas].reverse().map((esperada) => {
    const estacion = estacionQueCubre(estaciones, esperada.progresiva, sentido)
    return {
      progresiva: esperada.progresiva,
      cota: esperada.cota,
      lectura: estacion.alturaInstrumental - esperada.cota,
      estacion: estacion.numero,
    }
  })
  return {
    ...plan,
    desde: plan.hasta,
    hasta: plan.desde,
    sentido,
    estaciones,
    cambios: puntosDeCambio(estaciones),
    esperadas,
  }
}
