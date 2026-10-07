import { formatearProgresiva, progresivasDeLaToma, type EstadoTolerancia, type Id } from '@topo/core'
import { useMemo } from 'react'
import { useAlmacen } from '../estado/almacen'
import { useContextoDe, useEvaluacionRasante, useResultadoDe } from '../estado/derivados'
import { etiquetaAccesibleCelda, SIMBOLO_ESTADO_TOLERANCIA } from '../estadoRasante'
import { armarEsqueletoTabla } from '../esqueletoTabla'
import MapaGrilla, { type CeldaPintada } from './MapaGrilla'
import { CLASES_ESTADO } from './ui'

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

/** La diferencia dentro de la celda: con signo y sin unidad («+46», «−4», «0»). */
function diferenciaCorta(diferenciaMm: number): string {
  return `${diferenciaMm > 0 ? '+' : diferenciaMm < 0 ? '−' : ''}${Math.abs(diferenciaMm)}`
}

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
  /** Ver `MapaGrilla`. Por defecto, un punto por fila y la calle entera a lo ancho. */
  orientacion?: 'porElemento' | 'porProgresiva'
}

/**
 * La rejilla de la calle pintada por estado: símbolo, diferencia en mm y
 * color en cada celda. La leyenda (los conteos del semáforo) y el aviso de
 * «no comprobado» los pone quien la monta, en su cabecera; además, cada
 * celda medida sobre una nivelación sin cerrar lo dice en su nombre accesible.
 */
export default function MapaEstado({ idCampaniaReferencia, orientacion = 'porProgresiva' }: Props) {
  const contexto = useContextoDe(idCampaniaReferencia)
  const evaluacion = useEvaluacionRasante(idCampaniaReferencia ?? '')
  // Sin cierre dentro de tolerancia, nada de lo pintado está comprobado
  // (diseño §3): lo dice cada celda, no solo quien monte el mapa.
  const resultado = useResultadoDe(idCampaniaReferencia)
  const noComprobado = resultado !== null && resultado.cierre.pasa !== true

  const seleccion = useAlmacen((s) => s.seleccion)
  const seleccionar = useAlmacen((s) => s.seleccionar)

  const esqueleto = useMemo(
    () =>
      contexto ? armarEsqueletoTabla(contexto.calle, progresivasDeLaToma(contexto.campania)) : null,
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
      <p className="rounded-[10px] border border-dashed border-borde-fuerte p-3 text-sm text-tenue">
        {MENSAJE_SIN_RASANTE}
      </p>
    )
  }

  function pintarCelda(clave: string): CeldaPintada {
    // `clave` sale de `progresivas`/`elementos`, que a su vez salen de
    // `armarEsqueletoTabla(contexto.calle, progresivasDeLaToma(...))` — la
    // misma calle y las mismas progresivas medidas que `useEvaluacionRasante`
    // usó para construir `evaluacion.celdas` (ambos cuelgan del mismo
    // `idCampaniaReferencia`, sin un segundo camino que pudiera
    // desalinearlos). Por eso el motor garantiza una celda en el mapa por
    // cada progresiva × elemento y esta búsqueda nunca falla.
    const celda = evaluacion!.celdas.get(clave)!
    const separador = clave.indexOf('|')
    const progresiva = Number(clave.slice(0, separador))
    const elementoClave = clave.slice(separador + 1)
    const etiqueta = `${formatearProgresiva(progresiva)} ${nombresPorClave.get(elementoClave) ?? elementoClave}`

    return {
      simbolo: SIMBOLO_ESTADO[celda.estado],
      texto: celda.diferenciaMm === null ? undefined : diferenciaCorta(celda.diferenciaMm),
      etiqueta:
        noComprobado && celda.diferenciaMm !== null
          ? `${etiquetaAccesibleCelda(etiqueta, celda)}, no comprobado`
          : etiquetaAccesibleCelda(etiqueta, celda),
      clases: CLASES_ESTADO[celda.estado],
    }
  }

  return (
    <MapaGrilla
      progresivas={progresivas}
      elementos={elementos}
      llenas={new Set()}
      claveActiva={seleccion.clave}
      alElegir={seleccionar}
      pintarCelda={pintarCelda}
      orientacion={orientacion}
    />
  )
}
