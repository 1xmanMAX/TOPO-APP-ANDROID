import type { Calle } from '@topo/core'
import { useAlmacen } from '../../estado/almacen'

interface Props {
  calle: Calle
}

/**
 * Qué capa de la calle se está mirando: cada toma de cada nivelación es una
 * capa medida un día. Cambiarla cambia la toma activa, y con ella el corte,
 * el mapa y la ficha. Las tomas van agrupadas por nivelación porque la
 * misma capa puede medirse en dos nivelaciones distintas (ida y control).
 */
export default function SelectorCapaActiva({ calle }: Props) {
  const capas = useAlmacen((s) => s.proyecto.capas)
  const campaniaActivaId = useAlmacen((s) => s.campaniaActivaId)
  const activarCampania = useAlmacen((s) => s.activarCampania)

  const hayTomas = calle.nivelaciones.some((n) => n.tomas.length > 0)
  if (!hayTomas) return null

  return (
    <label className="flex min-w-0 flex-1 items-center gap-2 text-sm sm:flex-none">
      <span className="shrink-0 font-medium">Capa activa</span>
      <select
        value={campaniaActivaId ?? ''}
        onChange={(evento) => activarCampania(evento.target.value || null)}
        className="min-h-11 min-w-0 flex-1 rounded border border-slate-300 bg-white px-2 text-sm sm:w-72 sm:flex-none dark:border-slate-700 dark:bg-slate-900"
      >
        {campaniaActivaId === null && <option value="">Elige una capa</option>}
        {calle.nivelaciones.map((nivelacion) =>
          nivelacion.tomas.length === 0 ? null : (
            <optgroup key={nivelacion.id} label={nivelacion.nombre}>
              {nivelacion.tomas.map((toma) => (
                <option key={toma.id} value={toma.id}>
                  {capas.find((c) => c.id === toma.capaId)?.nombre ?? 'Sin capa'} · {toma.fecha}
                </option>
              ))}
            </optgroup>
          ),
        )}
      </select>
    </label>
  )
}
