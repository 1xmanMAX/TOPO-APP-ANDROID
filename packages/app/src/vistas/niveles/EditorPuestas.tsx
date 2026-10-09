import type { Id, PuestaDeNivel } from '@topo/core'
import { useState } from 'react'
import CampoNumero from '../../componentes/CampoNumero'
import Segmentado from '../../componentes/Segmentado'
import { BOTON_SECUNDARIO, ENLACE_PELIGRO } from '../../componentes/ui'
import { useAlmacen } from '../../estado/almacen'
import { formatearCota } from '../../formato'
import { alturaDe, origenDePuesta, puestasDe } from '../../niveles/puestas'

const CAMPO = 'min-h-11 w-full min-w-0 rounded-[10px] border border-borde-fuerte bg-tarjeta px-2 text-[15px] text-tinta'

type Origen = 'bm' | 'cota' | 'libreta'

const ORIGENES: { valor: Origen; texto: string }[] = [
  { valor: 'bm', texto: 'BM del proyecto' },
  { valor: 'cota', texto: 'Cota escrita' },
  { valor: 'libreta', texto: 'Libreta' },
]

function origenDe(p: PuestaDeNivel): Origen {
  return p.libreta ? 'libreta' : p.bmId ? 'bm' : 'cota'
}

/** El texto de una puesta en una lista: «Puesta 1 · AI 3246.680». */
export function textoDePuesta(p: PuestaDeNivel, ai: number | null): string {
  return `${p.nombre} · AI ${ai !== null ? formatearCota(ai) : '—'}`
}

interface Props {
  /** La puesta elegida (la que se edita). Si falta, la primera. */
  activaId?: Id | null
  alElegir?: (id: Id) => void
  /** Un mensaje tras pasar los conjuntos o quitar una puesta. */
  extra?: (activa: PuestaDeNivel) => React.ReactNode
}

/**
 * Las puestas del nivel de toda la obra: una sola lista, la misma en
 * Niveles, en el plano, en la calculadora, en Replantear y en la hoja de
 * estacas. La AI sale de un BM del proyecto + la lectura atrás (y sigue al
 * BM si se corrige su cota), de una cota escrita + la lectura atrás, o de
 * una estación de la libreta.
 */
export default function EditorPuestas({ activaId: activaPedida, alElegir, extra }: Props) {
  const proyecto = useAlmacen((s) => s.proyecto)
  const agregarPuesta = useAlmacen((s) => s.agregarPuesta)
  const actualizarPuesta = useAlmacen((s) => s.actualizarPuesta)
  const eliminarPuesta = useAlmacen((s) => s.eliminarPuesta)
  const [propia, setPropia] = useState<Id | null>(null)
  const puestas = puestasDe(proyecto)
  const activa = puestas.find((p) => p.id === (activaPedida ?? propia)) ?? puestas[0] ?? null
  const elegir = (id: Id) => {
    setPropia(id)
    alElegir?.(id)
  }

  function nueva() {
    const base = activa
    const bm = proyecto.bms[0]
    const id = agregarPuesta({
      nombre: `Puesta ${puestas.length + 1}`,
      cotaBM: base ? base.cotaBM : (bm?.cota ?? 100),
      lecturaAtras: base?.lecturaAtras ?? 1.5,
      bmId: base ? (base.bmId ?? null) : (bm?.id ?? null),
    })
    elegir(id)
  }

  const tomas = proyecto.calles.flatMap((c) =>
    c.nivelaciones.flatMap((n) => n.tomas.map((t) => ({ calle: c.nombre, toma: t, capa: proyecto.capas.find((x) => x.id === t.capaId)?.nombre ?? '' }))),
  )

  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="Puestas" className="flex flex-wrap gap-1">
        {puestas.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={p.id === activa?.id}
            onClick={() => elegir(p.id)}
            className={`min-h-11 rounded-full border px-3 text-sm ${
              p.id === activa?.id ? 'border-tinta bg-cabecera font-semibold text-white' : 'border-borde-fuerte bg-tarjeta text-tinta'
            }`}
          >
            <span className="numerico">{textoDePuesta(p, alturaDe(p, proyecto))}</span>
          </button>
        ))}
        <button type="button" onClick={nueva} className={BOTON_SECUNDARIO}>
          + Nueva puesta
        </button>
      </div>

      {!activa ? (
        <p className="text-sm text-tenue">Todavía no hay puestas: crea una con la cota de un BM y la lectura atrás.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <label className="col-span-2 flex flex-col gap-1">
            <span className="text-[13px] font-medium text-tenue">Nombre</span>
            <input value={activa.nombre} onChange={(e) => actualizarPuesta(activa.id, { nombre: e.target.value })} autoComplete="off" className={CAMPO} />
          </label>
          <div className="col-span-2">
            <Segmentado
              etiqueta="De dónde sale la altura"
              opciones={ORIGENES}
              valor={origenDe(activa)}
              alCambiar={(o) =>
                actualizarPuesta(activa.id, {
                  bmId: o === 'bm' ? (activa.bmId ?? proyecto.bms[0]?.id ?? null) : null,
                  libreta:
                    o === 'libreta' && tomas[0]
                      ? (activa.libreta ?? { tomaId: tomas[0].toma.id, indiceEstacion: Math.max(0, tomas[0].toma.estaciones.length - 1) })
                      : null,
                })
              }
              anchoCompleto
            />
          </div>
          {origenDe(activa) === 'bm' &&
            (proyecto.bms.length === 0 ? (
              <p className="col-span-2 text-sm text-aviso">No hay BMs en el proyecto: créalos en Obra, o escribe la cota.</p>
            ) : (
              <label className="flex flex-col gap-1">
                <span className="text-[13px] font-medium text-tenue">BM</span>
                <select
                  aria-label="BM de la puesta"
                  value={activa.bmId ?? ''}
                  onChange={(e) => actualizarPuesta(activa.id, { bmId: e.target.value })}
                  className={CAMPO}
                >
                  {proyecto.bms.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nombre} · {formatearCota(b.cota)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          {origenDe(activa) === 'cota' && (
            <CampoNumero etiqueta="Cota BM (m)" valor={activa.cotaBM} alCambiar={(v) => actualizarPuesta(activa.id, { cotaBM: v })} />
          )}
          {origenDe(activa) !== 'libreta' && (
            <CampoNumero etiqueta="Lectura atrás (m)" valor={activa.lecturaAtras} alCambiar={(v) => actualizarPuesta(activa.id, { lecturaAtras: v })} />
          )}
          {origenDe(activa) === 'libreta' &&
            (tomas.length === 0 ? (
              <p className="col-span-2 text-sm text-aviso">No hay jornadas en la libreta todavía.</p>
            ) : (
              <>
                <label className="flex flex-col gap-1">
                  <span className="text-[13px] font-medium text-tenue">Jornada</span>
                  <select
                    aria-label="Jornada de la libreta"
                    value={activa.libreta?.tomaId ?? ''}
                    onChange={(e) => {
                      const t = tomas.find((x) => x.toma.id === e.target.value)
                      if (t) actualizarPuesta(activa.id, { libreta: { tomaId: t.toma.id, indiceEstacion: Math.max(0, t.toma.estaciones.length - 1) } })
                    }}
                    className={CAMPO}
                  >
                    {tomas.map((t) => (
                      <option key={t.toma.id} value={t.toma.id}>
                        {t.calle} · {t.capa} · {t.toma.fecha}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[13px] font-medium text-tenue">Estación</span>
                  <select
                    aria-label="Estación de la libreta"
                    value={activa.libreta?.indiceEstacion ?? 0}
                    onChange={(e) =>
                      activa.libreta && actualizarPuesta(activa.id, { libreta: { ...activa.libreta, indiceEstacion: Number(e.target.value) } })
                    }
                    className={CAMPO}
                  >
                    {(tomas.find((t) => t.toma.id === activa.libreta?.tomaId)?.toma.estaciones ?? []).map((_, i) => (
                      <option key={i} value={i}>
                        Estación {i + 1}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ))}
          <p className="col-span-2 text-[15px]">
            AI: <b className="numerico text-[19px]">{alturaDe(activa, proyecto) !== null ? formatearCota(alturaDe(activa, proyecto)!) : '—'}</b>{' '}
            <span className="text-[13px] text-tenue">({origenDePuesta(activa, proyecto)})</span>
            {alturaDe(activa, proyecto) === null && (
              <span className="block text-sm text-falla">No sale la AI: revisa la lectura atrás (que quepa en la mira) o la estación.</span>
            )}
          </p>
          {extra?.(activa)}
          <button
            type="button"
            onClick={() => eliminarPuesta(activa.id)}
            className={`${ENLACE_PELIGRO} col-span-2 self-start`}
          >
            Quitar «{activa.nombre}»
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Para elegir con qué puesta se lee, en cualquier pantalla: la lista de las
 * puestas del proyecto con su AI. `vacio` es el texto de la opción «sin
 * elegir» (p. ej. «La del conjunto»); sin él no la hay.
 */
export function SelectorPuesta({
  valor,
  alCambiar,
  etiqueta = 'Puesta',
  vacio,
}: {
  valor: Id | null
  alCambiar: (id: Id | null) => void
  etiqueta?: string
  vacio?: string
}) {
  const proyecto = useAlmacen((s) => s.proyecto)
  const puestas = puestasDe(proyecto)
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[13px] font-medium text-tenue">{etiqueta}</span>
      <select
        value={valor ?? ''}
        onChange={(e) => alCambiar(e.target.value === '' ? null : e.target.value)}
        className={CAMPO}
      >
        {vacio !== undefined && <option value="">{vacio}</option>}
        {puestas.map((p) => (
          <option key={p.id} value={p.id}>
            {textoDePuesta(p, alturaDe(p, proyecto))}
          </option>
        ))}
      </select>
    </label>
  )
}
