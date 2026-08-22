import { formatearProgresiva, type CeldaEvaluada } from '@topo/core'
import { useMemo } from 'react'
import { useAlmacen } from '../estado/almacen'
import { useEvaluacionRasante, useResultado } from '../estado/derivados'
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

  /**
   * La rasante de la misma campaña que dibuja el terreno de este perfil
   * (`useResultado`, sin id: cae en la campaña activa igual que el terreno) —
   * nunca la del eje sin más. Por el bombeo, la rasante de un elemento fuera
   * del eje va a otra cota; dibujar la del eje aquí mentiría en toda la
   * longitud de la calle.
   */
  const evaluacionRasante = useEvaluacionRasante()

  const celdasRasante = useMemo(() => {
    if (!evaluacionRasante) return []
    return [...evaluacionRasante.celdas.values()]
      .filter((celda) => celda.elementoClave === elementoClave)
      .sort((a, b) => a.progresiva - b.progresiva)
  }, [evaluacionRasante, elementoClave])

  // Mismo criterio que en el corte transversal: se corta el trazo donde el
  // proyecto no define rasante en esa progresiva, en vez de unir dos puntos
  // con una recta que nadie proyectó.
  const tramosRasante = useMemo(() => {
    const grupos: CeldaEvaluada[][] = []
    let actual: CeldaEvaluada[] = []
    const cerrar = () => {
      if (actual.length > 0) grupos.push(actual)
      actual = []
    }
    for (const celda of celdasRasante) {
      if (celda.cotaTeorica !== null) actual.push(celda)
      else cerrar()
    }
    cerrar()
    return grupos
  }, [celdasRasante])

  const primeraCeldaRasante = tramosRasante[0]?.[0]

  if (puntos.length === 0 && tramosRasante.length === 0) {
    return (
      <p className="rounded border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">
        {elementoClave} no tiene lecturas todavía.
      </p>
    )
  }

  return (
    <MarcoGrafico
      valoresX={[...puntos.map((p) => p.progresiva), ...celdasRasante.map((c) => c.progresiva)]}
      valoresY={[
        ...puntos.map((p) => p.cota),
        ...celdasRasante.filter((c) => c.cotaTeorica !== null).map((c) => c.cotaTeorica!),
      ]}
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
            {tramosRasante.length > 0 && (
              <g aria-label="Rasante de proyecto">
                {tramosRasante.map((grupo, indice) => (
                  <polyline
                    key={`rasante-${indice}`}
                    points={grupo
                      .map((c) => `${x(c.progresiva).toFixed(1)},${y(c.cotaTeorica!).toFixed(1)}`)
                      .join(' ')}
                    fill="none"
                    className="stroke-slate-700 dark:stroke-slate-200"
                    strokeWidth={2}
                    strokeDasharray="6 4"
                  />
                ))}
                {primeraCeldaRasante && (
                  <text
                    x={x(primeraCeldaRasante.progresiva) + 6}
                    y={y(primeraCeldaRasante.cotaTeorica!) - 6}
                    aria-hidden="true"
                    className="fill-slate-500 text-[9px]"
                  >
                    rasante {formatearCota(primeraCeldaRasante.cotaTeorica!)} m
                  </text>
                )}
              </g>
            )}

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
