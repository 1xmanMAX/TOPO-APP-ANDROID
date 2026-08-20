import BarraSuperior from './componentes/BarraSuperior'
import { useAlmacen } from './estado/almacen'
import VistaProyecto from './vistas/VistaProyecto'
import VistaPlantilla from './vistas/VistaPlantilla'
import VistaCalle from './vistas/VistaCalle'
import VistaCampanias from './vistas/VistaCampanias'
import VistaLibreta from './vistas/VistaLibreta'

export default function App() {
  const vista = useAlmacen((s) => s.vista)

  return (
    <div className="flex h-full flex-col">
      <BarraSuperior />
      <div className="flex-1 overflow-auto">
        {vista === 'proyecto' && <VistaProyecto />}
        {vista === 'plantilla' && <VistaPlantilla />}
        {vista === 'calle' && <VistaCalle />}
        {vista === 'campanias' && <VistaCampanias />}
        {vista === 'libreta' && <VistaLibreta />}
        {vista !== 'proyecto' && vista !== 'plantilla' && vista !== 'calle' && vista !== 'campanias' && vista !== 'libreta' && (
          <p className="p-6 text-sm text-slate-500">
            Pantalla en construcción. Abre «Proyecto» mientras tanto.
          </p>
        )}
      </div>
    </div>
  )
}
