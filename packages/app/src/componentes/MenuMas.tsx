import { useEffect, useRef, useState, type ReactNode } from 'react'
import { BOTON_ICONO } from './ui'

interface Props {
  /** El nombre accesible del botón («Archivo», «Más de la jornada»). */
  etiqueta: string
  /**
   * El texto que se ve junto al ícono. Si falta, solo se ve el ícono (⋯ o el
   * que se pase) y la etiqueta va en aria-label.
   */
  textoVisible?: string
  /** Un ícono propio en vez de los tres puntos. */
  icono?: ReactNode
  idMenu: string
  /** El nombre accesible del panel que se abre («Archivo del proyecto»). */
  etiquetaGrupo: string
  alinear?: 'derecha' | 'izquierda'
  tono?: 'oscuro' | 'claro'
  /** Clases extra del texto visible (p. ej. «hidden md:inline» para ocultarlo en el celular). */
  claseTexto?: string
  /**
   * Si es true, el menú se cierra al tocar un botón de dentro (una acción
   * que se elige y listo, como «Corregir»). Por defecto sigue abierto: hay
   * menús con selectores de archivo o con un «Copiado ✓» que se tiene que ver.
   */
  cerrarAlElegir?: boolean
  children: ReactNode
}

export const PUNTOS = (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="currentColor">
    <circle cx="5" cy="12" r="1.8" />
    <circle cx="12" cy="12" r="1.8" />
    <circle cx="19" cy="12" r="1.8" />
  </svg>
)

/**
 * El «⋯» del lienzo: lo que no se usa a cada rato va plegado detrás de un
 * botón, para que la pantalla tenga pocos botones. Se cierra al tocar fuera
 * o con Escape.
 *
 * El panel se oculta con `hidden` y no se desmonta: si dentro hay un selector
 * de archivo y el menú se cerrara al tocar «Abrir», se llevaría el selector
 * con el archivo a medio elegir.
 */
export default function MenuMas({
  etiqueta,
  textoVisible,
  icono,
  idMenu,
  etiquetaGrupo,
  alinear = 'derecha',
  tono = 'claro',
  claseTexto = '',
  cerrarAlElegir = false,
  children,
}: Props) {
  const [abierto, setAbierto] = useState(false)
  const contenedor = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!abierto) return
    function alTocarFuera(evento: PointerEvent) {
      if (!contenedor.current?.contains(evento.target as Node)) setAbierto(false)
    }
    function alPulsarTecla(evento: KeyboardEvent) {
      if (evento.key === 'Escape') setAbierto(false)
    }
    document.addEventListener('pointerdown', alTocarFuera)
    document.addEventListener('keydown', alPulsarTecla)
    return () => {
      document.removeEventListener('pointerdown', alTocarFuera)
      document.removeEventListener('keydown', alPulsarTecla)
    }
  }, [abierto])

  const claseBoton =
    tono === 'oscuro'
      ? `inline-flex h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-[10px] border border-cabecera-borde text-white hover:bg-cabecera-2 ${
          textoVisible ? 'px-2.5 text-sm font-medium' : ''
        } ${abierto ? 'bg-cabecera-2' : ''}`
      : `${BOTON_ICONO} ${textoVisible ? 'w-auto gap-2 px-3 text-sm font-medium' : ''} ${abierto ? 'bg-fondo' : ''}`

  // Si el texto visible es el mismo que el nombre, el nombre sale del texto;
  // si no (o si en el celular se oculta), va en aria-label.
  const ariaLabel = textoVisible === etiqueta && !claseTexto ? undefined : etiqueta

  return (
    <div ref={contenedor} className="relative">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={abierto}
        aria-controls={idMenu}
        onClick={() => setAbierto((actual) => !actual)}
        className={claseBoton}
      >
        {icono ?? PUNTOS}
        {textoVisible && (
          <span aria-hidden={ariaLabel ? true : undefined} className={claseTexto}>
            {textoVisible}
          </span>
        )}
      </button>
      <div
        id={idMenu}
        role="group"
        aria-label={etiquetaGrupo}
        hidden={!abierto}
        onClick={
          cerrarAlElegir
            ? (evento) => {
                if ((evento.target as HTMLElement).closest('button')) setAbierto(false)
              }
            : undefined
        }
        className={`absolute top-full z-40 mt-1 w-max max-w-[calc(100vw-1rem)] rounded-xl border border-borde bg-tarjeta p-2 text-tinta shadow-lg ${
          alinear === 'derecha' ? 'right-0' : 'left-0'
        }`}
      >
        {children}
      </div>
    </div>
  )
}
