import { useId, useState } from 'react'
import { CEJA } from '../../componentes/ui'
import { useAlmacen, type ModoCalle } from '../../estado/almacen'
import { useContexto } from '../../estado/derivados'
import FichaMedir from './FichaMedir'
import FichaReplantear from './FichaReplantear'
import FichaRevisar from './FichaRevisar'
import { DibujoCalle, MapaCalle, type TipoVista } from './VistaComun'

const TITULO_MODO: Record<ModoCalle, string> = {
  medir: 'Medir',
  revisar: 'Revisar',
  replantear: 'Replantear',
}

/**
 * El orden en el celular depende de lo que se hace. Midiendo y replanteando,
 * lo primero es la ficha (el campo de la lectura, la estaca); revisando, el
 * dibujo del punto y luego su ficha. El mapa va siempre al final. Desde la
 * tablet la ficha va a la derecha, a todo lo alto.
 */
const AREAS_CELULAR: Record<ModoCalle, string> = {
  medir: "[grid-template-areas:'ficha'_'dibujo'_'mapa']",
  replantear: "[grid-template-areas:'ficha'_'dibujo'_'mapa']",
  revisar: "[grid-template-areas:'dibujo'_'ficha'_'mapa']",
}

/**
 * Calle: una sola vista para los tres modos (diseño §1). El dibujo de la
 * calle y su mapa son iguales en los tres modos; la ficha es la del modo.
 * La calle, la capa y los modos se eligen arriba, en la cabecera.
 */
export default function EspacioCalle() {
  const modo = useAlmacen((s) => s.modoCalle)
  const calle = useAlmacen((s) => s.proyecto.calles.find((c) => c.id === s.calleActivaId) ?? null)
  const contexto = useContexto()
  // El tipo de dibujo se conserva al cambiar de modo: se mira la misma calle.
  const [vista, setVista] = useState<TipoVista>('corte')
  const idTitulo = useId()

  if (!calle) {
    return <p className="p-6 text-sm text-tenue">Elige una calle, o crea la primera en Obra.</p>
  }

  const sinTomas = !calle.nivelaciones.some((n) => n.tomas.length > 0)
  const contextoDeEstaCalle = contexto && contexto.calle.id === calle.id ? contexto : null

  return (
    <div className="min-h-full bg-fondo p-3 md:p-4">
      {!contextoDeEstaCalle ? (
        <p className="rounded-xl border border-dashed border-borde-fuerte bg-tarjeta p-4 text-sm text-tenue">
          {sinTomas
            ? 'Esta calle todavía no tiene ninguna capa medida: crea una nivelación en Obra › Calles.'
            : 'Elige una capa para trabajar en esta calle.'}
        </p>
      ) : (
        <div
          className={`grid gap-4 ${AREAS_CELULAR[modo]} md:grid-cols-[minmax(0,1fr)_20rem] md:grid-rows-[auto_1fr] md:[grid-template-areas:'dibujo_ficha'_'mapa_ficha'] lg:grid-cols-[minmax(0,1fr)_380px]`}
        >
          <DibujoCalle modo={modo} vista={vista} alCambiarVista={setVista} className="[grid-area:dibujo]" />
          {/* self-start: el mapa mide lo que tiene dentro, no lo alta que sea la ficha de al lado. */}
          <MapaCalle modo={modo} className="self-start [grid-area:mapa]" />
          <aside
            aria-labelledby={idTitulo}
            className="flex min-w-0 flex-col gap-4 self-start rounded-xl border border-borde bg-tarjeta px-4 py-4 [grid-area:ficha] sm:px-5 sm:py-[18px] md:row-span-2"
          >
            <h2 id={idTitulo} className={CEJA}>
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
