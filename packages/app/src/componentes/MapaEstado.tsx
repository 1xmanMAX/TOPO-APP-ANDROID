import { formatearProgresiva, type CeldaEvaluada, type EstadoTolerancia, type Id } from '@topo/core'
import { useMemo } from 'react'
import { useAlmacen } from '../estado/almacen'
import { useContexto, useContextoDe, useEvaluacionRasante } from '../estado/derivados'
import { ETIQUETA_ESTADO, formatearDiferencia, SIMBOLO_ESTADO_TOLERANCIA } from '../estadoRasante'
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

/**
 * El nombre accesible completo de una celda: progresiva, elemento, diferencia
 * con signo y estado en palabras — nunca solo el color ni solo el símbolo.
 */
function etiquetaAccesible(etiqueta: string, celda: CeldaEvaluada | undefined): string {
  if (!celda) return `${etiqueta}, sin datos`
  if (celda.diferenciaMm === null) return `${etiqueta}, ${ETIQUETA_ESTADO[celda.estado]}`
  return `${etiqueta}: ${formatearDiferencia(celda.diferenciaMm)}, ${ETIQUETA_ESTADO[celda.estado]}`
}

interface Props {
  /**
   * Contra qué campaña se pinta el mapa: la decide quien llama, igual que
   * `idCampaniaReferencia` en `CorteTransversal` y `PerfilLongitudinal` — ese
   * argumento ("solo hay un llamador hoy") ya costó dos rondas de arreglo
   * entre esas dos vistas. Sin indicar nada cae en la campaña activa del
   * almacén, el mismo valor por defecto que ya trae `useEvaluacionRasante`;
   * pasar explícitamente `null` (a diferencia de omitirlo) pide en cambio que
   * no haya ninguna referencia, aunque el almacén sí tenga una activa.
   */
  idCampaniaReferencia?: Id | null
}

export default function MapaEstado({ idCampaniaReferencia }: Props) {
  const contextoActivo = useContexto()
  const contextoReferencia = useContextoDe(idCampaniaReferencia ?? null)
  const contexto = idCampaniaReferencia === undefined ? contextoActivo : contextoReferencia

  const idEvaluacion = idCampaniaReferencia === undefined ? undefined : (idCampaniaReferencia ?? '')
  const evaluacion = useEvaluacionRasante(idEvaluacion)

  const seleccion = useAlmacen((s) => s.seleccion)
  const seleccionar = useAlmacen((s) => s.seleccionar)

  const esqueleto = useMemo(
    () => (contexto ? armarEsqueletoTabla(contexto.calle, contexto.plantilla) : null),
    [contexto],
  )
  const progresivas = esqueleto?.progresivas ?? []
  const elementos = esqueleto?.elementos ?? []

  if (!contexto) return null

  if (!evaluacion) {
    return (
      <p className="rounded border border-dashed border-slate-300 p-3 text-sm text-slate-500 dark:border-slate-700">
        {MENSAJE_SIN_RASANTE}
      </p>
    )
  }

  function pintarCelda(clave: string): CeldaPintada {
    const celda = evaluacion!.celdas.get(clave)
    const separador = clave.indexOf('|')
    const etiqueta = `${formatearProgresiva(Number(clave.slice(0, separador)))} ${clave.slice(separador + 1)}`

    if (!celda) {
      return { simbolo: '·', etiqueta: `${etiqueta}, sin datos`, clases: CLASES_ESTADO.sinMedir }
    }
    return {
      simbolo: SIMBOLO_ESTADO[celda.estado],
      etiqueta: etiquetaAccesible(etiqueta, celda),
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
