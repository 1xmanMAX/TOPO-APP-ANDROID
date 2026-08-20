import type { Campania, Id } from '@topo/core'
import { useEffect, useMemo, useState } from 'react'
import { useAlmacen } from '../estado/almacen'

const MENSAJE_MISMA_CAPA = 'Una capa no se compara consigo misma'

/** Campaña con la capa ya resuelta, para no repetir la búsqueda en cada celda. */
interface CampaniaConCapa {
  campania: Campania
  nombreCapa: string
  orden: number
}

/**
 * Campañas de la calle activa, agrupadas por capa y ordenadas por el orden de
 * la capa (no por fecha): el orden es el del paquete estructural, y es lo que
 * hace legible la lista. Dos campañas de la misma capa (una remedición) se
 * distinguen por su fecha y quedan una junto a la otra, ordenadas por fecha.
 */
function campaniasDeLaCalle(
  campanias: Campania[],
  capas: { id: Id; nombre: string; orden: number }[],
  calleActivaId: Id | null,
): CampaniaConCapa[] {
  const capasPorId = new Map(capas.map((capa) => [capa.id, capa]))

  return campanias
    .filter((campania) => campania.calleId === calleActivaId)
    .map((campania) => {
      const capa = capasPorId.get(campania.capaId)
      return { campania, nombreCapa: capa?.nombre ?? '—', orden: capa?.orden ?? 0 }
    })
    .sort((a, b) => a.orden - b.orden || a.campania.fecha.localeCompare(b.campania.fecha))
}

function etiqueta({ nombreCapa, campania }: CampaniaConCapa): string {
  return `${nombreCapa} · ${campania.fecha}`
}

export default function SelectorCapas() {
  const proyecto = useAlmacen((s) => s.proyecto)
  const campaniaActivaId = useAlmacen((s) => s.campaniaActivaId)
  const capasVisibles = useAlmacen((s) => s.capasVisibles)
  const comparacion = useAlmacen((s) => s.comparacion)
  const alternarCapaVisible = useAlmacen((s) => s.alternarCapaVisible)
  const fijarComparacion = useAlmacen((s) => s.fijarComparacion)

  const calleActivaId = useMemo(
    () => proyecto.campanias.find((c) => c.id === campaniaActivaId)?.calleId ?? null,
    [proyecto, campaniaActivaId],
  )

  const campanias = useMemo(
    () => campaniasDeLaCalle(proyecto.campanias, proyecto.capas, calleActivaId),
    [proyecto, calleActivaId],
  )

  const [mensaje, setMensaje] = useState<string | null>(null)

  // Lo elegido es de otra calle: no lo sigas mostrando como advertencia.
  useEffect(() => {
    setMensaje(null)
  }, [calleActivaId])

  function elegirInferior(valor: string) {
    const inferior = valor === '' ? null : valor
    if (inferior !== null && inferior === comparacion.superior) {
      fijarComparacion(inferior, null)
      setMensaje(MENSAJE_MISMA_CAPA)
      return
    }
    fijarComparacion(inferior, comparacion.superior)
    setMensaje(null)
  }

  function elegirSuperior(valor: string) {
    const superior = valor === '' ? null : valor
    if (superior !== null && superior === comparacion.inferior) {
      fijarComparacion(comparacion.inferior, null)
      setMensaje(MENSAJE_MISMA_CAPA)
      return
    }
    fijarComparacion(comparacion.inferior, superior)
    setMensaje(null)
  }

  return (
    <div className="flex flex-col gap-3 rounded border border-slate-200 p-3 text-sm dark:border-slate-800">
      <span className="font-semibold">Capas</span>

      {campanias.length === 0 ? (
        <p className="text-slate-500">Todavía no hay campañas en esta calle.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {campanias.map((item) => (
            <li key={item.campania.id}>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  aria-label={`Dibujar ${etiqueta(item)}`}
                  checked={capasVisibles.includes(item.campania.id)}
                  onChange={() => alternarCapaVisible(item.campania.id)}
                />
                <span className="numerico">{item.campania.fecha}</span>
                <span>{item.nombreCapa}</span>
              </label>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5">
          <span className="text-slate-500">Capa de abajo</span>
          <select
            aria-label="Capa de abajo en la comparación"
            value={comparacion.inferior ?? ''}
            onChange={(evento) => elegirInferior(evento.target.value)}
            className="rounded border border-slate-300 bg-white px-1.5 py-0.5 dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="">—</option>
            {campanias.map((item) => (
              <option key={item.campania.id} value={item.campania.id}>
                {etiqueta(item)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1.5">
          <span className="text-slate-500">Capa de arriba</span>
          <select
            aria-label="Capa de arriba en la comparación"
            value={comparacion.superior ?? ''}
            onChange={(evento) => elegirSuperior(evento.target.value)}
            className="rounded border border-slate-300 bg-white px-1.5 py-0.5 dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="">—</option>
            {campanias.map((item) => (
              <option key={item.campania.id} value={item.campania.id}>
                {etiqueta(item)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {mensaje && <p className="text-aviso">{mensaje}</p>}
    </div>
  )
}
