import {
  calcularCampania,
  construirGrilla,
  type Calle,
  type Campania,
  type Capa,
  type Id,
  type Plantilla,
  type Proyecto,
  type ResultadoCampania,
} from '@topo/core'
import { useMemo } from 'react'
import { useAlmacen } from './almacen'

export interface ContextoCampania {
  campania: Campania
  calle: Calle
  plantilla: Plantilla
  capa: Capa | undefined
}

/** Datos que una campaña necesita para calcularse. */
function contextoDe(proyecto: Proyecto, campaniaId: Id | null): ContextoCampania | null {
  const campania = proyecto.campanias.find((c) => c.id === campaniaId)
  if (!campania) return null
  const calle = proyecto.calles.find((c) => c.id === campania.calleId)
  if (!calle) return null
  const plantilla = proyecto.plantillas.find((p) => p.id === calle.plantillaId)
  if (!plantilla) return null
  return { campania, calle, plantilla, capa: proyecto.capas.find((c) => c.id === campania.capaId) }
}

export function useContexto(): ContextoCampania | null {
  const proyecto = useAlmacen((s) => s.proyecto)
  const campaniaActivaId = useAlmacen((s) => s.campaniaActivaId)

  return useMemo(() => contextoDe(proyecto, campaniaActivaId), [proyecto, campaniaActivaId])
}

/** Calcula la campaña pedida. Recalcula solo cuando cambian el proyecto o el id. */
export function useResultadoDe(campaniaId: Id | null): ResultadoCampania | null {
  const proyecto = useAlmacen((s) => s.proyecto)

  return useMemo(() => {
    const contexto = contextoDe(proyecto, campaniaId)
    if (!contexto) return null
    return calcularCampania({
      campania: contexto.campania,
      calle: contexto.calle,
      plantilla: contexto.plantilla,
      bms: proyecto.bms,
    })
  }, [proyecto, campaniaId])
}

/**
 * Calcula varias campañas a la vez. La lista de ids se compara por contenido
 * y no por identidad: quien llama la arma en cada dibujado y no tiene por qué
 * acordarse de memoizarla.
 */
export function useResultadosDe(campaniaIds: Id[]): Map<Id, ResultadoCampania> {
  const proyecto = useAlmacen((s) => s.proyecto)
  const clave = campaniaIds.join(',')

  return useMemo(() => {
    const salida = new Map<Id, ResultadoCampania>()
    for (const id of clave === '' ? [] : clave.split(',')) {
      const contexto = contextoDe(proyecto, id)
      if (!contexto) continue
      salida.set(
        id,
        calcularCampania({
          campania: contexto.campania,
          calle: contexto.calle,
          plantilla: contexto.plantilla,
          bms: proyecto.bms,
        }),
      )
    }
    return salida
  }, [proyecto, clave])
}

/** Recalcula solo cuando cambian el proyecto o la campaña activa. */
export function useResultado(): ResultadoCampania | null {
  const campaniaActivaId = useAlmacen((s) => s.campaniaActivaId)
  return useResultadoDe(campaniaActivaId)
}

/**
 * Progresivas de la calle activa, tomadas de la grilla completa y no solo de lo
 * medido: la tabla deja elegir celdas vacías, y el deslizador tiene que poder
 * seguir al usuario hasta ellas.
 */
export function useProgresivas(): number[] {
  const contexto = useContexto()

  return useMemo(() => {
    if (!contexto) return []
    try {
      const celdas = construirGrilla(contexto.calle, contexto.plantilla)
      return [...new Set(celdas.map((celda) => celda.progresiva))].sort((a, b) => a - b)
    } catch {
      return []
    }
  }, [contexto])
}
