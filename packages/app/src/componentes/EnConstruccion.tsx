import { useId, type ReactNode } from 'react'

interface Props {
  titulo: string
  /** Qué va a haber aquí, en una frase: así quien llega sabe que no es un fallo. */
  descripcion?: string
  children?: ReactNode
}

/**
 * Lo que muestra una pantalla de la ola 2 mientras su agente la construye.
 * Lleva el mismo título que tendrá la pantalla terminada, para que la
 * navegación se pueda recorrer (y probar) desde ya.
 */
export default function EnConstruccion({ titulo, descripcion, children }: Props) {
  const idTitulo = useId()
  return (
    <section aria-labelledby={idTitulo} className="mx-auto flex max-w-4xl flex-col gap-3 p-4 sm:p-6">
      <h2 id={idTitulo} className="text-lg font-semibold">
        {titulo}
      </h2>
      <p className="rounded border border-dashed border-slate-300 p-3 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
        <span aria-hidden="true">△ </span>
        En construcción.{descripcion ? ` ${descripcion}` : ''}
      </p>
      {children}
    </section>
  )
}
