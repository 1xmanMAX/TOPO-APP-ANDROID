import { formatearProgresiva } from '@topo/core'
import { useEffect, useRef, useState } from 'react'

interface Props {
  progresivas: number[]
  valor: number
  alCambiar: (progresiva: number) => void
}

export default function DeslizadorProgresiva({ progresivas, valor, alCambiar }: Props) {
  const [reproduciendo, setReproduciendo] = useState(false)
  const temporizador = useRef<number | null>(null)
  const indice = Math.max(0, progresivas.indexOf(valor))

  useEffect(() => {
    if (!reproduciendo || progresivas.length === 0) return

    temporizador.current = window.setInterval(() => {
      const siguiente = (progresivas.indexOf(valor) + 1) % progresivas.length
      alCambiar(progresivas[siguiente]!)
    }, 700)

    return () => {
      if (temporizador.current) window.clearInterval(temporizador.current)
    }
  }, [reproduciendo, valor, progresivas, alCambiar])

  if (progresivas.length === 0) return null

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        aria-label={reproduciendo ? 'Detener recorrido' : 'Reproducir recorrido'}
        onClick={() => setReproduciendo((antes) => !antes)}
        className="min-h-11 min-w-11 rounded border border-slate-300 px-2 py-1 text-sm md:min-h-0 md:min-w-0 dark:border-slate-700"
      >
        {reproduciendo ? '⏸' : '▶'}
      </button>

      <span className="numerico w-20 text-sm font-semibold">{formatearProgresiva(valor)}</span>

      <input
        type="range"
        aria-label="Progresiva"
        min={0}
        max={progresivas.length - 1}
        step={1}
        value={indice}
        onChange={(evento) => alCambiar(progresivas[Number(evento.target.value)]!)}
        className="flex-1 accent-marca max-md:h-11"
      />

      <span className="text-xs text-slate-500">
        {formatearProgresiva(progresivas[0]!)} → {formatearProgresiva(progresivas[progresivas.length - 1]!)}
      </span>
    </div>
  )
}
