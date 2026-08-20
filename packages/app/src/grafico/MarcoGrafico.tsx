import type { ReactNode } from 'react'
import { formatearCota } from '../formato'
import { escalaLineal, extension, marcas } from './escala'

const ANCHO = 720
const ALTO_POR_DEFECTO = 260
const MARGEN = { arriba: 16, derecha: 16, abajo: 34, izquierda: 62 }
const MARGEN_RELATIVO_Y = 0.25

interface PropsMarco {
  valoresX: number[]
  valoresY: number[]
  rotuloX: string
  formatearX: (valor: number) => string
  /** Margen relativo del dominio horizontal, ver `extension`. Distinto según el gráfico. */
  margenX?: number
  alto?: number
  etiqueta: string
  children: (escalas: { x: (v: number) => number; y: (v: number) => number }) => ReactNode
}

export default function MarcoGrafico({
  valoresX,
  valoresY,
  rotuloX,
  formatearX,
  margenX = 0.08,
  alto = ALTO_POR_DEFECTO,
  etiqueta,
  children,
}: PropsMarco) {
  const dominioX = extension(valoresX, margenX)
  const dominioY = extension(valoresY, MARGEN_RELATIVO_Y)

  const x = escalaLineal(dominioX, [MARGEN.izquierda, ANCHO - MARGEN.derecha])
  const y = escalaLineal(dominioY, [alto - MARGEN.abajo, MARGEN.arriba])

  return (
    <svg
      viewBox={`0 0 ${ANCHO} ${alto}`}
      role="img"
      aria-label={etiqueta}
      className="w-full rounded border border-slate-200 dark:border-slate-800"
    >
      {marcas(dominioY, 4).map((cota) => (
        <g key={`y-${cota}`}>
          <line
            x1={MARGEN.izquierda}
            x2={ANCHO - MARGEN.derecha}
            y1={y(cota)}
            y2={y(cota)}
            className="stroke-slate-200 dark:stroke-slate-800"
          />
          <text
            x={MARGEN.izquierda - 6}
            y={y(cota) + 4}
            textAnchor="end"
            className="fill-slate-500 text-[10px]"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {formatearCota(cota)}
          </text>
        </g>
      ))}

      {marcas(dominioX, 6).map((valor) => (
        <text
          key={`x-${valor}`}
          x={x(valor)}
          y={alto - MARGEN.abajo + 16}
          textAnchor="middle"
          className="fill-slate-500 text-[10px]"
        >
          {formatearX(valor)}
        </text>
      ))}

      <text
        x={(MARGEN.izquierda + ANCHO - MARGEN.derecha) / 2}
        y={alto - 6}
        textAnchor="middle"
        className="fill-slate-400 text-[10px]"
      >
        {rotuloX}
      </text>

      {children({ x, y })}
    </svg>
  )
}
