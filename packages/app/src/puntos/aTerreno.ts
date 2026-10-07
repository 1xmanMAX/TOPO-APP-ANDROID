/**
 * Del archivo leído a la superficie: convierte los puntos de estación total o
 * GNSS (`lectores.ts`) en `PuntoTerreno` del motor (`triangular`), amarrados
 * al sistema del plano si hace falta.
 *
 * Reglas (spec 2026-10-05 §3 y spec 2026-10-06):
 * - Nada se descarta en silencio: el punto sin cota no entra a la superficie
 *   (no se inventa) y se dice con su nombre y su línea.
 * - Un GNSS solo es comprobado si su solución fue FIJA. Si el archivo no dice
 *   la solución, no se sabe, y entonces tampoco es comprobado.
 * - El amarre mueve este y norte; la cota no. Si los dos levantamientos
 *   parten de BM distintos, la diferencia de cota se declara aparte
 *   (`desplazamientoCota`), a la vista, y no se esconde en el amarre.
 */

import { aplicarAmarre, type Amarre, type OrigenPunto, type ParDeAmarre, type PuntoTerreno } from '@topo/core'
import { esSolucionFija, type PuntoLeido } from './lectores'

export interface OpcionesATerreno {
  origen: OrigenPunto
  /**
   * Si las cotas del conjunto están comprobadas (estación con su poligonal
   * cerrada, nivelación cerrada…). Lo declara quien sabe cómo se midió; en
   * GNSS, además, cada punto tiene que tener solución fija.
   */
  comprobado: boolean
  /** Amarre al sistema del plano (`calcularAmarre`). Null o ausente: las coordenadas quedan como vienen. */
  amarre?: Amarre | null
  /** Metros que se suman a cada cota (p. ej. cota del BM real − cota supuesta en campo). */
  desplazamientoCota?: number
  /**
   * Se antepone al nombre de cada punto. Sirve al juntar dos archivos que
   * numeran desde 1: «E1» de la estación y «E1» del GNSS dejan de confundirse
   * en los avisos.
   */
  prefijoId?: string
}

export interface PuntosParaTerreno {
  puntos: PuntoTerreno[]
  /** Lo que no entró y por qué, y lo que entró pero no está comprobado. */
  avisos: string[]
}

function texto3(n: number): string {
  return n.toFixed(3)
}

/** Convierte los puntos leídos en puntos de terreno, listos para `triangular`. */
export function puntosATerreno(leidos: readonly PuntoLeido[], opciones: OpcionesATerreno): PuntosParaTerreno {
  const avisos: string[] = []
  const dz = opciones.desplazamientoCota ?? 0
  if (!Number.isFinite(dz)) {
    throw new Error(`El desplazamiento de cota debe ser un número de metros (llegó ${opciones.desplazamientoCota}).`)
  }
  const prefijo = opciones.prefijoId ?? ''
  const puntos: PuntoTerreno[] = []
  const sinCota: string[] = []
  const noFijos: string[] = []
  const sinSolucion: string[] = []

  for (const p of leidos) {
    const id = prefijo + p.id
    if (p.z === null || !Number.isFinite(p.z)) {
      sinCota.push(`${id} (línea ${p.linea})`)
      continue
    }
    let comprobado = opciones.comprobado
    if (opciones.origen === 'gnss') {
      if (p.solucion === null) {
        sinSolucion.push(id)
        comprobado = false
      } else if (!esSolucionFija(p.solucion)) {
        noFijos.push(`${id} (${p.solucion})`)
        comprobado = false
      }
    }
    const xy = opciones.amarre ? aplicarAmarre(opciones.amarre, p) : { x: p.x, y: p.y }
    const punto: PuntoTerreno = { id, x: xy.x, y: xy.y, z: p.z + dz, origen: opciones.origen, comprobado }
    if (p.codigo) punto.codigo = p.codigo
    puntos.push(punto)
  }

  if (sinCota.length > 0) {
    avisos.push(
      `${sinCota.length === 1 ? 'Un punto no tiene' : `${sinCota.length} puntos no tienen`} cota y no ` +
        `${sinCota.length === 1 ? 'entra' : 'entran'} a la superficie: ${sinCota.join(', ')}.`,
    )
  }
  if (noFijos.length > 0) {
    avisos.push(`Sin solución fija, entran como no comprobados: ${noFijos.join(', ')}.`)
  }
  if (sinSolucion.length > 0) {
    avisos.push(
      `El archivo no dice la solución del GNSS de ${sinSolucion.length} punto${sinSolucion.length === 1 ? '' : 's'}: ` +
        'entran como no comprobados.',
    )
  }
  if (dz !== 0) {
    avisos.push(`A todas las cotas se les sumó ${dz > 0 ? '+' : ''}${texto3(dz)} m.`)
  }
  if (opciones.amarre) {
    const a = opciones.amarre
    avisos.push(
      `Coordenadas amarradas: giro ${a.rotacionGrados.toFixed(4)}°, escala ${a.escala.toFixed(6)}, ` +
        `traslación ${texto3(a.tx)} / ${texto3(a.ty)} m.`,
    )
  }
  return { puntos, avisos }
}

/**
 * Los pares para `calcularAmarre` con los puntos que tienen el mismo nombre
 * en los dos archivos (la estación, los BM, las estacas comunes). Si un
 * nombre se repite en un archivo no se usa: no se sabe cuál es.
 */
export function paresPorNombre(origen: readonly PuntoLeido[], destino: readonly PuntoLeido[]): ParDeAmarre[] {
  const unicos = (lista: readonly PuntoLeido[]) => {
    const vistos = new Map<string, PuntoLeido | null>()
    for (const p of lista) vistos.set(p.id, vistos.has(p.id) ? null : p)
    return vistos
  }
  const enDestino = unicos(destino)
  const pares: ParDeAmarre[] = []
  for (const [id, p] of unicos(origen)) {
    const q = enDestino.get(id)
    if (!p || !q) continue
    pares.push({ id, origen: { x: p.x, y: p.y }, destino: { x: q.x, y: q.y } })
  }
  return pares
}
