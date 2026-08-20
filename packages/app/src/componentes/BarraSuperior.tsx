import { useAlmacen, type Vista } from '../estado/almacen'
import BarraArchivo from './BarraArchivo'

const PESTANAS: { vista: Vista; texto: string }[] = [
  { vista: 'proyecto', texto: 'Proyecto' },
  { vista: 'plantilla', texto: 'Plantilla' },
  { vista: 'calle', texto: 'Calle' },
  { vista: 'campanias', texto: 'Campañas' },
  { vista: 'libreta', texto: 'Libreta' },
  { vista: 'resultados', texto: 'Resultados' },
]

export default function BarraSuperior() {
  const vista = useAlmacen((s) => s.vista)
  const irA = useAlmacen((s) => s.irA)
  const nombre = useAlmacen((s) => s.proyecto.meta.nombre)

  return (
    <header className="flex items-center gap-6 border-b border-slate-200 px-4 py-2 dark:border-slate-800">
      <span className="text-sm font-semibold">{nombre}</span>
      <nav className="flex gap-1">
        {PESTANAS.map((pestana) => (
          <button
            key={pestana.vista}
            type="button"
            onClick={() => irA(pestana.vista)}
            className={`rounded px-3 py-1.5 text-sm ${
              vista === pestana.vista
                ? 'bg-marca font-medium text-white'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            {pestana.texto}
          </button>
        ))}
      </nav>
      <div className="ml-auto">
        <BarraArchivo />
      </div>
    </header>
  )
}
