import type { ReactNode } from 'react'

export interface OpcionSegmentado<V extends string> {
  valor: V
  texto: string
  /** Un ícono de 18 px que va antes del texto (aria-hidden). */
  icono?: ReactNode
}

interface Props<V extends string> {
  /** El nombre accesible del grupo («Modos de la calle»). */
  etiqueta: string
  opciones: OpcionSegmentado<V>[]
  /** La opción elegida; `null` si ninguna lo está (p. ej. con una pantalla encima). */
  valor: V | null
  alCambiar: (valor: V) => void
  /** Oscuro sobre la cabecera, claro sobre el fondo de la pantalla. */
  tono?: 'oscuro' | 'claro'
  /**
   * Qué es para el lector de pantalla: `nav` cuando cambia de pantalla,
   * `group` cuando cambia una vista dentro de la misma, `tablist` cuando hay
   * paneles de pestaña. Con `tablist` los botones son pestañas con
   * aria-selected; si no, aria-pressed.
   */
  como?: 'nav' | 'group' | 'tablist'
  anchoCompleto?: boolean
  className?: string
}

/**
 * El control segmentado del lienzo: dos a cuatro opciones en una cápsula, la
 * elegida resaltada. Es siempre un solo elemento (no uno para el celular y
 * otro para la laptop): los guiones buscan por nombre y verían dos.
 */
export default function Segmentado<V extends string>({
  etiqueta,
  opciones,
  valor,
  alCambiar,
  tono = 'claro',
  como = 'group',
  anchoCompleto = false,
  className = '',
}: Props<V>) {
  const oscuro = tono === 'oscuro'
  const contenedor = `flex gap-1 rounded-xl p-1 ${oscuro ? 'bg-cabecera-2' : 'bg-borde/60 dark:bg-cabecera-2'} ${
    anchoCompleto ? 'w-full' : ''
  } ${className}`
  const claseActivo = oscuro ? 'bg-white text-[#10161D]' : 'bg-tarjeta text-tinta shadow-sm'
  const claseInactivo = oscuro ? 'text-cabecera-texto hover:text-white' : 'text-tenue hover:text-tinta'

  const botones = opciones.map((opcion) => {
    const activo = opcion.valor === valor
    const estado = como === 'tablist' ? { role: 'tab', 'aria-selected': activo } : { 'aria-pressed': activo }
    return (
      <button
        key={opcion.valor}
        type="button"
        {...estado}
        onClick={() => alCambiar(opcion.valor)}
        className={`inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-[9px] px-2 text-[15px] font-semibold sm:gap-2 sm:px-3 ${
          activo ? claseActivo : claseInactivo
        }`}
      >
        {opcion.icono && (
          <span aria-hidden="true" className="inline-flex h-[18px] w-[18px] shrink-0 max-[379px]:hidden items-center justify-center [&>svg]:h-[18px] [&>svg]:w-[18px]">
            {opcion.icono}
          </span>
        )}
        {opcion.texto}
      </button>
    )
  })

  if (como === 'nav') {
    return (
      <nav aria-label={etiqueta} className={contenedor}>
        {botones}
      </nav>
    )
  }
  return (
    <div role={como} aria-label={etiqueta} className={contenedor}>
      {botones}
    </div>
  )
}
