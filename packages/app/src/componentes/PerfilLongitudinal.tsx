import { formatearProgresiva, type CeldaEvaluada, type Id } from '@topo/core'
import { useMemo } from 'react'
import { useAlmacen } from '../estado/almacen'
import { useEvaluacionRasante, useResultado } from '../estado/derivados'
import { formatearCota } from '../formato'
import MarcoGrafico from '../grafico/MarcoGrafico'

interface Props {
  elementoClave: string
  /**
   * Contra qué campaña se dibuja la rasante: la decide quien llama, nunca
   * este componente mirando `campaniaActivaId` en el almacén — mismo
   * criterio que `idCampaniaReferencia` en `CorteTransversal`, y por la
   * misma razón: ese argumento ("solo hay un llamador hoy") ya falló una vez
   * ahí y costó dos rondas de arreglo cuando apareció un segundo llamador
   * con otra intención. El terreno (`useResultado`, más abajo) sigue siendo
   * siempre el de la campaña activa: es lo que este perfil está mostrando,
   * no una referencia elegible. `null` cuando no hay campaña activa que
   * ofrecer como referencia.
   */
  idCampaniaReferencia: Id | null
}

export default function PerfilLongitudinal({ elementoClave, idCampaniaReferencia }: Props) {
  const resultado = useResultado()
  const seleccion = useAlmacen((s) => s.seleccion)
  const seleccionar = useAlmacen((s) => s.seleccionar)

  const puntos = useMemo(() => {
    if (!resultado) return []
    return [...resultado.cotasPorCelda.values()]
      .filter((celda) => celda.elementoClave === elementoClave)
      .sort((a, b) => a.progresiva - b.progresiva)
  }, [resultado, elementoClave])

  const evaluacionRasante = useEvaluacionRasante(idCampaniaReferencia ?? '')

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
            {primeraCeldaRasante && (
              <g
                aria-label={`Rasante de proyecto, cota inicial ${formatearCota(primeraCeldaRasante.cotaTeorica!)} m`}
              >
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
