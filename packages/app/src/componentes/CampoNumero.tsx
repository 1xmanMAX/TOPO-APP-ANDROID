import { useEffect, useState } from 'react'

interface Props {
  etiqueta?: string
  valor: number
  alCambiar: (valor: number) => void
  decimales?: number
  sufijo?: string
  ancho?: string
  alPresionarEnter?: () => void
}

/**
 * Campo numérico que mantiene el texto que el usuario está escribiendo.
 * Sin esto, escribir "3245," reformatearía el valor y movería el cursor.
 */
export default function CampoNumero({
  etiqueta,
  valor,
  alCambiar,
  decimales = 3,
  sufijo,
  ancho,
  alPresionarEnter,
}: Props) {
  const [texto, setTexto] = useState(valor.toFixed(decimales))
  const [editando, setEditando] = useState(false)

  useEffect(() => {
    if (!editando) setTexto(valor.toFixed(decimales))
  }, [valor, decimales, editando])

  function manejarCambio(entrada: string) {
    setTexto(entrada)
    const numero = Number(entrada.replace(',', '.'))
    if (entrada.trim() !== '' && Number.isFinite(numero)) alCambiar(numero)
  }

  return (
    <label className={`flex flex-col gap-1 ${ancho ?? ''}`}>
      {etiqueta && (
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{etiqueta}</span>
      )}
      <div className="flex items-center gap-1">
        <input
          type="text"
          inputMode="decimal"
          aria-label={etiqueta}
          value={texto}
          onFocus={() => setEditando(true)}
          onBlur={() => {
            setEditando(false)
            setTexto(valor.toFixed(decimales))
          }}
          onChange={(evento) => manejarCambio(evento.target.value)}
          onKeyDown={(evento) => {
            if (evento.key === 'Enter') alPresionarEnter?.()
          }}
          className="numerico w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-right text-sm outline-none focus:border-marca focus:ring-1 focus:ring-marca dark:border-slate-700 dark:bg-slate-900"
        />
        {sufijo && <span className="text-xs text-slate-500">{sufijo}</span>}
      </div>
    </label>
  )
}
