import {
  cotaEjeRasante,
  clasificarCotasDePista,
  largoPolilinea,
  opcionesDeInstrumento,
  progresivasDeLaToma,
  type Calle,
  type CotasMismaEstaca,
  type Id,
  type Instrumento,
  type OpcionesControles,
  type Perfil,
  type Pista,
  type PistaCalibrada,
  type PlanoImportado,
  type Proyecto,
  type Rasante,
} from '@topo/core'
import { leerDxf } from '../../planos/dxf'

/**
 * De dónde sale el perfil que se planifica:
 * - 'rasante': la cota de arranque y la pendiente de la calle (una sola
 *   pendiente, sin quiebres);
 * - 'plano': las cotas escritas en el plano a lo largo de la pista enlazada;
 * - 'digitado': vértices que el topógrafo escribe a mano (lo que ve en el
 *   expediente, o la pista empinada que el plano no trae).
 */
export type FuentePerfil = 'rasante' | 'plano' | 'digitado'

export interface Vertice {
  progresiva: number
  cota: number
}

/** La pista enlazada a la calle, si la hay. */
export function pistaDeLaCalle(proyecto: Proyecto, calleId: Id): Pista | undefined {
  return proyecto.pistas?.find((p) => p.calleId === calleId)
}

/**
 * La pista del modelo con la calibración de su plano, que es lo que pide la
 * geometría. Null si el plano no está o aún no se calibró: sin calibración
 * no hay metros, y adivinarlos movería todas las progresivas.
 */
export function pistaCalibrada(pista: Pista, plano: PlanoImportado | undefined): PistaCalibrada | null {
  if (!plano?.calibracion || pista.polilinea.length < 2) return null
  return {
    id: pista.id,
    nombre: pista.nombre,
    polilinea: pista.polilinea,
    calibracion: plano.calibracion,
    progresivaInicio: pista.progresivaInicio ?? 0,
    ...(pista.calleId ? { calleId: pista.calleId } : {}),
  }
}

/** Largo de la pista en metros de obra. */
export function largoDePista(pista: PistaCalibrada): number {
  return largoPolilinea(pista.polilinea) * pista.calibracion.metrosPorUnidad
}

/**
 * Desde y hasta qué progresiva se planifica si nadie lo dijo: lo que mide la
 * pista; si no hay pista, lo que abarcan las progresivas de sus tomas; y si
 * tampoco, cien metros desde el arranque de la rasante (o desde 0+000).
 */
export function extremosSugeridos(calle: Calle, pista: PistaCalibrada | null): { desde: number; hasta: number } {
  if (pista) {
    const largo = largoDePista(pista)
    if (largo > 0)
      return {
        desde: pista.progresivaInicio,
        hasta: pista.progresivaInicio + largo,
      }
  }
  const progresivas = calle.nivelaciones.flatMap((n) => n.tomas.flatMap((t) => progresivasDeLaToma(t)))
  if (progresivas.length > 0) {
    const desde = Math.min(...progresivas)
    const hasta = Math.max(...progresivas)
    if (hasta > desde) return { desde, hasta }
  }
  const desde = calle.rasante?.progresivaArranque ?? 0
  return { desde, hasta: desde + 100 }
}

/**
 * El perfil de la rasante entre dos progresivas. La rasante de la app tiene
 * una sola pendiente, así que son dos vértices: el planificador no verá
 * quiebres que la rasante no declara.
 */
export function perfilDeRasante(rasante: Rasante, desde: number, hasta: number): Vertice[] {
  return [
    { progresiva: desde, cota: cotaEjeRasante(rasante, desde) },
    { progresiva: hasta, cota: cotaEjeRasante(rasante, hasta) },
  ]
}

export interface CotasDelPlano {
  vertices: Vertice[]
  /** Estacas con cotas distintas que alguien tiene que decidir (no entran al perfil). */
  conflictos: CotasMismaEstaca[]
  /** Por qué no hay cotas, en palabras; null si las hay. */
  motivo: string | null
}

/**
 * Las cotas del plano a lo largo de la pista. Solo DXF por ahora: los textos
 * de un PDF se leen de forma asíncrona y en el sistema de la imagen que
 * pinta la pantalla del plano, y mezclar sistemas pondría las cotas en otro
 * lugar (ver la regla de oro en planos/geometria del motor).
 */
export function cotasDelPlano(
  plano: PlanoImportado | undefined,
  bytes: Uint8Array | undefined,
  pista: PistaCalibrada | null,
): CotasDelPlano {
  const nada = (motivo: string): CotasDelPlano => ({
    vertices: [],
    conflictos: [],
    motivo,
  })
  if (!plano) return nada('la pista no tiene su plano')
  if (!pista) return nada('el plano de la pista aún no está calibrado')
  if (plano.formato !== 'dxf') return nada('las cotas de un plano PDF todavía no se leen aquí; digítalas')
  if (!bytes) return nada('falta el archivo del plano (vuelve a importarlo)')
  let textos
  try {
    textos = leerDxf(new TextDecoder().decode(bytes)).textos
  } catch {
    return nada('no se pudo leer el DXF del plano')
  }
  const { cercanas, conflictos } = clasificarCotasDePista(
    pista,
    textos.map((t) => ({ x: t.x, y: t.y, valor: t.valor })),
  )
  const vertices = cercanas.map((c) => ({
    progresiva: c.progresiva,
    cota: c.cota,
  }))
  if (vertices.length < 2) {
    return {
      vertices,
      conflictos,
      motivo: 'el plano no trae al menos dos cotas a lo largo de la pista',
    }
  }
  return { vertices, conflictos, motivo: null }
}

/** Las reglas del plan: las del instrumento de la obra (una sola fuente). */
export function opcionesDelPlan(instrumento: Partial<Instrumento> | undefined): Partial<OpcionesControles> {
  return opcionesDeInstrumento(instrumento)
}

/** Dos listas de vértices iguales al milímetro. */
export function mismosVertices(a: Perfil, b: Perfil): boolean {
  return (
    a.length === b.length &&
    a.every((v, i) => Math.abs(v.progresiva - b[i]!.progresiva) < 5e-4 && Math.abs(v.cota - b[i]!.cota) < 5e-4)
  )
}
