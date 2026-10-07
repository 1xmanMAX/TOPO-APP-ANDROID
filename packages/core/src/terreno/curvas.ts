import type { Punto2 } from '../planos/geometria'
import type { Superficie } from './triangulacion'
import { dentroDePoligono } from './zona'

/*
 * Curvas de nivel sobre el TIN. Por cada triángulo y cada cota se saca el
 * segmento donde el plano del triángulo corta esa cota; luego los segmentos se
 * unen en polilíneas por la arista (o el vértice) que comparten.
 *
 * Un vértice justo en la cota cuenta como «arriba» (z ≥ cota). Así una curva
 * que pasa exactamente por puntos levantados sale seguida y sin pedazos de
 * largo cero: los cortes en un vértice se identifican por el vértice, no por la
 * arista, y se unen aunque lleguen desde triángulos distintos. Las claves son
 * números y no textos: con miles de puntos, armar textos era la mitad del
 * tiempo.
 *
 * Cada tramo sabe si su triángulo es comprobado; la curva es comprobada solo si
 * todos sus tramos lo son (spec §3).
 */

export interface OpcionesCurvas {
  /** Equidistancia en m (0.25, 0.5, 1…). */
  intervalo: number
  /** Una de cada tantas curvas es maestra (cota múltiplo de intervalo × cadaMaestra). Por defecto 5. */
  cadaMaestra?: number
  /** Recorta las curvas a este polígono (cóncavo o no). */
  zona?: Punto2[]
  /** Distancia entre rótulos a lo largo de una curva, m. Por defecto 50. */
  separacionRotulos?: number
  /** Qué curvas llevan rótulo. Por defecto solo las maestras. */
  rotular?: 'maestras' | 'todas'
}

export interface RotuloCurva extends Punto2 {
  /** Grados desde el este, antihorario, entre −90 y 90 para que se lea derecho. */
  angulo: number
  texto: string
}

export interface Curva {
  cota: number
  maestra: boolean
  /** Cerrada: el último punto repite el primero. */
  cerrada: boolean
  puntos: Punto2[]
  /** Uno por tramo (puntos.length − 1): el tramo cae en un triángulo comprobado. */
  tramosComprobados: boolean[]
  comprobada: boolean
  rotulos: RotuloCurva[]
}

export interface ResultadoCurvas {
  curvas: Curva[]
  intervalo: number
  /** Cotas extremas de la superficie (null si está vacía). */
  cotaMin: number | null
  cotaMax: number | null
}

interface Segmento {
  ka: number
  kb: number
  a: Punto2
  b: Punto2
  comprobado: boolean
}

interface Polilinea {
  puntos: Punto2[]
  tramos: boolean[]
  cerrada: boolean
}

/** Cota de la curva k, sin el ruido de la multiplicación en coma flotante. */
function cotaDe(k: number, intervalo: number): number {
  return Math.round(k * intervalo * 1e9) / 1e9
}

/** Une los segmentos de una cota en polilíneas abiertas y cerradas. */
function unir(segmentos: Segmento[]): Polilinea[] {
  const porClave = new Map<number, number[]>()
  const agregar = (k: number, i: number) => {
    const l = porClave.get(k)
    if (l) l.push(i)
    else porClave.set(k, [i])
  }
  segmentos.forEach((s, i) => {
    agregar(s.ka, i)
    agregar(s.kb, i)
  })
  const usado = new Uint8Array(segmentos.length)
  const salida: Polilinea[] = []

  const recorrer = (inicio: number): Polilinea | null => {
    let clave = inicio
    let punto: Punto2 | null = null
    const puntos: Punto2[] = []
    const tramos: boolean[] = []
    for (;;) {
      const sig = (porClave.get(clave) ?? []).find((i) => !usado[i])
      if (sig === undefined) break
      usado[sig] = 1
      const s = segmentos[sig]!
      const alReves = s.kb === clave && s.ka !== clave
      const desde = alReves ? s.b : s.a
      const hasta = alReves ? s.a : s.b
      if (!punto) puntos.push(desde)
      puntos.push(hasta)
      tramos.push(s.comprobado)
      punto = hasta
      clave = alReves ? s.ka : s.kb
    }
    if (tramos.length === 0) return null
    return { puntos, tramos, cerrada: clave === inicio && tramos.length > 2 }
  }

  // primero desde las puntas (grado impar): las abiertas
  for (const [clave, lista] of porClave) {
    if (lista.length % 2 === 1) {
      while ((porClave.get(clave) ?? []).some((i) => !usado[i])) {
        const p = recorrer(clave)
        if (p) salida.push(p)
      }
    }
  }
  // lo que queda son lazos
  segmentos.forEach((s, i) => {
    if (usado[i]) return
    const p = recorrer(s.ka)
    if (p) salida.push(p)
  })
  return salida
}

/** Parámetros (0..1) donde el segmento a→b cruza el borde del polígono. */
function cruces(a: Punto2, b: Punto2, pol: Punto2[]): number[] {
  const t: number[] = []
  const dx = b.x - a.x
  const dy = b.y - a.y
  for (let i = 0; i < pol.length; i++) {
    const p = pol[i]!
    const q = pol[(i + 1) % pol.length]!
    const ex = q.x - p.x
    const ey = q.y - p.y
    const den = dx * ey - dy * ex
    if (Math.abs(den) < 1e-15) continue
    const s = ((p.x - a.x) * ey - (p.y - a.y) * ex) / den
    const u = ((p.x - a.x) * dy - (p.y - a.y) * dx) / den
    if (s > 1e-12 && s < 1 - 1e-12 && u >= -1e-12 && u <= 1 + 1e-12) t.push(s)
  }
  return t.sort((x, y) => x - y)
}

/** Corta una polilínea al polígono: devuelve los pedazos que quedan dentro. */
function recortar(pl: Polilinea, zona: Punto2[]): Polilinea[] {
  const pedazos: Polilinea[] = []
  let actual: Polilinea | null = null
  let salio = false
  for (let i = 1; i < pl.puntos.length; i++) {
    const a = pl.puntos[i - 1]!
    const b = pl.puntos[i]!
    const ts = [0, ...cruces(a, b, zona), 1]
    for (let j = 1; j < ts.length; j++) {
      const t0 = ts[j - 1]!
      const t1 = ts[j]!
      if (t1 - t0 < 1e-12) continue
      const p0 = { x: a.x + t0 * (b.x - a.x), y: a.y + t0 * (b.y - a.y) }
      const p1 = { x: a.x + t1 * (b.x - a.x), y: a.y + t1 * (b.y - a.y) }
      const medio = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 }
      if (!dentroDePoligono(medio, zona)) {
        salio = true
        if (actual) pedazos.push(actual)
        actual = null
        continue
      }
      if (!actual) actual = { puntos: [p0], tramos: [], cerrada: false }
      actual.puntos.push(p1)
      actual.tramos.push(pl.tramos[i - 1]!)
    }
  }
  if (actual) pedazos.push(actual)
  if (!salio) return pl.cerrada && pedazos.length === 1 ? [{ ...pedazos[0]!, cerrada: true }] : pedazos
  // una curva cerrada que sale y vuelve: el último pedazo sigue en el primero
  if (pl.cerrada && pedazos.length > 1) {
    const primero = pedazos[0]!
    const ultimo = pedazos[pedazos.length - 1]!
    const fin = ultimo.puntos[ultimo.puntos.length - 1]!
    const ini = primero.puntos[0]!
    if (Math.hypot(fin.x - ini.x, fin.y - ini.y) < 1e-9) {
      pedazos[0] = {
        puntos: [...ultimo.puntos, ...primero.puntos.slice(1)],
        tramos: [...ultimo.tramos, ...primero.tramos],
        cerrada: false,
      }
      pedazos.pop()
    }
  }
  return pedazos
}

function largo(puntos: Punto2[]): number {
  let l = 0
  for (let i = 1; i < puntos.length; i++) l += Math.hypot(puntos[i]!.x - puntos[i - 1]!.x, puntos[i]!.y - puntos[i - 1]!.y)
  return l
}

/** Rótulos repartidos a lo largo de la curva, con el ángulo del tramo donde caen. */
function rotulosDe(puntos: Punto2[], texto: string, separacion: number): RotuloCurva[] {
  const total = largo(puntos)
  if (total < separacion / 10 || total === 0) return []
  const n = Math.max(1, Math.floor(total / separacion))
  const rotulos: RotuloCurva[] = []
  let i = 1
  let acumulado = 0
  for (let r = 0; r < n; r++) {
    const objetivo = ((r + 0.5) * total) / n
    for (; i < puntos.length; i++) {
      const a = puntos[i - 1]!
      const b = puntos[i]!
      const l = Math.hypot(b.x - a.x, b.y - a.y)
      if (acumulado + l >= objetivo || i === puntos.length - 1) {
        const t = l > 0 ? Math.min(1, Math.max(0, (objetivo - acumulado) / l)) : 0
        let angulo = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
        if (angulo > 90) angulo -= 180
        if (angulo <= -90) angulo += 180
        rotulos.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y), angulo, texto })
        break
      }
      acumulado += l
    }
  }
  return rotulos
}

/** Curvas de nivel de la superficie, ordenadas por cota. */
export function curvasDeNivel(sup: Superficie, opciones: OpcionesCurvas): ResultadoCurvas {
  const { intervalo } = opciones
  if (!(intervalo > 0) || !Number.isFinite(intervalo)) {
    throw new Error(`El intervalo entre curvas debe ser un número positivo (llegó ${intervalo}).`)
  }
  const cadaMaestra = Math.max(1, Math.round(opciones.cadaMaestra ?? 5))
  const separacion = opciones.separacionRotulos ?? 50
  // con 0 el reparto de rótulos no termina nunca (n = total / 0 = Infinity)
  if (!(separacion > 0) || !Number.isFinite(separacion)) {
    throw new Error(`La separación entre rótulos debe ser un número positivo de metros (llegó ${separacion}).`)
  }
  const rotular = opciones.rotular ?? 'maestras'

  if (sup.triangulos.length === 0) return { curvas: [], intervalo, cotaMin: null, cotaMax: null }

  let cotaMin = Infinity
  let cotaMax = -Infinity
  const porNivel = new Map<number, Segmento[]>()
  const { puntos } = sup
  // claves numéricas: arista (i, j) con i < j → i·n + j; vértice i → −(i + 1)
  const n = puntos.length

  for (const t of sup.triangulos) {
    const v = [t.a, t.b, t.c]
    const z = v.map((i) => puntos[i]!.z)
    const zMin = Math.min(z[0]!, z[1]!, z[2]!)
    const zMax = Math.max(z[0]!, z[1]!, z[2]!)
    if (zMin < cotaMin) cotaMin = zMin
    if (zMax > cotaMax) cotaMax = zMax
    for (let k = Math.ceil(zMin / intervalo - 1e-9); k <= Math.floor(zMax / intervalo + 1e-9); k++) {
      const L = cotaDe(k, intervalo)
      if (L <= zMin) continue // todo «arriba»: no corta
      if (L > zMax) continue
      const cortes: { clave: number; p: Punto2 }[] = []
      for (let e = 0; e < 3; e++) {
        const i = v[e]!
        const j = v[(e + 1) % 3]!
        const zi = puntos[i]!.z
        const zj = puntos[j]!.z
        if (zi >= L === zj >= L) continue
        // `alto` es el de z ≥ L; si cae justo en la cota, el corte es el vértice
        const [alto, bajo] = zi >= L ? [i, j] : [j, i]
        const pa = puntos[alto]!
        const pb = puntos[bajo]!
        if (pa.z === L) {
          cortes.push({ clave: -(alto + 1), p: { x: pa.x, y: pa.y } })
        } else {
          const s = (L - pa.z) / (pb.z - pa.z)
          cortes.push({
            clave: i < j ? i * n + j : j * n + i,
            p: { x: pa.x + s * (pb.x - pa.x), y: pa.y + s * (pb.y - pa.y) },
          })
        }
      }
      if (cortes.length !== 2) continue
      const [c1, c2] = cortes as [{ clave: number; p: Punto2 }, { clave: number; p: Punto2 }]
      if (c1.clave === c2.clave) continue // los dos cortes en el mismo vértice: largo cero
      const lista = porNivel.get(k)
      const seg = { ka: c1.clave, kb: c2.clave, a: c1.p, b: c2.p, comprobado: t.comprobado }
      if (lista) lista.push(seg)
      else porNivel.set(k, [seg])
    }
  }

  const curvas: Curva[] = []
  for (const k of [...porNivel.keys()].sort((a, b) => a - b)) {
    const cota = cotaDe(k, intervalo)
    const maestra = k % cadaMaestra === 0
    let polilineas = unir(porNivel.get(k)!)
    if (opciones.zona && opciones.zona.length >= 3) {
      const zona = opciones.zona
      polilineas = polilineas.flatMap((p) => recortar(p, zona))
    }
    for (const p of polilineas) {
      if (p.tramos.length === 0 || largo(p.puntos) < 1e-9) continue
      const texto = cota.toFixed(2)
      curvas.push({
        cota,
        maestra,
        cerrada: p.cerrada,
        puntos: p.puntos,
        tramosComprobados: p.tramos,
        comprobada: p.tramos.every(Boolean),
        rotulos: rotular === 'todas' || maestra ? rotulosDe(p.puntos, texto, separacion) : [],
      })
    }
  }
  return { curvas, intervalo, cotaMin, cotaMax }
}
