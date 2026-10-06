import { accionDeDiferencia, formatearProgresiva, partirClaveCelda, type CeldaEvaluada } from '@topo/core'
import { useMemo } from 'react'
import AvisoEspesores from '../../componentes/AvisoEspesores'
import { calcularEstadoRasante } from '../../estadoComparacion'
import { formatearDiferencia } from '../../estadoRasante'
import { useAlmacen } from '../../estado/almacen'
import { useContexto } from '../../estado/derivados'
import { formatearCota } from '../../formato'
import NotasDeCalle from '../herramientas/NotasDeCalle'
import { AVISO_DESTACADO, BOTON_PRINCIPAL, estacionComprobada, estacionDeCelda, textoAccion, VISUAL_ESTADO } from './comun'
import { useEvaluacionCalle, useResultadoCalle } from './resultadoCalle'

/** La celda que más se aparta del proyecto, medida y con rasante. Null si no hay ninguna. */
function peorCelda(celdas: Iterable<CeldaEvaluada>): CeldaEvaluada | null {
  let peor: CeldaEvaluada | null = null
  for (const celda of celdas) {
    if (celda.diferenciaMm === null) continue
    if (peor === null || Math.abs(celda.diferenciaMm) > Math.abs(peor.diferenciaMm!)) peor = celda
  }
  return peor
}

/**
 * Revisar: el punto elegido contra el proyecto (cota medida, de proyecto,
 * diferencia, semáforo y qué hacer), el resumen de la calle con un atajo al
 * peor punto, y las notas de la calle. Si la nivelación no cerró, se dice
 * arriba de todo: lo que se ve aquí no está comprobado.
 */
export default function FichaRevisar() {
  const contexto = useContexto()
  const resultado = useResultadoCalle()
  const evaluacion = useEvaluacionCalle(resultado)
  const calleActivaId = useAlmacen((s) => s.calleActivaId)
  const claveSeleccionada = useAlmacen((s) => s.seleccion.clave)
  const seleccionar = useAlmacen((s) => s.seleccionar)

  const peor = useMemo(() => (evaluacion ? peorCelda(evaluacion.celdas.values()) : null), [evaluacion])

  if (!contexto || !resultado) {
    return <p className="text-sm text-slate-500">Elige una capa medida para revisarla.</p>
  }

  const { calle, capa, campania } = contexto
  const cierraLaToma = resultado.cierre.pasa === true
  const celda = claveSeleccionada ? (evaluacion?.celdas.get(claveSeleccionada) ?? null) : null
  const cotaCelda = claveSeleccionada ? resultado.cotasPorCelda.get(claveSeleccionada) : undefined
  // Sin rasante no hay evaluación, pero lo medido en el punto sí se enseña.
  const partes = claveSeleccionada ? partirClaveCelda(claveSeleccionada) : null
  const progresivaPunto = celda?.progresiva ?? partes?.progresiva ?? null
  const elementoPunto = celda?.elementoClave ?? partes?.elementoClave ?? null
  const punto = elementoPunto ? calle.seccion.puntos.find((p) => p.id === elementoPunto) : undefined
  const accion = celda?.diferenciaMm != null ? accionDeDiferencia(celda.diferenciaMm) : null
  const visual = celda ? VISUAL_ESTADO[celda.estado] : null
  const cotaMedida = celda ? celda.cotaReal : (cotaCelda?.cota ?? null)
  // Lo comprobado es por estación: si la toma volvió a arrancar en un BM, el
  // cierre no respalda lo medido antes de ese arranque.
  const estacion = claveSeleccionada ? estacionDeCelda(campania, claveSeleccionada) : null
  const puntoComprobado = estacion !== null && estacionComprobada(resultado, estacion)
  const hayPunto = claveSeleccionada !== null && (celda !== null || (!calle.rasante && partes !== null))

  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-semibold">{cierraLaToma ? 'Cotas compensadas' : 'Cotas sin compensar'}</h3>
      {evaluacion ? (
        <AvisoEspesores estado={calcularEstadoRasante(resultado.cierre)} />
      ) : (
        !cierraLaToma && (
          <p className="rounded border border-falla bg-falla/10 px-3 py-2 text-sm font-semibold text-falla">
            <span aria-hidden="true">✗ </span>COTAS NO COMPROBADAS — la nivelación no cerró dentro de tolerancia.
          </p>
        )
      )}

      <section aria-label="Punto elegido" className="flex flex-col gap-2 rounded border border-slate-200 p-3 dark:border-slate-800">
        {!hayPunto ? (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {calle.rasante
              ? 'Toca una celda del mapa o un punto del corte para ver su diferencia con el proyecto.'
              : 'Toca una celda del mapa o un punto del corte para ver lo medido. Esta calle no tiene rasante de proyecto: no hay diferencias que revisar (cárgala en Obra › Calles).'}
          </p>
        ) : (
          <>
            <h3 className="font-semibold">
              {progresivaPunto !== null && formatearProgresiva(progresivaPunto)}{' '}
              {punto?.nombre ?? 'punto que ya no está en la sección'}
            </h3>
            {visual ? (
              <p className={`rounded border px-3 py-2 text-lg font-bold ${visual.clases}`}>
                <span aria-hidden="true">{visual.simbolo} </span>
                {visual.texto}
                {textoAccion(accion) && <> · {textoAccion(accion)}</>}
              </p>
            ) : (
              <p className={`rounded border px-3 py-2 text-sm font-semibold ${VISUAL_ESTADO.sinRasante.clases}`}>
                <span aria-hidden="true">{VISUAL_ESTADO.sinRasante.simbolo} </span>
                sin rasante de proyecto: solo la cota medida
              </p>
            )}
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-slate-500">Cota medida</dt>
              <dd className="numerico">{cotaMedida === null ? '—' : formatearCota(cotaMedida)}</dd>
              <dt className="text-slate-500">Cota de proyecto</dt>
              <dd className="numerico">{celda?.cotaTeorica == null ? '—' : formatearCota(celda.cotaTeorica)}</dd>
              <dt className="text-slate-500">Diferencia</dt>
              <dd className="numerico">{celda?.diferenciaMm == null ? '—' : formatearDiferencia(celda.diferenciaMm)}</dd>
              <dt className="text-slate-500">Tolerancia</dt>
              <dd className="numerico">{capa ? `±${capa.toleranciaMm} mm` : '—'}</dd>
              <dt className="text-slate-500">Lectura</dt>
              <dd className="numerico">
                {cotaCelda && cotaCelda.lecturas.length > 0 ? cotaCelda.lecturas.map(formatearCota).join(' · ') : '—'}
              </dd>
            </dl>
            {!puntoComprobado && cotaMedida !== null && (
              <p className={AVISO_DESTACADO}>
                <span aria-hidden="true">△ </span>
                {cierraLaToma
                  ? `Medida en la estación ${estacion! + 1}, antes de que la toma volviera a arrancar en un BM: el cierre no la respalda, no comprobada.`
                  : 'Cota sobre una nivelación sin cerrar: no comprobada.'}
              </p>
            )}
          </>
        )}
      </section>

      {evaluacion && (
        <section aria-label="Resumen de la calle" className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Resumen de la calle{!cierraLaToma && ' (no comprobado)'}</h3>
          {/* Un «✓ 17 conformes» sin más se lee como aprobado: si la nivelación no cerró, el resumen lo dice él mismo. */}
          {!cierraLaToma && (
            <p className={AVISO_DESTACADO}>
              <span aria-hidden="true">△ </span>
              La nivelación no cerró: estos conteos no están comprobados.
            </p>
          )}
          <ul className="grid grid-cols-2 gap-1 text-sm sm:grid-cols-3 lg:grid-cols-2">
            <li className="text-pasa">
              <span aria-hidden="true">✓ </span>
              {evaluacion.conformes} conformes{!cierraLaToma && ' sin comprobar'}
            </li>
            <li className="text-aviso">
              <span aria-hidden="true">△ </span>
              {evaluacion.alLimite} al límite
            </li>
            <li className="text-falla">
              <span aria-hidden="true">✗ </span>
              {evaluacion.fuera} fuera de tolerancia
            </li>
            <li className="text-slate-600 dark:text-slate-300">
              <span aria-hidden="true">· </span>
              {evaluacion.sinMedir} sin medir
            </li>
            {evaluacion.fueraDeSeccion > 0 && (
              <li className="text-slate-600 dark:text-slate-300">
                <span aria-hidden="true">— </span>
                {evaluacion.fueraDeSeccion} fuera de la sección
              </li>
            )}
          </ul>
          <button
            type="button"
            disabled={peor === null}
            onClick={() => peor && seleccionar(peor.clave)}
            className={`${BOTON_PRINCIPAL} self-start`}
          >
            Ir al peor punto
          </button>
        </section>
      )}

      {calleActivaId && <NotasDeCalle calleId={calleActivaId} />}
    </div>
  )
}
