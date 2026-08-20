import { useMemo, useState } from 'react'
import CorteTransversal from '../componentes/CorteTransversal'
import DeslizadorProgresiva from '../componentes/DeslizadorProgresiva'
import PerfilLongitudinal from '../componentes/PerfilLongitudinal'
import TablaResultados from '../componentes/TablaResultados'
import { useAlmacen } from '../estado/almacen'
import { useContexto, useResultado } from '../estado/derivados'

export default function VistaResultados() {
  const contexto = useContexto()
  const resultado = useResultado()
  const seleccion = useAlmacen((s) => s.seleccion)
  const irAProgresiva = useAlmacen((s) => s.irAProgresiva)
  const [elementoPerfil, setElementoPerfil] = useState('EJE')

  const progresivas = useMemo(() => {
    if (!resultado) return []
    return [...new Set([...resultado.cotasPorCelda.values()].map((c) => c.progresiva))].sort(
      (a, b) => a - b,
    )
  }, [resultado])

  if (!contexto || !resultado) {
    return <p className="p-6 text-sm text-slate-500">No hay una campaña abierta.</p>
  }

  const progresivaActiva = seleccion.progresiva ?? progresivas[0] ?? 0

  return (
    <div className="flex flex-col gap-6 p-4">
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Cotas compensadas</h2>
        <TablaResultados />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Corte transversal</h2>
        <CorteTransversal progresiva={progresivaActiva} />
        <DeslizadorProgresiva progresivas={progresivas} valor={progresivaActiva} alCambiar={irAProgresiva} />
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Perfil longitudinal</h2>
          <select
            aria-label="Elemento del perfil"
            value={elementoPerfil}
            onChange={(evento) => setElementoPerfil(evento.target.value)}
            className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            {contexto.plantilla.elementos.map((elemento) => (
              <option key={elemento.clave} value={elemento.clave}>
                {elemento.etiqueta}
              </option>
            ))}
          </select>
        </div>
        <PerfilLongitudinal elementoClave={elementoPerfil} />
      </section>
    </div>
  )
}
