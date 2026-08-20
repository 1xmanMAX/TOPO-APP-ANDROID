import { formatearProgresiva } from '@topo/core'
import { useMemo } from 'react'
import { useAlmacen } from '../estado/almacen'
import { useResultado } from '../estado/derivados'
import { escalaLineal, extension, marcas } from '../grafico/escala'

const ANCHO = 720
const ALTO = 260
const MARGEN = { arriba: 16, derecha: 16, abajo: 34, izquierda: 62 }

interface Props {
  progresiva: number
}

export default function CorteTransversal({ progresiva }: Props) {
  const resultado = useResultado()
  const seleccion = useAlmacen((s) => s.seleccion)
  const seleccionar = useAlmacen((s) => s.seleccionar)

  const puntos = useMemo(() => {
    if (!resultado) return []
    return [...resultado.cotasPorCelda.values()]
      .filter((celda) => celda.progresiva === progresiva)
      .sort((a, b) => a.offset - b.offset)
  }, [resultado, progresiva])

  if (puntos.length === 0) {
    return (
      <p className="rounded border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">
        {formatearProgresiva(progresiva)} todavía no tiene lecturas.
      </p>
    )
  }

  const dominioX = extension(puntos.map((p) => p.offset), 0.08)
  const dominioY = extension(puntos.map((p) => p.cota), 0.25)

  const x = escalaLineal(dominioX, [MARGEN.izquierda, ANCHO - MARGEN.derecha])
  const y = escalaLineal(dominioY, [ALTO - MARGEN.abajo, MARGEN.arriba])

  const trazo = puntos.map((p) => `${x(p.offset).toFixed(1)},${y(p.cota).toFixed(1)}`).join(' ')

  return (
    <svg
      viewBox={`0 0 ${ANCHO} ${ALTO}`}
      role="img"
      aria-label={`Corte transversal en ${formatearProgresiva(progresiva)}`}
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
            {cota.toFixed(3)}
          </text>
        </g>
      ))}

      {marcas(dominioX, 6).map((offset) => (
        <text
          key={`x-${offset}`}
          x={x(offset)}
          y={ALTO - MARGEN.abajo + 16}
          textAnchor="middle"
          className="fill-slate-500 text-[10px]"
        >
          {offset.toFixed(1)}
        </text>
      ))}

      <text
        x={(MARGEN.izquierda + ANCHO - MARGEN.derecha) / 2}
        y={ALTO - 6}
        textAnchor="middle"
        className="fill-slate-400 text-[10px]"
      >
        distancia al eje (m)
      </text>

      <polyline points={trazo} fill="none" className="stroke-marca" strokeWidth={2} />

      {puntos.map((punto) => {
        const activo = seleccion.clave === punto.clave
        return (
          <g key={punto.clave}>
            <circle
              cx={x(punto.offset)}
              cy={y(punto.cota)}
              r={activo ? 7 : 4.5}
              className={activo ? 'fill-falla' : 'fill-marca'}
            />
            <text
              x={x(punto.offset)}
              y={y(punto.cota) - 12}
              textAnchor="middle"
              className="fill-slate-500 text-[9px]"
            >
              {punto.elementoClave}
            </text>
            <circle
              cx={x(punto.offset)}
              cy={y(punto.cota)}
              r={14}
              fill="transparent"
              role="button"
              tabIndex={0}
              data-activo={activo}
              aria-label={`${formatearProgresiva(punto.progresiva)} ${punto.elementoClave} · cota ${punto.cota.toFixed(3)}`}
              onClick={() => seleccionar(punto.clave)}
              onKeyDown={(evento) => {
                if (evento.key === 'Enter' || evento.key === ' ') seleccionar(punto.clave)
              }}
              className="cursor-pointer outline-none"
            >
              <title>
                {punto.elementoClave} · offset {punto.offset.toFixed(2)} m · cota{' '}
                {punto.cota.toFixed(3)} m
              </title>
            </circle>
          </g>
        )
      })}
    </svg>
  )
}
