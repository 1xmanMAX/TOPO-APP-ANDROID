import {
  armarCaras,
  calcularCampania,
  claveCelda,
  evaluarContraRasante,
  formatearProgresiva,
  proyectarCaras,
  type CaraMalla,
  type CaraProyectada,
  type EstadoTolerancia,
  type Id,
  type PuntoProyectado,
} from '@topo/core'
import { useMemo, useRef, type PointerEvent as EventoPuntero } from 'react'
import { useAlmacen } from '../estado/almacen'
import { useContextoDe, useEvaluacionRasante } from '../estado/derivados'
import { armarEsqueletoTabla } from '../esqueletoTabla'
import { etiquetaAccesibleCelda, SIMBOLO_ESTADO_TOLERANCIA } from '../estadoRasante'
import ResumenVista3D from './ResumenVista3D'

const MENSAJE_SIN_RASANTE = 'Define la rasante del proyecto para levantar el modelo en volumen.'
const MENSAJE_POCAS_PROGRESIVAS = 'Hacen falta al menos dos progresivas medidas para levantar el modelo.'
const MENSAJE_SIN_MODELO = 'Ninguna zona tiene sus cuatro esquinas medidas todavía: no hay cuadro que dibujar.'

/** Cuántos grados gira la cámara por cada pixel que se arrastra: un gesto entero de lado a lado da una vuelta completa cómoda, ni brusca ni perezosa. */
const GRADOS_POR_PIXEL = 0.5

/**
 * Símbolo por estado, igual criterio que en `MapaEstado`: los tres de
 * tolerancia ya tienen el suyo en `SIMBOLO_ESTADO_TOLERANCIA`; sin medir y
 * sin rasante se completan aquí con el mismo punto y raya que usa el mapa,
 * para que el mismo estado se lea igual en las dos vistas.
 */
const SIMBOLO_ESTADO: Record<EstadoTolerancia, string> = {
  conforme: SIMBOLO_ESTADO_TOLERANCIA.conforme!,
  alLimite: SIMBOLO_ESTADO_TOLERANCIA.alLimite!,
  fuera: SIMBOLO_ESTADO_TOLERANCIA.fuera!,
  sinMedir: '·',
  sinRasante: '—',
}

/** Mismos tres colores de semáforo que `MapaEstado` y `TablaDiferencias`, ahora como relleno de cara. */
const CLASE_RELLENO: Record<EstadoTolerancia, string> = {
  conforme: 'fill-pasa/80',
  alLimite: 'fill-aviso/80',
  fuera: 'fill-falla/80',
  sinMedir: 'fill-slate-300 dark:fill-slate-700',
  sinRasante: 'fill-slate-200 dark:fill-slate-800',
}

/**
 * En modo capas los tres colores de semáforo no significan nada (no hay
 * tolerancia que evaluar entre capas): una paleta neutra propia, por
 * posición en el paquete y no por cuántas capas haya marcadas. Mismo criterio
 * que ya usa `CorteTransversal` para no pisar el significado de pasa/al
 * límite/fuera. El color nunca es la única pista: cada capa además lleva su
 * nombre rotulado junto a la superficie y en el texto accesible de cada cara.
 */
const CLASE_RELLENO_CAPA = [
  'fill-marca/70',
  'fill-slate-500/70 dark:fill-slate-400/70',
  'fill-slate-800/70 dark:fill-slate-200/70',
  'fill-slate-400/60 dark:fill-slate-600/60',
]

function claseRellenoCapa(indice: number): string {
  return CLASE_RELLENO_CAPA[indice % CLASE_RELLENO_CAPA.length]!
}

const CLASE_BORDE = 'stroke-slate-900/25 dark:stroke-slate-100/25'

const LEYENDA: { estado: EstadoTolerancia; texto: string }[] = [
  { estado: 'conforme', texto: 'Dentro de tolerancia' },
  { estado: 'alLimite', texto: 'Al límite de tolerancia' },
  { estado: 'fuera', texto: 'Fuera de tolerancia' },
  { estado: 'sinMedir', texto: 'Sin medir' },
  { estado: 'sinRasante', texto: 'Sin rasante definida en el proyecto' },
]

interface Props {
  /**
   * Contra qué campaña se levanta el modelo: la decide quien llama, nunca
   * este componente mirando `campaniaActivaId` en el almacén — mismo
   * criterio que `idCampaniaReferencia` en `CorteTransversal` y
   * `MapaEstado`, y por la misma razón: ese argumento ("solo hay un
   * llamador hoy") ya costó cuatro rondas de arreglo repartidas entre las
   * cuatro vistas que ya existen. Obligatoria, sin valor por defecto que lea
   * el almacén: `null` cuando no hay campaña activa que ofrecer como
   * referencia.
   */
  idCampaniaReferencia: Id | null
}

/** Una capa marcada, ya con sus propias caras (sus propias cotas medidas). */
interface EntradaCapa {
  campaniaId: Id
  nombreCapa: string
  caras: CaraMalla[]
}

/** Qué capa dibujó una cara y con qué nombre rotularla: se pierde al pasar por `armarCaras`, así que se lleva aparte. */
interface InfoCapaDeCara {
  campaniaId: Id
  nombreCapa: string
}

/**
 * Extremos de los puntos ya proyectados, con un margen para que ninguna cara
 * quede pegada al borde de la caja. No es un `viewBox` fijo: la caja se
 * recalcula con cada proyección, así que el dibujo siempre encaja aunque
 * girar o inclinar la cámara cambie su tamaño en pantalla.
 */
function calcularCaja(puntos: PuntoProyectado[]): { minX: number; minY: number; ancho: number; alto: number } {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const punto of puntos) {
    if (punto.x < minX) minX = punto.x
    if (punto.x > maxX) maxX = punto.x
    if (punto.y < minY) minY = punto.y
    if (punto.y > maxY) maxY = punto.y
  }
  const margen = Math.max(maxX - minX, maxY - minY, 1) * 0.1
  return {
    minX: minX - margen,
    minY: minY - margen,
    ancho: maxX - minX + margen * 2,
    alto: maxY - minY + margen * 2,
  }
}

export default function Vista3D({ idCampaniaReferencia }: Props) {
  const contexto = useContextoDe(idCampaniaReferencia)
  const evaluacion = useEvaluacionRasante(idCampaniaReferencia ?? '')
  const proyecto = useAlmacen((s) => s.proyecto)
  const capasVisibles = useAlmacen((s) => s.capasVisibles)
  const modoVista3D = useAlmacen((s) => s.modoVista3D)
  // El mismo deslizador de progresiva que ya usa el corte transversal: no es
  // un prop propio de este componente, es el valor compartido del almacén.
  // `null` (nadie lo movió todavía) no recorta nada.
  const progresivaCorte = useAlmacen((s) => s.seleccion.progresiva)
  const camara = useAlmacen((s) => s.camara)
  const girarCamara = useAlmacen((s) => s.girarCamara)

  /**
   * Última posición horizontal del puntero mientras se arrastra, en un `ref`
   * y no en estado: cada movimiento gira la cámara, y no hace falta que ese
   * seguimiento en sí mismo dispare un renderizado aparte.
   */
  const arrastreX = useRef<number | null>(null)

  function alBajarPuntero(evento: EventoPuntero<SVGSVGElement>) {
    evento.currentTarget.setPointerCapture(evento.pointerId)
    arrastreX.current = evento.clientX
  }

  function alMoverPuntero(evento: EventoPuntero<SVGSVGElement>) {
    if (arrastreX.current === null) return
    const diferencia = evento.clientX - arrastreX.current
    arrastreX.current = evento.clientX
    girarCamara(diferencia * GRADOS_POR_PIXEL)
  }

  function alSoltarPuntero(evento: EventoPuntero<SVGSVGElement>) {
    evento.currentTarget.releasePointerCapture(evento.pointerId)
    arrastreX.current = null
  }

  const esqueleto = useMemo(
    () => (contexto ? armarEsqueletoTabla(contexto.calle, contexto.plantilla) : null),
    [contexto],
  )

  const offsets = useMemo(() => {
    const mapa = new Map<string, number>()
    if (contexto) for (const elemento of contexto.plantilla.elementos) mapa.set(elemento.clave, elemento.offset)
    return mapa
  }, [contexto])

  /**
   * Progresivas con al menos una celda medida, no todas las de la grilla —
   * una calle larga puede tener decenas sin ninguna lectura todavía. Sin dos
   * de estas no hay ni un solo cuadro que se pueda llegar a cerrar. Solo
   * gobierna el modo estado: en modo capas cada capa marcada puede tener sus
   * propias progresivas medidas, y basta con que alguna cierre un cuadro.
   */
  const progresivasMedidas = useMemo(() => {
    const conjunto = new Set<number>()
    if (evaluacion) {
      for (const celda of evaluacion.celdas.values()) {
        if (celda.cotaReal !== null) conjunto.add(celda.progresiva)
      }
    }
    return conjunto
  }, [evaluacion])

  /**
   * Qué campañas se apilan en modo capas: las marcadas en el selector que ya
   * usa el corte transversal (`capasVisibles`), o si no hay ninguna marcada,
   * la campaña de referencia — mismo criterio que ya usa `VistaResultados`
   * para el corte transversal, para que las vistas no se contradigan.
   */
  const idsCapas = useMemo(
    () => (capasVisibles.length > 0 ? capasVisibles : idCampaniaReferencia ? [idCampaniaReferencia] : []),
    [capasVisibles, idCampaniaReferencia],
  )

  /**
   * Una entrada por capa marcada, con sus propias caras (sus propias cotas
   * medidas, evaluadas contra la misma rasante de la calle). `calcularCampania`
   * y `evaluarContraRasante` son funciones normales, no hooks: un bucle
   * adentro de un único `useMemo` no viola las reglas de hooks, a diferencia
   * de llamar un hook por campaña con una lista de tamaño variable.
   */
  const entradasCapas = useMemo((): EntradaCapa[] => {
    if (modoVista3D !== 'capas' || !esqueleto || !contexto || !contexto.calle.rasante) return []
    const rasante = contexto.calle.rasante
    const capasPorId = new Map(proyecto.capas.map((capa) => [capa.id, capa]))
    const salida: EntradaCapa[] = []

    for (const id of idsCapas) {
      const campania = proyecto.campanias.find((c) => c.id === id)
      // Solo campañas de la misma calle que la de referencia: sus claves de
      // celda (`progresiva|elemento`) coinciden con las de cualquier otra
      // calle, así que mezclar cotas de calles distintas dibujaría una
      // superficie sin sentido físico.
      if (!campania || campania.calleId !== contexto.calle.id) continue

      const resultado = calcularCampania({
        campania,
        calle: contexto.calle,
        plantilla: contexto.plantilla,
        bms: proyecto.bms,
      })
      const evaluacionCapa = evaluarContraRasante({
        resultado,
        calle: contexto.calle,
        plantilla: contexto.plantilla,
        rasante,
        capas: proyecto.capas,
        capaId: campania.capaId,
      })
      const caras = armarCaras({
        progresivas: esqueleto.progresivas,
        elementos: esqueleto.elementos,
        offsets,
        cotaDe: (clave) => evaluacionCapa.celdas.get(clave)?.cotaReal ?? null,
      })
      if (caras.length === 0) continue

      salida.push({ campaniaId: id, nombreCapa: capasPorId.get(campania.capaId)?.nombre ?? '—', caras })
    }

    return salida
  }, [modoVista3D, esqueleto, contexto, offsets, idsCapas, proyecto])

  const carasEstado = useMemo(() => {
    if (modoVista3D !== 'estado' || !esqueleto || !evaluacion || progresivasMedidas.size < 2) return []
    return armarCaras({
      progresivas: esqueleto.progresivas,
      elementos: esqueleto.elementos,
      offsets,
      cotaDe: (clave) => evaluacion.celdas.get(clave)?.cotaReal ?? null,
    })
  }, [modoVista3D, esqueleto, evaluacion, offsets, progresivasMedidas])

  /**
   * Todas las caras de todas las capas visibles, juntas en un solo montón
   * antes de proyectar: `proyectarCaras` las ordena a todas juntas por
   * profundidad, vengan de la capa que vengan. Dibujar una capa entera y
   * luego la otra dejaría a la de abajo tapando a la de arriba en los tramos
   * donde va por delante.
   *
   * El corte vivo (el deslizador de progresiva) se aplica aquí, antes de
   * proyectar: una cara cuya `progresivaDesde` quede más allá del corte ni
   * siquiera se arma como candidata a dibujarse, no se dibuja y se tapa con
   * otra encima.
   */
  const { caraObjs, infoPorCara } = useMemo(() => {
    const objs: CaraMalla[] = []
    const info = new Map<CaraMalla, InfoCapaDeCara>()

    function agregar(caras: CaraMalla[], etiqueta: InfoCapaDeCara | null) {
      for (const cara of caras) {
        if (progresivaCorte !== null && cara.progresivaDesde > progresivaCorte) continue
        objs.push(cara)
        if (etiqueta) info.set(cara, etiqueta)
      }
    }

    if (modoVista3D === 'capas') {
      for (const entrada of entradasCapas) {
        agregar(entrada.caras, { campaniaId: entrada.campaniaId, nombreCapa: entrada.nombreCapa })
      }
    } else {
      agregar(carasEstado, null)
    }

    return { caraObjs: objs, infoPorCara: info }
  }, [modoVista3D, entradasCapas, carasEstado, progresivaCorte])

  const proyectadas = useMemo(() => proyectarCaras(caraObjs, camara), [caraObjs, camara])

  const caja = useMemo(() => calcularCaja(proyectadas.flatMap((c) => c.puntos)), [proyectadas])

  /** Orden estable de las capas marcadas, para repartir la paleta neutra siempre igual mientras no cambie la marcación. */
  const indicePorCapa = useMemo(() => {
    const mapa = new Map<Id, number>()
    entradasCapas.forEach((entrada, indice) => mapa.set(entrada.campaniaId, indice))
    return mapa
  }, [entradasCapas])

  /**
   * Un rótulo por capa, junto a su superficie: el punto más alto en pantalla
   * entre todas sus caras, para que el nombre quede por encima del dibujo y
   * no se pierda debajo de otra capa que pase por delante.
   */
  const rotulosCapas = useMemo(() => {
    if (modoVista3D !== 'capas') return []
    const porCapa = new Map<Id, { nombreCapa: string; punto: PuntoProyectado }>()
    for (const { cara, puntos } of proyectadas) {
      const dato = infoPorCara.get(cara)
      if (!dato) continue
      const puntoAlto = puntos.reduce((a, b) => (b.y < a.y ? b : a))
      const actual = porCapa.get(dato.campaniaId)
      if (!actual || puntoAlto.y < actual.punto.y) {
        porCapa.set(dato.campaniaId, { nombreCapa: dato.nombreCapa, punto: puntoAlto })
      }
    }
    return [...porCapa.entries()].map(([campaniaId, valor]) => ({ campaniaId, ...valor }))
  }, [modoVista3D, proyectadas, infoPorCara])

  if (!contexto) return null

  if (!evaluacion) {
    return (
      <p className="rounded border border-dashed border-slate-300 p-3 text-sm text-slate-500 dark:border-slate-700">
        {MENSAJE_SIN_RASANTE}
      </p>
    )
  }

  if (modoVista3D === 'estado' && progresivasMedidas.size < 2) {
    return (
      <p className="rounded border border-dashed border-slate-300 p-3 text-sm text-slate-500 dark:border-slate-700">
        {MENSAJE_POCAS_PROGRESIVAS}
      </p>
    )
  }

  if (proyectadas.length === 0) {
    return (
      <p className="rounded border border-dashed border-slate-300 p-3 text-sm text-slate-500 dark:border-slate-700">
        {MENSAJE_SIN_MODELO}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <svg
        viewBox={`${caja.minX.toFixed(2)} ${caja.minY.toFixed(2)} ${caja.ancho.toFixed(2)} ${caja.alto.toFixed(2)}`}
        role="img"
        aria-label="Modelo en volumen de la calle, coloreado por el estado de cada tramo. Arrastra para girarlo."
        // Eventos de puntero, no de ratón: cubren ratón y dedo con el mismo
        // código. `touch-action: none` para que en el móvil arrastrar gire la
        // cámara en vez de competir con el desplazamiento de la página, y
        // `select-none` para que arrastrar sobre el dibujo no seleccione texto
        // de alrededor por accidente.
        onPointerDown={alBajarPuntero}
        onPointerMove={alMoverPuntero}
        onPointerUp={alSoltarPuntero}
        onPointerCancel={alSoltarPuntero}
        style={{ touchAction: 'none' }}
        className="w-full touch-none cursor-grab select-none rounded border border-slate-200 active:cursor-grabbing dark:border-slate-800"
      >
        {proyectadas.map(({ cara, puntos }: CaraProyectada) => {
          const puntosSvg = puntos.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')
          const etiquetaBase = `Entre ${formatearProgresiva(cara.progresivaDesde)} y ${formatearProgresiva(cara.progresivaHasta)}, de ${cara.elementoDesde} a ${cara.elementoHasta}`

          if (modoVista3D === 'capas') {
            const dato = infoPorCara.get(cara)
            const indice = dato ? (indicePorCapa.get(dato.campaniaId) ?? 0) : 0
            const etiqueta = dato ? `${dato.nombreCapa}: ${etiquetaBase}` : etiquetaBase

            return (
              <polygon
                key={`${dato?.campaniaId ?? ''}-${cara.clave}`}
                data-cara={cara.clave}
                data-capa-id={dato?.campaniaId}
                data-progresiva-desde={cara.progresivaDesde}
                data-progresiva-hasta={cara.progresivaHasta}
                points={puntosSvg}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
                className={`${claseRellenoCapa(indice)} ${CLASE_BORDE}`}
                role="img"
                aria-label={etiqueta}
              >
                <title>{etiqueta}</title>
              </polygon>
            )
          }

          const claveInicial = claveCelda(cara.progresivaDesde, cara.elementoDesde)
          // Misma garantía que en `MapaEstado`: `esqueleto` y `evaluacion`
          // salen del mismo par calle/plantilla (el mismo `contexto`), así
          // que el producto progresiva × elemento que arma
          // `armarEsqueletoTabla` siempre tiene su celda evaluada.
          const celdaInicial = evaluacion.celdas.get(claveInicial)!
          const etiqueta = etiquetaAccesibleCelda(etiquetaBase, celdaInicial)

          return (
            <polygon
              key={cara.clave}
              data-cara={cara.clave}
              data-progresiva-desde={cara.progresivaDesde}
              data-progresiva-hasta={cara.progresivaHasta}
              points={puntosSvg}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
              className={`${CLASE_RELLENO[celdaInicial.estado]} ${CLASE_BORDE}`}
              role="img"
              aria-label={etiqueta}
            >
              <title>{etiqueta}</title>
            </polygon>
          )
        })}

        {modoVista3D === 'capas' &&
          rotulosCapas.map(({ campaniaId, nombreCapa, punto }) => (
            <text
              key={campaniaId}
              x={punto.x}
              y={punto.y - 6}
              textAnchor="middle"
              aria-hidden="true"
              className="fill-slate-700 text-[10px] font-semibold dark:fill-slate-200"
            >
              {nombreCapa}
            </text>
          ))}
      </svg>

      <p className="text-xs text-slate-500 dark:text-slate-400">Alturas exageradas {camara.exageracion}×</p>

      {modoVista3D === 'estado' && (
        <ul
          className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300"
          aria-label="Qué significa cada color del modelo"
        >
          {LEYENDA.map(({ estado, texto }) => (
            <li key={estado} className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className={`flex h-5 w-5 items-center justify-center rounded text-[11px] ${CLASE_RELLENO[estado]}`}
              >
                {SIMBOLO_ESTADO[estado]}
              </span>
              <span>{texto}</span>
            </li>
          ))}
        </ul>
      )}

      {/*
       * Siempre visible, nunca detrás de un botón: quien no vea el modelo
       * (o no distinga sus colores) tiene que poder enterarse igual de qué
       * cuenta el dibujo.
       */}
      <ResumenVista3D idCampaniaReferencia={idCampaniaReferencia} />
    </div>
  )
}
