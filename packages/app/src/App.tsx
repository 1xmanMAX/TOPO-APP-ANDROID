import BarraSuperior from './componentes/BarraSuperior'
import { useAlmacen } from './estado/almacen'
import VistaProyecto from './vistas/VistaProyecto'
import VistaPlantilla from './vistas/VistaPlantilla'

export default function App() {
  const vista = useAlmacen((s) => s.vista)

  return (
    <div className="flex h-full flex-col">
      <BarraSuperior />
      <div className="flex-1 overflow-auto">
        {vista === 'proyecto' && <VistaProyecto />}
        {vista === 'plantilla' && <VistaPlantilla />}
        {vista !== 'proyecto' && vista !== 'plantilla' && (
          <p className="p-6 text-sm text-slate-500">
            Pantalla en construcción. Abre «Proyecto» mientras tanto.
          </p>
        )}
      </div>
    </div>
  )
}
