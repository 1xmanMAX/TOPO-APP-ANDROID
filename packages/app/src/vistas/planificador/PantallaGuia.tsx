import EnConstruccion from '../../componentes/EnConstruccion'
import { useAlmacen } from '../../estado/almacen'

/**
 * Calle › Planificar › Guía de campo: el plan, paso a paso, para seguirlo
 * en campo. ESQUELETO del armazón: lo llena el agente del Planificador.
 */
export default function PantallaGuia() {
  const abrirPantallaCalle = useAlmacen((s) => s.abrirPantallaCalle)

  return (
    <EnConstruccion titulo="Guía de campo" descripcion="Estación por estación: dónde plantar el nivel y qué leer.">
      <button
        type="button"
        onClick={() => abrirPantallaCalle('planificar')}
        className="min-h-11 self-start rounded border border-slate-300 px-4 py-2 text-sm dark:border-slate-700"
      >
        Volver a Planificar
      </button>
    </EnConstruccion>
  )
}
