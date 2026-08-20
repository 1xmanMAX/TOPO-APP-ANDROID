import { useEffect, useState } from 'react'
import type { Proyecto } from '@topo/core'
import { borrarBorrador, contarLecturas, leerBorrador } from './archivo/autoguardado'
import BarraSuperior from './componentes/BarraSuperior'
import { useAlmacen } from './estado/almacen'
import VistaProyecto from './vistas/VistaProyecto'
import VistaPlantilla from './vistas/VistaPlantilla'
import VistaCalle from './vistas/VistaCalle'
import VistaCampanias from './vistas/VistaCampanias'
import VistaLibreta from './vistas/VistaLibreta'
import VistaResultados from './vistas/VistaResultados'

export default function App() {
  const vista = useAlmacen((s) => s.vista)
  const cargarProyecto = useAlmacen((s) => s.cargarProyecto)
  const [borrador, setBorrador] = useState<{ proyecto: Proyecto; guardado: string } | null>(null)

  useEffect(() => {
    void leerBorrador()
      .then(setBorrador)
      .catch(() => setBorrador(null))
  }, [])

  return (
    <div className="flex h-full flex-col">
      <BarraSuperior />
      {borrador && (
        <div className="flex items-center gap-3 border-b border-aviso bg-aviso/10 px-4 py-2 text-sm">
          <span>
            Recuperé tu trabajo del{' '}
            {new Date(borrador.guardado).toLocaleString('es-PE', {
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })}{' '}
            — {borrador.proyecto.meta.nombre}, {contarLecturas(borrador.proyecto)} lecturas.
          </span>
          <button
            type="button"
            onClick={() => {
              cargarProyecto(borrador.proyecto)
              setBorrador(null)
            }}
            className="rounded bg-marca px-2 py-1 text-white"
          >
            Recuperar
          </button>
          <button
            type="button"
            onClick={() => {
              void borrarBorrador()
              setBorrador(null)
            }}
            className="rounded px-2 py-1"
          >
            Descartar
          </button>
        </div>
      )}
      <div className="flex-1 overflow-auto">
        {vista === 'proyecto' && <VistaProyecto />}
        {vista === 'plantilla' && <VistaPlantilla />}
        {vista === 'calle' && <VistaCalle />}
        {vista === 'campanias' && <VistaCampanias />}
        {vista === 'libreta' && <VistaLibreta />}
        {vista === 'resultados' && <VistaResultados />}
        {vista !== 'proyecto' &&
          vista !== 'plantilla' &&
          vista !== 'calle' &&
          vista !== 'campanias' &&
          vista !== 'libreta' &&
          vista !== 'resultados' && (
            <p className="p-6 text-sm text-slate-500">
              Pantalla en construcción. Abre «Proyecto» mientras tanto.
            </p>
          )}
      </div>
    </div>
  )
}
