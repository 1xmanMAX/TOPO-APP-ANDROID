import { useMemo, useState } from 'react'
import { armarTabla, copiarAlPortapapeles, descargarCsv, descargarXlsx } from '../archivo/exportar'
import CorteTransversal from '../componentes/CorteTransversal'
import DeslizadorProgresiva from '../componentes/DeslizadorProgresiva'
import PerfilLongitudinal from '../componentes/PerfilLongitudinal'
import TablaResultados from '../componentes/TablaResultados'
import { useAlmacen } from '../estado/almacen'
import { useContexto, useProgresivas, useResultado } from '../estado/derivados'

export default function VistaResultados() {
  const contexto = useContexto()
  const resultado = useResultado()
  const seleccion = useAlmacen((s) => s.seleccion)
  const irAProgresiva = useAlmacen((s) => s.irAProgresiva)
  const [elementoPedido, setElementoPedido] = useState('EJE')

  const progresivas = useProgresivas()

  const tabla = useMemo(
    () => (resultado && contexto ? armarTabla(resultado, contexto.calle, contexto.plantilla) : []),
    [resultado, contexto],
  )
  const [copiado, setCopiado] = useState(false)
  const nombreArchivo = `${contexto?.calle.nombre ?? 'cotas'} — ${contexto?.capa?.nombre ?? ''}`.trim()

  if (!contexto || !resultado) {
    return <p className="p-6 text-sm text-slate-500">No hay una campaña abierta.</p>
  }

  const progresivaActiva = seleccion.progresiva ?? progresivas[0] ?? 0

  // Si la plantilla cambió y el elemento elegido ya no está, se cae al primero
  // disponible en vez de dejar el desplegable apuntando a algo inexistente.
  const clavesDisponibles = contexto.plantilla.elementos.map((elemento) => elemento.clave)
  const elementoPerfil = clavesDisponibles.includes(elementoPedido)
    ? elementoPedido
    : (clavesDisponibles[0] ?? '')

  return (
    <div className="flex flex-col gap-6 p-4">
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Cotas compensadas</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => descargarXlsx(tabla, nombreArchivo)}
            className="rounded bg-marca px-3 py-1.5 text-sm font-medium text-white"
          >
            Exportar a Excel
          </button>
          <button
            type="button"
            onClick={() => descargarCsv(tabla, nombreArchivo)}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700"
          >
            Exportar a CSV
          </button>
          <button
            type="button"
            onClick={() => {
              void copiarAlPortapapeles(tabla).then(() => {
                setCopiado(true)
                window.setTimeout(() => setCopiado(false), 2000)
              })
            }}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700"
          >
            {copiado ? 'Copiado ✓' : 'Copiar tabla'}
          </button>
        </div>
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
            onChange={(evento) => setElementoPedido(evento.target.value)}
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
