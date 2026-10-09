import type { NivelesEnPlano, PlanoImportado, PuntoNivelPlano } from '@topo/core'
import { useEffect, useState } from 'react'
import CampoNumero from '../../componentes/CampoNumero'
import { useAlmacen } from '../../estado/almacen'
import { formatearCota } from '../../formato'
import { alturaDe, nuevoIdNivel } from '../../niveles/hoja'
import { puestaDelPunto, type AnalisisEnPlano } from '../../niveles/enPlano'
import { BOTON_ICONO, BOTON_SECUNDARIO, CAJA, ENLACE_PELIGRO } from './estilos'
import { aSvg, puntosSvg } from './geometriaVisor'

/** Rótulo con halo, como los demás del plano: se lee sobre cualquier dibujo y en los dos temas. */
const ROTULO = 'fill-slate-900 stroke-white dark:fill-white dark:stroke-slate-900'

function cm(m: number): string {
  return `${(m * 100).toFixed(1)} cm`
}

// ─── Lo que se dibuja sobre el plano ─────────────────────────────────────

interface PropsDibujo {
  niveles: NivelesEnPlano
  analisis: AnalisisEnPlano
  elegidoId: string | null
  upp: number
  /** Rotular la pendiente de cada lado entre dos puntos vecinos. */
  verPendientes: boolean
}

/**
 * Los puntos de nivel sobre el plano: su número y su cota, la superficie
 * que forman (en ámbar lo que es tan plano que el agua puede quedarse),
 * una flecha en cada triángulo hacia donde cae el agua, los sumideros en
 * azul, los puntos donde se empoza con ✗, y el camino del agua desde el
 * punto elegido.
 */
export function DibujoNiveles({ niveles, analisis, elegidoId, upp, verPendientes }: PropsDibujo) {
  const r = analisis.resultado?.ok ? analisis.resultado : null
  const porId = new Map(niveles.puntos.map((p) => [p.id, p]))
  const empoza = new Set(r?.empozan ?? [])
  const camino = elegidoId && r ? (r.caminos.get(elegidoId)?.camino ?? []) : []

  return (
    <g>
      {r && (
        <g pointerEvents="none">
          {r.triangulos.map((t, i) => {
            const vertices = t.ids.map((id) => porId.get(id)!)
            return (
              <polygon
                key={`t-${i}`}
                points={puntosSvg(vertices)}
                className={t.plano ? 'fill-aviso/15 stroke-aviso' : 'fill-proyecto/5 stroke-slate-400'}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            )
          })}
          {r.triangulos.map((t, i) => {
            if (!t.direccion) return null
            // El centro del triángulo en unidades del plano (el análisis pudo ir en metros).
            const vertices = t.ids.map((id) => porId.get(id)!)
            const c = aSvg({ x: (vertices[0]!.x + vertices[1]!.x + vertices[2]!.x) / 3, y: (vertices[0]!.y + vertices[1]!.y + vertices[2]!.y) / 3 })
            const angulo = (Math.atan2(t.direccion.y, t.direccion.x) * 180) / Math.PI
            const s = upp
            return (
              <g key={`f-${i}`} transform={`translate(${c.x} ${c.y}) rotate(${-angulo})`}>
                <line x1={-9 * s} y1={0} x2={6 * s} y2={0} strokeWidth={2.2 * s} className={t.plano ? 'stroke-aviso' : 'stroke-proyecto'} />
                <path d={`M ${11 * s} 0 L ${3 * s} ${-5 * s} L ${3 * s} ${5 * s} Z`} className={t.plano ? 'fill-aviso' : 'fill-proyecto'} />
              </g>
            )
          })}
          {verPendientes &&
            !analisis.sinEscala &&
            r.aristas.map((a) => {
              const p = porId.get(a.alto)!
              const q = porId.get(a.bajo)!
              const m = aSvg({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 })
              return (
                <text
                  key={`a-${a.alto}-${a.bajo}`}
                  x={m.x}
                  y={m.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={10 * upp}
                  strokeWidth={3 * upp}
                  paintOrder="stroke"
                  className="fill-slate-600 stroke-white dark:fill-slate-300 dark:stroke-slate-900"
                >
                  {a.pendientePct.toFixed(2)}%
                </text>
              )
            })}
          {camino.length > 1 && (
            <polyline
              points={puntosSvg(camino.map((id) => porId.get(id)!))}
              fill="none"
              className="stroke-proyecto"
              strokeWidth={4}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="1 7"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </g>
      )}

      {niveles.puntos.map((p) => {
        const c = aSvg(p)
        const cota = analisis.cotas.get(p.id)
        const elegido = p.id === elegidoId
        const seEmpoza = empoza.has(p.id)
        const clase = p.salida
          ? 'fill-proyecto stroke-white dark:stroke-slate-900'
          : cota === undefined
            ? 'fill-white stroke-slate-500 dark:fill-slate-900'
            : 'fill-white stroke-slate-900 dark:fill-slate-900 dark:stroke-white'
        return (
          <g key={p.id} data-punto-nivel={p.id} className="cursor-pointer">
            {/* El área que se toca es más grande que el punto: con el dedo no se acierta a 9 px. */}
            <circle cx={c.x} cy={c.y} r={18 * upp} fill="transparent" />
            {elegido && <circle cx={c.x} cy={c.y} r={13 * upp} className="fill-marca/25 stroke-marca" strokeWidth={2 * upp} />}
            {seEmpoza && <circle cx={c.x} cy={c.y} r={11 * upp} fill="none" className="stroke-falla" strokeWidth={3 * upp} />}
            <circle cx={c.x} cy={c.y} r={7 * upp} className={clase} strokeWidth={2 * upp} strokeDasharray={cota === undefined ? `${2 * upp} ${2 * upp}` : undefined} />
            <text
              x={c.x + 10 * upp}
              y={c.y - 6 * upp}
              fontSize={13 * upp}
              fontWeight={700}
              strokeWidth={3 * upp}
              paintOrder="stroke"
              className={seEmpoza ? 'fill-falla stroke-white dark:stroke-slate-900' : ROTULO}
              pointerEvents="none"
            >
              {seEmpoza ? `✗ ${p.nombre}` : p.nombre}
              {p.salida ? ' ▼' : ''}
            </text>
            {cota !== undefined && (
              <text
                x={c.x + 10 * upp}
                y={c.y + 9 * upp}
                fontSize={11 * upp}
                strokeWidth={3 * upp}
                paintOrder="stroke"
                className={ROTULO}
                pointerEvents="none"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {formatearCota(cota)}
              </text>
            )}
          </g>
        )
      })}
    </g>
  )
}

// ─── El panel: puestas, la tabla de lecturas y el veredicto ─────────────

interface PropsPanel {
  plano: PlanoImportado
  niveles: NivelesEnPlano
  analisis: AnalisisEnPlano
  elegidoId: string | null
  alElegir: (id: string | null) => void
  cambiar: (cambio: (n: NivelesEnPlano) => NivelesEnPlano) => void
  moviendo: boolean
  alMover: (moviendo: boolean) => void
  verPendientes: boolean
  alVerPendientes: (ver: boolean) => void
}

/**
 * Niveles del plano: arriba el veredicto (¿llega toda el agua a una
 * salida?), luego la tabla para escribir lo que se leyó en cada punto —en
 * el orden en que se pusieron—, la ficha del punto elegido con su camino del
 * agua, y las puestas.
 */
export function PanelNiveles({ plano, niveles, analisis, elegidoId, alElegir, cambiar, moviendo, alMover, verPendientes, alVerPendientes }: PropsPanel) {
  const r = analisis.resultado
  const elegido = niveles.puntos.find((p) => p.id === elegidoId) ?? null
  const leidos = analisis.cotas.size
  const nombre = (id: string) => niveles.puntos.find((p) => p.id === id)?.nombre ?? id

  function editarPunto(id: string, cambios: Partial<PuntoNivelPlano>) {
    cambiar((n) => ({ ...n, puntos: n.puntos.map((p) => (p.id === id ? { ...p, ...cambios } : p)) }))
  }

  function quitarPunto(id: string) {
    cambiar((n) => ({ ...n, puntos: n.puntos.filter((p) => p.id !== id) }))
    if (elegidoId === id) alElegir(null)
  }

  const veredicto = (() => {
    if (niveles.puntos.length === 0) return { tono: 'neutro' as const, texto: 'Toca el plano para poner el punto 1, luego el 2, el 3… donde vas a leer.' }
    if (leidos < 3) return { tono: 'neutro' as const, texto: `Escribe las lecturas en la tabla: hacen falta al menos 3 puntos leídos (llevas ${leidos}).` }
    if (!r || !r.ok) return { tono: 'aviso' as const, texto: r && !r.ok ? r.error : '' }
    if (r.empozan.length > 0) {
      return { tono: 'falla' as const, texto: `✗ El agua se empoza en ${r.empozan.map(nombre).join(', ')}: más bajo que todos sus vecinos y sin salida.` }
    }
    if (r.salePorBorde.length > 0) {
      return {
        tono: 'aviso' as const,
        texto: `△ El agua llega al borde de lo nivelado en ${r.salePorBorde.map(nombre).join(', ')}: verifica que por ahí tenga por dónde irse, o marca la salida.`,
      }
    }
    return { tono: 'pasa' as const, texto: '✓ Toda el agua llega a una salida.' }
  })()
  const planos = r?.ok ? r.triangulos.filter((t) => t.plano).length : 0
  const clasesVeredicto = {
    neutro: 'border border-dashed border-borde-fuerte text-tenue',
    aviso: 'bg-aviso-suave text-aviso',
    falla: 'bg-falla-suave text-falla',
    pasa: 'bg-pasa-suave text-pasa',
  }[veredicto.tono]

  const caminoElegido = elegido && r?.ok ? r.caminos.get(elegido.id) : undefined
  const primerTramo =
    caminoElegido && caminoElegido.camino.length > 1 && r?.ok
      ? r.aristas.find((a) => a.alto === caminoElegido.camino[0] && a.bajo === caminoElegido.camino[1])
      : undefined

  return (
    <section aria-label="Niveles del plano" className={CAJA}>
      <h3 className="text-[15px] font-semibold">Niveles en el plano</h3>
      <p role="status" className={`rounded-[10px] px-3 py-2 text-sm font-semibold ${clasesVeredicto}`}>
        {veredicto.texto}
      </p>
      {planos > 0 && (
        <p className="text-sm text-aviso">
          <span aria-hidden="true">△ </span>
          {planos === 1 ? '1 triángulo queda' : `${planos} triángulos quedan`} con menos de {niveles.pendienteMinimaPct} % de pendiente
          (en ámbar en el plano): ahí el agua corre muy lento o se queda.
        </p>
      )}
      {analisis.sinEscala && niveles.puntos.length > 0 && (
        <p className="text-sm text-tenue">
          El plano no tiene escala: se ve hacia dónde va el agua y dónde se empoza, pero no las pendientes en %. Calíbralo para verlas.
        </p>
      )}

      {elegido && (
        <div className="flex flex-col gap-2 rounded-[10px] border border-marca/40 bg-marca-suave p-3">
          <div className="flex items-center gap-2">
            <label className="flex flex-1 items-center gap-2 text-sm">
              Punto
              <input
                aria-label="Nombre del punto elegido"
                value={elegido.nombre}
                onChange={(e) => editarPunto(elegido.id, { nombre: e.target.value })}
                className="numerico min-h-11 w-20 rounded-[10px] border border-borde-fuerte bg-tarjeta px-2 text-base font-semibold"
              />
            </label>
            <button type="button" aria-pressed={moviendo} onClick={() => alMover(!moviendo)} className={BOTON_SECUNDARIO}>
              {moviendo ? 'Toca el plano…' : 'Mover'}
            </button>
          </div>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" className="size-5" checked={elegido.salida} onChange={(e) => editarPunto(elegido.id, { salida: e.target.checked })} />
            Es una salida del agua (sumidero, cuneta, canal)
          </label>
          {caminoElegido && (
            <p className="text-sm">
              El agua de <b>{elegido.nombre}</b>{' '}
              {caminoElegido.camino.length === 1 ? (
                caminoElegido.fin === 'salida' ? (
                  'entra a la salida.'
                ) : caminoElegido.fin === 'empoza' ? (
                  <b className="text-falla">se queda ahí: es más bajo que todos sus vecinos.</b>
                ) : (
                  <b className="text-aviso">se queda en el borde de lo nivelado.</b>
                )
              ) : (
                <>
                  va a {caminoElegido.camino.slice(1).map(nombre).join(' → ')}{' '}
                  {caminoElegido.fin === 'salida' ? (
                    <b className="text-pasa">(salida ✓)</b>
                  ) : caminoElegido.fin === 'empoza' ? (
                    <b className="text-falla">y se empoza ✗</b>
                  ) : (
                    <b className="text-aviso">y llega al borde △</b>
                  )}
                  {primerTramo && (
                    <span className="block text-[13px] text-tenue">
                      Hacia {nombre(primerTramo.bajo)} baja {cm(primerTramo.desnivel)}
                      {!analisis.sinEscala && ` en ${primerTramo.distancia.toFixed(1)} m (${primerTramo.pendientePct.toFixed(2)} %)`}.
                    </span>
                  )}
                </>
              )}
            </p>
          )}
          <button type="button" onClick={() => quitarPunto(elegido.id)} className={`${ENLACE_PELIGRO} self-start`}>
            Quitar el punto {elegido.nombre}
          </button>
        </div>
      )}

      {niveles.puntos.length > 0 && (
        <TablaLecturas niveles={niveles} analisis={analisis} elegidoId={elegidoId} alElegir={alElegir} editarPunto={editarPunto} />
      )}

      <Puestas niveles={niveles} cambiar={cambiar} />

      <div className="flex flex-wrap items-end gap-3">
        <CampoNumero
          etiqueta="Pendiente mínima para que corra (%)"
          decimales={2}
          valor={niveles.pendienteMinimaPct}
          alCambiar={(v) => cambiar((n) => ({ ...n, pendienteMinimaPct: Math.max(0, v) }))}
          ancho="w-52"
        />
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" className="size-5" checked={verPendientes} onChange={(e) => alVerPendientes(e.target.checked)} />
          Pendiente entre puntos
        </label>
      </div>
      <p className="text-[13px] text-tenue">
        En el plano: ▶ hacia dónde cae el agua en cada triángulo, ▼ las salidas, ✗ donde se empoza. El punto elegido marca el camino
        de su agua. Los puntos se guardan con este plano ({plano.nombre}).
      </p>
    </section>
  )
}

/** La tabla de campo: un renglón por punto, en el orden en que se pusieron. */
function TablaLecturas({
  niveles,
  analisis,
  elegidoId,
  alElegir,
  editarPunto,
}: {
  niveles: NivelesEnPlano
  analisis: AnalisisEnPlano
  elegidoId: string | null
  alElegir: (id: string) => void
  editarPunto: (id: string, cambios: Partial<PuntoNivelPlano>) => void
}) {
  const varias = niveles.puestas.length > 1
  return (
    <table aria-label="Lecturas de los puntos" className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-tenue">
          <th className="py-1 font-medium">Punto</th>
          {varias && <th className="py-1 font-medium">Puesta</th>}
          <th className="py-1 font-medium">Lectura (m)</th>
          <th className="py-1 text-right font-medium">Cota</th>
        </tr>
      </thead>
      <tbody>
        {niveles.puntos.map((p, i) => {
          const cota = analisis.cotas.get(p.id)
          return (
            <tr key={p.id} className={`border-t border-borde ${p.id === elegidoId ? 'bg-marca-suave' : ''}`}>
              <td className="py-1">
                <button type="button" onClick={() => alElegir(p.id)} className="numerico min-h-11 min-w-11 text-left font-semibold">
                  {p.nombre}
                  {p.salida && <span className="text-proyecto"> ▼</span>}
                </button>
              </td>
              {varias && (
                <td className="py-1">
                  <select
                    aria-label={`Puesta del punto ${p.nombre}`}
                    value={puestaDelPunto(niveles, p)?.id ?? ''}
                    onChange={(e) => editarPunto(p.id, { puestaId: e.target.value })}
                    className="min-h-11 max-w-[7rem] rounded-[10px] border border-borde-fuerte bg-tarjeta px-1 text-sm"
                  >
                    {niveles.puestas.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.nombre}
                      </option>
                    ))}
                  </select>
                </td>
              )}
              <td className="py-1">
                <CampoLectura
                  etiqueta={`Lectura del punto ${p.nombre}`}
                  valor={p.lectura}
                  alCambiar={(lectura) => editarPunto(p.id, { lectura })}
                  alEnfocar={() => alElegir(p.id)}
                  siguiente={i < niveles.puntos.length - 1 ? `Lectura del punto ${niveles.puntos[i + 1]!.nombre}` : null}
                />
              </td>
              <td className="numerico py-1 text-right font-semibold">{cota !== undefined ? formatearCota(cota) : '—'}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

/**
 * La lectura de un punto: vacía mientras no se haya leído. Con Enter pasa al
 * punto siguiente, como quien llena una columna de su libreta.
 */
function CampoLectura({
  etiqueta,
  valor,
  alCambiar,
  alEnfocar,
  siguiente,
}: {
  etiqueta: string
  valor: number | null
  alCambiar: (v: number | null) => void
  alEnfocar: () => void
  siguiente: string | null
}) {
  const [texto, setTexto] = useState(valor === null ? '' : valor.toFixed(3))
  const [editando, setEditando] = useState(false)
  useEffect(() => {
    if (!editando) setTexto(valor === null ? '' : valor.toFixed(3))
  }, [valor, editando])
  return (
    <input
      aria-label={etiqueta}
      inputMode="decimal"
      autoComplete="off"
      enterKeyHint={siguiente ? 'next' : 'done'}
      value={texto}
      placeholder="—"
      onFocus={() => {
        setEditando(true)
        alEnfocar()
      }}
      onBlur={() => setEditando(false)}
      onChange={(e) => {
        setTexto(e.target.value)
        const t = e.target.value.trim()
        if (t === '') alCambiar(null)
        else {
          const n = Number(t.replace(',', '.'))
          if (Number.isFinite(n)) alCambiar(n)
        }
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' || !siguiente) return
        e.preventDefault()
        const proximo = document.querySelector<HTMLInputElement>(`input[aria-label="${siguiente}"]`)
        proximo?.focus()
        proximo?.select()
      }}
      className="numerico min-h-11 w-24 rounded-[10px] border border-borde-fuerte bg-tarjeta px-2 text-right text-base"
    />
  )
}

/** Las puestas con que se leyó: cota del BM + lectura atrás. */
function Puestas({ niveles, cambiar }: { niveles: NivelesEnPlano; cambiar: PropsPanel['cambiar'] }) {
  const instrumento = useAlmacen((s) => s.proyecto.instrumento)
  const bms = useAlmacen((s) => s.proyecto.bms)
  function editar(id: string, cambios: Partial<{ nombre: string; cotaBM: number; lecturaAtras: number }>) {
    cambiar((n) => ({ ...n, puestas: n.puestas.map((p) => (p.id === id ? { ...p, ...cambios } : p)) }))
  }
  return (
    <div className="flex flex-col gap-2 border-t border-dashed border-borde pt-3">
      <h4 className="text-sm font-semibold">Puestas del nivel</h4>
      {niveles.puestas.map((p) => {
        const ai = alturaDe(p, instrumento)
        return (
          <div key={p.id} className="grid grid-cols-2 gap-2 rounded-[10px] border border-borde p-2">
            <input
              aria-label="Nombre de la puesta"
              value={p.nombre}
              onChange={(e) => editar(p.id, { nombre: e.target.value })}
              className="col-span-2 min-h-11 rounded-[10px] border border-borde-fuerte bg-tarjeta px-2 text-sm font-semibold"
            />
            <CampoNumero etiqueta="Cota BM (m)" valor={p.cotaBM} alCambiar={(v) => editar(p.id, { cotaBM: v })} />
            <CampoNumero etiqueta="Lectura atrás (m)" valor={p.lecturaAtras} alCambiar={(v) => editar(p.id, { lecturaAtras: v })} />
            {bms.length > 0 && (
              <select
                aria-label={`Tomar la cota de un BM para ${p.nombre}`}
                value=""
                onChange={(e) => {
                  const bm = bms.find((b) => b.id === e.target.value)
                  if (bm) editar(p.id, { cotaBM: bm.cota })
                }}
                className="min-h-11 rounded-[10px] border border-borde-fuerte bg-tarjeta px-2 text-sm"
              >
                <option value="">Cota de un BM…</option>
                {bms.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nombre} · {formatearCota(b.cota)}
                  </option>
                ))}
              </select>
            )}
            <p className="flex items-center text-sm">
              AI <b className="numerico ml-1">{ai !== null ? formatearCota(ai) : '—'}</b>
            </p>
          </div>
        )
      })}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() =>
            cambiar((n) => {
              const ultima = n.puestas[n.puestas.length - 1]
              return {
                ...n,
                puestas: [
                  ...n.puestas,
                  { id: nuevoIdNivel('puesta'), nombre: `Puesta ${n.puestas.length + 1}`, cotaBM: ultima?.cotaBM ?? 100, lecturaAtras: ultima?.lecturaAtras ?? 1.5 },
                ],
              }
            })
          }
          className={BOTON_SECUNDARIO}
        >
          + Puesta
        </button>
        {niveles.puestas.length > 1 && (
          <button
            type="button"
            aria-label="Quitar la última puesta"
            onClick={() =>
              cambiar((n) => {
                const quitada = n.puestas[n.puestas.length - 1]!
                const resto = n.puestas.slice(0, -1)
                return { ...n, puestas: resto, puntos: n.puntos.map((p) => (p.puestaId === quitada.id ? { ...p, puestaId: resto[0]!.id } : p)) }
              })
            }
            className={BOTON_ICONO}
          >
            −
          </button>
        )}
      </div>
    </div>
  )
}
