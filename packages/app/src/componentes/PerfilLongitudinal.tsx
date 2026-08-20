import { formatearProgresiva } from '@topo/core'
import { useMemo } from 'react'
import { useAlmacen } from '../estado/almacen'
import { useResultado } from '../estado/derivados'
import { formatearCota } from '../formato'
import MarcoGrafico from '../grafico/MarcoGrafico'

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

  return (
    <MarcoGrafico
      valoresX={puntos.map((p) => p.progresiva)}
      valoresY={puntos.map((p) => p.cota)}
      margenX={0.05}
      alto={240}
      rotuloX="progresiva"
      formatearX={(valor) => formatearProgresiva(valor)}
      etiqueta={`Perfil longitudinal de ${elementoClave}`}
    >
      {({ x, y }) => {
        const trazo = puntos
          .map((p) => `${x(p.progresiva).toFixed(1)},${y(p.cota).toFixed(1)}`)
          .join(' ')
        return (
          <>
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
          </>
        )
      }}
    </MarcoGrafico>
  )
}
