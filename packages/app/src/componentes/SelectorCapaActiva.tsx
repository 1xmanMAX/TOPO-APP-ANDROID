import type { Calle } from '@topo/core'
import { useId, type ReactNode } from 'react'
import { useAlmacen } from '../estado/almacen'

/**
 * Un desplegable en chip oscuro, como el de «Capa» de la cabecera del lienzo.
 * La etiqueta accesible va aparte (sr-only) y el chevron lo pinta un svg: el
 * del navegador no se ve sobre el fondo oscuro. Las opciones llevan fondo
 * blanco y tinta propios porque en Windows heredan el color del select.
 */
export function ChipSelect({
  etiqueta,
  rotulo,
  valor,
  alCambiar,
  claseTexto,
  className = '',
  children,
}: {
  /** El nombre accesible: «Calle activa», «Capa activa». */
  etiqueta: string
  /** La palabra corta que se ve delante desde md («Capa»). */
  rotulo?: string
  valor: string
  alCambiar: (valor: string) => void
  claseTexto: string
  className?: string
  children: ReactNode
}) {
  const id = useId()
  return (
    <div className={`flex min-w-0 items-center gap-2 ${className}`}>
      <label htmlFor={id} className="sr-only">
        {etiqueta}
      </label>
      {rotulo && (
        <span aria-hidden="true" className="shrink-0 text-sm text-cabecera-tenue max-lg:hidden">
          {rotulo}
        </span>
      )}
      <div className="relative min-w-0 flex-1">
        <select
          id={id}
          value={valor}
          onChange={(evento) => alCambiar(evento.target.value)}
          className={`h-11 w-full min-w-0 appearance-none truncate rounded-lg border border-cabecera-borde bg-cabecera-2 pr-8 pl-3 text-white [&_option]:bg-white [&_option]:text-[#10161D] [&_optgroup]:bg-white [&_optgroup]:text-[#10161D] ${claseTexto}`}
        >
          {children}
        </select>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="pointer-events-none absolute top-1/2 right-2.5 h-4 w-4 -translate-y-1/2 text-cabecera-tenue"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </div>
    </div>
  )
}

interface Props {
  calle: Calle
  className?: string
}

/**
 * Qué capa de la calle se está mirando: cada toma de cada nivelación es una
 * capa medida un día. Cambiarla cambia la toma activa, y con ella el corte,
 * el mapa y la ficha. Las tomas van agrupadas por nivelación porque la
 * misma capa puede medirse en dos nivelaciones distintas (ida y control).
 * Vive en la cabecera, junto a la calle activa.
 */
export default function SelectorCapaActiva({ calle, className = '' }: Props) {
  const capas = useAlmacen((s) => s.proyecto.capas)
  const campaniaActivaId = useAlmacen((s) => s.campaniaActivaId)
  const activarCampania = useAlmacen((s) => s.activarCampania)

  const hayTomas = calle.nivelaciones.some((n) => n.tomas.length > 0)
  if (!hayTomas) return null

  return (
    <ChipSelect
      etiqueta="Capa activa"
      rotulo="Capa"
      valor={campaniaActivaId ?? ''}
      alCambiar={(valor) => activarCampania(valor || null)}
      claseTexto="text-sm font-semibold"
      className={className}
    >
      {campaniaActivaId === null && <option value="">Elige una capa</option>}
      {calle.nivelaciones.map((nivelacion) =>
        nivelacion.tomas.length === 0 ? null : (
          <optgroup key={nivelacion.id} label={nivelacion.nombre}>
            {nivelacion.tomas.map((toma) => (
              <option key={toma.id} value={toma.id}>
                {capas.find((c) => c.id === toma.capaId)?.nombre ?? 'Sin capa'} · {toma.fecha}
              </option>
            ))}
          </optgroup>
        ),
      )}
    </ChipSelect>
  )
}
