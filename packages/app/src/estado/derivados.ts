import {
  calcularCampania,
  construirGrilla,
  evaluarContraRasante,
  progresivasMedidas,
  type Calle,
  type Capa,
  type Id,
  type Proyecto,
  type ResultadoCampania,
  type ResultadoEvaluacion,
  type Toma,
} from '@topo/core'
import { useMemo } from 'react'
import { useAlmacen } from './almacen'
import { buscarToma } from './proyectoTomas'

export interface ContextoCampania {
  campania: Toma
  calle: Calle
  capa: Capa | undefined
}

/** Datos que una campaña necesita para calcularse. */
function contextoDe(proyecto: Proyecto, campaniaId: Id | null): ContextoCampania | null {
  const hallado = buscarToma(proyecto, campaniaId)
  if (!hallado) return null
  const calle = proyecto.calles.find((c) => c.id === hallado.calleId)
  if (!calle) return null
  return { campania: hallado.toma, calle, capa: proyecto.capas.find((c) => c.id === hallado.toma.capaId) }
}

export function useContexto(): ContextoCampania | null {
  const proyecto = useAlmacen((s) => s.proyecto)
  const campaniaActivaId = useAlmacen((s) => s.campaniaActivaId)

  return useMemo(() => contextoDe(proyecto, campaniaActivaId), [proyecto, campaniaActivaId])
}

/** Calle y capa de cualquier campaña, no solo la activa — para armar la cabecera de una comparación. */
export function useContextoDe(campaniaId: Id | null): ContextoCampania | null {
  const proyecto = useAlmacen((s) => s.proyecto)

  return useMemo(() => contextoDe(proyecto, campaniaId), [proyecto, campaniaId])
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
 * Compara lo medido en una campaña contra la rasante de su calle, celda por
 * celda. Null si falta cualquier ingrediente — calle, rasante o el resultado
 * calculado — porque entonces no hay nada que evaluar; eso no es un fallo, es
 * una calle que todavía no tiene rasante. Si algo más falla, el error vive
 * dentro de `ResultadoEvaluacion.error` y llega tal cual a quien consuma
 * esto: este hook no lo esconde ni lo reinterpreta.
 */
export function useEvaluacionRasante(campaniaId?: Id): ResultadoEvaluacion | null {
  const proyecto = useAlmacen((s) => s.proyecto)
  const campaniaActivaId = useAlmacen((s) => s.campaniaActivaId)
  const idEfectivo = campaniaId ?? campaniaActivaId
  const resultado = useResultadoDe(idEfectivo)

  return useMemo(() => {
    const contexto = contextoDe(proyecto, idEfectivo)
    if (!contexto || !contexto.calle.rasante || !resultado) return null
    return evaluarContraRasante({
      resultado,
      calle: contexto.calle,
      toma: contexto.campania,
      rasante: contexto.calle.rasante,
      capas: proyecto.capas,
      capaId: contexto.campania.capaId,
    })
  }, [proyecto, idEfectivo, resultado])
}

/**
 * Progresivas de la campaña activa, las que de verdad se midieron: ya no
 * salen de un rango configurado en la calle (que no existe), así que no hay
 * «progresivas pendientes» que enseñar antes de haber tomado la primera
 * lectura ahí. Es el mismo criterio que `construirGrilla` en todo lo demás.
 */
export function useProgresivas(): number[] {
  const contexto = useContexto()

  return useMemo(() => {
    if (!contexto) return []
    const celdas = construirGrilla(contexto.calle, progresivasMedidas(contexto.campania.estaciones))
    return [...new Set(celdas.map((celda) => celda.progresiva))].sort((a, b) => a - b)
  }, [contexto])
}
