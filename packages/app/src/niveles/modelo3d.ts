import type { Calibracion, FinDelAgua, NivelesEnPlano } from '@topo/core'
import type { AnalisisEnPlano } from './enPlano'

/**
 * El modelo 3D del agua: los puntos leídos en el plano levantados a su cota,
 * unidos en triángulos (los mismos del análisis de escurrimiento), con
 * hacia dónde cae el agua en cada uno y el camino que sigue el agua de cada
 * punto. En metros, con el centro del dibujo en (0, 0) y la cota más baja
 * en 0: así la cámara gira alrededor de la zona y no de un punto en UTM.
 *
 * Aquí no se calcula nada nuevo de topografía: todo sale de `analizarPlano`.
 */

export interface VerticeModelo {
  id: string
  nombre: string
  nota?: string
  x: number
  y: number
  /** Metros sobre la cota más baja del modelo. */
  z: number
  /** La cota de verdad, para rotularla. */
  cota: number
  salida: boolean
  /** Lo medido en las calles (no es un punto del plano). */
  medido: boolean
  /** Adónde llega el agua que cae en este punto. */
  fin: FinDelAgua | null
}

export interface TrianguloModelo {
  ids: [string, string, string]
  /** Menos pendiente que la mínima: ahí el agua se queda o corre muy lento. */
  plano: boolean
  pendientePct: number
  /** Hacia dónde baja el agua, en planta (vector unitario); null si está a nivel. */
  direccion: { x: number; y: number } | null
}

export interface ModeloAgua {
  vertices: Map<string, VerticeModelo>
  triangulos: TrianguloModelo[]
  /** El camino del agua de cada punto, de vértice en vértice, hasta donde termina. */
  caminos: { desde: string; ids: string[]; fin: FinDelAgua }[]
  /** Lo que miden la zona (lado mayor en planta) y el desnivel, en metros. */
  ancho: number
  desnivel: number
  /** Si las distancias están en metros (el plano tiene escala). */
  enMetros: boolean
}

/** El modelo, o null si todavía no hay análisis (menos de 3 puntos leídos o puntos en línea). */
export function modeloDelAgua(niveles: NivelesEnPlano, analisis: AnalisisEnPlano, calibracion: Calibracion | null): ModeloAgua | null {
  const r = analisis.resultado
  if (!r?.ok) return null
  const k = calibracion?.metrosPorUnidad ?? 1
  const crudos: Omit<VerticeModelo, 'z' | 'fin'>[] = []
  for (const p of niveles.puntos) {
    const cota = analisis.cotas.get(p.id)
    if (cota === undefined) continue
    crudos.push({ id: p.id, nombre: p.nombre, ...(p.nota ? { nota: p.nota } : {}), x: p.x * k, y: p.y * k, cota, salida: p.salida, medido: false })
  }
  for (const m of analisis.medidos) crudos.push({ id: m.id, nombre: m.nombre, x: m.x * k, y: m.y * k, cota: m.cota, salida: false, medido: true })
  if (crudos.length < 3) return null

  const cx = crudos.reduce((s, v) => s + v.x, 0) / crudos.length
  const cy = crudos.reduce((s, v) => s + v.y, 0) / crudos.length
  const zMin = Math.min(...crudos.map((v) => v.cota))
  const zMax = Math.max(...crudos.map((v) => v.cota))
  const vertices = new Map<string, VerticeModelo>()
  for (const v of crudos) {
    vertices.set(v.id, { ...v, x: v.x - cx, y: v.y - cy, z: v.cota - zMin, fin: r.caminos.get(v.id)?.fin ?? null })
  }
  const xs = crudos.map((v) => v.x)
  const ys = crudos.map((v) => v.y)
  return {
    vertices,
    triangulos: r.triangulos
      .filter((t) => t.ids.every((id) => vertices.has(id)))
      .map((t) => ({ ids: t.ids, plano: t.plano, pendientePct: t.pendientePct, direccion: t.direccion })),
    caminos: [...r.caminos.entries()]
      .filter(([id]) => vertices.has(id))
      .map(([desde, c]) => ({ desde, ids: c.camino.filter((id) => vertices.has(id)), fin: c.fin })),
    ancho: Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)),
    desnivel: zMax - zMin,
    enMetros: calibracion !== null,
  }
}

/**
 * Cuánto estirar las cotas para que el relieve se lea: que el desnivel
 * ocupe más o menos un cuarto del ancho de la zona. Una plataforma de 40 m
 * con 30 cm de caída se ve plana sin exagerar (0.75 %); con ×33 ya se lee.
 */
export function exageracionSugerida(m: Pick<ModeloAgua, 'ancho' | 'desnivel'>): number {
  if (!(m.desnivel > 0) || !(m.ancho > 0)) return 1
  return Math.min(200, Math.max(1, Math.round((0.25 * m.ancho) / m.desnivel)))
}

/** La cota z del plano que pasa por los tres vértices, en el punto (x, y). */
export function cotaEnTriangulo(a: VerticeModelo, b: VerticeModelo, c: VerticeModelo, x: number, y: number): number {
  const ux = b.x - a.x
  const uy = b.y - a.y
  const uz = b.z - a.z
  const vx = c.x - a.x
  const vy = c.y - a.y
  const vz = c.z - a.z
  // Normal = u × v; el plano: n·(p − a) = 0.
  const nx = uy * vz - uz * vy
  const ny = uz * vx - ux * vz
  const nz = ux * vy - uy * vx
  if (nz === 0) return (a.z + b.z + c.z) / 3
  return a.z - (nx * (x - a.x) + ny * (y - a.y)) / nz
}
