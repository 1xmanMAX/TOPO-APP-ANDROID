import {
  calcularCampania,
  construirGrilla,
  type Calle,
  type Campania,
  type Capa,
  type Plantilla,
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

export function useContexto(): ContextoCampania | null {
  const proyecto = useAlmacen((s) => s.proyecto)
  const campaniaActivaId = useAlmacen((s) => s.campaniaActivaId)

  return useMemo(() => {
    const campania = proyecto.campanias.find((c) => c.id === campaniaActivaId)
    if (!campania) return null
    const calle = proyecto.calles.find((c) => c.id === campania.calleId)
    if (!calle) return null
    const plantilla = proyecto.plantillas.find((p) => p.id === calle.plantillaId)
    if (!plantilla) return null
    return { campania, calle, plantilla, capa: proyecto.capas.find((c) => c.id === campania.capaId) }
  }, [proyecto, campaniaActivaId])
}

/** Recalcula solo cuando cambian el proyecto o la campaña activa. */
export function useResultado(): ResultadoCampania | null {
  const bms = useAlmacen((s) => s.proyecto.bms)
  const contexto = useContexto()

  return useMemo(() => {
    if (!contexto) return null
    return calcularCampania({
      campania: contexto.campania,
      calle: contexto.calle,
      plantilla: contexto.plantilla,
      bms,
    })
  }, [contexto, bms])
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
