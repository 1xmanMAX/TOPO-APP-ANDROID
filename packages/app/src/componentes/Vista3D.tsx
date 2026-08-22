import {
  armarCaras,
  claveCelda,
  formatearProgresiva,
  proyectarCaras,
  type CaraProyectada,
  type EstadoTolerancia,
  type Id,
  type PuntoProyectado,
} from '@topo/core'
import { useMemo } from 'react'
import { useAlmacen } from '../estado/almacen'
import { useContextoDe, useEvaluacionRasante } from '../estado/derivados'
import { armarEsqueletoTabla } from '../esqueletoTabla'
import { etiquetaAccesibleCelda, SIMBOLO_ESTADO_TOLERANCIA } from '../estadoRasante'

const MENSAJE_SIN_RASANTE = 'Define la rasante del proyecto para levantar el modelo en volumen.'
const MENSAJE_POCAS_PROGRESIVAS = 'Hacen falta al menos dos progresivas medidas para levantar el modelo.'
const MENSAJE_SIN_MODELO = 'Ninguna zona tiene sus cuatro esquinas medidas todavía: no hay cuadro que dibujar.'

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
  const camara = useAlmacen((s) => s.camara)

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
   * de estas no hay ni un solo cuadro que se pueda llegar a cerrar.
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

  const caras = useMemo(() => {
    if (!esqueleto || !evaluacion || progresivasMedidas.size < 2) return []
    return armarCaras({
      progresivas: esqueleto.progresivas,
      elementos: esqueleto.elementos,
      offsets,
      cotaDe: (clave) => evaluacion.celdas.get(clave)?.cotaReal ?? null,
    })
  }, [esqueleto, evaluacion, offsets, progresivasMedidas])

  const proyectadas = useMemo(() => proyectarCaras(caras, camara), [caras, camara])

  const caja = useMemo(() => calcularCaja(proyectadas.flatMap((c) => c.puntos)), [proyectadas])

  if (!contexto) return null

  if (!evaluacion) {
    return (
      <p className="rounded border border-dashed border-slate-300 p-3 text-sm text-slate-500 dark:border-slate-700">
        {MENSAJE_SIN_RASANTE}
      </p>
    )
  }

  if (progresivasMedidas.size < 2) {
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
        aria-label="Modelo en volumen de la calle, coloreado por el estado de cada tramo"
        className="w-full rounded border border-slate-200 dark:border-slate-800"
      >
        {proyectadas.map(({ cara, puntos }: CaraProyectada) => {
          const claveInicial = claveCelda(cara.progresivaDesde, cara.elementoDesde)
          // Misma garantía que en `MapaEstado`: `esqueleto` y `evaluacion`
          // salen del mismo par calle/plantilla (el mismo `contexto`), así
          // que el producto progresiva × elemento que arma
          // `armarEsqueletoTabla` siempre tiene su celda evaluada.
          const celdaInicial = evaluacion.celdas.get(claveInicial)!
          const etiquetaBase = `Entre ${formatearProgresiva(cara.progresivaDesde)} y ${formatearProgresiva(cara.progresivaHasta)}, de ${cara.elementoDesde} a ${cara.elementoHasta}`
          const etiqueta = etiquetaAccesibleCelda(etiquetaBase, celdaInicial)
          const puntosSvg = puntos.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')

          return (
            <polygon
              key={cara.clave}
              data-cara={cara.clave}
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
      </svg>

      <p className="text-xs text-slate-500 dark:text-slate-400">Alturas exageradas {camara.exageracion}×</p>

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
    </div>
  )
}
