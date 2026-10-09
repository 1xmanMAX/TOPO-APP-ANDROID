import { formatearProgresiva, separacionEn, separacionEntreLineas, type PanelDeNiveles } from '@topo/core'
import { useEffect, useId, useMemo, useState } from 'react'
import AvisoLinea from '../../componentes/AvisoLinea'
import Segmentado from '../../componentes/Segmentado'
import { BOTON_ICONO, BOTON_SECUNDARIO, CEJA, CLASES_ESTADO, TARJETA } from '../../componentes/ui'
import { formatearCota } from '../../formato'
import { CATEGORIA_REPLANTEO, corteYRelleno, textoCorteRelleno, type LineaDeLaHoja } from '../../niveles/hoja'
import GraficoNiveles, { LeyendaNiveles } from './GraficoNiveles'
import type { PropsHoja } from './PantallaNiveles'

const SELECTOR = 'min-h-11 w-full min-w-0 rounded-[10px] border border-borde-fuerte bg-tarjeta px-2 text-[15px] text-tinta'

const MODOS = [
  { valor: 'separacion' as const, texto: 'Separación' },
  { valor: 'corteRelleno' as const, texto: 'Corte y relleno' },
]

const PALABRA = { conforme: 'CUMPLE', alLimite: 'AL LÍMITE', fuera: 'NO CUMPLE' } as const

function cm(m: number): string {
  const v = m * 100
  return `${v < -0.05 ? '−' : ''}${Math.abs(v).toFixed(1)} cm`
}

/** Los avisos de «no comprobado» no dicen nada aquí: todo sale de puestas rápidas, que nadie cierra. */
function avisosUtiles(avisos: string[]): string[] {
  return [...new Set(avisos)].filter((a) => !/no comprobad|sin cierre/i.test(a))
}

interface Props extends PropsHoja {
  titulo: string
  lineas: Map<string, LineaDeLaHoja>
  panel: PanelDeNiveles
  alCambiar: (panel: PanelDeNiveles) => void
}

/**
 * Una gráfica de su herramienta: dos líneas a lo largo de la calle.
 *
 * - Separación: de la línea de arriba a la de abajo, contra el mínimo de la
 *   hoja; la menor, dónde ocurre y los puntos que no llegan.
 * - Corte y relleno: lo que hay contra lo que debe quedar (el replanteo);
 *   en cada punto, cuánto sobra (corte) o falta (relleno), y el mayor de cada uno.
 *
 * Con la pendiente de cada tramo rotulada, un escáner para recorrer la
 * calle y ▲ ▼ para subir o bajar cualquiera de las dos líneas y ver al
 * momento cómo cambia.
 */
export default function PanelComparar({ titulo, hoja, cambiar, lineas, panel, alCambiar }: Props) {
  const idTitulo = useId()
  const conjuntos = hoja.conjuntos
  const existe = (id: string | null) => (id !== null && lineas.has(id) ? id : null)
  const superiorId = existe(panel.superiorId) ?? conjuntos[0]?.id ?? null
  const inferiorId = existe(panel.inferiorId) ?? conjuntos[1]?.id ?? conjuntos[0]?.id ?? null
  const superior = superiorId ? lineas.get(superiorId)! : null
  const inferior = inferiorId ? lineas.get(inferiorId)! : null
  const corte = panel.modo === 'corteRelleno'
  const minimoM = hoja.minimoCm / 100

  const separacion = useMemo(
    () => (!corte && superior && inferior ? separacionEntreLineas(superior.linea, inferior.linea, minimoM) : null),
    [corte, superior, inferior, minimoM],
  )
  const cr = useMemo(() => (corte && superior && inferior ? corteYRelleno(superior.linea, inferior.linea) : null), [corte, superior, inferior])

  const tramo = separacion?.ok ? { desde: separacion.desde, hasta: separacion.hasta } : cr ? { desde: cr.desde, hasta: cr.hasta } : null
  const inicio = separacion?.ok ? separacion.critico.progresiva : (cr?.mayorCorte ?? cr?.mayorRelleno ?? cr?.puntos[0])?.progresiva ?? null
  const [escaner, setEscaner] = useState<number | null>(null)
  const enTramo = tramo !== null && escaner !== null && escaner >= tramo.desde && escaner <= tramo.hasta
  useEffect(() => {
    if (tramo && !enTramo && inicio !== null) setEscaner(inicio)
  }, [tramo, enTramo, inicio])
  const x = tramo ? (enTramo ? escaner! : inicio) : null
  const enX = x !== null && superior && inferior ? separacionEn(superior.linea, inferior.linea, x, corte ? 0 : minimoM) : null

  function ajustar(id: string, delta: number) {
    cambiar((h) => ({
      ...h,
      conjuntos: h.conjuntos.map((c) => (c.id === id ? { ...c, ajusteCm: Math.round((c.ajusteCm + delta) * 100) / 100 } : c)),
    }))
  }

  function cambiarModo(modo: PanelDeNiveles['modo']) {
    if (modo === 'corteRelleno') {
      // Abajo va lo que debe quedar: si hay un replanteo y no está elegido, se propone.
      const replanteo = conjuntos.find((c) => c.categoria === CATEGORIA_REPLANTEO && c.id !== superiorId)
      alCambiar({ superiorId, inferiorId: inferiorId && lineas.get(inferiorId)?.conjunto.categoria === CATEGORIA_REPLANTEO ? inferiorId : (replanteo?.id ?? inferiorId), modo })
    } else alCambiar({ superiorId, inferiorId, modo })
  }

  const etiquetas = corte ? ['Lo que hay', 'Lo que debe quedar (replanteo)'] : ['Línea de arriba', 'Línea de abajo']
  const misma = superiorId !== null && superiorId === inferiorId

  return (
    <section aria-labelledby={idTitulo} className={`${TARJETA} flex min-w-0 flex-col gap-3`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={idTitulo} className={CEJA}>
          {titulo}
        </h3>
        <Segmentado etiqueta={`Qué ver, ${titulo.toLowerCase()}`} opciones={MODOS} valor={panel.modo} alCambiar={cambiarModo} />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {([0, 1] as const).map((i) => {
          const id = i === 0 ? superiorId : inferiorId
          const ajuste = id ? (lineas.get(id)?.conjunto.ajusteCm ?? 0) : 0
          return (
            <div key={i} className="flex min-w-0 flex-col gap-1">
              <label className="flex flex-col gap-1">
                <span className={`text-sm font-semibold ${i === 0 ? 'text-proyecto' : 'text-aviso'}`}>{etiquetas[i]}</span>
                <select
                  value={id ?? ''}
                  onChange={(e) => alCambiar(i === 0 ? { ...panel, superiorId: e.target.value, inferiorId } : { ...panel, superiorId, inferiorId: e.target.value })}
                  className={SELECTOR}
                >
                  {conjuntos.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                      {c.categoria ? ` (${c.categoria})` : ''}
                    </option>
                  ))}
                </select>
              </label>
              {id && (
                <div className="flex items-center gap-1 text-[13px] text-tenue">
                  <button type="button" aria-label={`Bajar ${etiquetas[i]!.toLowerCase()} 1 cm`} onClick={() => ajustar(id, -1)} className={BOTON_ICONO}>
                    ▼
                  </button>
                  <button type="button" aria-label={`Subir ${etiquetas[i]!.toLowerCase()} 1 cm`} onClick={() => ajustar(id, 1)} className={BOTON_ICONO}>
                    ▲
                  </button>
                  <span className="numerico">{ajuste === 0 ? 'sin ajuste' : `${ajuste > 0 ? '+' : '−'}${Math.abs(ajuste)} cm`}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {conjuntos.length < 2 || misma ? (
        <p className="rounded-[10px] border border-dashed border-borde-fuerte px-3 py-2 text-sm text-tenue">
          Elige dos conjuntos distintos.
        </p>
      ) : corte ? (
        !cr ? (
          <p className="rounded-[10px] bg-aviso-suave px-3 py-2 text-sm text-aviso">
            <span aria-hidden="true">△ </span>Sin resultado: cada línea necesita al menos 2 puntos y tienen que coincidir en algún tramo.
          </p>
        ) : (
          <div role="status" className="rounded-[10px] border border-borde bg-fondo px-3 py-2 text-[15px]">
            {cr.mayorCorte || cr.mayorRelleno ? (
              <>
                {cr.mayorCorte && (
                  <p>
                    <b className="text-marca">Mayor corte: {cm(cr.mayorCorte.diferencia)}</b> en{' '}
                    <span className="numerico">{formatearProgresiva(cr.mayorCorte.progresiva)}</span>
                  </p>
                )}
                {cr.mayorRelleno && (
                  <p>
                    <b className="text-proyecto">Mayor relleno: {cm(-cr.mayorRelleno.diferencia)}</b> en{' '}
                    <span className="numerico">{formatearProgresiva(cr.mayorRelleno.progresiva)}</span>
                  </p>
                )}
              </>
            ) : (
              <p className="font-semibold text-pasa">
                <span aria-hidden="true">✓ </span>Todo en cota con el replanteo.
              </p>
            )}
            <p className="text-sm text-tenue">
              Tramo: <span className="numerico">{formatearProgresiva(cr.desde)} a {formatearProgresiva(cr.hasta)}</span>
            </p>
          </div>
        )
      ) : separacion && !separacion.ok ? (
        <p className="rounded-[10px] bg-aviso-suave px-3 py-2 text-sm text-aviso">
          <span aria-hidden="true">△ </span>Sin resultado: {separacion.error}
        </p>
      ) : separacion?.ok ? (
        <div role="status" className={`rounded-[10px] px-3 py-2 text-[15px] [.sol_&]:border [.sol_&]:border-current ${CLASES_ESTADO[separacion.estado]}`}>
          <p>
            <b className="text-[17px]">
              <span aria-hidden="true">{separacion.simbolo} </span>
              {PALABRA[separacion.estado]}
            </b>{' '}
            — separación mínima <b className="numerico">{cm(separacion.critico.separacion)}</b> (requerido ≥ {cm(minimoM)})
          </p>
          <p className="text-sm">
            En <span className="numerico">{formatearProgresiva(separacion.critico.progresiva)}</span>
            {separacion.critico.seCruzan && ' · las líneas se cruzan'}. Tramo evaluado:{' '}
            <span className="numerico">
              {formatearProgresiva(separacion.desde)} a {formatearProgresiva(separacion.hasta)}
            </span>
            .
          </p>
          {separacion.noCumplen.length > 0 && (
            <p className="text-sm">
              No cumplen ({separacion.noCumplen.length}):{' '}
              {separacion.noCumplen.slice(0, 8).map((p, i) => (
                <span key={p.progresiva}>
                  {i > 0 && ' · '}
                  <button type="button" onClick={() => setEscaner(p.progresiva)} className="numerico underline underline-offset-2">
                    {formatearProgresiva(p.progresiva)} ({cm(p.separacion)})
                  </button>
                </span>
              ))}
              {separacion.noCumplen.length > 8 && ' …'}
            </p>
          )}
        </div>
      ) : null}

      {superior && inferior && !misma && (separacion?.ok || cr) && (
        <>
          <GraficoNiveles
            etiqueta={`${superior.linea.nombre} y ${inferior.linea.nombre}`}
            marcarSinComprobar={false}
            lineas={[
              { linea: superior.linea, tono: 'superior', pendientes: true },
              { linea: inferior.linea, tono: 'inferior', pendientes: true, discontinua: corte },
            ]}
            fallas={separacion?.ok ? separacion.noCumplen.map((p) => ({ progresiva: p.progresiva, desde: p.cotaSuperior, hasta: p.cotaInferior })) : []}
            corteRelleno={
              cr
                ? cr.puntos
                    .filter((p) => Math.abs(p.diferencia) >= 0.0005)
                    .map((p) => ({ progresiva: p.progresiva, desde: p.cotaActual, hasta: p.cotaReplanteo, tipo: p.diferencia > 0 ? ('corte' as const) : ('relleno' as const) }))
                : []
            }
            critico={
              separacion?.ok
                ? { progresiva: separacion.critico.progresiva, desde: separacion.critico.cotaSuperior, hasta: separacion.critico.cotaInferior }
                : null
            }
            cursor={
              enX
                ? {
                    progresiva: enX.progresiva,
                    desde: enX.cotaSuperior,
                    hasta: enX.cotaInferior,
                    tono: corte ? 'tinta' : enX.cumple ? 'pasa' : 'falla',
                    texto: corte ? textoCorteRelleno(enX.separacion) : cm(enX.separacion),
                  }
                : null
            }
          />
          <LeyendaNiveles
            sinComprobar={false}
            corteRelleno={corte}
            lineas={[
              { nombre: superior.linea.nombre, tono: 'superior' },
              { nombre: inferior.linea.nombre, tono: 'inferior', discontinua: corte },
            ]}
          />

          {tramo && (
            <div className="flex flex-col gap-1 border-t border-dashed border-borde pt-2">
              <span className="text-[13px] font-medium text-tenue">Escáner: desliza para recorrer la progresiva</span>
              <input
                type="range"
                min={tramo.desde}
                max={tramo.hasta}
                step={Math.max((tramo.hasta - tramo.desde) / 1000, 0.001)}
                value={x ?? tramo.desde}
                onChange={(e) => setEscaner(Number(e.target.value))}
                aria-label={`Escáner de progresiva, ${titulo.toLowerCase()}`}
                aria-valuetext={x !== null ? formatearProgresiva(x) : undefined}
                className="h-8 w-full accent-[var(--color-tinta)]"
              />
              <p aria-live="polite" className="text-[15px]">
                {enX ? (
                  <>
                    <span className="numerico">{formatearProgresiva(enX.progresiva)}</span> ·{' '}
                    {corte ? (
                      <b className={enX.separacion > 0.0005 ? 'text-marca' : enX.separacion < -0.0005 ? 'text-proyecto' : 'text-pasa'}>
                        {textoCorteRelleno(enX.separacion)}
                      </b>
                    ) : (
                      <>
                        separación{' '}
                        <b className={`numerico ${enX.cumple ? 'text-pasa' : 'text-falla'}`}>
                          {enX.simbolo} {cm(enX.separacion)}
                        </b>
                      </>
                    )}
                    <span className="block text-[13px] text-tenue">
                      {corte ? 'Hay' : 'Arriba'} <span className="numerico">{formatearCota(enX.cotaSuperior)}</span> ·{' '}
                      {corte ? 'debe quedar' : 'abajo'} <span className="numerico">{formatearCota(enX.cotaInferior)}</span>
                    </span>
                  </>
                ) : (
                  <span className="text-tenue">Sin dato en esta progresiva.</span>
                )}
              </p>
              {inicio !== null && (
                <button type="button" onClick={() => setEscaner(inicio)} className={`${BOTON_SECUNDARIO} self-start`}>
                  {corte ? 'Ir al mayor corte o relleno' : 'Ir al punto crítico'}
                </button>
              )}
            </div>
          )}

          {cr && (
            <details className="group">
              <summary className="flex min-h-11 cursor-pointer list-none items-center text-[15px] font-semibold">
                Corte y relleno punto por punto <span className="ml-2 text-sm font-normal text-tenue">{cr.puntos.length}</span>
              </summary>
              <table className="numerico w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-tenue">
                    <th className="py-1 font-medium">Prog.</th>
                    <th className="py-1 font-medium">Hay</th>
                    <th className="py-1 font-medium">Debe</th>
                    <th className="py-1 font-medium">Qué hacer</th>
                  </tr>
                </thead>
                <tbody>
                  {cr.puntos.map((p) => (
                    <tr key={p.progresiva} className="border-t border-borde">
                      <td className="py-1.5">{formatearProgresiva(p.progresiva)}</td>
                      <td className="py-1.5">{formatearCota(p.cotaActual)}</td>
                      <td className="py-1.5">{formatearCota(p.cotaReplanteo)}</td>
                      <td className={`py-1.5 font-semibold ${p.diferencia > 0.0005 ? 'text-marca' : p.diferencia < -0.0005 ? 'text-proyecto' : 'text-pasa'}`}>
                        {textoCorteRelleno(p.diferencia)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </>
      )}

      {superior && inferior && !misma &&
        avisosUtiles([...(separacion?.ok ? separacion.avisos : []), ...superior.avisos, ...inferior.avisos]).map((a) => (
          <AvisoLinea key={a} tono="aviso">
            {a}
          </AvisoLinea>
        ))}
    </section>
  )
}
