import { useRef, useState, type DragEvent } from 'react'
import VistaSubirDatos from '../VistaSubirDatos'

/**
 * Pasa el archivo soltado al campo de archivo de `VistaSubirDatos`, como si
 * se hubiera elegido a mano: así la lectura, los avisos y la aceptación son
 * exactamente los de siempre, sin una segunda puerta de entrada que pueda
 * leer distinto.
 */
export function entregarArchivo(contenedor: HTMLElement | null, archivos: FileList): boolean {
  const campo = contenedor?.querySelector<HTMLInputElement>('input[type="file"]')
  if (!campo || archivos.length === 0) return false
  try {
    campo.files = archivos
  } catch {
    // Algún navegador no deja asignar la lista; se define encima.
    Object.defineProperty(campo, 'files', { configurable: true, value: archivos })
  }
  campo.dispatchEvent(new Event('change', { bubbles: true }))
  return true
}

/** «Subir hoja» dentro del panel de la calle: la pantalla de subir datos de siempre, y se puede soltar el Excel encima. */
export default function SubirHojaEmbebida({ calleDelPanel }: { calleDelPanel?: string }) {
  const contenedor = useRef<HTMLDivElement>(null)
  const [encima, setEncima] = useState(false)

  function alSoltar(evento: DragEvent<HTMLDivElement>) {
    evento.preventDefault()
    setEncima(false)
    entregarArchivo(contenedor.current, evento.dataTransfer.files)
  }

  return (
    <div
      ref={contenedor}
      data-testid="zona-subir-hoja"
      onDragOver={(e) => {
        e.preventDefault()
        setEncima(true)
      }}
      onDragLeave={() => setEncima(false)}
      onDrop={alSoltar}
      // La pantalla de subir datos es la de siempre, pensada para la laptop:
      // aquí, que también se usa en el celular, sus botones y campos se
      // agrandan a 44 px y su margen se encoge, sin tocar la pantalla.
      className={`rounded-b-lg [&_button]:min-h-11 [&_input:not([type=file])]:min-h-11 [&_select]:min-h-11 [&>div]:p-4 ${
        encima ? 'outline-2 outline-dashed outline-marca' : ''
      }`}
    >
      <p className="px-4 pt-3 text-sm text-slate-600 dark:text-slate-300">
        <span aria-hidden="true">⇪ </span>
        Suelta aquí tu Excel o tu CSV, elígelo abajo o pega las celdas.
      </p>
      <p className="px-4 pt-1 text-sm text-aviso">
        <span aria-hidden="true">△ </span>
        La calle sale del nombre del archivo.
        {calleDelPanel
          ? ` Si esta hoja es de «${calleDelPanel}», comprueba que ese nombre esté en «¿A qué calle va esta hoja?» antes de aceptar: si no, nace otra calle.`
          : ' Comprueba el nombre en «¿A qué calle va esta hoja?» antes de aceptar.'}
      </p>
      <VistaSubirDatos />
    </div>
  )
}
