import { claveDestino, instrumentoCompleto, type Id, type Instrumento, type ResultadoCampania, type Toma } from '@topo/core'
import { useMemo } from 'react'
import { useAlmacen } from '../../estado/almacen'
import { useContexto, useEvaluacionRasante, useResultado } from '../../estado/derivados'

/** Una cota medida en otra progresiva del mismo punto de la sección. */
export interface CotaVecina {
  progresiva: number
  cota: number
  /** Si la estación que la leyó está dentro del tramo que respalda un cierre que pasa. */
  comprobada: boolean
}

/**
 * Lo que la calculadora ya sabe al abrirse, sacado de la libreta: así en
 * campo no hay que volver a escribir lo que la app tiene delante. Nada de
 * esto se calcula aquí; solo se lee del motor (calcularCampania y
 * evaluarContraRasante, a través de los derivados del almacén).
 *
 * La comprobación va dato por dato y no por la estación activa: el motor solo
 * compensa y respalda las estaciones del último circuito (tramoComprobado),
 * así que una cota leída antes de él no está comprobada aunque la activa sí.
 */
export interface ContextoCalculadora {
  instrumento: Instrumento
  calleId: Id | null
  /** Altura instrumental de la estación activa: desde ella se replantea. */
  alturaInstrumental: number | null
  /** Número de la estación activa, contando desde 1, para decirlo en pantalla. */
  numeroEstacion: number | null
  /** Si la estación activa está dentro del tramo que respalda un cierre dentro de tolerancia. */
  alturaComprobada: boolean
  /** Progresiva del punto seleccionado (o solo de la fila, si no hay punto). */
  progresiva: number | null
  /** Nombre del punto seleccionado en la sección, para escribirlo en la nota. */
  nombrePunto: string | null
  cotaProyecto: number | null
  cotaMedida: number | null
  cotaMedidaComprobada: boolean
  /** La última lectura anotada en el punto seleccionado. */
  lectura: number | null
  /**
   * La estación desde la que se tomó esa lectura (contando desde 1) y su AI.
   * La cota del punto es AI de ESA estación − lectura, no la de la activa.
   */
  estacionLectura: number | null
  alturaInstrumentalLectura: number | null
  lecturaComprobada: boolean
  toleranciaMm: number | null
  /** El mismo punto en la progresiva anterior y en la siguiente, si ya se midió. */
  anterior: CotaVecina | null
  siguiente: CotaVecina | null
}

function finito(valor: number | undefined): number | null {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : null
}

/**
 * Para cada celda, qué estación dio su última lectura usada. La lista de
 * lecturas de CotaCelda no dice la estación; se busca en la libreta la última
 * lectura a esa celda con ese mismo valor desde una estación con AI.
 */
function estacionDeLaUltimaLectura(toma: Toma, resultado: ResultadoCampania, clave: string): number | null {
  const lecturas = resultado.cotasPorCelda.get(clave)?.lecturas ?? []
  if (lecturas.length === 0) return null
  const ultima = lecturas[lecturas.length - 1]!
  let hallada: number | null = null
  toma.estaciones.forEach((estacion, indice) => {
    if (finito(resultado.cotasInstrumento[indice]) === null) return
    const leidas = [...estacion.intermedias, ...(estacion.vistaAdelante ? [estacion.vistaAdelante] : [])]
    for (const lectura of leidas) {
      if (lectura.destino.tipo !== 'celda') continue
      if (claveDestino(lectura.destino) === clave && lectura.valor === ultima) hallada = indice
    }
  })
  return hallada
}

export function useContextoCalculadora(): ContextoCalculadora {
  const proyecto = useAlmacen((s) => s.proyecto)
  const calleActivaId = useAlmacen((s) => s.calleActivaId)
  const estacionActiva = useAlmacen((s) => s.estacionActiva)
  const seleccion = useAlmacen((s) => s.seleccion)
  const contexto = useContexto()
  const resultado = useResultado()
  const evaluacion = useEvaluacionRasante()

  return useMemo(() => {
    const instrumento = instrumentoCompleto(proyecto.instrumento)
    const tramo = resultado?.tramoComprobado ?? null
    const cierrePasa = resultado?.cierre.pasa === true
    const aiDe = (indice: number | null) => (indice === null ? null : finito(resultado?.cotasInstrumento[indice]))
    const estacionComprobada = (indice: number | null) =>
      indice !== null &&
      aiDe(indice) !== null &&
      cierrePasa &&
      tramo !== null &&
      indice >= tramo.primeraEstacion &&
      indice <= tramo.ultimaEstacion
    const estacionDe = (clave: string) =>
      contexto && resultado ? estacionDeLaUltimaLectura(contexto.campania, resultado, clave) : null

    const alturaInstrumental = aiDe(estacionActiva)

    const clave = seleccion.clave
    const celda = clave ? evaluacion?.celdas.get(clave) : undefined
    const cotaCelda = clave ? resultado?.cotasPorCelda.get(clave) : undefined
    const progresiva = celda?.progresiva ?? cotaCelda?.progresiva ?? seleccion.progresiva ?? null
    const lecturas = cotaCelda?.lecturas ?? []
    const elementoClave = celda?.elementoClave ?? cotaCelda?.elementoClave ?? null
    const nombrePunto =
      cotaCelda?.elementoNombre ??
      contexto?.calle.seccion.puntos.find((p) => p.id === elementoClave)?.nombre ??
      null

    const lectura = lecturas.length > 0 ? lecturas[lecturas.length - 1]! : null
    const indiceLectura = clave && lectura !== null ? estacionDe(clave) : null
    const cotaMedida = celda?.cotaReal ?? cotaCelda?.cota ?? null

    // Vecinas: el mismo punto de la sección, ya medido, en la progresiva más
    // cercana por detrás y por delante.
    let anterior: CotaVecina | null = null
    let siguiente: CotaVecina | null = null
    if (resultado && elementoClave !== null && progresiva !== null) {
      for (const otra of resultado.cotasPorCelda.values()) {
        if (otra.elementoClave !== elementoClave || !Number.isFinite(otra.cota)) continue
        const vecina = () => ({
          progresiva: otra.progresiva,
          cota: otra.cota,
          comprobada: estacionComprobada(estacionDe(otra.clave)),
        })
        if (otra.progresiva < progresiva && (!anterior || otra.progresiva > anterior.progresiva)) {
          anterior = vecina()
        }
        if (otra.progresiva > progresiva && (!siguiente || otra.progresiva < siguiente.progresiva)) {
          siguiente = vecina()
        }
      }
    }

    return {
      instrumento,
      calleId: calleActivaId,
      alturaInstrumental,
      numeroEstacion: alturaInstrumental !== null ? estacionActiva + 1 : null,
      alturaComprobada: estacionComprobada(estacionActiva),
      progresiva,
      nombrePunto,
      cotaProyecto: celda?.cotaTeorica ?? null,
      cotaMedida,
      cotaMedidaComprobada: cotaMedida !== null && estacionComprobada(clave ? estacionDe(clave) : null),
      lectura,
      estacionLectura: indiceLectura !== null ? indiceLectura + 1 : null,
      alturaInstrumentalLectura: aiDe(indiceLectura),
      lecturaComprobada: estacionComprobada(indiceLectura),
      toleranciaMm: contexto?.capa?.toleranciaMm ?? null,
      anterior,
      siguiente,
    }
  }, [proyecto, calleActivaId, estacionActiva, seleccion, contexto, resultado, evaluacion])
}
