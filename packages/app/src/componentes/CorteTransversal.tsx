import { formatearProgresiva } from '@topo/core'
import { useMemo } from 'react'
import { useAlmacen } from '../estado/almacen'
import { useResultado } from '../estado/derivados'
import { formatearCota } from '../formato'
import MarcoGrafico from '../grafico/MarcoGrafico'

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

  return (
    <MarcoGrafico
      valoresX={puntos.map((p) => p.offset)}
      valoresY={puntos.map((p) => p.cota)}
      margenX={0.08}
      rotuloX="distancia al eje (m)"
      formatearX={(valor) => valor.toFixed(1)}
      etiqueta={`Corte transversal en ${formatearProgresiva(progresiva)}`}
    >
      {({ x, y }) => {
        const trazo = puntos.map((p) => `${x(p.offset).toFixed(1)},${y(p.cota).toFixed(1)}`).join(' ')
        return (
          <>
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
                    aria-label={`${formatearProgresiva(punto.progresiva)} ${punto.elementoClave} · cota ${formatearCota(punto.cota)} m`}
                    onClick={() => seleccionar(punto.clave)}
                    onKeyDown={(evento) => {
                      if (evento.key === 'Enter' || evento.key === ' ') seleccionar(punto.clave)
                    }}
                    className="cursor-pointer outline-none"
                  >
                    <title>
                      {punto.elementoClave} · offset {punto.offset.toFixed(2)} m · cota{' '}
                      {formatearCota(punto.cota)} m
                    </title>
                  </circle>
                </g>
              )
            })}
          </>
        )
      }}
    </MarcoGrafico>
  )
}
