import type { ReactNode } from 'react'

type Tono = 'aviso' | 'falla' | 'pasa' | 'info'

interface Props {
  tono: Tono
  /** El símbolo del semáforo. Por defecto △ en aviso, ✗ en falla, ✓ en pasa. */
  simbolo?: string
  children: ReactNode
  accion?: { texto: string; alPulsar: () => void }
  className?: string
}

const CLASES: Record<Tono, string> = {
  aviso: 'bg-aviso-suave text-aviso',
  falla: 'bg-falla-suave text-falla',
  pasa: 'bg-pasa-suave text-pasa',
  info: 'bg-sin-suave text-tinta',
}

const SIMBOLO: Record<Tono, string> = { aviso: '△', falla: '✗', pasa: '✓', info: 'ℹ' }

/**
 * El aviso de una línea del lienzo: símbolo, texto y, si hace falta, una
 * acción al final. «No comprobado» va siempre en tono aviso (△), nunca en
 * rojo: no dice que esté mal, dice que falta cerrar la nivelación.
 */
export default function AvisoLinea({ tono, simbolo, children, accion, className = '' }: Props) {
  return (
    <div className={`flex items-start gap-2 rounded-[10px] px-3 py-2 text-sm ${CLASES[tono]} ${className}`}>
      <span aria-hidden="true" className="shrink-0 font-semibold leading-5">
        {simbolo ?? SIMBOLO[tono]}
      </span>
      <div className="min-w-0 flex-1 leading-5">{children}</div>
      {accion && (
        <button
          type="button"
          onClick={accion.alPulsar}
          className="-my-2 inline-flex min-h-11 shrink-0 items-center font-semibold underline underline-offset-2"
        >
          {accion.texto}
        </button>
      )}
    </div>
  )
}
