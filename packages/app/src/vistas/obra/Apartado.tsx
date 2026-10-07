import { useId, type ReactNode } from 'react'

interface Props {
  /** Nombre corto y fijo: es el nombre accesible del botón («Sección»). */
  titulo: string
  /** Lo que tiene dentro, dicho en una línea sin abrirlo. */
  resumen: ReactNode
  abierto: boolean
  alAlternar: () => void
  /**
   * Plegado, esconde el contenido en vez de quitarlo. Para «Subir hoja»: una
   * hoja leída y a medio colocar no se puede perder por plegar el apartado.
   */
  conservarMontado?: boolean
  children: ReactNode
}

/**
 * Un apartado plegable del panel de la calle (lienzo «Ajustes»). Cerrado,
 * dice qué tiene en una línea; así se recorre la calle entera sin abrir nada.
 * El resumen va como descripción y no dentro del nombre del botón, para que
 * el nombre siga siendo «Sección» aunque cambie lo que la sección tiene. A la
 * vista se corta con «…» si no cabe; el lector de pantalla lo lee entero.
 */
export default function Apartado({ titulo, resumen, abierto, alAlternar, conservarMontado = false, children }: Props) {
  const idContenido = useId()
  const idResumen = useId()
  const idTitulo = useId()

  const signo = (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={`h-4 w-4 shrink-0 text-tenue transition-transform ${abierto ? 'rotate-90' : ''}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  )

  return (
    <section className="@container rounded-xl border border-borde bg-tarjeta">
      <button
        type="button"
        aria-expanded={abierto}
        // Solo apunta al contenido cuando está en la página.
        aria-controls={abierto || conservarMontado ? idContenido : undefined}
        aria-labelledby={idTitulo}
        aria-describedby={idResumen}
        onClick={alAlternar}
        className="flex min-h-14 w-full min-w-0 flex-col items-start gap-0.5 px-4 py-2 text-left @lg:flex-row @lg:items-center @lg:gap-3"
      >
        <span className="flex w-full items-center justify-between gap-2 @lg:w-52 @lg:flex-none">
          <span id={idTitulo} className="text-base font-semibold">
            {titulo}
          </span>
          <span className="@lg:hidden">{signo}</span>
        </span>
        <span id={idResumen} className="block w-full min-w-0 truncate text-sm text-tenue @lg:flex-1">
          {resumen}
        </span>
        <span className="hidden @lg:inline">{signo}</span>
      </button>
      {(abierto || conservarMontado) && (
        <div id={idContenido} hidden={!abierto} className="border-t border-borde">
          {children}
        </div>
      )}
    </section>
  )
}
