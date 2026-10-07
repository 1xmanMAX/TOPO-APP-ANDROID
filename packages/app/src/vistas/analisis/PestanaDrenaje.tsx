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
import Plegable from '../../componentes/Plegable'
import { CEJA, TARJETA } from '../../componentes/ui'
import { useResultado, type ContextoCampania } from '../../estado/derivados'
import { cuenta, formatearCota } from '../../formato'
import { Aviso, AvisoNoComprobado, ETIQUETA, fechaCorta, formatearPorcentaje, motivoSinCierre, SELECTOR } from './comunes'
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
  const activarCampania = useAlmacen((s) => s.activarCampania)
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

  const nombreCapa = (id: string) => capas.find((c) => c.id === id)?.nombre ?? 'Sin capa'
  const resumenEleccion =
    `Capa ${nombreCapa(capaId)} ${fechaCorta(contexto.campania.fecha)} · ${punto?.nombre ?? '—'} · ` +
    `${sumideros.progresivas.length === 0 ? 'sin sumideros' : cuenta(sumideros.progresivas.length, 'sumidero', 'sumideros')} · cambiar`

  function bloqueEleccion(abierto: boolean) {
    return (
      <Plegable titulo="Analizando" resumen={resumenEleccion} abierto={abierto} className={`${TARJETA} py-1`}>
        <div className="grid gap-3 pb-3 sm:grid-cols-3">
          <CapaAnalizada calle={calle} campaniaId={contexto.campania.id} nombreCapa={nombreCapa} alElegir={activarCampania} />
          <label className="flex min-w-0 flex-col gap-1">
            <span className={ETIQUETA}>Punto del perfil</span>
            <select aria-label="Punto del perfil" value={elementoId} onChange={(e) => alCambiar({ elemento: e.target.value })} className={SELECTOR}>
              {puntos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1">
            <span className={ETIQUETA}>Sumideros (progresivas)</span>
            <input
              aria-label="Sumideros"
              value={textoSumideros}
              onChange={(e) => alCambiar({ sumideros: e.target.value })}
              placeholder="0+040; 0+120"
              // Teclado de texto a propósito: el decimal del celular no trae «+», «;» ni espacio.
              inputMode="text"
              className={`${SELECTOR} numerico placeholder:text-tenue`}
            />
            {sumideros.noEntendidas.length > 0 && (
              <span className="text-sm text-aviso">
                <span aria-hidden="true">△ </span>No se entiende: {sumideros.noEntendidas.join(', ')}
              </span>
            )}
          </label>
        </div>
      </Plegable>
    )
  }

  if (!resultado || !calculo) {
    return (
      <div className="flex flex-col gap-4">
        {bloqueEleccion(true)}
        <Aviso tono="neutro" simbolo="△">
          Esta capa todavía no tiene cotas calculadas. Anota sus lecturas en Calle › Medir.
        </Aviso>
      </div>
    )
  }
  const { drenaje, bombeos, medido } = calculo
  const contrapendientes = drenaje.tramos.filter((t) => t.contraPendiente)
  const hayProblema = drenaje.empozamientos.length > 0 || contrapendientes.length > 0

  return (
    <div className="flex flex-col gap-4">
      {!drenaje.comprobado && <AvisoNoComprobado que="DRENAJE Y BOMBEO" motivo={motivoSinCierre(resultado.cierre.pasa)} />}
      {!rasante && (
        <Aviso tono="aviso" simbolo="△">
          Esta calle no tiene rasante de proyecto: se ve hacia dónde corre el agua y dónde se junta, pero no se
          comparan pendientes ni bombeo con el proyecto. Carga la rasante en Obra › Calles.
        </Aviso>
      )}

      {medido.length >= 2 && (
        <ul
          aria-label="Resumen del drenaje"
          className={`flex flex-col gap-1 rounded-[14px] p-4 [.sol_&]:border-2 [.sol_&]:border-current ${hayProblema ? 'bg-falla-suave text-falla' : 'bg-pasa-suave text-pasa'}`}
        >
          <Resumen
            principal
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
      )}

      {bloqueEleccion(sumideros.noEntendidas.length > 0)}

      {medido.length < 2 ? (
        <Aviso tono="aviso" simbolo="△">
          {punto?.nombre ?? 'Este punto'} tiene {medido.length === 0 ? 'ninguna cota' : 'una sola cota'}: para ver hacia
          dónde corre el agua hacen falta al menos dos progresivas medidas en él. Mídelo en Calle › Medir o elige otro
          punto.
        </Aviso>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        {medido.length >= 2 && (
          <aside aria-label="Lo que encontró" className={`${TARJETA} flex min-w-0 flex-col gap-4 lg:order-2`}>
            <span className={CEJA}>Lo que encontró</span>
            <section className="flex flex-col gap-2 text-sm">
              <h3 className="text-[15px] font-semibold">Puntos bajos</h3>
              {drenaje.puntosBajos.length === 0 ? (
                <p className="text-tenue">Ninguno: el agua sale de lo medido.</p>
              ) : (
                <ul aria-label="Puntos bajos" className="flex flex-col gap-2">
                  {drenaje.puntosBajos.map((p) => {
                    const empoza = drenaje.empozamientos.includes(p)
                    const lugar =
                      p.hasta !== p.progresiva
                        ? `${formatearProgresiva(p.progresiva)} a ${formatearProgresiva(p.hasta)}`
                        : formatearProgresiva(p.progresiva)
                    return (
                      <li
                        key={`${p.progresiva}-${p.hasta}`}
                        className={`rounded-[10px] px-3 py-2 [.sol_&]:border [.sol_&]:border-current ${empoza ? 'bg-falla-suave text-falla' : p.enSumidero ? 'bg-pasa-suave text-pasa' : 'bg-aviso-suave text-aviso'}`}
                      >
                        <span aria-hidden="true">{empoza ? '✗ ' : p.enSumidero ? '✓ ' : '△ '}</span>
                        <span className="numerico font-semibold">{lugar}</span> · cota{' '}
                        <span className="numerico">{formatearCota(p.cota)}</span> ·{' '}
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

            <section className="flex flex-col gap-2 text-sm">
              <h3 className="text-[15px] font-semibold">Sentido del agua</h3>
              <ul aria-label="Sentido del agua por tramo" className="flex flex-col">
                {drenaje.tramos.map((t) => (
                  <TramoAgua key={`${t.desde}-${t.hasta}`} tramo={t} />
                ))}
              </ul>
            </section>
          </aside>
        )}

        <div className="flex min-w-0 flex-col gap-4 lg:order-1">
          {medido.length >= 2 && (
            <div className={`${TARJETA} flex min-w-0 flex-col gap-2`}>
              <h3 className="text-[17px] font-bold">Por dónde corre el agua</h3>
              <PerfilLongitudinal elementoClave={elementoId} idCampaniaReferencia={campaniaActivaId} />
            </div>
          )}

          <section className={`${TARJETA} flex min-w-0 flex-col gap-2 text-sm`}>
            <h3 className="text-[17px] font-bold">Bombeo de la calzada</h3>
            {bombeos.length === 0 ? (
              <p className="text-tenue">
                La sección no tiene eje y bordes de calzada: declara esos puntos en Obra › Calles para ver el bombeo.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table aria-label="Bombeo por progresiva" className="w-full min-w-max border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-tinta text-left text-tenue">
                      <th className="px-2 py-1.5 font-medium">Progresiva</th>
                      <th className="px-2 py-1.5 font-medium">Lado</th>
                      <th className="px-2 py-1.5 text-right font-medium">Medido</th>
                      <th className="px-2 py-1.5 text-right font-medium">Proyecto</th>
                      <th className="px-2 py-1.5 font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bombeos.map((b) => (
                      <tr key={`${b.progresiva}-${b.lado}`} className="border-t border-borde">
                        <td className="numerico px-2 py-1.5">{formatearProgresiva(b.progresiva)}</td>
                        <td className="px-2 py-1.5">{b.lado}</td>
                        <td className="numerico px-2 py-1.5 text-right whitespace-nowrap">{b.medido !== null ? formatearPorcentaje(b.medido) : '—'}</td>
                        <td className="numerico px-2 py-1.5 text-right whitespace-nowrap">{b.proyecto !== null ? formatearPorcentaje(b.proyecto) : '—'}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap">
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
                            <span className="text-tenue">sin medir</span>
                          ) : (
                            <span className="text-tenue">sin proyecto</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>

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

/**
 * Qué capa medida se analiza. Drenaje y bombeo salen de la toma activa: sin
 * decirlo, el bombeo de la base se podía leer como el de la subrasante. Elegir
 * otra aquí cambia la capa activa de la calle, la misma de Medir y Revisar.
 */
function CapaAnalizada({
  calle,
  campaniaId,
  nombreCapa,
  alElegir,
}: {
  calle: Calle
  campaniaId: string
  nombreCapa: (id: string) => string
  alElegir: (id: string) => void
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className={ETIQUETA}>Capa analizada</span>
      <select aria-label="Capa analizada" value={campaniaId} onChange={(e) => alElegir(e.target.value)} className={SELECTOR}>
        {calle.nivelaciones.map((nivelacion) =>
          nivelacion.tomas.length === 0 ? null : (
            <optgroup key={nivelacion.id} label={nivelacion.nombre}>
              {nivelacion.tomas.map((toma) => (
                <option key={toma.id} value={toma.id}>
                  {nombreCapa(toma.capaId)} · {toma.fecha}
                </option>
              ))}
            </optgroup>
          ),
        )}
      </select>
      <span className="text-xs text-tenue">Cambiarla cambia la capa activa de la calle.</span>
    </label>
  )
}

/**
 * Una línea del veredicto del drenaje. La primera (los empozamientos) va en
 * grande: es lo que se pregunta. Las neutras van sin símbolo de estado.
 */
function Resumen({
  bien,
  texto,
  neutro = false,
  principal = false,
}: {
  bien: boolean
  texto: string
  neutro?: boolean
  principal?: boolean
}) {
  return (
    <li className={principal ? 'text-xl font-bold' : 'text-[15px] font-medium text-tinta'}>
      <span aria-hidden="true">{neutro ? '· ' : bien ? '✓ ' : '✗ '}</span>
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
  const clase = tramo.contraPendiente ? 'text-falla' : tramo.casiPlano ? 'text-aviso' : ''
  return (
    <li aria-label={etiqueta} className={`flex min-h-9 flex-wrap items-center gap-x-3 border-b border-borde py-1 last:border-b-0 ${clase}`}>
      <span aria-hidden="true" className="w-5 text-center text-lg leading-none font-bold">
        {FLECHA[tramo.sentidoMedido]}
      </span>
      <span className="numerico">
        {formatearProgresiva(tramo.desde)} → {formatearProgresiva(tramo.hasta)}
      </span>
      <span className="numerico font-semibold">{formatearPorcentaje(tramo.pendienteMedida)}</span>
      {tramo.pendienteProyecto !== null && (
        <span className="numerico text-tenue">proyecto {formatearPorcentaje(tramo.pendienteProyecto)}</span>
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
