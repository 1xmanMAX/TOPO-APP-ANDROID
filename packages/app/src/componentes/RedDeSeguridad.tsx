import { Component, type ErrorInfo, type ReactNode } from 'react'
import { descargarTopo } from '../archivo/topo'
import { useAlmacen } from '../estado/almacen'

function BotonGuardar() {
  const proyecto = useAlmacen((s) => s.proyecto)
  return (
    <button
      type="button"
      onClick={() => descargarTopo(proyecto)}
      className="rounded bg-marca px-3 py-1.5 text-sm font-medium text-white"
    >
      Guardar el proyecto en un archivo
    </button>
  )
}

interface Estado {
  fallo: Error | null
}

/**
 * Si algo revienta al dibujar, la app entera se queda en blanco y el topógrafo
 * pierde de vista su trabajo. Esto lo atrapa, se lo explica, y sobre todo le
 * deja guardar el proyecto antes de recargar.
 */
export default class RedDeSeguridad extends Component<{ children: ReactNode }, Estado> {
  override state: Estado = { fallo: null }

  static getDerivedStateFromError(fallo: Error): Estado {
    return { fallo }
  }

  override componentDidCatch(fallo: Error, informacion: ErrorInfo): void {
    console.error('Fallo al dibujar la aplicación', fallo, informacion.componentStack)
  }

  override render(): ReactNode {
    if (!this.state.fallo) return this.props.children

    return (
      <div className="mx-auto flex max-w-xl flex-col gap-4 p-8">
        <h1 className="text-lg font-semibold text-falla">La aplicación se detuvo</h1>
        <p className="text-sm">
          Algo salió mal al dibujar la pantalla. Tu trabajo no se ha perdido: guárdalo en un
          archivo antes de recargar la página.
        </p>
        <p className="rounded border border-slate-300 p-3 font-mono text-xs dark:border-slate-700">
          {this.state.fallo.message}
        </p>
        <div className="flex gap-2">
          <BotonGuardar />
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700"
          >
            Recargar
          </button>
        </div>
      </div>
    )
  }
}
