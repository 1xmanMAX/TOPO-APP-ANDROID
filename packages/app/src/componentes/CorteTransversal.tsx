import {
  aMilimetros,
  compararCapas,
  formatearProgresiva,
  redondear3,
  type CeldaComparada,
  type CeldaEvaluada,
  type CotaCelda,
  type Id,
} from '@topo/core'
import { useId, useMemo } from 'react'
import { useAlmacen } from '../estado/almacen'
import { useEvaluacionRasante, useResultadosDe } from '../estado/derivados'
import { buscarToma } from '../estado/proyectoTomas'
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
  /**
   * Contra qué campaña se sombrea el corte y el relleno: la que el topógrafo
   * está controlando, no "la capa más alta que se vea en pantalla". Igual que
   * `idsVisibles`, la decide quien llama — la libreta manda la campaña activa,
   * Resultados también — y por la misma razón: este componente no lee
   * `campaniaActivaId` del almacén. `null` cuando no hay campaña activa que
   * ofrecer como referencia.
   */
  idCampaniaReferencia: Id | null
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

/** Punto interpolado entre `a` y `b` a fracción `t` (0 = `a`, 1 = `b`), en sus tres magnitudes. */
function puntoIntermedio(a: PuntoZona, b: PuntoZona, t: number): PuntoZona {
  return {
    offset: a.offset + t * (b.offset - a.offset),
    terreno: a.terreno + t * (b.terreno - a.terreno),
    rasante: a.rasante + t * (b.rasante - a.rasante),
  }
}

/**
 * Reparte el tramo entre dos puntos consecutivos en segmentos de corte
 * (terreno por encima de la rasante) o relleno (por debajo), partiendo en
 * dos sitios distintos cuando hace falta:
 *
 * - Donde el terreno cruza la rasante, para no pintar de corte un trozo que
 *   en realidad es de relleno, ni al revés.
 * - Donde el segmento cruza el eje (offset 0), para que ninguna zona abarque
 *   los dos lados de la calle a la vez. Sin este segundo corte, una zona
 *   entre por ejemplo −3.00 y 2.00 quedaría entera "a la izquierda del eje"
 *   aunque la mitad esté a la derecha — el nombre accesible mentiría sobre
 *   dónde está, y no hay forma de redactarlo bien si la zona en sí cruza el
 *   eje. Partirla aquí es lo que hace que esa frase no pueda mentir.
 *
 * Ambos cortes son independientes entre sí — el terreno puede cruzar la
 * rasante en un punto distinto de donde cruza el eje — así que se calculan
 * los dos, se ordenan, y el segmento se reparte en hasta tres trozos.
 */
function segmentosEntre(a: PuntoZona, b: PuntoZona): SegmentoZona[] {
  const diferenciaA = a.terreno - a.rasante
  const diferenciaB = b.terreno - b.rasante

  const cortes: number[] = []
  if ((diferenciaA >= 0) !== (diferenciaB >= 0)) {
    cortes.push(diferenciaA / (diferenciaA - diferenciaB))
  }
  if ((a.offset < 0 && b.offset > 0) || (a.offset > 0 && b.offset < 0)) {
    cortes.push(a.offset / (a.offset - b.offset))
  }
  cortes.sort((x, y) => x - y)

  const fracciones = [0, ...cortes, 1]
  const segmentos: SegmentoZona[] = []

  for (let i = 0; i < fracciones.length - 1; i++) {
    const t0 = fracciones[i]!
    const t1 = fracciones[i + 1]!
    // El signo a mitad de camino de este trozo decide su zona: los extremos
    // pueden caer justo en un cruce (diferencia o offset en cero), donde el
    // signo es ambiguo.
    const diferenciaMedia = diferenciaA + ((t0 + t1) / 2) * (diferenciaB - diferenciaA)
    const zona: ZonaRasante = diferenciaMedia >= 0 ? 'corte' : 'relleno'

    segmentos.push({
      zona,
      desde: t0 === 0 ? a : puntoIntermedio(a, b, t0),
      hasta: t1 === 1 ? b : puntoIntermedio(a, b, t1),
    })
  }

  return segmentos
}

function segmentosDeZona(tramos: PuntoZona[][]): SegmentoZona[] {
  const segmentos: SegmentoZona[] = []

  for (const puntos of tramos) {
    for (let i = 0; i < puntos.length - 1; i++) {
      segmentos.push(...segmentosEntre(puntos[i]!, puntos[i + 1]!))
    }
  }

  return segmentos
}

/**
 * Nombre accesible de una zona de corte o relleno: qué es, cuánto y dónde,
 * en una frase que se entiende leída en voz alta y sin ver el dibujo.
 *
 * Antes decía «Corte de 0.046 m a -4.20 m del eje», que se oye como un rango
 * entre 0.046 y -4.20 cuando en realidad son dos magnitudes distintas —
 * cuánto sobra o falta, y en qué tramo de la sección pasa— y además la
 * diferencia iba en metros. La regla del proyecto es milímetros con signo;
 * aquí el signo lo lleva la palabra («corte» o «relleno», ya inequívocas por
 * sí solas) y no un número negativo, que en voz alta no se oye. El "cuánto"
 * es el mayor de los dos extremos del segmento — mismo criterio que antes—,
 * y el lado ("a la izquierda"/"a la derecha del eje") lo decide el extremo
 * más alejado del eje, en palabras, no con un signo menos.
 */
function tituloDeZona(segmento: SegmentoZona): string {
  const diferenciaMm = (punto: PuntoZona) =>
    Math.abs(Math.round(aMilimetros(redondear3(punto.terreno - punto.rasante))))
  const diferenciaMayorMm = Math.max(diferenciaMm(segmento.desde), diferenciaMm(segmento.hasta))
  const tipo = segmento.zona === 'corte' ? 'Corte' : 'Relleno'

  const offsetDesde = segmento.desde.offset
  const offsetHasta = segmento.hasta.offset
  const lejano = Math.abs(offsetDesde) >= Math.abs(offsetHasta) ? offsetDesde : offsetHasta
  const cercano = lejano === offsetDesde ? offsetHasta : offsetDesde
  const lado = lejano < 0 ? 'a la izquierda del eje' : lejano > 0 ? 'a la derecha del eje' : 'en el eje'

  return (
    `${tipo} de hasta ${diferenciaMayorMm} mm, ` +
    `entre ${Math.abs(lejano).toFixed(2)} y ${Math.abs(cercano).toFixed(2)} m ${lado}`
  )
}

/** Leyenda de las tramas de corte y relleno, para no depender solo del color. */
function LeyendaZonas({
  idPatronCorte,
  idPatronRelleno,
}: {
  idPatronCorte: string
  idPatronRelleno: string
}) {
  return (
    <ul className="flex flex-wrap gap-4 text-xs text-slate-600 dark:text-slate-300">
      <li className="flex items-center gap-1.5">
        <svg width={20} height={14} aria-hidden="true" className="shrink-0">
          <rect
            width={20}
            height={14}
            fill={`url(#${idPatronCorte})`}
            strokeWidth={1}
            className="stroke-amber-600/70 dark:stroke-amber-400/70"
          />
        </svg>
        Corte: donde el terreno sobra frente a la rasante
      </li>
      <li className="flex items-center gap-1.5">
        <svg width={20} height={14} aria-hidden="true" className="shrink-0">
          <rect
            width={20}
            height={14}
            fill={`url(#${idPatronRelleno})`}
            strokeWidth={1}
            strokeDasharray="3 2"
            className="stroke-sky-600/70 dark:stroke-sky-400/70"
          />
        </svg>
        Relleno: donde el terreno falta frente a la rasante
      </li>
    </ul>
  )
}

export default function CorteTransversal({ progresiva, idsVisibles, idCampaniaReferencia }: Props) {
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
      const campania = buscarToma(proyecto, id)?.toma
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
  }, [idsVisibles, resultados, proyecto, progresiva])

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
   * La rasante se compara contra la campaña de referencia que decide quien
   * llama (la que el topógrafo está controlando), nunca contra "la capa más
   * alta visible": cada capa tiene su propio objetivo de proyecto bien
   * definido, y preferir la de mayor orden hacía que marcar o desmarcar otra
   * capa en el selector de Resultados cambiara, sin que nadie tocara la
   * campaña de referencia, contra qué se sombreaba. Con `null` se pasa un id
   * vacío en vez de dejar que el hook caiga en la campaña activa del
   * almacén: este componente no decide eso mirando el estado global.
   */
  const idReferenciaEfectivo = idCampaniaReferencia ?? ''
  const evaluacionRasante = useEvaluacionRasante(idReferenciaEfectivo)

  /**
   * Si la campaña de referencia no está entre las capas marcadas, no se
   * sombrea nada: un sombreado sin la línea de terreno que lo sostiene sería
   * más confuso que no tenerlo. En su lugar se explica por qué (ver más abajo).
   */
  const referenciaVisible = idCampaniaReferencia !== null && idsVisibles.includes(idCampaniaReferencia)

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
    () => (referenciaVisible ? segmentosDeZona(tramosDeRasante(celdasRasante)) : []),
    [celdasRasante, referenciaVisible],
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
    <div className="flex flex-col gap-2">
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
              {segmentosZona.length > 0 && (
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
                        role="img"
                        aria-label={tituloDeZona(segmento)}
                      >
                        <title>{tituloDeZona(segmento)}</title>
                      </polygon>
                    )
                  })}
                </>
              )}

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

      {evaluacionRasante && segmentosZona.length > 0 && (
        <LeyendaZonas idPatronCorte={idPatronCorte} idPatronRelleno={idPatronRelleno} />
      )}

      {evaluacionRasante && !referenciaVisible && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          El sombreado corresponde a la capa que estás controlando: márcala en el selector de capas para
          verlo.
        </p>
      )}
    </div>
  )
}
