import type { Punto2 } from '../planos/geometria'
import { planoDe, triangulosCerca, type PlanoTriangulo, type Superficie } from './triangulacion'

/*
 * Lo que hay dentro de una zona dibujada en planta: área, cotas de la
 * superficie y volumen de corte y relleno respecto a una cota o a otra
 * superficie.
 *
 * Cómo se integra: el polígono se recorta con cada triángulo (el triángulo es
 * convexo, así que el recorte de Sutherland–Hodgman sirve aunque la zona sea
 * cóncava). Sobre cada pedazo la cota es un plano, y la integral de una
 * función lineal sobre un polígono es exacta con sus momentos (área y
 * centroide). Donde la diferencia cambia de signo, el pedazo se parte por la
 * recta de cota cero para que el corte y el relleno no se cancelen.
 *
 * Todo se integra en coordenadas locales (restando un origen cerca de la
 * zona): con UTM (E ≈ 350 000, N ≈ 8 500 000) los productos cruzados de la
 * fórmula de Gauss y el término independiente del plano (≈ −(b·E + c·N)) se
 * comen casi todas las cifras y el volumen sale mal.
 *
 * Convención (spec §3): diferencia = superficie − referencia. Positivo = sobra
 * = corte; negativo = falta = relleno.
 */

export interface OpcionesZona {
  /** Cota de referencia en m, u otra superficie (p. ej. el proyecto o la subrasante). */
  referencia?: number | Superficie
}

export interface ResultadoZona {
  /** Área en planta del polígono, m². */
  areaPlanta: number
  /**
   * Área donde hay superficie (y, si la referencia es otra superficie, donde
   * hay las dos), m². Es el área sobre la que se calculó todo lo demás.
   */
  areaConSuperficie: number
  /** Área del polígono sin superficie: fuera del levantamiento o en un hueco, m². */
  areaSinSuperficie: number
  /** Parte del área calculada sobre triángulos no comprobados, m². */
  areaNoComprobada: number
  /** Ninguna parte del área calculada es no comprobada. */
  comprobado: boolean
  /** Cotas de la superficie dentro de la zona; null si no hay superficie. */
  cotaMin: number | null
  cotaMax: number | null
  /** Cota media pesada por área. */
  cotaMedia: number | null
  /** m³ donde la superficie queda sobre la referencia. 0 sin referencia. */
  volumenCorte: number
  /** m³ donde la superficie queda bajo la referencia. 0 sin referencia. */
  volumenRelleno: number
  /** No hubo superficie dentro de la zona: los ceros no son «no hay nada», son «no se pudo». */
  sinDatos: boolean
}

/** Área con signo: positiva si el polígono va en sentido antihorario. */
function areaConSigno(pol: Punto2[]): number {
  if (pol.length === 0) return 0
  // relativo al primer vértice, para no perder cifras con coordenadas UTM
  const ox = pol[0]!.x
  const oy = pol[0]!.y
  let s = 0
  for (let i = 0; i < pol.length; i++) {
    const a = pol[i]!
    const b = pol[(i + 1) % pol.length]!
    s += (a.x - ox) * (b.y - oy) - (b.x - ox) * (a.y - oy)
  }
  return s / 2
}

/** Área en planta de un polígono, m², sin importar el sentido. */
export function areaPoligono(pol: Punto2[]): number {
  if (pol.length < 3) return 0
  return Math.abs(areaConSigno(pol))
}

/** El punto está dentro del polígono (cóncavo o no). */
export function dentroDePoligono(p: Punto2, pol: Punto2[]): boolean {
  let dentro = false
  for (let i = 0, j = pol.length - 1; i < pol.length; j = i++) {
    const a = pol[i]!
    const b = pol[j]!
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) dentro = !dentro
  }
  return dentro
}

/** El mismo polígono en sentido antihorario. */
function antihorario(pol: Punto2[]): Punto2[] {
  return areaConSigno(pol) < 0 ? [...pol].reverse() : pol
}

/** Recorta `pol` al semiplano donde f(x, y) = a + b·x + c·y ≥ 0. */
function recortarSemiplano(pol: Punto2[], f: PlanoTriangulo): Punto2[] {
  const fuera: Punto2[] = []
  const valor = (p: Punto2): number => f.a + f.b * p.x + f.c * p.y
  for (let i = 0; i < pol.length; i++) {
    const p = pol[i]!
    const q = pol[(i + 1) % pol.length]!
    const vp = valor(p)
    const vq = valor(q)
    if (vp >= 0) fuera.push(p)
    if ((vp >= 0) !== (vq >= 0)) {
      const t = vp / (vp - vq)
      fuera.push({ x: p.x + t * (q.x - p.x), y: p.y + t * (q.y - p.y) })
    }
  }
  return fuera
}

/** Recorta `pol` al triángulo (convexo) de vértices a, b, c en cualquier sentido. */
function recortarTriangulo(pol: Punto2[], a: Punto2, b: Punto2, c: Punto2): Punto2[] {
  const vert = areaConSigno([a, b, c]) >= 0 ? [a, b, c] : [a, c, b]
  let r = pol
  for (let i = 0; i < 3 && r.length > 0; i++) {
    const p = vert[i]!
    const q = vert[(i + 1) % 3]!
    // a la izquierda de p→q: (q − p) × (x − p) ≥ 0
    const dx = q.x - p.x
    const dy = q.y - p.y
    r = recortarSemiplano(r, { a: -(dx * p.y) + dy * p.x, b: -dy, c: dx })
  }
  return r
}

interface Momentos {
  area: number
  mx: number
  my: number
}

/** Área y momentos con signo (∫x, ∫y) de un polígono. */
function momentos(pol: Punto2[]): Momentos {
  let area = 0
  let mx = 0
  let my = 0
  for (let i = 0; i < pol.length; i++) {
    const p = pol[i]!
    const q = pol[(i + 1) % pol.length]!
    const cr = p.x * q.y - q.x * p.y
    area += cr
    mx += (p.x + q.x) * cr
    my += (p.y + q.y) * cr
  }
  return { area: area / 2, mx: mx / 6, my: my / 6 }
}

/** ∫ f sobre el polígono, con f lineal. */
function integral(m: Momentos, f: PlanoTriangulo): number {
  return f.a * m.area + f.b * m.mx + f.c * m.my
}

function cajaDe(pol: Punto2[]): [number, number, number, number] {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const p of pol) {
    if (p.x < x0) x0 = p.x
    if (p.y < y0) y0 = p.y
    if (p.x > x1) x1 = p.x
    if (p.y > y1) y1 = p.y
  }
  return [x0, y0, x1, y1]
}

/**
 * Plano del triángulo k en coordenadas locales: z = a + b·(x − o.x) + c·(y − o.y).
 * Las pendientes b y c no dependen del origen; `a` se arma desde un vértice
 * (no desde el plano absoluto, que ya perdió cifras).
 */
function planoLocal(sup: Superficie, k: number, o: Punto2): PlanoTriangulo {
  const { b, c } = planoDe(sup, k)
  const p = sup.puntos[sup.triangulos[k]!.a]!
  return { a: p.z + b * (o.x - p.x) + c * (o.y - p.y), b, c }
}

/**
 * Pedazos de `pol` (en coordenadas locales respecto a `o`) dentro de cada
 * triángulo de la superficie, con su plano local.
 */
function pedazos(
  sup: Superficie,
  pol: Punto2[],
  o: Punto2,
): { pol: Punto2[]; plano: PlanoTriangulo; comprobado: boolean }[] {
  const [x0, y0, x1, y1] = cajaDe(pol)
  const salida: { pol: Punto2[]; plano: PlanoTriangulo; comprobado: boolean }[] = []
  const local = (p: Punto2): Punto2 => ({ x: p.x - o.x, y: p.y - o.y })
  for (const k of triangulosCerca(sup, x0 + o.x, y0 + o.y, x1 + o.x, y1 + o.y)) {
    const t = sup.triangulos[k]!
    const r = recortarTriangulo(pol, local(sup.puntos[t.a]!), local(sup.puntos[t.b]!), local(sup.puntos[t.c]!))
    if (r.length < 3 || Math.abs(areaConSigno(r)) < 1e-12) continue
    salida.push({ pol: r, plano: planoLocal(sup, k, o), comprobado: t.comprobado })
  }
  return salida
}

const EPS_AREA = 1e-9

/**
 * Analiza la superficie dentro del polígono `zona` (en planta, cóncavo o no,
 * en cualquier sentido; no debe cruzarse a sí mismo).
 */
export function analizarZona(sup: Superficie, zona: Punto2[], opciones: OpcionesZona = {}): ResultadoZona {
  const areaPlanta = areaPoligono(zona)
  // origen local: la esquina SO de la caja de la zona
  const [ox, oy] = zona.length > 0 ? cajaDe(zona) : [0, 0]
  const o: Punto2 = { x: ox, y: oy }
  const pol = antihorario(zona.map((p) => ({ x: p.x - o.x, y: p.y - o.y })))
  const ref = opciones.referencia

  let area = 0
  let areaNoComprobada = 0
  let zIntegral = 0
  let cotaMin = Infinity
  let cotaMax = -Infinity
  let corte = 0
  let relleno = 0

  const sumar = (pieza: Punto2[], plano: PlanoTriangulo, comprobado: boolean, diferencia: PlanoTriangulo | null) => {
    const m = momentos(pieza)
    if (m.area < 1e-12) return
    area += m.area
    if (!comprobado) areaNoComprobada += m.area
    zIntegral += integral(m, plano)
    for (const p of pieza) {
      const z = plano.a + plano.b * p.x + plano.c * p.y
      if (z < cotaMin) cotaMin = z
      if (z > cotaMax) cotaMax = z
    }
    if (!diferencia) return
    const arriba = recortarSemiplano(pieza, diferencia)
    if (arriba.length >= 3) corte += integral(momentos(arriba), diferencia)
    const negada = { a: -diferencia.a, b: -diferencia.b, c: -diferencia.c }
    const abajo = recortarSemiplano(pieza, negada)
    if (abajo.length >= 3) relleno += integral(momentos(abajo), negada)
  }

  if (areaPlanta > 0) {
    for (const { pol: pieza, plano, comprobado } of pedazos(sup, pol, o)) {
      if (ref === undefined) {
        sumar(pieza, plano, comprobado, null)
      } else if (typeof ref === 'number') {
        sumar(pieza, plano, comprobado, { a: plano.a - ref, b: plano.b, c: plano.c })
      } else {
        for (const otro of pedazos(ref, pieza, o)) {
          sumar(otro.pol, plano, comprobado && otro.comprobado, {
            a: plano.a - otro.plano.a,
            b: plano.b - otro.plano.b,
            c: plano.c - otro.plano.c,
          })
        }
      }
    }
  }

  const sinDatos = area < EPS_AREA
  return {
    areaPlanta,
    areaConSuperficie: area,
    areaSinSuperficie: Math.max(0, areaPlanta - area),
    areaNoComprobada,
    // sin datos no hay nada comprobado: no pintar ✓ sobre «no se pudo calcular»
    comprobado: !sinDatos && areaNoComprobada < EPS_AREA,
    cotaMin: sinDatos ? null : cotaMin,
    cotaMax: sinDatos ? null : cotaMax,
    cotaMedia: sinDatos ? null : zIntegral / area,
    volumenCorte: Math.max(0, corte),
    volumenRelleno: Math.max(0, relleno),
    sinDatos,
  }
}
