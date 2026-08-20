import CampoNumero from '../componentes/CampoNumero'
import CampoTexto from '../componentes/CampoTexto'
import { useAlmacen } from '../estado/almacen'

export default function VistaProyecto() {
  const meta = useAlmacen((s) => s.proyecto.meta)
  const bms = useAlmacen((s) => s.proyecto.bms)
  const capas = useAlmacen((s) => s.proyecto.capas)
  const actualizarMeta = useAlmacen((s) => s.actualizarMeta)
  const agregarBM = useAlmacen((s) => s.agregarBM)
  const actualizarBM = useAlmacen((s) => s.actualizarBM)
  const eliminarBM = useAlmacen((s) => s.eliminarBM)
  const agregarCapa = useAlmacen((s) => s.agregarCapa)
  const eliminarCapa = useAlmacen((s) => s.eliminarCapa)

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 p-6">
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Datos de la obra</h2>
        <div className="grid grid-cols-2 gap-3">
          <CampoTexto etiqueta="Nombre del proyecto" valor={meta.nombre} alCambiar={(v) => actualizarMeta({ nombre: v })} />
          <CampoTexto etiqueta="Obra" valor={meta.obra} alCambiar={(v) => actualizarMeta({ obra: v })} />
          <CampoTexto etiqueta="Cliente" valor={meta.cliente} alCambiar={(v) => actualizarMeta({ cliente: v })} />
          <CampoTexto etiqueta="Ubicación" valor={meta.ubicacion} alCambiar={(v) => actualizarMeta({ ubicacion: v })} />
          <CampoTexto etiqueta="Responsable" valor={meta.responsable} alCambiar={(v) => actualizarMeta({ responsable: v })} />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Bancos de nivel</h2>
          <button
            type="button"
            onClick={() =>
              agregarBM({
                nombre: `BM-${bms.length + 1}`,
                cota: 0,
                tipo: 'auxiliar',
                descripcion: '',
              })
            }
            className="rounded bg-marca px-3 py-1.5 text-sm font-medium text-white"
          >
            Agregar banco de nivel
          </button>
        </div>

        {bms.length === 0 && (
          <p className="text-sm text-slate-500">
            Todavía no hay bancos de nivel. Agrega al menos uno para poder nivelar.
          </p>
        )}

        <div className="flex flex-col gap-2">
          {bms.map((bm) => (
            <div key={bm.id} className="grid grid-cols-[8rem_9rem_8rem_1fr_auto] items-end gap-2">
              <CampoTexto etiqueta="Nombre" valor={bm.nombre} alCambiar={(v) => actualizarBM(bm.id, { nombre: v })} />
              <CampoNumero etiqueta="Cota" valor={bm.cota} alCambiar={(v) => actualizarBM(bm.id, { cota: v })} sufijo="m" />
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Tipo</span>
                <select
                  value={bm.tipo}
                  onChange={(evento) => actualizarBM(bm.id, { tipo: evento.target.value as 'oficial' | 'auxiliar' })}
                  className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
                >
                  <option value="oficial">Oficial</option>
                  <option value="auxiliar">Auxiliar</option>
                </select>
              </label>
              <CampoTexto
                etiqueta="Descripción"
                valor={bm.descripcion}
                alCambiar={(v) => actualizarBM(bm.id, { descripcion: v })}
                marcador="dónde está el clavo"
              />
              <button
                type="button"
                onClick={() => eliminarBM(bm.id)}
                aria-label={`Eliminar ${bm.nombre}`}
                className="rounded px-2 py-1.5 text-sm text-falla hover:bg-red-50 dark:hover:bg-red-950"
              >
                Eliminar
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Capas</h2>
          <button
            type="button"
            onClick={() => agregarCapa('CAPA NUEVA')}
            className="rounded bg-marca px-3 py-1.5 text-sm font-medium text-white"
          >
            Agregar capa
          </button>
        </div>
        <ul className="flex flex-wrap gap-2">
          {capas.map((capa) => (
            <li key={capa.id} className="flex items-center gap-2 rounded border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700">
              <span>{capa.nombre}</span>
              <button
                type="button"
                onClick={() => eliminarCapa(capa.id)}
                aria-label={`Eliminar capa ${capa.nombre}`}
                className="text-slate-400 hover:text-falla"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
