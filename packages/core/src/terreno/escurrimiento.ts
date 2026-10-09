/**
 * Por dónde se va el agua en una zona de puntos nivelados.
 *
 * Max controla la cota de unos puntos en una zona complicada (varias
 * intersecciones juntas) para que, cuando llueva fuerte, el agua vaya por
 * donde él quiere y no se empoce. Con los puntos y sus cotas:
 *
 *  - se arma la superficie (la triangulación de `triangulacion.ts`, sin
 *    quitar triángulos: la zona la definen sus puntos);
 *  - en cada triángulo, la dirección en que baja el agua (la de máxima
 *    pendiente) y cuánto baja, y si es tan plano que puede empozar;
 *  - entre cada par de puntos vecinos, la pendiente;
 *  - desde cada punto, el camino del agua siguiendo al vecino más bajo por
 *    la mayor pendiente, hasta donde se detiene: una salida que él marcó
 *    (sumidero, cuneta, canal), el borde de la zona (se va fuera de lo
 *    nivelado) o un punto más bajo que todos sus vecinos, donde se empoza.
 *
 * Las coordenadas van en metros (para que las pendientes sean %). Con un
 * plano sin escala, las direcciones y los caminos siguen valiendo —la escala
 * es la misma en todas direcciones—, pero los porcentajes no: quien llama lo
 * dice (`sinEscala`).
 */
import { planoDe, triangular, type PuntoTerreno } from './triangulacion'

export interface PuntoEscurrimiento {
  id: string
  /** Cómo se llama en pantalla: «7». */
  nombre: string
  x: number
  y: number
  z: number
  /** Es por donde el agua tiene que salir: sumidero, cuneta, canal. */
  salida: boolean
}

export interface OpcionesEscurrimiento {
  /** Por debajo de esta pendiente (%), un triángulo es plano: el agua se queda. Por defecto 0.5 %. */
  pendienteMinimaPct?: number
}

export const PENDIENTE_MINIMA_DRENAJE_PCT = 0.5

/** Menos de esto (m) de desnivel no cuenta como bajar: es el milímetro de la mira. */
const DESNIVEL_MINIMO = 0.0005

export type FinDelAgua = 'salida' | 'borde' | 'empoza'

export interface CaminoDelAgua {
  /** Los ids por donde pasa, del punto de partida al final. */
  camino: string[]
  fin: FinDelAgua
  /** El id donde termina. */
  hasta: string
}

export interface TrianguloEscurrimiento {
  /** Ids de sus tres vértices. */
  ids: [string, string, string]
  centro: { x: number; y: number }
  /** Hacia dónde baja el agua, vector unitario; null si es perfectamente horizontal. */
  direccion: { x: number; y: number } | null
  /** Pendiente máxima del triángulo, %. */
  pendientePct: number
  /** Más plano que la pendiente mínima: el agua puede quedarse. */
  plano: boolean
}

export interface AristaEscurrimiento {
  /** Va del punto más alto al más bajo. */
  alto: string
  bajo: string
  /** Metros en planta. */
  distancia: number
  /** Metros, siempre ≥ 0. */
  desnivel: number
  /** %, siempre ≥ 0. */
  pendientePct: number
}

export type ResultadoEscurrimiento =
  | {
      ok: true
      triangulos: TrianguloEscurrimiento[]
      aristas: AristaEscurrimiento[]
      /** Por id de punto. */
      caminos: Map<string, CaminoDelAgua>
      /** Puntos donde el agua se detiene sin salida (más bajos que todos sus vecinos). */
      empozan: string[]
      /** Puntos del borde por donde el agua se va de la zona. */
      salePorBorde: string[]
      /** Puntos que están en el borde de la zona. */
      enBorde: Set<string>
      avisos: string[]
    }
  | { ok: false; error: string }

/**
 * El análisis entero. Los puntos sin cota numérica o repetidos los avisa la
 * triangulación; con menos de tres puntos útiles no hay superficie.
 */
export function analizarEscurrimiento(
  entrada: PuntoEscurrimiento[],
  opciones: OpcionesEscurrimiento = {},
): ResultadoEscurrimiento {
  const minima = Number.isFinite(opciones.pendienteMinimaPct) && opciones.pendienteMinimaPct! >= 0
    ? opciones.pendienteMinimaPct!
    : PENDIENTE_MINIMA_DRENAJE_PCT
  const validos = entrada.filter((p) => [p.x, p.y, p.z].every(Number.isFinite))
  if (validos.length < 3) {
    return { ok: false, error: 'Hacen falta al menos 3 puntos con cota para saber por dónde va el agua.' }
  }
  const porId = new Map(validos.map((p) => [p.id, p]))

  // Sin quitar triángulos: un lado máximo mayor que la zona entera.
  const xs = validos.map((p) => p.x)
  const ys = validos.map((p) => p.y)
  const diagonal = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
  const sup = triangular(
    validos.map((p): PuntoTerreno => ({ id: p.id, x: p.x, y: p.y, z: p.z, origen: 'nivel', comprobado: true })),
    { ladoMaximo: Math.max(1, diagonal * 2) },
  )
  const avisos = sup.avisos.filter((a) => a.tipo !== 'lado-maximo').map((a) => a.mensaje)
  if (sup.triangulos.length === 0) {
    return {
      ok: false,
      error: 'Los puntos no forman una superficie (¿están todos en una línea?). Pon puntos a los dos lados.',
    }
  }

  const P = sup.puntos
  const vecinos = new Map<number, Set<number>>()
  const usosDeArista = new Map<string, number>()
  const unir = (i: number, j: number) => {
    if (!vecinos.has(i)) vecinos.set(i, new Set())
    if (!vecinos.has(j)) vecinos.set(j, new Set())
    vecinos.get(i)!.add(j)
    vecinos.get(j)!.add(i)
    const clave = i < j ? `${i}|${j}` : `${j}|${i}`
    usosDeArista.set(clave, (usosDeArista.get(clave) ?? 0) + 1)
  }

  const triangulos: TrianguloEscurrimiento[] = sup.triangulos.map((t, k) => {
    unir(t.a, t.b)
    unir(t.b, t.c)
    unir(t.c, t.a)
    const { b, c } = planoDe(sup, k)
    const g = Math.hypot(b, c)
    const pendientePct = g * 100
    const [pa, pb, pc] = [P[t.a]!, P[t.b]!, P[t.c]!]
    return {
      ids: [pa.id, pb.id, pc.id],
      centro: { x: (pa.x + pb.x + pc.x) / 3, y: (pa.y + pb.y + pc.y) / 3 },
      direccion: g > 1e-12 ? { x: -b / g, y: -c / g } : null,
      pendientePct,
      plano: pendientePct < minima,
    }
  })

  const enBorde = new Set<string>()
  for (const [clave, usos] of usosDeArista) {
    if (usos !== 1) continue
    const [i, j] = clave.split('|').map(Number) as [number, number]
    enBorde.add(P[i]!.id)
    enBorde.add(P[j]!.id)
  }

  const aristas: AristaEscurrimiento[] = [...usosDeArista.keys()].map((clave) => {
    const [i, j] = clave.split('|').map(Number) as [number, number]
    const [alto, bajo] = P[i]!.z >= P[j]!.z ? [P[i]!, P[j]!] : [P[j]!, P[i]!]
    const distancia = Math.hypot(alto.x - bajo.x, alto.y - bajo.y)
    const desnivel = alto.z - bajo.z
    return { alto: alto.id, bajo: bajo.id, distancia, desnivel, pendientePct: distancia > 0 ? (desnivel / distancia) * 100 : 0 }
  })

  // El vecino al que se va el agua desde cada punto: el de mayor pendiente hacia abajo.
  const siguiente = new Map<number, number | null>()
  for (let i = 0; i < P.length; i++) {
    let mejor: number | null = null
    let mejorPendiente = 0
    for (const j of vecinos.get(i) ?? []) {
      const desnivel = P[i]!.z - P[j]!.z
      if (desnivel <= DESNIVEL_MINIMO) continue
      const pendiente = desnivel / Math.hypot(P[i]!.x - P[j]!.x, P[i]!.y - P[j]!.y)
      if (pendiente > mejorPendiente) {
        mejorPendiente = pendiente
        mejor = j
      }
    }
    siguiente.set(i, mejor)
  }

  const caminos = new Map<string, CaminoDelAgua>()
  for (let i = 0; i < P.length; i++) {
    const camino = [P[i]!.id]
    let actual = i
    // La cota baja en cada paso, así que el camino no puede volver sobre sí mismo.
    while (!porId.get(P[actual]!.id)?.salida) {
      const s = siguiente.get(actual)
      if (s === null || s === undefined) break
      actual = s
      camino.push(P[actual]!.id)
    }
    const hasta = P[actual]!.id
    const fin: FinDelAgua = porId.get(hasta)?.salida ? 'salida' : enBorde.has(hasta) ? 'borde' : 'empoza'
    caminos.set(P[i]!.id, { camino, fin, hasta })
  }

  const finales = [...caminos.values()]
  const unicos = (f: FinDelAgua) => [...new Set(finales.filter((c) => c.fin === f).map((c) => c.hasta))]
  return {
    ok: true,
    triangulos,
    aristas,
    caminos,
    empozan: unicos('empoza'),
    salePorBorde: unicos('borde'),
    enBorde,
    avisos,
  }
}
