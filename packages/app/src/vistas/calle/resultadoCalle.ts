import { calcularCampania, evaluarContraRasante, instrumentoCompleto, type ResultadoCampania, type ResultadoEvaluacion } from '@topo/core'
import { useMemo } from 'react'
import { useAlmacen } from '../../estado/almacen'
import { useContexto } from '../../estado/derivados'

/**
 * La toma activa calculada con la mira del proyecto. `useResultado` de
 * estado/derivados calcula con la mira de fábrica; si el proyecto dice otra
 * (p. ej. 4 m), una lectura de 4.5 llenaría la celda aquí mientras el aviso
 * al anotar y el cierre en vivo la declaran imposible. Las fichas de la calle
 * leen de aquí para que las tres cuenten con la misma mira.
 *
 * Mientras derivados no pase `largoMira`, el corte y el mapa (que calculan
 * por su cuenta) siguen con la de fábrica: se pidió arreglarlo allí.
 */
export function useResultadoCalle(): ResultadoCampania | null {
  const contexto = useContexto()
  const bms = useAlmacen((s) => s.proyecto.bms)
  const instrumento = useAlmacen((s) => s.proyecto.instrumento)

  return useMemo(() => {
    if (!contexto) return null
    return calcularCampania({
      campania: contexto.campania,
      calle: contexto.calle,
      bms,
      largoMira: instrumentoCompleto(instrumento).largoMira,
    })
  }, [contexto, bms, instrumento])
}

/** Lo medido contra la rasante, con el mismo resultado de arriba. Null sin rasante. */
export function useEvaluacionCalle(resultado: ResultadoCampania | null): ResultadoEvaluacion | null {
  const contexto = useContexto()
  const capas = useAlmacen((s) => s.proyecto.capas)

  return useMemo(() => {
    if (!contexto || !contexto.calle.rasante || !resultado) return null
    return evaluarContraRasante({
      resultado,
      calle: contexto.calle,
      toma: contexto.campania,
      rasante: contexto.calle.rasante,
      capas,
      capaId: contexto.campania.capaId,
    })
  }, [contexto, capas, resultado])
}
