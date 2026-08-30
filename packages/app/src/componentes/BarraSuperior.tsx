import { useAlmacen, type Vista } from '../estado/almacen'
import BarraArchivo from './BarraArchivo'
import BotonTema from './BotonTema'

const PESTANAS: { vista: Vista; texto: string }[] = [
  { vista: 'proyecto', texto: 'Proyecto' },
  { vista: 'calle', texto: 'Calle' },
  // Estas dos van juntas y antes de la libreta porque es el orden en que se
  // trabaja: se declara la sección de la calle y con ella se sube la hoja.
  { vista: 'seccion', texto: 'Sección' },
  { vista: 'subir', texto: 'Subir datos' },
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
      <div className="ml-auto flex items-center gap-2">
        <BotonTema />
        <BarraArchivo />
      </div>
    </header>
  )
}
