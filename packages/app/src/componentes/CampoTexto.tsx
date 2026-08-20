interface Props {
  etiqueta: string
  valor: string
  alCambiar: (valor: string) => void
  marcador?: string
  ancho?: string
}

export default function CampoTexto({ etiqueta, valor, alCambiar, marcador, ancho }: Props) {
  return (
    <label className={`flex flex-col gap-1 ${ancho ?? ''}`}>
      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{etiqueta}</span>
      <input
        type="text"
        value={valor}
        placeholder={marcador}
        onChange={(evento) => alCambiar(evento.target.value)}
        className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-marca focus:ring-1 focus:ring-marca dark:border-slate-700 dark:bg-slate-900"
      />
    </label>
  )
}
