import { useRef, useState } from 'react'
import { abrirTopo, descargarTopo } from '../archivo/topo'
import { useAlmacen } from '../estado/almacen'

const TEXTO_CONFIRMACION = '¿Seguro? Se pierde lo no guardado'

type Armado = 'nuevo' | 'abrir' | null

export default function BarraArchivo() {
  const proyecto = useAlmacen((s) => s.proyecto)
  const cargarProyecto = useAlmacen((s) => s.cargarProyecto)
  const nuevoProyecto = useAlmacen((s) => s.nuevoProyecto)
  const entradaArchivo = useRef<HTMLInputElement>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [armado, setArmado] = useState<Armado>(null)

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
          if (armado === 'nuevo') {
            nuevoProyecto()
            setArmado(null)
          } else {
            setArmado('nuevo')
          }
        }}
        onBlur={() => setArmado((actual) => (actual === 'nuevo' ? null : actual))}
        className="rounded px-2 py-1 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        {armado === 'nuevo' ? TEXTO_CONFIRMACION : 'Nuevo'}
      </button>
      <button
        type="button"
        onClick={() => {
          setMensaje(null)
          if (armado === 'abrir') {
            setArmado(null)
            entradaArchivo.current?.click()
          } else {
            setArmado('abrir')
          }
        }}
        onBlur={() => setArmado((actual) => (actual === 'abrir' ? null : actual))}
        className="rounded px-2 py-1 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        {armado === 'abrir' ? TEXTO_CONFIRMACION : 'Abrir'}
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
