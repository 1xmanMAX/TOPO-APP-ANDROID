import { armarCaras, claveCelda, formatearProgresiva, type EstadoTolerancia, type Id } from '@topo/core'
import { useMemo } from 'react'
import { useContextoDe, useEvaluacionRasante } from '../estado/derivados'
import { ETIQUETA_ESTADO, formatearDiferencia } from '../estadoRasante'
import { armarEsqueletoTabla } from '../esqueletoTabla'

/**
 * Mismo orden que la leyenda de `Vista3D`: primero los tres estados de
 * tolerancia (de mejor a peor), luego los dos que no la evalúan. `sinMedir`
 * nunca aparece en la práctica — un tramo solo se dibuja con sus cuatro
 * esquinas medidas—, pero queda listado por si algún día deja de ser cierto.
 */
const ORDEN_ESTADOS: EstadoTolerancia[] = ['conforme', 'alLimite', 'fuera', 'sinRasante', 'sinMedir']

interface Props {
  /**
   * Contra qué campaña se resume: la decide quien llama, nunca este
   * componente mirando `campaniaActivaId` en el almacén — mismo criterio que
   * `idCampaniaReferencia` en `Vista3D`, `MapaEstado`, `CorteTransversal` y
   * `TablaDiferencias`, y por la misma razón: ese argumento ("solo hay un
   * llamador hoy") ya costó cuatro rondas de arreglo repartidas entre las
   * cinco vistas que ya existen. Obligatoria, sin valor por defecto que lea
   * el almacén: `null` cuando no hay campaña activa que ofrecer como
   * referencia.
   */
  idCampaniaReferencia: Id | null
}

/**
 * El párrafo que dice con palabras lo que `Vista3D` enseña con formas: para
 * quien no ve el modelo en volumen (o no puede distinguir sus colores), esta
 * es la única manera de enterarse de que hay un problema y de dónde está.
 *
 * Cuenta exactamente los mismos tramos que dibuja `Vista3D` — mismas caras,
 * mismo criterio de color (la esquina "desde" de cada cara) — para que el
 * párrafo nunca hable de un tramo que el dibujo no pinta, ni calle uno que sí
 * pinta.
 */
export default function ResumenVista3D({ idCampaniaReferencia }: Props) {
  const contexto = useContextoDe(idCampaniaReferencia)
  const evaluacion = useEvaluacionRasante(idCampaniaReferencia ?? '')

  const esqueleto = useMemo(
    () => (contexto ? armarEsqueletoTabla(contexto.calle, contexto.plantilla) : null),
    [contexto],
  )

  const offsets = useMemo(() => {
    const mapa = new Map<string, number>()
    if (contexto) for (const elemento of contexto.plantilla.elementos) mapa.set(elemento.clave, elemento.offset)
    return mapa
  }, [contexto])

  const caras = useMemo(() => {
    if (!esqueleto || !evaluacion) return []
    return armarCaras({
      progresivas: esqueleto.progresivas,
      elementos: esqueleto.elementos,
      offsets,
      cotaDe: (clave) => evaluacion.celdas.get(clave)?.cotaReal ?? null,
    })
  }, [esqueleto, evaluacion, offsets])

  if (!contexto || !evaluacion || caras.length === 0) return null

  const conteos: Partial<Record<EstadoTolerancia, number>> = {}
  let peor: { etiqueta: string; diferenciaMm: number } | null = null

  for (const cara of caras) {
    // Mismo criterio de color que usa `Vista3D` al dibujar la cara: el
    // estado de su esquina "desde" — no de las cuatro. Un tramo con problema
    // en otra esquina se cuenta ahí, en la cara donde esa esquina sea la
    // suya, no en esta.
    const claveInicial = claveCelda(cara.progresivaDesde, cara.elementoDesde)
    const celda = evaluacion.celdas.get(claveInicial)!
    conteos[celda.estado] = (conteos[celda.estado] ?? 0) + 1

    if ((celda.estado === 'fuera' || celda.estado === 'alLimite') && celda.diferenciaMm !== null) {
      if (!peor || Math.abs(celda.diferenciaMm) > Math.abs(peor.diferenciaMm)) {
        peor = {
          etiqueta: `${formatearProgresiva(cara.progresivaDesde)} ${cara.elementoDesde}`,
          diferenciaMm: celda.diferenciaMm,
        }
      }
    }
  }

  const detalleEstados = ORDEN_ESTADOS.filter((estado) => conteos[estado])
    .map((estado) => `${conteos[estado]} ${ETIQUETA_ESTADO[estado]}`)
    .join(', ')

  return (
    <p className="text-sm text-slate-600 dark:text-slate-300">
      El modelo dibuja {caras.length} tramos{detalleEstados ? `: ${detalleEstados}` : ''}.{' '}
      {peor
        ? `La mayor diferencia está en ${peor.etiqueta}: ${formatearDiferencia(peor.diferenciaMm)}.`
        : 'Todo dentro de tolerancia.'}
    </p>
  )
}
