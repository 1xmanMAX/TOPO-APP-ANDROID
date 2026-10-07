import type { ReactNode } from 'react'

interface Props {
  titulo: ReactNode
  /** Una línea que dice qué hay dentro sin abrirlo («Clase III · 12 mm √K»). */
  resumen?: string
  abierto?: boolean
  children: ReactNode
  className?: string
}

/**
 * Un apartado que se pliega, sobre <details>/<summary>: sin JavaScript, con
 * teclado y lector de pantalla de serie. jsdom deja el contenido en el DOM
 * aunque esté cerrado, así que las pruebas unitarias lo siguen encontrando.
 *
 * Ojo en los guiones de Playwright: no se puede rellenar un campo de un
 * plegable cerrado (no es visible). El guion lo abre primero con un clic en
 * su summary.
 */
export default function Plegable({ titulo, resumen, abierto = false, children, className = '' }: Props) {
  return (
    <details open={abierto} className={`group ${className}`}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
        <span className="shrink-0 text-[15px] font-semibold">{titulo}</span>
        <span className="line-clamp-2 min-w-0 flex-1 text-sm leading-snug text-tenue">{resumen}</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-4 w-4 shrink-0 text-tenue transition-transform group-open:rotate-90"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
      </summary>
      <div className="pt-2">{children}</div>
    </details>
  )
}
