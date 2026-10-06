import {
  analizarDrenaje,
  formatearProgresiva,
  parsearProgresiva,
  type Calle,
  type SentidoDelAgua,
  type TramoDeDrenaje,
} from '@topo/core'
import { useMemo } from 'react'
import PerfilLongitudinal from '../../componentes/PerfilLongitudinal'
import { useAlmacen } from '../../estado/almacen'
import { useResultado, type ContextoCampania } from '../../estado/derivados'
import { formatearCota } from '../../formato'
import { Aviso, AvisoNoComprobado, formatearPorcentaje, motivoSinCierre, SELECTOR } from './comunes'
import { bombeosPorProgresiva, leerListaDeProgresivas, perfilDeProyecto, perfilMedido } from './superficies'

const FLECHA: Record<SentidoDelAgua, string> = { avanza: '→', retrocede: '←', plano: '·' }
const SENTIDO: Record<SentidoDelAgua, string> = {
  avanza: 'el agua corre hacia adelante',
  retrocede: 'el agua corre hacia atrás',
  plano: 'plano, el agua no corre',
}
const SIMBOLO_BOMBEO = { conforme: '✓', alLimite: '△', fuera: '✗' } as const
const PALABRA_BOMBEO = { conforme: 'conforme', alLimite: 'al límite', fuera: 'fuera' } as const
const CLASE_BOMBEO = { conforme: 'text-pasa', alLimite: 'text-aviso', fuera: 'text-falla' } as const

/** Lo que se elige en Drenaje; lo guarda PantallaAnalisis para que no se pierda al cambiar de pestaña. */
export interface EleccionDrenaje {
  /** Id del punto de la sección; vacío = el eje. */
  elemento: string
  /** Lo escrito en «Sumideros», tal cual. */
  sumideros: string
}
export const DRENAJE_DE_FABRICA: EleccionDrenaje = { elemento: '', sumideros: '' }

/**
 * Drenaje: hacia dónde corre el agua por un punto de la sección (de fábrica
 * el eje), dónde se junta y si el bombeo bota el agua como pide el proyecto.
 * Las cuentas son de `analisis/drenaje` del motor.
 */
export default function PestanaDrenaje({
  calle,
  contexto,
  eleccion,
  alCambiar,
}: {
  calle: Calle
  contexto: ContextoCampania
  eleccion: EleccionDrenaje
  alCambiar: (cambio: Partial<EleccionDrenaje>) => void
}) {
  const resultado = useResultado()
  const capas = useAlmacen((s) => s.proyecto.capas)
  const campaniaActivaId = useAlmacen((s) => s.campaniaActivaId)
  const puntos = calle.seccion.puntos
  const ejeId = puntos.find((p) => p.rol === 'eje')?.id ?? puntos[0]?.id ?? ''
  const elementoPedido = eleccion.elemento
  const textoSumideros = eleccion.sumideros

  const elementoId = puntos.some((p) => p.id === elementoPedido) ? elementoPedido : ejeId
  const punto = puntos.find((p) => p.id === elementoId)
  const rasante = calle.rasante
  const capaId = contexto.campania.capaId
  const sumideros = useMemo(() => leerListaDeProgresivas(textoSumideros, parsearProgresiva), [textoSumideros])

  const calculo = useMemo(() => {
    if (!resultado || !punto) return null
    const medido = perfilMedido(resultado, punto.id)
    const proyecto = rasante
      ? perfilDeProyecto(rasante, capas, capaId, medido.map((p) => p.progresiva), punto.distancia)
      : null
    const drenaje = analizarDrenaje(medido, proyecto, {
      sumideros: sumideros.progresivas,
      comprobado: resultado.cierre.pasa === true,
    })
    const progresivas = [...new Set([...resultado.cotasPorCelda.values()].map((c) => c.progresiva))].sort((a, b) => a - b)
    const bombeos = bombeosPorProgresiva(calle, resultado, progresivas, rasante ? { rasante, capas, capaId } : null)
    return { medido, drenaje, bombeos }
  }, [resultado, punto, rasante, capas, capaId, sumideros, calle])

  if (puntos.length === 0) {
    return (
      <Aviso tono="aviso" simbolo="△">
        La sección de esta calle no tiene puntos, así que no hay perfil que seguir. Declara los puntos de la sección
        (eje, bordes, cunetas) en Obra › Calles.
      </Aviso>
    )
  }
  if (!resultado || !calculo) {
    return (
      <Aviso tono="neutro" simbolo="△">
        La nivelación activa todavía no tiene cotas calculadas. Anota sus lecturas en Calle › Medir.
      </Aviso>
    )
  }
  const { drenaje, bombeos, medido } = calculo
  const contrapendientes = drenaje.tramos.filter((t) => t.contraPendiente)

  return (
    <div className="flex flex-col gap-3">
      {!drenaje.comprobado && <AvisoNoComprobado que="DRENAJE Y BOMBEO" motivo={motivoSinCierre(resultado.cierre.pasa)} />}
      {!rasante && (
        <Aviso tono="aviso" simbolo="△">
          Esta calle no tiene rasante de proyecto: se ve hacia dónde corre el agua y dónde se junta, pero no se
          comparan pendientes ni bombeo con el proyecto. Carga la rasante en Obra › Calles.
        </Aviso>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Punto del perfil</span>
          <select aria-label="Punto del perfil" value={elementoId} onChange={(e) => alCambiar({ elemento: e.target.value })} className={SELECTOR}>
            {puntos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Sumideros (progresivas)</span>
          <input
            aria-label="Sumideros"
            value={textoSumideros}
            onChange={(e) => alCambiar({ sumideros: e.target.value })}
            placeholder="0+040; 0+120"
            // Teclado de texto a propósito: el decimal del celular no trae «+», «;» ni espacio.
            inputMode="text"
            className={`${SELECTOR} numerico`}
          />
          {sumideros.noEntendidas.length > 0 && (
            <span className="text-aviso">
              <span aria-hidden="true">△ </span>No se entiende: {sumideros.noEntendidas.join(', ')}
            </span>
          )}
        </label>
      </div>

      {medido.length < 2 ? (
        <Aviso tono="aviso" simbolo="△">
          {punto?.nombre ?? 'Este punto'} tiene {medido.length === 0 ? 'ninguna cota' : 'una sola cota'}: para ver hacia
          dónde corre el agua hacen falta al menos dos progresivas medidas en él. Mídelo en Calle › Medir o elige otro
          punto.
        </Aviso>
      ) : (
        <>
          <PerfilLongitudinal elementoClave={elementoId} idCampaniaReferencia={campaniaActivaId} />

          <ul aria-label="Resumen del drenaje" className="grid gap-2 text-sm sm:grid-cols-3">
            <Resumen
              bien={drenaje.empozamientos.length === 0}
              texto={
                drenaje.empozamientos.length === 0
                  ? 'Ningún empozamiento'
                  : `${drenaje.empozamientos.length} ${drenaje.empozamientos.length === 1 ? 'empozamiento' : 'empozamientos'}`
              }
            />
            <Resumen
              bien={contrapendientes.length === 0}
              texto={
                !rasante
                  ? 'Contrapendiente: sin proyecto'
                  : contrapendientes.length === 0
                    ? 'Ningún tramo a contrapendiente'
                    : `${contrapendientes.length} ${contrapendientes.length === 1 ? 'tramo' : 'tramos'} a contrapendiente`
              }
              neutro={!rasante}
            />
            <Resumen
              bien={drenaje.puntosBajos.length === 0}
              neutro
              texto={`${drenaje.puntosBajos.length} ${drenaje.puntosBajos.length === 1 ? 'punto bajo' : 'puntos bajos'}`}
            />
          </ul>

          <section className="flex flex-col gap-1 text-sm">
            <h3 className="font-semibold">Sentido del agua</h3>
            <ul aria-label="Sentido del agua por tramo" className="flex flex-col gap-1">
              {drenaje.tramos.map((t) => (
                <TramoAgua key={`${t.desde}-${t.hasta}`} tramo={t} />
              ))}
            </ul>
          </section>

          <section className="flex flex-col gap-1 text-sm">
            <h3 className="font-semibold">Puntos bajos</h3>
            {drenaje.puntosBajos.length === 0 ? (
              <p className="text-slate-600 dark:text-slate-300">Ninguno: el agua sale de lo medido.</p>
            ) : (
              <ul aria-label="Puntos bajos" className="flex flex-col gap-1">
                {drenaje.puntosBajos.map((p) => {
                  const empoza = drenaje.empozamientos.includes(p)
                  const lugar =
                    p.hasta !== p.progresiva
                      ? `${formatearProgresiva(p.progresiva)} a ${formatearProgresiva(p.hasta)}`
                      : formatearProgresiva(p.progresiva)
                  return (
                    <li
                      key={`${p.progresiva}-${p.hasta}`}
                      className={`rounded border px-3 py-2 ${empoza ? 'border-falla text-falla' : p.enSumidero ? 'border-pasa text-pasa' : 'border-aviso text-aviso'}`}
                    >
                      <span aria-hidden="true">{empoza ? '✗ ' : p.enSumidero ? '✓ ' : '△ '}</span>
                      <span className="numerico">{lugar}</span> · cota {formatearCota(p.cota)} ·{' '}
                      {empoza
                        ? `se empoza: junta ${p.profundidadMm} mm antes de rebalsar${p.profundidadMm <= 2 ? ' (dentro del ruido de la nivelación)' : ''}`
                        : p.enSumidero
                          ? 'lo recoge un sumidero'
                          : 'en el extremo de lo medido: mira más allá antes de darlo por bueno'}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </>
      )}

      <section className="flex flex-col gap-1 text-sm">
        <h3 className="font-semibold">Bombeo de la calzada</h3>
        {bombeos.length === 0 ? (
          <p className="text-slate-600 dark:text-slate-300">
            La sección no tiene eje y bordes de calzada: declara esos puntos en Obra › Calles para ver el bombeo.
          </p>
        ) : (
          <div className="overflow-x-auto rounded border border-slate-200 dark:border-slate-800">
            <table aria-label="Bombeo por progresiva" className="w-full border-collapse text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900">
                <tr className="text-left text-slate-500">
                  <th className="px-2 py-1.5 font-medium">Progresiva</th>
                  <th className="px-2 py-1.5 font-medium">Lado</th>
                  <th className="px-2 py-1.5 text-right font-medium">Medido</th>
                  <th className="px-2 py-1.5 text-right font-medium">Proyecto</th>
                  <th className="px-2 py-1.5 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {bombeos.map((b) => (
                  <tr key={`${b.progresiva}-${b.lado}`} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="numerico px-2 py-1.5">{formatearProgresiva(b.progresiva)}</td>
                    <td className="px-2 py-1.5">{b.lado}</td>
                    <td className="numerico px-2 py-1.5 text-right">{b.medido !== null ? formatearPorcentaje(b.medido) : '—'}</td>
                    <td className="numerico px-2 py-1.5 text-right">{b.proyecto !== null ? formatearPorcentaje(b.proyecto) : '—'}</td>
                    <td className="px-2 py-1.5">
                      {b.comparacion ? (
                        <span className={CLASE_BOMBEO[b.comparacion.estado]}>
                          {SIMBOLO_BOMBEO[b.comparacion.estado]} {PALABRA_BOMBEO[b.comparacion.estado]}
                          {b.comparacion.aguaAlReves
                            ? ' · el agua va al revés'
                            : b.comparacion.menosQueProyecto
                              ? ' · más tendido'
                              : ''}
                        </span>
                      ) : b.medido === null ? (
                        <span className="text-slate-500">sin medir</span>
                      ) : (
                        <span className="text-slate-500">sin proyecto</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {drenaje.descartados.length > 0 && (
        <p className="text-sm text-aviso">
          <span aria-hidden="true">△ </span>
          {drenaje.descartados.length} {drenaje.descartados.length === 1 ? 'punto no entró' : 'puntos no entraron'} al
          análisis (sin cota o repetidos).
        </p>
      )}
    </div>
  )
}

function Resumen({ bien, texto, neutro = false }: { bien: boolean; texto: string; neutro?: boolean }) {
  const clase = neutro ? 'border-slate-300 dark:border-slate-700' : bien ? 'border-pasa text-pasa' : 'border-falla text-falla'
  return (
    <li className={`rounded border px-3 py-2 font-medium ${clase}`}>
      {!neutro && <span aria-hidden="true">{bien ? '✓ ' : '✗ '}</span>}
      {texto}
    </li>
  )
}

function TramoAgua({ tramo }: { tramo: TramoDeDrenaje }) {
  const etiqueta =
    `${formatearProgresiva(tramo.desde)} a ${formatearProgresiva(tramo.hasta)}: ${SENTIDO[tramo.sentidoMedido]}, ` +
    `${formatearPorcentaje(tramo.pendienteMedida)}` +
    (tramo.pendienteProyecto !== null ? `, proyecto ${formatearPorcentaje(tramo.pendienteProyecto)}` : '') +
    (tramo.contraPendiente ? ', a contrapendiente' : '') +
    (tramo.casiPlano && !tramo.contraPendiente ? ', casi plano' : '')
  const clase = tramo.contraPendiente
    ? 'border-falla text-falla'
    : tramo.casiPlano
      ? 'border-aviso text-aviso'
      : 'border-slate-200 dark:border-slate-800'
  return (
    <li aria-label={etiqueta} className={`flex flex-wrap items-center gap-x-3 rounded border px-3 py-1.5 ${clase}`}>
      <span aria-hidden="true" className="w-6 text-center text-lg leading-none">
        {FLECHA[tramo.sentidoMedido]}
      </span>
      <span className="numerico">
        {formatearProgresiva(tramo.desde)} → {formatearProgresiva(tramo.hasta)}
      </span>
      <span className="numerico">{formatearPorcentaje(tramo.pendienteMedida)}</span>
      {tramo.pendienteProyecto !== null && (
        <span className="numerico text-slate-500">proyecto {formatearPorcentaje(tramo.pendienteProyecto)}</span>
      )}
      {tramo.contraPendiente && (
        <span className="font-semibold">
          <span aria-hidden="true">✗ </span>contrapendiente
        </span>
      )}
      {tramo.casiPlano && !tramo.contraPendiente && (
        <span>
          <span aria-hidden="true">△ </span>casi plano
        </span>
      )}
    </li>
  )
}
