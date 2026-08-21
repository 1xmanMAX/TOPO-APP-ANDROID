import {
  compararCapas,
  formatearProgresiva,
  type CeldaComparada,
  type CeldaEvaluada,
  type CotaCelda,
  type Id,
} from '@topo/core'
import { useId, useMemo } from 'react'
import { useAlmacen } from '../estado/almacen'
import { useEvaluacionRasante, useResultadosDe } from '../estado/derivados'
import { formatearCota } from '../formato'
import MarcoGrafico from '../grafico/MarcoGrafico'

interface Props {
  progresiva: number
  /**
   * Qué campañas dibujar, ya decidido por quien llama: la libreta manda
   * siempre la campaña activa (es la que se está midiendo); Resultados manda
   * las marcadas en su selector de capas. El componente no lee `capasVisibles`
   * ni `campaniaActivaId` del almacén — eso es lo que hacía que el corte de
   * la libreta mostrara la capa marcada en Resultados en vez de la propia.
   */
  idsVisibles: Id[]
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

type ZonaRasante = 'corte' | 'relleno'

interface PuntoZona {
  offset: number
  terreno: number
  rasante: number
}

interface SegmentoZona {
  zona: ZonaRasante
  desde: PuntoZona
  hasta: PuntoZona
}

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

/**
 * Igual criterio que `tramosConPareja`, pero para terreno contra rasante:
 * corta el tramo en cuanto una celda no tiene medida o cae fuera de la
 * sección definida. No sombrear ahí es la misma regla que ya rige el
 * relleno entre dos capas — solo se compara donde las dos líneas existen.
 */
function tramosDeRasante(celdas: CeldaEvaluada[]): PuntoZona[][] {
  const tramos: PuntoZona[][] = []
  let actual: PuntoZona[] = []

  const cerrar = () => {
    if (actual.length >= 2) tramos.push(actual)
    actual = []
  }

  for (const celda of celdas) {
    if (celda.cotaReal !== null && celda.cotaTeorica !== null) {
      actual.push({ offset: celda.offset, terreno: celda.cotaReal, rasante: celda.cotaTeorica })
    } else {
      cerrar()
    }
  }
  cerrar()

  return tramos
}

/**
 * Reparte cada tramo en segmentos de corte (terreno por encima de la
 * rasante) o relleno (por debajo). Cuando el terreno cruza la rasante entre
 * dos puntos consecutivos, parte el segmento en el punto de cruce —
 * calculado por interpolación lineal— para no pintar de corte un trozo que
 * en realidad es de relleno, ni al revés.
 */
function segmentosDeZona(tramos: PuntoZona[][]): SegmentoZona[] {
  const segmentos: SegmentoZona[] = []

  for (const puntos of tramos) {
    for (let i = 0; i < puntos.length - 1; i++) {
      const a = puntos[i]!
      const b = puntos[i + 1]!
      const diferenciaA = a.terreno - a.rasante
      const diferenciaB = b.terreno - b.rasante
      const zonaDe = (diferencia: number): ZonaRasante => (diferencia >= 0 ? 'corte' : 'relleno')

      if ((diferenciaA >= 0) === (diferenciaB >= 0)) {
        segmentos.push({ zona: zonaDe(diferenciaA), desde: a, hasta: b })
        continue
      }

      const t = diferenciaA / (diferenciaA - diferenciaB)
      const cruce: PuntoZona = {
        offset: a.offset + t * (b.offset - a.offset),
        terreno: a.rasante + t * (b.rasante - a.rasante),
        rasante: a.rasante + t * (b.rasante - a.rasante),
      }

      segmentos.push({ zona: zonaDe(diferenciaA), desde: a, hasta: cruce })
      segmentos.push({ zona: zonaDe(diferenciaB), desde: cruce, hasta: b })
    }
  }

  return segmentos
}

export default function CorteTransversal({ progresiva, idsVisibles }: Props) {
  const proyecto = useAlmacen((s) => s.proyecto)
  const seleccion = useAlmacen((s) => s.seleccion)
  const seleccionar = useAlmacen((s) => s.seleccionar)

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

  /**
   * La rasante se compara contra la capa más alta del paquete visible — la
   * última en `series`, ya ordenada de abajo hacia arriba —, porque es la
   * que representa la superficie terminada. Si no hay ninguna serie se pasa
   * un id vacío en vez de dejar que el hook caiga en la campaña activa del
   * almacén: sin capas visibles no hay nada que comparar, y este componente
   * no decide eso mirando el estado global.
   */
  const idCapaSuperior = series.length > 0 ? series[series.length - 1]!.campaniaId : ''
  const evaluacionRasante = useEvaluacionRasante(idCapaSuperior)

  const idPrefijo = useId()
  const idPatronCorte = `patron-corte-${idPrefijo}`
  const idPatronRelleno = `patron-relleno-${idPrefijo}`

  const celdasRasante = useMemo(() => {
    if (!evaluacionRasante) return []
    return [...evaluacionRasante.celdas.values()]
      .filter((celda) => celda.progresiva === progresiva)
      .sort((a, b) => a.offset - b.offset)
  }, [evaluacionRasante, progresiva])

  // La línea de la rasante se dibuja donde el proyecto define cota, tenga o
  // no medida todavía: a diferencia del sombreado, aquí no hace falta la
  // pareja.
  const tramosLineaRasante = useMemo(() => {
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

  const segmentosZona = useMemo(
    () => segmentosDeZona(tramosDeRasante(celdasRasante)),
    [celdasRasante],
  )

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
      valoresX={[
        ...series.flatMap((serie) => serie.puntos.map((p) => p.offset)),
        ...celdasRasante.map((c) => c.offset),
      ]}
      valoresY={[
        ...series.flatMap((serie) => serie.puntos.map((p) => p.cota)),
        ...celdasRasante.filter((c) => c.cotaTeorica !== null).map((c) => c.cotaTeorica!),
      ]}
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

          {evaluacionRasante && (
            <>
              <defs>
                <pattern
                  id={idPatronCorte}
                  width={6}
                  height={6}
                  patternUnits="userSpaceOnUse"
                  patternTransform="rotate(45)"
                >
                  <rect width={6} height={6} className="fill-amber-500/10 dark:fill-amber-400/10" />
                  <line
                    x1={0}
                    y1={0}
                    x2={0}
                    y2={6}
                    strokeWidth={1.5}
                    className="stroke-amber-600/70 dark:stroke-amber-400/70"
                  />
                </pattern>
                <pattern
                  id={idPatronRelleno}
                  width={6}
                  height={6}
                  patternUnits="userSpaceOnUse"
                  patternTransform="rotate(-45)"
                >
                  <rect width={6} height={6} className="fill-sky-500/10 dark:fill-sky-400/10" />
                  <line
                    x1={0}
                    y1={0}
                    x2={0}
                    y2={6}
                    strokeWidth={1.5}
                    className="stroke-sky-600/70 dark:stroke-sky-400/70"
                  />
                </pattern>
              </defs>

              {segmentosZona.map((segmento) => {
                const puntos = [
                  `${x(segmento.desde.offset).toFixed(1)},${y(segmento.desde.terreno).toFixed(1)}`,
                  `${x(segmento.hasta.offset).toFixed(1)},${y(segmento.hasta.terreno).toFixed(1)}`,
                  `${x(segmento.hasta.offset).toFixed(1)},${y(segmento.hasta.rasante).toFixed(1)}`,
                  `${x(segmento.desde.offset).toFixed(1)},${y(segmento.desde.rasante).toFixed(1)}`,
                ].join(' ')
                const esCorte = segmento.zona === 'corte'

                return (
                  <polygon
                    key={`zona-${segmento.desde.offset}-${segmento.hasta.offset}`}
                    data-zona={segmento.zona}
                    data-offset-inicio={segmento.desde.offset}
                    data-offset-fin={segmento.hasta.offset}
                    points={puntos}
                    fill={`url(#${esCorte ? idPatronCorte : idPatronRelleno})`}
                    strokeWidth={1}
                    strokeDasharray={esCorte ? undefined : '3 2'}
                    className={
                      esCorte
                        ? 'stroke-amber-600/70 dark:stroke-amber-400/70'
                        : 'stroke-sky-600/70 dark:stroke-sky-400/70'
                    }
                    aria-hidden="true"
                  />
                )
              })}

              {tramosLineaRasante.length > 0 && (
                <g aria-label="Rasante de proyecto">
                  {tramosLineaRasante.map((grupo, indice) => (
                    <polyline
                      key={`rasante-${indice}`}
                      points={grupo
                        .map((c) => `${x(c.offset).toFixed(1)},${y(c.cotaTeorica!).toFixed(1)}`)
                        .join(' ')}
                      fill="none"
                      className="stroke-slate-700 dark:stroke-slate-200"
                      strokeWidth={2}
                      strokeDasharray="6 4"
                    />
                  ))}
                </g>
              )}
            </>
          )}

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
