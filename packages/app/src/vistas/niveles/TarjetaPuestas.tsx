import { useState } from 'react'
import CampoNumero from '../../componentes/CampoNumero'
import Segmentado from '../../componentes/Segmentado'
import { BOTON_SECUNDARIO, CEJA, ENLACE_PELIGRO, TARJETA } from '../../componentes/ui'
import { useAlmacen } from '../../estado/almacen'
import { formatearCota } from '../../formato'
import { alturaDe, nuevoIdNivel } from '../../niveles/hoja'
import type { PropsHoja } from './PantallaNiveles'

const UNIDADES = [
  { valor: 'm' as const, texto: 'm' },
  { valor: 'cm' as const, texto: 'cm' },
  { valor: 'mm' as const, texto: 'mm' },
]

const MIRAS = [
  { valor: 'normal' as const, texto: 'Hacia abajo' },
  { valor: 'invertida' as const, texto: 'Invertida' },
]

const CAMPO = 'min-h-11 w-full min-w-0 rounded-[10px] border border-borde-fuerte bg-tarjeta px-2 text-[15px] text-tinta'

/**
 * Las puestas del nivel, como en su hoja: cada puesta tiene su cota BM y su
 * lectura atrás, y si se cambia la lectura (de 1.000 a 1.500, por ejemplo)
 * se mueven todas las cotas de los conjuntos leídos desde ella. Para otro
 * día, una puesta nueva y se pasan los conjuntos a ella.
 */
export default function TarjetaPuestas({ hoja, cambiar }: PropsHoja) {
  const bms = useAlmacen((s) => s.proyecto.bms)
  const instrumento = useAlmacen((s) => s.proyecto.instrumento)
  const [activaId, setActivaId] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState('')
  const activa = hoja.puestas.find((p) => p.id === activaId) ?? hoja.puestas[0] ?? null

  function editar(cambios: Partial<{ nombre: string; cotaBM: number; lecturaAtras: number }>) {
    if (!activa) return
    cambiar((h) => ({ ...h, puestas: h.puestas.map((p) => (p.id === activa.id ? { ...p, ...cambios } : p)) }))
  }

  function nuevaPuesta() {
    const id = nuevoIdNivel('puesta')
    const base = activa ?? { cotaBM: bms[0]?.cota ?? 100, lecturaAtras: 1.5 }
    cambiar((h) => ({
      ...h,
      puestas: [...h.puestas, { id, nombre: `Puesta ${h.puestas.length + 1}`, cotaBM: base.cotaBM, lecturaAtras: base.lecturaAtras }],
    }))
    setActivaId(id)
    setMensaje('Puesta creada. Escribe la lectura atrás y luego pasa los conjuntos a ella.')
  }

  function pasarConjuntos() {
    if (!activa) return
    const ai = alturaDe(activa, instrumento)
    const otros = hoja.conjuntos.filter((c) => c.tipo === 'lectura' && c.puestaId !== activa.id)
    cambiar((h) => ({
      ...h,
      conjuntos: h.conjuntos.map((c) => (c.tipo === 'lectura' ? { ...c, puestaId: activa.id } : c)),
    }))
    setMensaje(
      otros.length === 0
        ? 'Todos los conjuntos ya usan esta puesta.'
        : `${otros.length === 1 ? 'Pasó 1 conjunto' : `Pasaron ${otros.length} conjuntos`} a «${activa.nombre}»${ai !== null ? ` (AI ${formatearCota(ai)})` : ''}.`,
    )
  }

  function quitarPuesta() {
    if (!activa || hoja.puestas.length < 2) return
    const resto = hoja.puestas.filter((p) => p.id !== activa.id)
    const primera = resto[0]!
    cambiar((h) => ({
      ...h,
      puestas: resto,
      conjuntos: h.conjuntos.map((c) => (c.puestaId === activa.id ? { ...c, puestaId: primera.id } : c)),
    }))
    setActivaId(primera.id)
    setMensaje(`Puesta «${activa.nombre}» quitada; sus conjuntos pasaron a «${primera.nombre}».`)
  }

  const ai = activa ? alturaDe(activa, instrumento) : null

  return (
    <section aria-label="Puestas del nivel" className={`${TARJETA} flex min-w-0 flex-col gap-3`}>
      <h3 className={CEJA}>Puestas del nivel</h3>
      <div role="group" aria-label="Puestas" className="flex flex-wrap gap-1">
        {hoja.puestas.map((p) => {
          const altura = alturaDe(p, instrumento)
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={p.id === activa?.id}
              onClick={() => {
                setActivaId(p.id)
                setMensaje('')
              }}
              className={`min-h-11 rounded-full border px-3 text-sm ${
                p.id === activa?.id ? 'border-tinta bg-cabecera font-semibold text-white' : 'border-borde-fuerte bg-tarjeta text-tinta'
              }`}
            >
              {p.nombre} · <span className="numerico">AI {altura !== null ? formatearCota(altura) : '—'}</span>
            </button>
          )
        })}
      </div>

      {activa && (
        <div className="grid grid-cols-2 gap-2">
          <label className="col-span-2 flex flex-col gap-1">
            <span className="text-[13px] font-medium text-tenue">Nombre</span>
            <input
              value={activa.nombre}
              onChange={(e) => editar({ nombre: e.target.value })}
              autoComplete="off"
              className={CAMPO}
            />
          </label>
          <CampoNumero etiqueta="Cota BM (m)" valor={activa.cotaBM} alCambiar={(v) => editar({ cotaBM: v })} />
          <CampoNumero etiqueta="Lectura atrás (m)" valor={activa.lecturaAtras} alCambiar={(v) => editar({ lecturaAtras: v })} />
          {bms.length > 0 && (
            <label className="col-span-2 flex flex-col gap-1">
              <span className="text-[13px] font-medium text-tenue">Tomar la cota de un BM del proyecto</span>
              <select
                value=""
                onChange={(e) => {
                  const bm = bms.find((b) => b.id === e.target.value)
                  if (bm) editar({ cotaBM: bm.cota })
                }}
                className={CAMPO}
              >
                <option value="">Elegir BM…</option>
                {bms.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nombre} · {formatearCota(b.cota)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <p className="col-span-2 text-[15px]">
            AI (cota del instrumento):{' '}
            <b className="numerico text-[19px]">{ai !== null ? formatearCota(ai) : '—'}</b>
            {ai === null && <span className="text-sm text-falla"> · la lectura atrás no cabe en la mira</span>}
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={nuevaPuesta} className={BOTON_SECUNDARIO}>
          + Nueva puesta
        </button>
        <button type="button" onClick={pasarConjuntos} disabled={!activa} className={BOTON_SECUNDARIO}>
          Pasar todos los conjuntos a esta puesta
        </button>
        <button type="button" onClick={quitarPuesta} disabled={hoja.puestas.length < 2} className={ENLACE_PELIGRO}>
          Quitar puesta
        </button>
      </div>
      <p aria-live="polite" className="text-[13px] text-tenue">
        {mensaje}
      </p>

      <div className="flex flex-col gap-2 border-t border-dashed border-borde pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-medium text-tenue">Lecturas en</span>
          <Segmentado etiqueta="Unidad de las lecturas" opciones={UNIDADES} valor={hoja.unidad} alCambiar={(unidad) => cambiar((h) => ({ ...h, unidad }))} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-medium text-tenue">Mira</span>
          <Segmentado etiqueta="Mira" opciones={MIRAS} valor={hoja.mira} alCambiar={(mira) => cambiar((h) => ({ ...h, mira }))} />
          <span className="text-[13px] text-tenue">{hoja.mira === 'normal' ? 'cota = AI − lectura' : 'cota = AI + lectura'}</span>
        </div>
        <CampoNumero
          etiqueta="Separación mínima entre líneas (cm)"
          decimales={1}
          valor={hoja.minimoCm}
          alCambiar={(minimoCm) => cambiar((h) => ({ ...h, minimoCm: Math.max(0, minimoCm) }))}
          ancho="w-56"
        />
      </div>
    </section>
  )
}
