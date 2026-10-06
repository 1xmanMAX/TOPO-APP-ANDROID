import { useEffect, useState } from 'react'

interface Props {
  etiqueta?: string
  /** Texto accesible del campo. Si falta, se usa `etiqueta`. */
  ariaLabel?: string
  valor: number
  alCambiar: (valor: number) => void
  decimales?: number
  sufijo?: string
  ancho?: string
  alPresionarEnter?: () => void
  /** Muestra el valor pero no deja escribir. Para cuando otra cosa manda el número. */
  soloLectura?: boolean
  /**
   * Cierra el cambio al salir del campo o con Enter, en vez de en cada tecla.
   *
   * Para cuando escribir el número tiene consecuencias que no se deshacen
   * —marcar como medida una distancia que la app había supuesto—: entonces
   * escribir tiene que ser un acto, y rozar el campo no puede bastar. Sin
   * esto, teclear un dígito y borrarlo deja el mismo número de antes pero
   * con un cambio ya avisado.
   */
  confirmarAlSalir?: boolean
}

/**
 * Campo numérico que mantiene el texto que el usuario está escribiendo.
 * Sin esto, escribir "3245," reformatearía el valor y movería el cursor.
 */
export default function CampoNumero({
  etiqueta,
  ariaLabel,
  valor,
  alCambiar,
  decimales = 3,
  sufijo,
  ancho,
  alPresionarEnter,
  soloLectura = false,
  confirmarAlSalir = false,
}: Props) {
  const [texto, setTexto] = useState(valor.toFixed(decimales))
  const [editando, setEditando] = useState(false)
  /** Si de verdad se escribió algo desde la última vez que se cerró el cambio. */
  const [tocado, setTocado] = useState(false)

  useEffect(() => {
    if (!editando) setTexto(valor.toFixed(decimales))
  }, [valor, decimales, editando])

  function manejarCambio(entrada: string) {
    setTexto(entrada)
    setTocado(true)
    // En este modo el aviso llega al cerrar, no tecla a tecla.
    if (confirmarAlSalir) return

    const numero = Number(entrada.replace(',', '.'))
    if (entrada.trim() !== '' && Number.isFinite(numero)) alCambiar(numero)
  }

  /**
   * Cierra el cambio con lo que quedó escrito. No avisa de nada si nadie
   * escribió (entrar y salir no es escribir) ni si lo escrito no es un
   * número (borrarlo entero deja las cosas como estaban). Escribir la misma
   * cifra que ya había sí avisa: confirmarla es un acto.
   */
  function confirmar() {
    if (!confirmarAlSalir || !tocado) return
    setTocado(false)

    const numero = Number(texto.replace(',', '.'))
    if (texto.trim() !== '' && Number.isFinite(numero)) alCambiar(numero)
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
          aria-label={ariaLabel ?? etiqueta}
          value={texto}
          readOnly={soloLectura}
          onFocus={() => setEditando(true)}
          onBlur={() => {
            setEditando(false)
            confirmar()
            setTexto(valor.toFixed(decimales))
          }}
          onChange={(evento) => {
            if (!soloLectura) manejarCambio(evento.target.value)
          }}
          onKeyDown={(evento) => {
            if (evento.key === 'Enter') {
              confirmar()
              alPresionarEnter?.()
            }
          }}
          className={`numerico min-h-11 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-right text-sm outline-none focus:border-marca focus:ring-1 focus:ring-marca dark:border-slate-700 dark:bg-slate-900 ${
            soloLectura ? 'text-slate-400 dark:text-slate-500' : ''
          }`}
        />
        {sufijo && <span className="text-xs text-slate-500">{sufijo}</span>}
      </div>
    </label>
  )
}
