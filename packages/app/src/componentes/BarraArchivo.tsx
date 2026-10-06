import { useRef, useState } from 'react'
import { abrirTopoCompleto, descargarTopo } from '../archivo/topo'
import { useAlmacen } from '../estado/almacen'

const TEXTO_CONFIRMACION = '¿Seguro? Se pierde lo no guardado'

type Armado = 'nuevo' | 'abrir' | null

export default function BarraArchivo() {
  const proyecto = useAlmacen((s) => s.proyecto)
  const archivosDePlano = useAlmacen((s) => s.archivosDePlano)
  const cargarProyecto = useAlmacen((s) => s.cargarProyecto)
  const nuevoProyecto = useAlmacen((s) => s.nuevoProyecto)
  const entradaArchivo = useRef<HTMLInputElement>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [armado, setArmado] = useState<Armado>(null)

  async function abrir(archivo: File) {
    try {
      const { proyecto: abierto, archivosDePlano: planos } = await abrirTopoCompleto(archivo)
      cargarProyecto(abierto, planos)
      setMensaje(null)
    } catch (fallo) {
      setMensaje((fallo as Error).message)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
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
        className="min-h-11 rounded px-3 py-1 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
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
        className="min-h-11 rounded px-3 py-1 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        {armado === 'abrir' ? TEXTO_CONFIRMACION : 'Abrir'}
      </button>
      <button
        type="button"
        onClick={() => {
          setMensaje(null)
          descargarTopo(proyecto, archivosDePlano)
        }}
        className="min-h-11 rounded px-3 py-1 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
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
          // Se vacía al momento: si se quedara con el archivo, elegir otra
          // vez el mismo .topo (volver a la copia guardada) no avisaría de
          // ningún cambio y no se abriría.
          evento.target.value = ''
          if (archivo) void abrir(archivo)
        }}
      />
      {mensaje && (
        <span role="alert" className="text-xs text-falla">
          <span aria-hidden="true">✗ </span>
          {mensaje}
        </span>
      )}
    </div>
  )
}
