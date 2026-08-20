import { compararCapas, formatearProgresiva, type CeldaComparada, type CotaCelda, type Id } from '@topo/core'
import { useMemo } from 'react'
import { useAlmacen } from '../estado/almacen'
import { useResultadosDe } from '../estado/derivados'
import { formatearCota } from '../formato'
import MarcoGrafico from '../grafico/MarcoGrafico'

interface Props {
  progresiva: number
}

interface EstiloCapa {
  linea: string
  punto: string
  trazo?: string
}

/**
 * De las cuatro variables de color del proyecto, tres ya significan algo
 * (pasa/falla/aviso): no sirven para distinguir capas sin mentir. Mientras no
 * exista una paleta propia para capas, la primera capa visible usa el color
 * de marca (igual que el trazo único de antes) y las siguientes se
 * distinguen por tono neutro y por el patrón del trazo, para que sigan
 * siendo legibles incluso si dos tonos de gris quedan parecidos.
 */
const ESTILOS_CAPA: EstiloCapa[] = [
  { linea: 'stroke-marca', punto: 'fill-marca' },
  { linea: 'stroke-slate-500 dark:stroke-slate-400', punto: 'fill-slate-500 dark:fill-slate-400', trazo: '7 3' },
  { linea: 'stroke-slate-800 dark:stroke-slate-200', punto: 'fill-slate-800 dark:fill-slate-200', trazo: '2 3' },
  { linea: 'stroke-slate-400 dark:stroke-slate-600', punto: 'fill-slate-400 dark:fill-slate-600', trazo: '1 4' },
]

const CLASE_RELLENO = 'fill-slate-400/25 dark:fill-slate-300/20'

interface SerieCapa {
  campaniaId: Id
  nombreCapa: string
  orden: number
  puntos: CotaCelda[]
}

interface Tramo {
  id: string
  celdas: CeldaComparada[]
}

/** Estilo de una capa por su posición en el paquete (no por cuántas hay). */
function estiloDe(indice: number): EstiloCapa {
  return ESTILOS_CAPA[indice % ESTILOS_CAPA.length]!
}

/**
 * Agrupa las celdas ya ordenadas por offset en tramos contiguos donde ambas
 * capas tienen cota. Una celda sin pareja cierra el tramo en curso: rellenar
 * saltándola dibujaría material entre dos puntos que nadie midió juntos.
 */
function tramosConPareja(id: string, celdas: CeldaComparada[]): Tramo[] {
  const tramos: Tramo[] = []
  let actual: CeldaComparada[] = []

  const cerrar = () => {
    if (actual.length >= 2) tramos.push({ id: `${id}-${actual[0]!.clave}`, celdas: actual })
    actual = []
  }

  for (const celda of celdas) {
    if (celda.espesor !== null) actual.push(celda)
    else cerrar()
  }
  cerrar()

  return tramos
}

export default function CorteTransversal({ progresiva }: Props) {
  const proyecto = useAlmacen((s) => s.proyecto)
  const campaniaActivaId = useAlmacen((s) => s.campaniaActivaId)
  const capasVisibles = useAlmacen((s) => s.capasVisibles)
  const seleccion = useAlmacen((s) => s.seleccion)
  const seleccionar = useAlmacen((s) => s.seleccionar)

  // Sin ninguna capa marcada en el selector, se dibuja la campaña activa:
  // así el corte no queda en blanco antes de que el topógrafo abra el panel
  // de capas, y con una sola campaña se ve igual que antes de esta tarea.
  const idsVisibles = useMemo(
    () => (capasVisibles.length > 0 ? capasVisibles : campaniaActivaId ? [campaniaActivaId] : []),
    [capasVisibles, campaniaActivaId],
  )

  const resultados = useResultadosDe(idsVisibles)

  const series = useMemo(() => {
    const capasPorId = new Map(proyecto.capas.map((capa) => [capa.id, capa]))
    const lista: SerieCapa[] = []

    for (const id of idsVisibles) {
      const resultado = resultados.get(id)
      if (!resultado) continue
      const campania = proyecto.campanias.find((c) => c.id === id)
      const capa = campania ? capasPorId.get(campania.capaId) : undefined

      lista.push({
        campaniaId: id,
        nombreCapa: capa?.nombre ?? '—',
        orden: capa?.orden ?? 0,
        puntos: [...resultado.cotasPorCelda.values()]
          .filter((celda) => celda.progresiva === progresiva)
          .sort((a, b) => a.offset - b.offset),
      })
    }

    // De abajo hacia arriba según el paquete estructural, no según el orden
    // en que se marcaron en el selector.
    return lista.sort((a, b) => a.orden - b.orden)
  }, [idsVisibles, resultados, proyecto.capas, proyecto.campanias, progresiva])

  const tramos = useMemo(() => {
    const salida: Tramo[] = []
    for (let i = 0; i < series.length - 1; i++) {
      const inferior = series[i]!
      const superior = series[i + 1]!
      const resultadoInferior = resultados.get(inferior.campaniaId)
      const resultadoSuperior = resultados.get(superior.campaniaId)
      if (!resultadoInferior || !resultadoSuperior) continue

      const comparacion = compararCapas(resultadoInferior, resultadoSuperior)
      const celdas = [...comparacion.celdas.values()]
        .filter((celda) => celda.progresiva === progresiva)
        .sort((a, b) => a.offset - b.offset)

      salida.push(...tramosConPareja(`${inferior.campaniaId}|${superior.campaniaId}`, celdas))
    }
    return salida
  }, [series, resultados, progresiva])

  const totalPuntos = series.reduce((total, serie) => total + serie.puntos.length, 0)
  const variasCapas = series.length > 1

  if (totalPuntos === 0) {
    return (
      <p className="rounded border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">
        {formatearProgresiva(progresiva)} todavía no tiene lecturas.
      </p>
    )
  }

  return (
    <MarcoGrafico
      valoresX={series.flatMap((serie) => serie.puntos.map((p) => p.offset))}
      valoresY={series.flatMap((serie) => serie.puntos.map((p) => p.cota))}
      margenX={0.08}
      rotuloX="distancia al eje (m)"
      formatearX={(valor) => valor.toFixed(1)}
      etiqueta={`Corte transversal en ${formatearProgresiva(progresiva)}`}
    >
      {({ x, y }) => (
        <>
          {tramos.map((tramo) => {
            const puntos = [
              ...tramo.celdas.map((c) => `${x(c.offset).toFixed(1)},${y(c.cotaSuperior!).toFixed(1)}`),
              ...[...tramo.celdas]
                .reverse()
                .map((c) => `${x(c.offset).toFixed(1)},${y(c.cotaInferior!).toFixed(1)}`),
            ].join(' ')
            return (
              <polygon
                key={tramo.id}
                data-relleno-capas={tramo.id}
                points={puntos}
                className={CLASE_RELLENO}
                aria-hidden="true"
              />
            )
          })}

          {series.map((serie, indice) => {
            if (serie.puntos.length === 0) return null
            const estilo = estiloDe(indice)
            const trazo = serie.puntos
              .map((p) => `${x(p.offset).toFixed(1)},${y(p.cota).toFixed(1)}`)
              .join(' ')
            const primero = serie.puntos[0]!

            return (
              <g key={serie.campaniaId}>
                <polyline
                  points={trazo}
                  fill="none"
                  data-capa-id={serie.campaniaId}
                  className={estilo.linea}
                  strokeWidth={2}
                  strokeDasharray={estilo.trazo}
                />

                {variasCapas && (
                  <text
                    x={x(primero.offset) - 8}
                    y={y(primero.cota) + 4}
                    textAnchor="end"
                    aria-hidden="true"
                    className="fill-slate-600 text-[9px] font-medium dark:fill-slate-300"
                  >
                    {serie.nombreCapa}
                  </text>
                )}

                {serie.puntos.map((punto) => {
                  const activo = seleccion.clave === punto.clave
                  const nombreConCapa = variasCapas
                    ? `${formatearProgresiva(punto.progresiva)} ${punto.elementoClave} · ${serie.nombreCapa} · cota ${formatearCota(punto.cota)} m`
                    : `${formatearProgresiva(punto.progresiva)} ${punto.elementoClave} · cota ${formatearCota(punto.cota)} m`

                  return (
                    <g key={`${serie.campaniaId}-${punto.clave}`}>
                      <circle
                        cx={x(punto.offset)}
                        cy={y(punto.cota)}
                        r={activo ? 7 : 4.5}
                        className={activo ? 'fill-falla' : estilo.punto}
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
                        aria-label={nombreConCapa}
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
              </g>
            )
          })}
        </>
      )}
    </MarcoGrafico>
  )
}
