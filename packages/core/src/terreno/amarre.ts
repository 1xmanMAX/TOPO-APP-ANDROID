/**
 * Amarre de un conjunto de puntos a otro sistema: la semejanza 2D (giro,
 * traslación y, si se pide, escala) que lleva las coordenadas de origen
 * —por ejemplo, las de una estación total en un sistema local— a las de
 * destino —las del plano, o UTM—, sacada de puntos que están en los dos.
 *
 *   x' = a·x − b·y + tx
 *   y' = b·x + a·y + ty      con a = s·cos θ, b = s·sin θ
 *
 * Con 2 puntos la cuenta es exacta; con más, mínimos cuadrados. La escala va
 * fija por defecto (en 1, o en el factor que se declare: la estación mide
 * distancias de verdad; si la escala que saldría libre no es esa, algún
 * punto está mal o el destino tiene otro factor), y esa escala libre se
 * informa siempre como control.
 */

export interface CoordenadaPlana {
  /** Este, en metros. */
  x: number
  /** Norte, en metros. */
  y: number
}

export interface ParDeAmarre {
  id: string
  /** El punto en el sistema que se quiere mover. */
  origen: CoordenadaPlana
  /** El mismo punto en el sistema de llegada. */
  destino: CoordenadaPlana
}

export interface Amarre {
  a: number
  b: number
  tx: number
  ty: number
  escala: number
  /** Giro antihorario (como en matemáticas), en grados, entre −180 y 180. */
  rotacionGrados: number
}

export interface ResiduoAmarre {
  id: string
  /** Destino − origen transformado, en metros. */
  dx: number
  dy: number
  distancia: number
}

export interface OpcionesAmarre {
  /** `'fija'` (por defecto) deja la escala en `factorEscala`; `'libre'` la ajusta. */
  escala?: 'fija' | 'libre'
  /**
   * La escala fija, si se conoce: por ejemplo el factor combinado de la
   * cuadrícula UTM por la elevación (~0.9991 en Huancayo) al pasar de un
   * sistema local medido con estación a UTM. Por defecto 1.
   */
  factorEscala?: number
  /** Residuo a partir del cual se avisa un punto, en metros. Por defecto 0.03. */
  toleranciaM?: number
}

export interface ResultadoAmarre {
  /** Null si no se pudo calcular (ver `avisos`). */
  amarre: Amarre | null
  /** La escala que daría el ajuste libre: el control de que los puntos son los mismos. */
  escalaLibre: number | null
  /** Uno por par usado, en el orden de entrada. */
  residuos: ResiduoAmarre[]
  /** Raíz del promedio de los residuos al cuadrado, en metros. */
  rmsM: number | null
  avisos: string[]
}

const TOLERANCIA_POR_DEFECTO = 0.03
/** Una escala libre que se aparta de la fija más de esto (1 por mil) merece revisarse. */
const ESCALA_SOSPECHOSA = 0.001
/**
 * Si el destino es UTM, el factor de la cuadrícula ya mueve la escala
 * varias décimas por mil (en la sierra, ~0.9 ‰): se avisa desde 0.3 ‰.
 */
const ESCALA_SOSPECHOSA_UTM = 0.0003
/** Fuera de esto la escala no es la de los mismos puntos en metros: el amarre no se da. */
const ESCALA_MINIMA = 0.5
const ESCALA_MAXIMA = 2
/** Con puntos más juntos que esto, un centímetro de error ya gira el plano a lo lejos. */
const BASE_MINIMA_M = 5

function finito(p: CoordenadaPlana): boolean {
  return Number.isFinite(p.x) && Number.isFinite(p.y)
}

function pareceUtm(p: CoordenadaPlana): boolean {
  return p.x >= 100000 && p.x < 1000000 && p.y >= 1000000 && p.y < 10000000
}

function m3(v: number): string {
  return v.toFixed(3)
}

export function aplicarAmarre(amarre: Amarre, p: CoordenadaPlana): CoordenadaPlana {
  return {
    x: amarre.a * p.x - amarre.b * p.y + amarre.tx,
    y: amarre.b * p.x + amarre.a * p.y + amarre.ty,
  }
}

/**
 * La transformación de vuelta: del destino al origen. Null si el amarre no
 * se puede invertir (escala 0 o algo que no es número).
 */
export function invertirAmarre(amarre: Amarre): Amarre | null {
  const d = amarre.a * amarre.a + amarre.b * amarre.b
  if (!Number.isFinite(d) || !(d > 1e-24) || !Number.isFinite(amarre.tx) || !Number.isFinite(amarre.ty)) return null
  const a = amarre.a / d
  const b = -amarre.b / d
  return {
    a,
    b,
    tx: -(a * amarre.tx - b * amarre.ty),
    ty: -(b * amarre.tx + a * amarre.ty),
    escala: 1 / Math.sqrt(d),
    rotacionGrados: -amarre.rotacionGrados,
  }
}

export function calcularAmarre(pares: ParDeAmarre[], opciones: OpcionesAmarre = {}): ResultadoAmarre {
  const libre = opciones.escala === 'libre'
  const avisos: string[] = []
  const vacio = (escalaLibre: number | null = null): ResultadoAmarre => ({
    amarre: null,
    escalaLibre,
    residuos: [],
    rmsM: null,
    avisos,
  })

  // Un dato mal escrito no puede apagar en silencio el control de puntos malos.
  let tolerancia = opciones.toleranciaM ?? TOLERANCIA_POR_DEFECTO
  if (!Number.isFinite(tolerancia) || tolerancia < 0) {
    avisos.push(`La tolerancia de residuos no es un número válido (≥ 0 m): se usó ${m3(TOLERANCIA_POR_DEFECTO)} m.`)
    tolerancia = TOLERANCIA_POR_DEFECTO
  }
  let factor = opciones.factorEscala ?? 1
  if (!Number.isFinite(factor) || factor < ESCALA_MINIMA || factor > ESCALA_MAXIMA) {
    avisos.push(`El factor de escala «${String(opciones.factorEscala)}» no es válido: se usó 1.`)
    factor = 1
  }

  const usados = pares.filter((p) => finito(p.origen) && finito(p.destino))
  for (const p of pares) {
    if (!usados.includes(p)) avisos.push(`El punto «${p.id}» tiene una coordenada que no es un número: se dejó fuera del amarre.`)
  }
  const vistos = new Set<string>()
  for (const p of usados) {
    if (vistos.has(p.id)) avisos.push(`El punto «${p.id}» está dos veces en el amarre: pesa doble. Revise que sea a propósito.`)
    vistos.add(p.id)
  }
  if (usados.length < 2) {
    avisos.push('Hacen falta al menos 2 puntos comunes para amarrar.')
    return vacio()
  }

  // Centroides: con coordenadas UTM (millones de metros) restar primero evita
  // perder decimales en los productos.
  const n = usados.length
  const co = { x: 0, y: 0 }
  const cd = { x: 0, y: 0 }
  for (const p of usados) {
    co.x += p.origen.x / n
    co.y += p.origen.y / n
    cd.x += p.destino.x / n
    cd.y += p.destino.y / n
  }
  let sumaCos = 0
  let sumaSin = 0
  let sumaOrigen = 0
  let base = 0
  for (const p of usados) {
    const xo = p.origen.x - co.x
    const yo = p.origen.y - co.y
    const xd = p.destino.x - cd.x
    const yd = p.destino.y - cd.y
    sumaCos += xo * xd + yo * yd
    sumaSin += xo * yd - yo * xd
    sumaOrigen += xo * xo + yo * yo
    base = Math.max(base, Math.hypot(xo, yo) * 2)
  }
  if (sumaOrigen < 1e-12) {
    avisos.push('Los puntos de amarre están todos en el mismo sitio: no se puede saber el giro.')
    return vacio()
  }
  const sumaDestino = usados.reduce((s, p) => s + (p.destino.x - cd.x) ** 2 + (p.destino.y - cd.y) ** 2, 0)
  if (sumaDestino < 1e-12) {
    avisos.push('En el sistema de llegada los puntos de amarre están todos en el mismo sitio: revise sus coordenadas.')
    return vacio()
  }

  const escalaLibre = Math.hypot(sumaCos, sumaSin) / sumaOrigen

  // ¿Espejado? Norte y este cambiados en un sistema (o un eje con el signo al
  // revés) no es un giro: es una reflexión. Se ajusta también la reflejada y
  // se compara lo que sobra (suma de residuos² con escala libre). Con 2
  // puntos las dos casan exactas: no se puede saber.
  if (n >= 3) {
    let cosR = 0
    let sinR = 0
    for (const p of usados) {
      const xo = p.origen.x - co.x
      const yo = -(p.origen.y - co.y)
      const xd = p.destino.x - cd.x
      const yd = p.destino.y - cd.y
      cosR += xo * xd + yo * yd
      sinR += xo * yd - yo * xd
    }
    const sobraDirecta = Math.max(0, sumaDestino - (sumaCos ** 2 + sumaSin ** 2) / sumaOrigen)
    const sobraEspejada = Math.max(0, sumaDestino - (cosR ** 2 + sinR ** 2) / sumaOrigen)
    if (Math.sqrt(sobraDirecta / n) > tolerancia && sobraEspejada < sobraDirecta * 0.01) {
      avisos.push(
        'Los puntos casan espejados, no girados: parece que el norte y el este están cambiados (o un eje tiene el signo ' +
          'al revés) en uno de los dos sistemas. Revise el orden de columnas. No se calculó el amarre.',
      )
      return vacio(escalaLibre)
    }
  }
  if (escalaLibre < ESCALA_MINIMA || escalaLibre > ESCALA_MAXIMA) {
    avisos.push(
      `La escala libre sale ${escalaLibre.toFixed(6)}: no parecen los mismos puntos en metros (¿otras unidades, ` +
        'puntos cambiados, norte y este cruzados?). No se calculó el amarre.',
    )
    return vacio(escalaLibre)
  }

  const theta = Math.atan2(sumaSin, sumaCos)
  const escala = libre ? escalaLibre : factor
  const a = escala * Math.cos(theta)
  const b = escala * Math.sin(theta)
  const amarre: Amarre = {
    a,
    b,
    tx: cd.x - (a * co.x - b * co.y),
    ty: cd.y - (b * co.x + a * co.y),
    escala,
    rotacionGrados: (theta * 180) / Math.PI,
  }

  // Residuos con los centroides restados, para no perder los milímetros
  // entre millones de metros cuando los dos sistemas son UTM.
  const residuosCon = (s: number): ResiduoAmarre[] => {
    const c = s * Math.cos(theta)
    const sn = s * Math.sin(theta)
    return usados.map((p) => {
      const xo = p.origen.x - co.x
      const yo = p.origen.y - co.y
      const dx = p.destino.x - cd.x - (c * xo - sn * yo)
      const dy = p.destino.y - cd.y - (sn * xo + c * yo)
      return { id: p.id, dx, dy, distancia: Math.hypot(dx, dy) }
    })
  }
  const rms = (rs: ResiduoAmarre[]) => Math.sqrt(rs.reduce((s, r) => s + r.distancia ** 2, 0) / n)
  const residuos = residuosCon(escala)
  const rmsM = rms(residuos)

  if (base < BASE_MINIMA_M) {
    avisos.push(
      `Los puntos de amarre están muy juntos (${m3(base)} m): el giro queda mal definido y el error crece lejos de ellos.`,
    )
  }
  const destinoUtm = usados.every((p) => pareceUtm(p.destino))
  const umbral = destinoUtm ? ESCALA_SOSPECHOSA_UTM : ESCALA_SOSPECHOSA
  if (Math.abs(escalaLibre - factor) > umbral) {
    avisos.push(
      `La escala libre sale ${escalaLibre.toFixed(6)}: ${libre ? 'se aplicó' : `no se aplicó (escala fija ${factor})`}. ` +
        (destinoUtm
          ? 'El destino parece UTM: puede ser el factor de escala de la cuadrícula y la elevación; si no, revise los puntos.'
          : 'Revise que los puntos sean los mismos y que estén en metros.'),
    )
  }
  if (libre && n === 2) {
    avisos.push('Con 2 puntos y escala libre el ajuste es exacto: no queda ningún control. Use un tercer punto.')
  }
  const malos = residuos.filter((r) => r.distancia > tolerancia)
  if (malos.length > 0) {
    const lista = malos.map((r) => `«${r.id}» ${m3(r.distancia)} m`).join(', ')
    avisos.push(`Residuo mayor que ${m3(tolerancia)} m en: ${lista}.`)
    // Si la escala libre lo arregla, no son los puntos: es la escala (factor
    // UTM × elevación, o unidades).
    if (!libre && n >= 3) {
      const rmsLibre = rms(residuosCon(escalaLibre))
      if (rmsLibre <= tolerancia || rmsLibre < rmsM / 3) {
        avisos.push(
          `Parece factor de escala, no puntos malos: con escala libre (${escalaLibre.toFixed(6)}) el error medio baja de ` +
            `${m3(rmsM)} m a ${m3(rmsLibre)} m. Pruebe escala libre o declare el factor de escala.`,
        )
      }
    }
  }

  return { amarre, escalaLibre, residuos, rmsM, avisos }
}
