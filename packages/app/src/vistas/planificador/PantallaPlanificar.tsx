import EnConstruccion from '../../componentes/EnConstruccion'
import { useAlmacen } from '../../estado/almacen'

/**
 * Calle › Planificar: dónde poner estaciones, puntos de cambio y puntos de
 * control para que el error no se acumule. ESQUELETO del armazón: lo llena
 * el agente del Planificador sobre `planificar/` del motor, y guarda lo
 * decidido con `fijarPlanControles`.
 */
export default function PantallaPlanificar() {
  const abrirPantallaCalle = useAlmacen((s) => s.abrirPantallaCalle)

  return (
    <EnConstruccion
      titulo="Planificar"
      descripcion="Cambios y puntos de control de la calle, con el porqué de cada uno."
    >
      <button
        type="button"
        onClick={() => abrirPantallaCalle('guia')}
        className="min-h-11 self-start rounded bg-marca px-4 py-2 text-sm font-medium text-white"
      >
        Guía de campo
      </button>
    </EnConstruccion>
  )
}
