import { formatearProgresiva } from '@topo/core'
import { useMemo } from 'react'
import { useAlmacen } from '../estado/almacen'
import { useResultado } from '../estado/derivados'
import { formatearCota } from '../formato'
import { escalaLineal, extension, marcas } from '../grafico/escala'

const ANCHO = 720
const ALTO = 240
const MARGEN = { arriba: 16, derecha: 16, abajo: 34, izquierda: 62 }

interface Props {
  elementoClave: string
}

export default function PerfilLongitudinal({ elementoClave }: Props) {
  const resultado = useResultado()
  const seleccion = useAlmacen((s) => s.seleccion)
  const seleccionar = useAlmacen((s) => s.seleccionar)

  const puntos = useMemo(() => {
    if (!resultado) return []
    return [...resultado.cotasPorCelda.values()]
      .filter((celda) => celda.elementoClave === elementoClave)
      .sort((a, b) => a.progresiva - b.progresiva)
  }, [resultado, elementoClave])

  if (puntos.length === 0) {
    return (
      <p className="rounded border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">
        {elementoClave} no tiene lecturas todavía.
      </p>
    )
  }

  const dominioX = extension(puntos.map((p) => p.progresiva), 0.05)
  const dominioY = extension(puntos.map((p) => p.cota), 0.25)
  const x = escalaLineal(dominioX, [MARGEN.izquierda, ANCHO - MARGEN.derecha])
  const y = escalaLineal(dominioY, [ALTO - MARGEN.abajo, MARGEN.arriba])

  const trazo = puntos.map((p) => `${x(p.progresiva).toFixed(1)},${y(p.cota).toFixed(1)}`).join(' ')

  return (
    <svg
      viewBox={`0 0 ${ANCHO} ${ALTO}`}
      role="img"
      aria-label={`Perfil longitudinal de ${elementoClave}`}
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

      {marcas(dominioX, 6).map((progresiva) => (
        <text
          key={`x-${progresiva}`}
          x={x(progresiva)}
          y={ALTO - MARGEN.abajo + 16}
          textAnchor="middle"
          className="fill-slate-500 text-[10px]"
        >
          {formatearProgresiva(progresiva)}
        </text>
      ))}

      <polyline points={trazo} fill="none" className="stroke-marca" strokeWidth={2} />

      {puntos.map((punto) => {
        const activo = seleccion.clave === punto.clave
        return (
          <circle
            key={punto.clave}
            cx={x(punto.progresiva)}
            cy={y(punto.cota)}
            r={activo ? 7 : 4.5}
            role="button"
            tabIndex={0}
            data-activo={activo}
            aria-label={`${formatearProgresiva(punto.progresiva)} ${punto.elementoClave} · cota ${formatearCota(punto.cota)}`}
            onClick={() => seleccionar(punto.clave)}
            onKeyDown={(evento) => {
              if (evento.key === 'Enter' || evento.key === ' ') seleccionar(punto.clave)
            }}
            className={`cursor-pointer outline-none ${activo ? 'fill-falla' : 'fill-marca'}`}
          />
        )
      })}
    </svg>
  )
}
