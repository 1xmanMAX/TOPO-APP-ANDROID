import type { PistaCalibrada, PlanoImportado, Pista, Punto2 } from '@topo/core'
import type { LimitesPlano, UnidadesPlano } from '../../planos/dxf'

/**
 * Cuentas de PANTALLA del visor de planos: dónde cae un toque, cómo se
 * acerca y se encuadra. No hay aquí nada de topografía (progresivas, cotas,
 * pendientes): eso lo hace `@topo/core` (planos/geometria).
 *
 * El visor trabaja en el sistema propio del plano, con la Y hacia ARRIBA:
 * unidades de dibujo en un DXF y puntos PDF en un PDF (lo mismo que entrega
 * el lector de textos). Así la pista no depende del tamaño con que se pinte
 * la imagen del PDF, y la calibración es siempre `ejeY: 'arriba'`.
 * El SVG tiene la Y hacia abajo: un punto (x, y) del plano se dibuja en
 * (x, −y). Esa vuelta se hace solo aquí, en `aSvg` y `pantallaAMundo`.
 */

/** La ventana del SVG (su viewBox), en coordenadas del SVG. */
export interface Vista {
  x: number
  y: number
  ancho: number
  alto: number
}

export interface Rectangulo {
  left: number
  top: number
  width: number
  height: number
}

/** Un punto del plano en coordenadas del SVG (Y hacia abajo). */
export function aSvg(punto: Punto2): Punto2 {
  return { x: punto.x, y: -punto.y }
}

/** `points` de un <polyline> a partir de puntos del plano. */
export function puntosSvg(puntos: readonly Punto2[]): string {
  return puntos.map((p) => `${p.x},${-p.y}`).join(' ')
}

/**
 * Escala y márgenes con que el navegador encaja el viewBox en la caja
 * (preserveAspectRatio "xMidYMid meet", el de fábrica del SVG).
 */
function encaje(vista: Vista, caja: Rectangulo) {
  const escala = Math.min(caja.width / vista.ancho, caja.height / vista.alto)
  return {
    escala,
    margenX: (caja.width - vista.ancho * escala) / 2,
    margenY: (caja.height - vista.alto * escala) / 2,
  }
}

/** Un punto de la pantalla (clientX, clientY) en coordenadas del SVG. */
export function pantallaASvg(clienteX: number, clienteY: number, caja: Rectangulo, vista: Vista): Punto2 {
  const { escala, margenX, margenY } = encaje(vista, caja)
  return {
    x: vista.x + (clienteX - caja.left - margenX) / escala,
    y: vista.y + (clienteY - caja.top - margenY) / escala,
  }
}

/** Un punto de la pantalla en coordenadas del plano (Y hacia arriba). */
export function pantallaAMundo(clienteX: number, clienteY: number, caja: Rectangulo, vista: Vista): Punto2 {
  const enSvg = pantallaASvg(clienteX, clienteY, caja, vista)
  return { x: enSvg.x, y: -enSvg.y }
}

/** Cuántas unidades del plano mide un píxel de pantalla: para que rótulos y marcas no crezcan con el zoom. */
export function unidadesPorPixel(vista: Vista, caja: Pick<Rectangulo, 'width' | 'height'>): number {
  if (!(caja.width > 0) || !(caja.height > 0)) return vista.ancho / 800
  return 1 / Math.min(caja.width / vista.ancho, caja.height / vista.alto)
}

/** Acerca (factor > 1) o aleja (factor < 1) dejando quieto el punto `centro` del SVG. */
export function acercar(vista: Vista, centro: Punto2, factor: number): Vista {
  if (!(factor > 0) || !Number.isFinite(factor)) return vista
  return {
    x: centro.x - (centro.x - vista.x) / factor,
    y: centro.y - (centro.y - vista.y) / factor,
    ancho: vista.ancho / factor,
    alto: vista.alto / factor,
  }
}

/** Corre la vista lo que se arrastró, en coordenadas del SVG. */
export function desplazar(vista: Vista, dx: number, dy: number): Vista {
  return { ...vista, x: vista.x - dx, y: vista.y - dy }
}

/** Los límites (en el plano) de un montón de puntos; null si no hay ninguno con números. */
export function limitesDePuntos(puntos: Iterable<Punto2>): LimitesPlano | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of puntos) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  return minX === Infinity ? null : { minX, minY, maxX, maxY }
}

/** El rectángulo que abarca los dos. */
export function unirLimites(a: LimitesPlano | null, b: LimitesPlano | null): LimitesPlano | null {
  if (!a) return b
  if (!b) return a
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  }
}

/**
 * La vista que muestra entero ese rectángulo del plano, con un margen y con
 * la forma de la caja (así no quedan franjas vacías que confundan el toque).
 */
export function encuadrar(limites: LimitesPlano, caja?: Pick<Rectangulo, 'width' | 'height'>, margen = 0.05): Vista {
  let ancho = Math.max(limites.maxX - limites.minX, 1e-6)
  let alto = Math.max(limites.maxY - limites.minY, 1e-6)
  const cx = (limites.minX + limites.maxX) / 2
  // En el SVG la Y va al revés: el centro está en −cy.
  const cy = -(limites.minY + limites.maxY) / 2
  ancho *= 1 + 2 * margen
  alto *= 1 + 2 * margen
  if (caja && caja.width > 0 && caja.height > 0) {
    const forma = caja.width / caja.height
    if (ancho / alto > forma) alto = ancho / forma
    else ancho = alto * forma
  }
  return { x: cx - ancho / 2, y: cy - alto / 2, ancho, alto }
}

/**
 * Metros por unidad según las unidades que declara el DXF ($INSUNITS). Un
 * DXF que no las dice no se adivina: hay que calibrarlo.
 */
export function metrosPorUnidadDe(unidades: UnidadesPlano | undefined): number | null {
  switch (unidades) {
    case 'm':
      return 1
    case 'cm':
      return 0.01
    case 'mm':
      return 0.001
    case 'km':
      return 1000
    case 'pulg':
      return 0.0254
    case 'pie':
      return 0.3048
    default:
      return null
  }
}

/**
 * La pista del modelo, lista para calcular con la geometría del motor: le
 * pone la calibración de su plano y su progresiva de arranque. Sin plano
 * calibrado no hay metros, y devuelve null en vez de inventar una escala.
 */
export function pistaCalibrada(pista: Pista, plano: PlanoImportado | undefined): PistaCalibrada | null {
  if (!plano?.calibracion || !(plano.calibracion.metrosPorUnidad > 0)) return null
  const calibrada: PistaCalibrada = {
    id: pista.id,
    nombre: pista.nombre,
    polilinea: pista.polilinea,
    // El visor trabaja siempre con la Y hacia arriba (ver arriba).
    calibracion: { metrosPorUnidad: plano.calibracion.metrosPorUnidad, ejeY: plano.calibracion.ejeY ?? 'arriba' },
    progresivaInicio: pista.progresivaInicio ?? 0,
  }
  if (pista.calleId) calibrada.calleId = pista.calleId
  return calibrada
}

/** Dos polilíneas con los mismos vértices (para saber si un eje del DXF ya es una pista). */
export function mismaPolilinea(a: readonly Punto2[], b: readonly Punto2[]): boolean {
  if (a.length !== b.length) return false
  const iguales = (p: Punto2, q: Punto2) => Math.abs(p.x - q.x) < 1e-6 && Math.abs(p.y - q.y) < 1e-6
  return a.every((p, i) => iguales(p, b[i]!)) || a.every((p, i) => iguales(p, b[b.length - 1 - i]!))
}
