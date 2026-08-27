import { useAlmacen } from '../estado/almacen'
import { calleDeToma, todasLasTomas } from '../estado/proyectoTomas'

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function VistaCampanias() {
  const proyecto = useAlmacen((s) => s.proyecto)
  const campaniaActivaId = useAlmacen((s) => s.campaniaActivaId)
  const agregarCampania = useAlmacen((s) => s.agregarCampania)
  const activarCampania = useAlmacen((s) => s.activarCampania)
  const actualizarCampania = useAlmacen((s) => s.actualizarCampania)
  const irA = useAlmacen((s) => s.irA)

  const calle = proyecto.calles[0]
  const bm = proyecto.bms[0]
  const campanias = todasLasTomas(proyecto)

  function nombreDe(lista: { id: string; nombre: string }[], id: string): string {
    return lista.find((elemento) => elemento.id === id)?.nombre ?? '—'
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Campañas de nivelación</h2>
        <button
          type="button"
          disabled={!calle || !bm || proyecto.capas.length === 0}
          onClick={() => {
            if (!calle || !bm || proyecto.capas.length === 0) return
            agregarCampania({
              fecha: hoyISO(),
              calleId: calle.id,
              capaId: proyecto.capas[0]?.id ?? '',
              bmInicialId: bm.id,
              cierre: {
                tipo: 'cerrado',
                bmFinalId: bm.id,
                longitudK: 0,
                longitudKAuto: true,
                clase: 'tercerOrden',
                coeficiente: 12,
              },
            })
            irA('libreta')
          }}
          className="rounded bg-marca px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
        >
          Nueva campaña
        </button>
      </div>

      <p className="text-sm text-slate-500">
        Cada campaña es una jornada de nivelación: una fecha, una calle y una capa. Nunca pisa a las
        anteriores; se apilan.
      </p>

      {(!calle || !bm || proyecto.capas.length === 0) && (
        <p className="rounded border border-aviso px-3 py-2 text-sm text-aviso">
          Para crear una campaña hace falta al menos una calle, un banco de nivel y una capa.
          Defínelos en las pantallas de Proyecto y Calle.
        </p>
      )}

      {campanias.length === 0 && (
        <p className="text-sm text-slate-500">Todavía no hay campañas. Crea la primera.</p>
      )}

      <ul className="flex flex-col gap-2">
        {[...campanias]
          .sort((a, b) => b.fecha.localeCompare(a.fecha))
          .map((campania) => {
            const activa = campania.id === campaniaActivaId
            const lecturas = campania.estaciones.reduce((suma, e) => suma + e.intermedias.length, 0)
            const calleDeLaCampania = calleDeToma(proyecto, campania.id)
            const nombreCalle = calleDeLaCampania ? nombreDe(proyecto.calles, calleDeLaCampania) : '—'
            const senia = `del ${campania.fecha} en ${nombreCalle}`

            return (
              <li
                key={campania.id}
                className={`grid grid-cols-[1fr_9rem_9rem_9rem_auto] items-center gap-3 rounded border px-3 py-2 ${
                  activa ? 'border-marca bg-marca/5' : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <button
                  type="button"
                  data-activa={activa}
                  aria-label={`Abrir campaña ${senia}`}
                  onClick={() => {
                    activarCampania(campania.id)
                    irA('libreta')
                  }}
                  className="text-left text-sm"
                >
                  <span className="numerico font-medium">{campania.fecha}</span>
                  <span className="text-slate-500">
                    {' '}
                    · {nombreCalle} ·{' '}
                    {nombreDe(proyecto.capas, campania.capaId)}
                  </span>
                  <span className="block text-xs text-slate-400">
                    {lecturas} lecturas · {campania.estaciones.length} estaciones
                  </span>
                </button>

                <label className="flex flex-col gap-1">
                  <span className="text-xs text-slate-500">Calle</span>
                  <select
                    aria-label={`Calle de la campaña ${senia}`}
                    value={calleDeLaCampania ?? ''}
                    onChange={(evento) =>
                      actualizarCampania(campania.id, { calleId: evento.target.value })
                    }
                    className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
                  >
                    {proyecto.calles.map((calle) => (
                      <option key={calle.id} value={calle.id}>
                        {calle.nombre}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-xs text-slate-500">Capa de la campaña</span>
                  <select
                    aria-label={`Capa de la campaña ${senia}`}
                    value={campania.capaId}
                    onChange={(evento) =>
                      actualizarCampania(campania.id, { capaId: evento.target.value })
                    }
                    className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
                  >
                    {proyecto.capas.map((capa) => (
                      <option key={capa.id} value={capa.id}>
                        {capa.nombre}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-xs text-slate-500">BM de arranque</span>
                  <select
                    aria-label={`BM de la campaña ${senia}`}
                    value={campania.bmInicialId}
                    onChange={(evento) =>
                      actualizarCampania(campania.id, { bmInicialId: evento.target.value })
                    }
                    className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
                  >
                    {proyecto.bms.map((banco) => (
                      <option key={banco.id} value={banco.id}>
                        {banco.nombre}
                      </option>
                    ))}
                  </select>
                </label>

                <input
                  type="date"
                  aria-label={`Fecha de la campaña ${senia}`}
                  value={campania.fecha}
                  onChange={(evento) => actualizarCampania(campania.id, { fecha: evento.target.value })}
                  className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
                />
              </li>
            )
          })}
      </ul>
    </div>
  )
}
