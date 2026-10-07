import { accionDeDiferencia, formatearProgresiva, partirClaveCelda, type CeldaEvaluada } from '@topo/core'
import { useEffect, useMemo } from 'react'
import AvisoEspesores from '../../componentes/AvisoEspesores'
import AvisoLinea from '../../componentes/AvisoLinea'
import Plegable from '../../componentes/Plegable'
import { CEJA } from '../../componentes/ui'
import { calcularEstadoRasante } from '../../estadoComparacion'
import { formatearDiferencia } from '../../estadoRasante'
import { useAlmacen } from '../../estado/almacen'
import { useContexto } from '../../estado/derivados'
import { formatearCota } from '../../formato'
import NotasDeCalle from '../herramientas/NotasDeCalle'
import { estacionComprobada, estacionDeCelda, textoAccion, VISUAL_ESTADO } from './comun'
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
 * Revisar: arriba, cómo está la calle entera y un atajo al peor punto; luego
 * el punto elegido contra el proyecto (diferencia, semáforo y qué hacer, en
 * grande, y debajo las cotas); y al final, plegadas, las notas de la calle.
 * Si la nivelación no cerró, se dice una sola vez, arriba y con su acción
 * («△ Sin cerrar · diferencias no comprobadas · Cierra en BM-2 ›»): nada de
 * lo que se ve aquí está comprobado. El mapa lleva su propia etiqueta porque
 * en el celular se ve aparte.
 *
 * Al entrar sin punto elegido se elige solo el peor: es el que hay que mirar.
 */
export default function FichaRevisar() {
  const contexto = useContexto()
  const resultado = useResultadoCalle()
  const evaluacion = useEvaluacionCalle(resultado)
  const calleActivaId = useAlmacen((s) => s.calleActivaId)
  const claveSeleccionada = useAlmacen((s) => s.seleccion.clave)
  const seleccionar = useAlmacen((s) => s.seleccionar)
  const abrirPantallaCalle = useAlmacen((s) => s.abrirPantallaCalle)
  const bms = useAlmacen((s) => s.proyecto.bms)

  const peor = useMemo(() => (evaluacion ? peorCelda(evaluacion.celdas.values()) : null), [evaluacion])

  // Sin punto elegido, o con uno que no es de esta calle, se va al peor.
  const sinPunto = claveSeleccionada === null || (evaluacion !== null && !evaluacion.celdas.has(claveSeleccionada))
  useEffect(() => {
    if (sinPunto && peor) seleccionar(peor.clave)
  }, [sinPunto, peor, seleccionar])

  if (!contexto || !resultado) {
    return <p className="text-sm text-tenue">Elige una capa medida para revisarla.</p>
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
  const cuantasNotas = calle.notas?.length ?? 0
  const nombrePeor = peor
    ? `${formatearProgresiva(peor.progresiva)} ${calle.seccion.puntos.find((p) => p.id === peor.elementoClave)?.nombre ?? ''}`
    : ''
  const bmFinalId = campania.cierre.bmFinalId ?? campania.bmInicialId
  const bmCierre = bms.find((b) => b.id === bmFinalId)?.nombre ?? null
  // El atajo sobra si el punto elegido ya es el peor (al entrar se elige solo).
  const peorYaElegido = peor !== null && peor.clave === claveSeleccionada

  // Sin cerrar, un solo aviso con su acción: dice que falta y dónde se arregla.
  const cerroFuera = resultado.cierre.pasa === false
  const avisoSinCerrar = !cierraLaToma && (
    <AvisoLinea
      tono="aviso"
      accion={
        cerroFuera || !bmCierre
          ? { texto: 'Ver el cierre ›', alPulsar: () => abrirPantallaCalle('cierre') }
          : { texto: `Cierra en ${bmCierre} ›`, alPulsar: () => abrirPantallaCalle('cierre') }
      }
    >
      <b>{cerroFuera ? 'Cierre fuera de tolerancia' : 'Sin cerrar'}</b> ·{' '}
      {evaluacion ? 'diferencias no comprobadas' : 'cotas no comprobadas'}
    </AvisoLinea>
  )

  return (
    <div className="flex flex-col gap-4">
      {!evaluacion && avisoSinCerrar}

      {/* La calle entera, en una franja: cuántos de cada y un atajo al peor. */}
      {evaluacion && (
        <section aria-label="Resumen de la calle" className="-mt-2 flex flex-col gap-2">
          <h3 className="text-[15px] font-semibold">Resumen de la calle</h3>
          {avisoSinCerrar || <AvisoEspesores estado={calcularEstadoRasante(resultado.cierre)} />}
          {/* Un «✓ 17 conformes» sin más se lee como aprobado: sin cerrar, lo dice, en pequeño. */}
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold">
            <li className="text-pasa">
              <span aria-hidden="true">✓ </span>
              {evaluacion.conformes} conformes
              {!cierraLaToma && <span className="font-normal text-tenue"> sin comprobar</span>}
            </li>
            <li className="text-aviso">
              <span aria-hidden="true">△ </span>
              {evaluacion.alLimite} al límite
            </li>
            <li className="text-falla">
              <span aria-hidden="true">✗ </span>
              {evaluacion.fuera} fuera de tolerancia
            </li>
            <li className="text-sin">
              <span aria-hidden="true">· </span>
              {evaluacion.sinMedir} sin medir
            </li>
            {evaluacion.fueraDeSeccion > 0 && (
              <li className="text-sin">
                <span aria-hidden="true">— </span>
                {evaluacion.fueraDeSeccion} fuera de la sección
              </li>
            )}
          </ul>
          {peor && peor.diferenciaMm !== null && !peorYaElegido && (
            <button
              type="button"
              onClick={() => seleccionar(peor.clave)}
              className="min-h-12 rounded-[10px] border border-falla/40 bg-falla-suave px-3 py-2 text-left text-[15px] font-semibold text-falla"
            >
              <span aria-hidden="true">✗ </span>Ir al peor punto:{' '}
              <span className="numerico">
                {nombrePeor} {formatearDiferencia(peor.diferenciaMm)}
              </span>
            </button>
          )}
        </section>
      )}

      <section aria-label="Punto elegido" className="flex flex-col gap-3">
        <h3 className={CEJA}>{cierraLaToma ? 'Cotas compensadas' : 'Cotas sin compensar'}</h3>
        {!hayPunto ? (
          <p className="text-sm text-tenue">
            {calle.rasante
              ? 'Toca una celda del mapa o un punto del corte para ver su diferencia con el proyecto.'
              : 'Toca una celda del mapa o un punto del corte para ver lo medido. Esta calle no tiene rasante de proyecto: no hay diferencias que revisar (cárgala en Obra › Calles).'}
          </p>
        ) : (
          <>
            <h3 className="-mt-2 text-[26px] leading-tight font-bold">
              {progresivaPunto !== null && <span className="numerico">{formatearProgresiva(progresivaPunto)}</span>} ·{' '}
              {punto?.nombre ?? 'punto que ya no está en la sección'}
            </h3>
            {visual ? (
              <div className={`flex items-center gap-3.5 rounded-xl px-4 py-3.5 ${visual.clases}`}>
                <span aria-hidden="true" className="text-[38px] leading-none">
                  {visual.simbolo}
                </span>
                <div className="min-w-0">
                  <p className="numerico text-[30px] leading-tight font-semibold">
                    {celda?.diferenciaMm == null ? '—' : formatearDiferencia(celda.diferenciaMm)}
                  </p>
                  <p className="text-[15px]">
                    {visual.texto}
                    {textoAccion(accion) && (
                      <>
                        {' · '}
                        <b>{textoAccion(accion)}</b>
                      </>
                    )}
                  </p>
                </div>
              </div>
            ) : (
              <p className={`rounded-xl px-4 py-3 text-sm font-semibold ${VISUAL_ESTADO.sinRasante.clases}`}>
                <span aria-hidden="true">{VISUAL_ESTADO.sinRasante.simbolo} </span>
                sin rasante de proyecto: solo la cota medida
              </p>
            )}
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-[15px]">
              <dt className="text-tenue">Cota medida</dt>
              <dd className="numerico font-semibold">{cotaMedida === null ? '—' : formatearCota(cotaMedida)}</dd>
              <dt className="text-tenue">Cota de proyecto</dt>
              <dd className="numerico font-semibold text-proyecto">
                {celda?.cotaTeorica == null ? '—' : formatearCota(celda.cotaTeorica)}
              </dd>
              <dt className="text-tenue">Diferencia</dt>
              <dd className="numerico">{celda?.diferenciaMm == null ? '—' : formatearDiferencia(celda.diferenciaMm)}</dd>
              <dt className="text-tenue">Tolerancia</dt>
              <dd className="numerico">{capa ? `±${capa.toleranciaMm} mm` : '—'}</dd>
              <dt className="text-tenue">Lectura</dt>
              <dd className="numerico">
                {cotaCelda && cotaCelda.lecturas.length > 0 ? cotaCelda.lecturas.map(formatearCota).join(' · ') : '—'}
              </dd>
            </dl>
            {/* Sin cerrar ya lo dice el aviso de arriba; aquí solo el caso que solo afecta a este punto. */}
            {cierraLaToma && !puntoComprobado && cotaMedida !== null && (
              <AvisoLinea tono="aviso">
                {`Medida en la estación ${estacion! + 1}, antes de que la toma volviera a arrancar en un BM: el cierre no la respalda, no comprobada.`}
              </AvisoLinea>
            )}
          </>
        )}
      </section>

      {calleActivaId && (
        <Plegable titulo={`Notas de la calle (${cuantasNotas})`} className="border-t border-borde pt-2">
          <NotasDeCalle calleId={calleActivaId} />
        </Plegable>
      )}
    </div>
  )
}
