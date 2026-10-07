import type { Punto2 } from '../planos/geometria'
import { planoDe, triangulosCerca, type PlanoTriangulo, type Superficie } from './triangulacion'

/*
 * Perfil del terreno a lo largo de una polilínea dibujada en planta (un eje,
 * un canal, una línea cualquiera). La polilínea se corta con cada triángulo del
 * TIN; entre dos cortes la cota varía en línea recta, así que el perfil es
 * exacto con un punto en cada arista que cruza.
 *
 * Donde la línea sale de la superficie (fuera del levantamiento o en un hueco)
 * no se inventa cota: el tramo se marca «fuera» y sus puntos van sin cota.
 */

export interface PuntoPerfil extends Punto2 {
  /**
   * Distancia acumulada desde el inicio de la polilínea, m. Crece siempre,
   * salvo en el borde de un hueco: ahí se repite con un punto con cota y otro
   * sin cota (corte de la línea).
   */
  distancia: number
  /** Cota del terreno; null fuera de la superficie. */
  z: number | null
  /** Sale solo de triángulos comprobados. */
  comprobado: boolean
}

export interface TramoPerfil {
  desde: number
  hasta: number
  /** Sobre la superficie; false = fuera o en un hueco. */
  dentro: boolean
  comprobado: boolean
  /** %, positivo sube en el sentido de avance; null fuera de la superficie. */
  pendiente: number | null
}

export interface PerfilLinea {
  puntos: PuntoPerfil[]
  tramos: TramoPerfil[]
  /** Largo en planta de la polilínea, m. */
  longitud: number
  /** Cuántos m de la línea no tienen superficie debajo. */
  fueraDeSuperficie: number
  /** Todos los tramos con superficie son comprobados. */
  comprobado: boolean
  /** Ningún tramo tiene superficie. */
  sinDatos: boolean
}

interface Pieza {
  desde: number
  hasta: number
  a: Punto2
  b: Punto2
  /** Plano del triángulo, o null si es un tramo fuera. */
  plano: PlanoTriangulo | null
  comprobado: boolean
}

const EPS = 1e-9

/** Intervalo [t0, t1] de a→b dentro del triángulo k (Cyrus–Beck), o null. */
function dentroDeTriangulo(sup: Superficie, k: number, a: Punto2, b: Punto2): [number, number] | null {
  const t = sup.triangulos[k]!
  let p = sup.puntos[t.a]!
  let q = sup.puntos[t.b]!
  let r = sup.puntos[t.c]!
  if ((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x) < 0) [q, r] = [r, q]
  let t0 = 0
  let t1 = 1
  const dx = b.x - a.x
  const dy = b.y - a.y
  for (const [u, v] of [
    [p, q],
    [q, r],
    [r, p],
  ] as const) {
    // f(t) = (v − u) × (a + t·d − u) ≥ 0 para quedar a la izquierda
    const ex = v.x - u.x
    const ey = v.y - u.y
    const f0 = ex * (a.y - u.y) - ey * (a.x - u.x)
    const df = ex * dy - ey * dx
    const tol = EPS * Math.hypot(ex, ey)
    if (Math.abs(df) < 1e-15) {
      if (f0 < -tol) return null
      continue
    }
    const tc = -f0 / df
    if (df > 0) t0 = Math.max(t0, tc)
    else t1 = Math.min(t1, tc)
    if (t0 >= t1) return null
  }
  return [t0, t1]
}

function zEn(plano: PlanoTriangulo, p: Punto2): number {
  return plano.a + plano.b * p.x + plano.c * p.y
}

/** Perfil del terreno a lo largo de `linea` (dos o más puntos en planta). */
export function perfilDeLinea(sup: Superficie, linea: Punto2[]): PerfilLinea {
  const piezas: Pieza[] = []
  let acumulado = 0
  for (let s = 1; s < linea.length; s++) {
    const a = linea[s - 1]!
    const b = linea[s]!
    const largo = Math.hypot(b.x - a.x, b.y - a.y)
    if (largo < EPS) continue
    const en = (t: number): Punto2 => ({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) })
    const intervalos: { t0: number; t1: number; k: number }[] = []
    for (const k of triangulosCerca(sup, Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y))) {
      const r = dentroDeTriangulo(sup, k, a, b)
      if (r && (r[1] - r[0]) * largo > EPS) intervalos.push({ t0: r[0], t1: r[1], k })
    }
    intervalos.sort((x, y) => x.t0 - y.t0)
    let cursor = 0
    const fuera = (t0: number, t1: number) => {
      if ((t1 - t0) * largo > EPS) {
        piezas.push({ desde: acumulado + t0 * largo, hasta: acumulado + t1 * largo, a: en(t0), b: en(t1), plano: null, comprobado: false })
      }
    }
    for (const iv of intervalos) {
      if (iv.t1 <= cursor + EPS / largo) continue // ya cubierto (arista compartida)
      const t0 = Math.max(iv.t0, cursor)
      if (t0 > cursor + EPS / largo) fuera(cursor, t0)
      piezas.push({
        desde: acumulado + t0 * largo,
        hasta: acumulado + iv.t1 * largo,
        a: en(t0),
        b: en(iv.t1),
        plano: planoDe(sup, iv.k),
        comprobado: sup.triangulos[iv.k]!.comprobado,
      })
      cursor = iv.t1
    }
    fuera(cursor, 1)
    acumulado += largo
  }

  // puntos en cada borde de pieza. En el borde de un hueco van DOS puntos a la
  // misma distancia, uno con cota y otro sin cota: así quien una los puntos con
  // rectas (o interpole una progresiva) corta la línea ahí y no inventa terreno
  // de un lado al otro del hueco.
  const puntos: PuntoPerfil[] = []
  const agregarPunto = (d: number, p: Punto2, z: number | null, comprobado: boolean) => {
    const ultimo = puntos[puntos.length - 1]
    if (ultimo && Math.abs(ultimo.distancia - d) < EPS) {
      if ((ultimo.z === null) === (z === null)) {
        if (z !== null) ultimo.comprobado = ultimo.comprobado && comprobado
        return
      }
      puntos.push({ distancia: ultimo.distancia, x: ultimo.x, y: ultimo.y, z, comprobado: z !== null && comprobado })
      return
    }
    puntos.push({ distancia: d, x: p.x, y: p.y, z, comprobado: z !== null && comprobado })
  }
  for (const pz of piezas) {
    agregarPunto(pz.desde, pz.a, pz.plano ? zEn(pz.plano, pz.a) : null, pz.comprobado)
    agregarPunto(pz.hasta, pz.b, pz.plano ? zEn(pz.plano, pz.b) : null, pz.comprobado)
  }
  if (puntos.length > 0) puntos[0]!.distancia = 0

  // tramos: se juntan los vecinos iguales (misma pendiente y condición)
  const tramos: TramoPerfil[] = []
  for (const pz of piezas) {
    const pendiente = pz.plano ? ((zEn(pz.plano, pz.b) - zEn(pz.plano, pz.a)) / (pz.hasta - pz.desde)) * 100 : null
    const previo = tramos[tramos.length - 1]
    const igual =
      previo &&
      previo.dentro === (pz.plano !== null) &&
      previo.comprobado === pz.comprobado &&
      Math.abs(previo.hasta - pz.desde) < EPS &&
      (pendiente === null ? previo.pendiente === null : previo.pendiente !== null && Math.abs(previo.pendiente - pendiente) < 1e-6)
    if (igual) {
      previo.hasta = pz.hasta
      continue
    }
    tramos.push({ desde: pz.desde, hasta: pz.hasta, dentro: pz.plano !== null, comprobado: pz.comprobado, pendiente })
  }

  const fueraDeSuperficie = tramos.filter((t) => !t.dentro).reduce((s, t) => s + (t.hasta - t.desde), 0)
  const conSuperficie = tramos.filter((t) => t.dentro)
  return {
    puntos,
    tramos,
    longitud: acumulado,
    fueraDeSuperficie,
    // sin superficie no hay nada comprobado (every sobre una lista vacía da true)
    comprobado: conSuperficie.length > 0 && conSuperficie.every((t) => t.comprobado),
    sinDatos: conSuperficie.length === 0,
  }
}
