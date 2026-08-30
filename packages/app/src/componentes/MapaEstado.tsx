import { formatearProgresiva, progresivasMedidas, type EstadoTolerancia, type Id } from '@topo/core'
import { useMemo } from 'react'
import { useAlmacen } from '../estado/almacen'
import { useContextoDe, useEvaluacionRasante } from '../estado/derivados'
import { etiquetaAccesibleCelda, SIMBOLO_ESTADO_TOLERANCIA } from '../estadoRasante'
import { armarEsqueletoTabla } from '../esqueletoTabla'
import MapaGrilla, { type CeldaPintada } from './MapaGrilla'

const MENSAJE_SIN_RASANTE = 'Define la rasante del proyecto para pintar el mapa de la calle.'

/**
 * Símbolo por estado. Los tres de tolerancia son los mismos que usa
 * `TablaDiferencias` — mismo signo, mismo significado en las dos vistas—.
 * Aquí, a diferencia de la tabla, el color es la única pista de fondo de
 * toda la rejilla, así que las otras dos categorías también necesitan el
 * suyo: un punto para «sin medir» (se resuelve midiendo) y una raya para
 * «sin rasante» (nunca será comparable, el proyecto no define nada ahí).
 */
const SIMBOLO_ESTADO: Record<EstadoTolerancia, string> = {
  conforme: SIMBOLO_ESTADO_TOLERANCIA.conforme!,
  alLimite: SIMBOLO_ESTADO_TOLERANCIA.alLimite!,
  fuera: SIMBOLO_ESTADO_TOLERANCIA.fuera!,
  sinMedir: '·',
  sinRasante: '—',
}

const CLASES_ESTADO: Record<EstadoTolerancia, string> = {
  conforme: 'bg-pasa/20 text-pasa',
  alLimite: 'bg-aviso/30 text-aviso',
  fuera: 'bg-falla/20 text-falla',
  sinMedir: 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500',
  sinRasante:
    'border border-dashed border-slate-300 bg-slate-50 text-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-600',
}

const LEYENDA: { estado: EstadoTolerancia; texto: string }[] = [
  { estado: 'conforme', texto: 'Dentro de tolerancia' },
  { estado: 'alLimite', texto: 'Al límite de tolerancia' },
  { estado: 'fuera', texto: 'Fuera de tolerancia' },
  { estado: 'sinMedir', texto: 'Sin medir' },
  { estado: 'sinRasante', texto: 'Sin rasante definida en el proyecto' },
]

interface Props {
  /**
   * Contra qué campaña se pinta el mapa: la decide quien llama, nunca este
   * componente mirando `campaniaActivaId` en el almacén — mismo criterio que
   * `idCampaniaReferencia` en `CorteTransversal` y `PerfilLongitudinal`, y
   * por la misma razón: ese argumento ("solo hay un llamador hoy") ya costó
   * tres rondas de arreglo repartidas entre esas dos vistas cuando apareció
   * un segundo llamador con otra intención. Obligatoria, sin valor por
   * defecto que lea el almacén: `null` cuando no hay campaña activa que
   * ofrecer como referencia.
   */
  idCampaniaReferencia: Id | null
}

export default function MapaEstado({ idCampaniaReferencia }: Props) {
  const contexto = useContextoDe(idCampaniaReferencia)
  const evaluacion = useEvaluacionRasante(idCampaniaReferencia ?? '')

  const seleccion = useAlmacen((s) => s.seleccion)
  const seleccionar = useAlmacen((s) => s.seleccionar)

  const esqueleto = useMemo(
    () =>
      contexto ? armarEsqueletoTabla(contexto.calle, progresivasMedidas(contexto.campania.estaciones)) : null,
    [contexto],
  )
  const progresivas = esqueleto?.progresivas ?? []
  const elementos = esqueleto?.elementos ?? []
  // Para nombrar cada celda con el nombre completo del punto («Borde
  // izquierdo»), nunca con el id interno de la sección (`p-borde-i`) que
  // compone la mitad derecha de `clave`: ese id no se le enseña a nadie.
  // Va el nombre completo y no la palabra corta de la cabecera porque esto
  // solo se usa para el nombre accesible de la celda, y la sección permite
  // la misma palabra a los dos lados del eje: dos celdas anunciadas «0+000
  // VEREDA» en la misma fila no se distinguirían de oído.
  const nombresPorClave = useMemo(() => new Map(elementos.map((e) => [e.clave, e.nombre])), [elementos])

  if (!contexto) return null

  if (!evaluacion) {
    return (
      <p className="rounded border border-dashed border-slate-300 p-3 text-sm text-slate-500 dark:border-slate-700">
        {MENSAJE_SIN_RASANTE}
      </p>
    )
  }

  function pintarCelda(clave: string): CeldaPintada {
    // `clave` sale de `progresivas`/`elementos`, que a su vez salen de
    // `armarEsqueletoTabla(contexto.calle, progresivasMedidas(...))` — la
    // misma calle y las mismas progresivas medidas que `useEvaluacionRasante`
    // usó para construir `evaluacion.celdas` (ambos cuelgan ahora del mismo
    // `idCampaniaReferencia`,
    // sin un segundo camino que pudiera desalinearlos). Por eso el motor
    // garantiza una celda en el mapa por cada progresiva × elemento y esta
    // búsqueda nunca falla: `construirGrilla` genera ese producto completo y
    // `evaluarContraRasante` evalúa cada una, sin huecos.
    const celda = evaluacion!.celdas.get(clave)!
    const separador = clave.indexOf('|')
    const progresiva = Number(clave.slice(0, separador))
    const elementoClave = clave.slice(separador + 1)
    const etiqueta = `${formatearProgresiva(progresiva)} ${nombresPorClave.get(elementoClave) ?? elementoClave}`

    return {
      simbolo: SIMBOLO_ESTADO[celda.estado],
      etiqueta: etiquetaAccesibleCelda(etiqueta, celda),
      clases: CLASES_ESTADO[celda.estado],
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <MapaGrilla
        progresivas={progresivas}
        elementos={elementos}
        llenas={new Set()}
        claveActiva={seleccion.clave}
        alElegir={seleccionar}
        pintarCelda={pintarCelda}
        orientacion="porProgresiva"
      />
      <ul
        className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300"
        aria-label="Qué significa cada color del mapa"
      >
        {LEYENDA.map(({ estado, texto }) => (
          <li key={estado} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={`flex h-5 w-5 items-center justify-center rounded text-[11px] ${CLASES_ESTADO[estado]}`}
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
