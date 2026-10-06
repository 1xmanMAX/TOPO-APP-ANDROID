import { useAlmacen } from '../../estado/almacen'
import VistaCalle from '../VistaCalle'
import VistaCampanias from '../VistaCampanias'
import VistaProyecto from '../VistaProyecto'
import VistaSeccion from '../VistaSeccion'
import VistaSubirDatos from '../VistaSubirDatos'

/**
 * Obra › Calles. ESQUELETO del armazón: mientras el agente de Obra arma la
 * pantalla de inicio (calles con el estado de sus capas, BMs, capas, ajustes
 * de cada calle, subir hoja, historial), aquí van las cinco vistas de antes,
 * una debajo de otra, para que no se pierda nada de lo que ya funcionaba.
 */
export default function EspacioObra() {
  // La sección es de una calle: la activa, o la primera si todavía no hay activa.
  const calleId = useAlmacen((s) => s.calleActivaId ?? s.proyecto.calles[0]?.id ?? null)

  return (
    <div className="flex flex-col divide-y divide-slate-200 dark:divide-slate-800">
      <VistaProyecto />
      <VistaCalle />
      {calleId ? (
        <VistaSeccion calleId={calleId} />
      ) : (
        <p className="p-6 text-sm text-slate-500">
          Todavía no hay ninguna calle. Sube una hoja de campo y la calle nace con ella.
        </p>
      )}
      <VistaSubirDatos />
      <VistaCampanias />
    </div>
  )
}
