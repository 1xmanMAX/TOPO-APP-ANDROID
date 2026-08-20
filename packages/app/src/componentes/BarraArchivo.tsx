import { useRef, useState } from 'react'
import { abrirTopo, descargarTopo } from '../archivo/topo'
import { useAlmacen } from '../estado/almacen'

export default function BarraArchivo() {
  const proyecto = useAlmacen((s) => s.proyecto)
  const cargarProyecto = useAlmacen((s) => s.cargarProyecto)
  const nuevoProyecto = useAlmacen((s) => s.nuevoProyecto)
  const entradaArchivo = useRef<HTMLInputElement>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)

  async function abrir(archivo: File) {
    try {
      cargarProyecto(await abrirTopo(archivo))
      setMensaje(null)
    } catch (fallo) {
      setMensaje((fallo as Error).message)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => {
          setMensaje(null)
          nuevoProyecto()
        }}
        className="rounded px-2 py-1 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        Nuevo
      </button>
      <button
        type="button"
        onClick={() => entradaArchivo.current?.click()}
        className="rounded px-2 py-1 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        Abrir
      </button>
      <button
        type="button"
        onClick={() => {
          setMensaje(null)
          descargarTopo(proyecto)
        }}
        className="rounded px-2 py-1 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        Guardar
      </button>
      <input
        ref={entradaArchivo}
        type="file"
        accept=".topo,application/zip"
        aria-label="Abrir archivo .topo"
        className="hidden"
        onChange={(evento) => {
          const archivo = evento.target.files?.[0]
          if (archivo) void abrir(archivo)
        }}
      />
      {mensaje && <span className="text-xs text-falla">{mensaje}</span>}
    </div>
  )
}
