import { useId, useState } from 'react'
import { useAlmacen, type ModoCalle } from '../../estado/almacen'
import { useContexto } from '../../estado/derivados'
import FichaMedir from './FichaMedir'
import FichaReplantear from './FichaReplantear'
import FichaRevisar from './FichaRevisar'
import SelectorCapaActiva from './SelectorCapaActiva'
import VistaComun, { type TipoVista } from './VistaComun'

const TITULO_MODO: Record<ModoCalle, string> = {
  medir: 'Medir',
  revisar: 'Revisar',
  replantear: 'Replantear',
}

/**
 * Calle: una sola vista para los tres modos (diseño §1). A la izquierda, o
 * arriba en el celular, el dibujo de la calle y su mapa, iguales en los tres
 * modos; a la derecha, o debajo en el celular, la ficha del modo. La calle,
 * los modos y las pantallas de la calle están en la sub-barra del armazón
 * (`NavegacionCalle`); aquí se elige la capa.
 */
export default function EspacioCalle() {
  const modo = useAlmacen((s) => s.modoCalle)
  const calle = useAlmacen((s) => s.proyecto.calles.find((c) => c.id === s.calleActivaId) ?? null)
  const contexto = useContexto()
  // El tipo de dibujo se conserva al cambiar de modo: se mira la misma calle.
  const [vista, setVista] = useState<TipoVista>('corte')
  const idTitulo = useId()

  if (!calle) {
    return <p className="p-6 text-sm text-slate-500">Elige una calle, o crea la primera en Obra.</p>
  }

  const sinTomas = !calle.nivelaciones.some((n) => n.tomas.length > 0)
  const contextoDeEstaCalle = contexto && contexto.calle.id === calle.id ? contexto : null

  return (
    <div className="flex flex-col gap-3 p-2 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <SelectorCapaActiva calle={calle} />
        {contextoDeEstaCalle && (
          <span className="text-xs text-slate-500">
            Tolerancia ±{contextoDeEstaCalle.capa?.toleranciaMm ?? '—'} mm
          </span>
        )}
      </div>

      {!contextoDeEstaCalle ? (
        <p className="rounded border border-dashed border-slate-300 p-3 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
          {sinTomas
            ? 'Esta calle todavía no tiene ninguna capa medida: crea una nivelación en Obra › Calles.'
            : 'Elige una capa para trabajar en esta calle.'}
        </p>
      ) : (
        // Desde la tablet en vertical (md) la ficha ya va al lado, como en la pantalla de referencia 2.
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_20rem] lg:grid-cols-[minmax(0,1fr)_26rem]">
          <VistaComun modo={modo} vista={vista} alCambiarVista={setVista} />
          <aside aria-labelledby={idTitulo} className="flex min-w-0 flex-col gap-3">
            <h2 id={idTitulo} className="text-lg font-semibold">
              {TITULO_MODO[modo]}
            </h2>
            {/* Con `key` por toma: cambiar de capa vacía el campo y olvida la última lectura de la otra toma. */}
            {modo === 'medir' && <FichaMedir key={contextoDeEstaCalle.campania.id} />}
            {modo === 'revisar' && <FichaRevisar />}
            {modo === 'replantear' && <FichaReplantear />}
          </aside>
        </div>
      )}
    </div>
  )
}
