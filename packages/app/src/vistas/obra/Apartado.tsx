import { useId, type ReactNode } from 'react'

interface Props {
  /** Nombre corto y fijo: es el nombre accesible del botón («Sección»). */
  titulo: string
  /** Lo que tiene dentro, dicho sin abrirlo. */
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
 * Un apartado plegable del panel de la calle. Cerrado, dice qué tiene en una
 * línea; así se recorre la calle entera sin abrir nada. El resumen va como
 * descripción y no dentro del nombre del botón, para que el nombre siga
 * siendo «Sección» aunque cambie lo que la sección tiene.
 */
export default function Apartado({ titulo, resumen, abierto, alAlternar, conservarMontado = false, children }: Props) {
  const idContenido = useId()
  const idResumen = useId()
  const idTitulo = useId()

  return (
    <section className="@container rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <button
        type="button"
        aria-expanded={abierto}
        // Solo apunta al contenido cuando está en la página.
        aria-controls={abierto || conservarMontado ? idContenido : undefined}
        aria-labelledby={idTitulo}
        aria-describedby={idResumen}
        onClick={alAlternar}
        className="flex min-h-14 w-full flex-col items-start gap-0.5 px-4 py-2 text-left @lg:flex-row @lg:items-center @lg:gap-4"
      >
        <span className="flex w-full items-center justify-between gap-2 @lg:w-44 @lg:flex-none">
          <span id={idTitulo} className="text-base font-semibold">
            {titulo}
          </span>
          <span aria-hidden="true" className="text-lg text-slate-500 @lg:hidden">
            {abierto ? '−' : '+'}
          </span>
        </span>
        <span id={idResumen} className="flex-1 text-sm text-slate-600 dark:text-slate-300">
          {resumen}
        </span>
        <span aria-hidden="true" className="hidden text-lg text-slate-500 @lg:inline">
          {abierto ? '−' : '+'}
        </span>
      </button>
      {(abierto || conservarMontado) && (
        <div id={idContenido} hidden={!abierto} className="border-t border-slate-200 dark:border-slate-800">
          {children}
        </div>
      )}
    </section>
  )
}
