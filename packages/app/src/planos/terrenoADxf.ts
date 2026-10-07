/**
 * Del motor de terreno al DXF: pasa las curvas de nivel (`curvasDeNivel`),
 * los puntos de la superficie y el trazo de un perfil (`perfilDeLinea`) a la
 * entrada de `escribirDxf`, sin volver a calcular nada. Lo no comprobado
 * sigue no comprobado: el motor lo marca por tramo y el DXF lo pone en sus
 * capas `…_NO_COMPROBADAS`.
 */

import type { Curva, PerfilLinea, PuntoTerreno, ResultadoCurvas } from '@topo/core'
import {
  escribirDxf,
  type CurvaSalida,
  type PerfilSalida,
  type PuntoSalida,
  type SalidaDxf,
  type TextoSalida,
} from './dxfSalida'

/** Una curva del motor tal cual: la forma es la misma (lo comprueba el compilador). */
export function curvaASalida(curva: Curva): CurvaSalida {
  return curva
}

/** Los puntos de la superficie, con su nombre y su comprobación. */
export function puntosASalida(puntos: readonly PuntoTerreno[]): PuntoSalida[] {
  return puntos.map((p) => ({ x: p.x, y: p.y, z: p.z, nombre: p.id, comprobado: p.comprobado }))
}

/**
 * El trazo en planta del perfil, partido donde la línea sale de la
 * superficie (no se dibuja terreno donde no lo hay). Cada pieza dice qué
 * tramos caen en triángulos comprobados.
 */
export function perfilEnPlanta(perfil: PerfilLinea): PerfilSalida[] {
  const piezas: PerfilSalida[] = []
  let actual: { puntos: { x: number; y: number }[]; tramos: boolean[] } | null = null
  const cerrar = () => {
    if (actual && actual.puntos.length >= 2) {
      piezas.push({
        puntos: actual.puntos,
        comprobado: actual.tramos.every(Boolean),
        tramosComprobados: actual.tramos,
      })
    }
    actual = null
  }
  const pts = perfil.puntos
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!
    const b = pts[i]!
    if (a.z === null || b.z === null || b.distancia - a.distancia <= 0) {
      if (a.z === null || b.z === null) cerrar()
      continue
    }
    const medio = (a.distancia + b.distancia) / 2
    const tramo = perfil.tramos.find((t) => t.dentro && t.desde <= medio && medio <= t.hasta)
    const comprobado = tramo?.comprobado ?? false
    if (!actual) actual = { puntos: [{ x: a.x, y: a.y }], tramos: [] }
    actual.puntos.push({ x: b.x, y: b.y })
    actual.tramos.push(comprobado)
  }
  cerrar()
  return piezas
}

export interface EntradaCurvasADxf {
  /** Lo que devolvió `curvasDeNivel`, o sus curvas. */
  curvas: ResultadoCurvas | readonly Curva[]
  /** Los puntos levantados (p. ej. `Superficie.puntos`), para que el CAD los muestre. */
  puntos?: readonly PuntoTerreno[]
  /** El perfil cuyo trazo se dibuja en planta. */
  perfil?: PerfilLinea
  textos?: TextoSalida[]
  /** Altura de los rótulos en metros del dibujo. Por defecto 1. */
  alturaTexto?: number
  /** Agrega la cota al nombre de cada punto. Por defecto no. */
  rotularCotaPuntos?: boolean
}

/** Escribe el DXF de las curvas de nivel (y, si vienen, puntos y trazo del perfil). */
export function curvasADxf(entrada: EntradaCurvasADxf): SalidaDxf {
  const curvas = 'curvas' in entrada.curvas ? entrada.curvas.curvas : entrada.curvas
  return escribirDxf({
    curvas: curvas.map(curvaASalida),
    puntos: entrada.puntos ? puntosASalida(entrada.puntos) : undefined,
    perfil: entrada.perfil ? perfilEnPlanta(entrada.perfil) : undefined,
    textos: entrada.textos,
    alturaTexto: entrada.alturaTexto,
    rotularCotaPuntos: entrada.rotularCotaPuntos,
  })
}
