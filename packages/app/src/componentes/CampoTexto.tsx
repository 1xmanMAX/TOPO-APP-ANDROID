import { useId } from 'react'

interface Props {
  etiqueta: string
  valor: string
  alCambiar: (valor: string) => void
  marcador?: string
  ancho?: string
  /** Una línea de ayuda debajo del campo. */
  ayuda?: string
}

export default function CampoTexto({ etiqueta, valor, alCambiar, marcador, ancho, ayuda }: Props) {
  const idAyuda = useId()
  return (
    <label className={`flex flex-col gap-1 ${ancho ?? ''}`}>
      <span className="text-[13px] font-medium text-tenue">{etiqueta}</span>
      <input
        type="text"
        // Con ayuda, el nombre es solo la etiqueta: la ayuda va como descripción.
        aria-label={ayuda ? etiqueta : undefined}
        aria-describedby={ayuda ? idAyuda : undefined}
        value={valor}
        placeholder={marcador}
        onChange={(evento) => alCambiar(evento.target.value)}
        className="min-h-12 rounded-[10px] border border-borde-fuerte bg-tarjeta px-3 text-base text-tinta outline-none focus:border-tinta focus:ring-2 focus:ring-marca/30"
      />
      {ayuda && (
        <span id={idAyuda} className="text-[13px] text-tenue">
          {ayuda}
        </span>
      )}
    </label>
  )
}
