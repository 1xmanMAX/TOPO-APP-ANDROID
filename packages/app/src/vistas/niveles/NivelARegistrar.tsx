import { formatearProgresiva, nivelARegistrar, parsearProgresiva, type FilaNivel } from '@topo/core'
import { useId, useMemo, useState } from 'react'
import AvisoLinea from '../../componentes/AvisoLinea'
import { CEJA, TARJETA } from '../../componentes/ui'
import { useAlmacen } from '../../estado/almacen'
import { formatearCota } from '../../formato'
import { alturaDe, CATEGORIA_REPLANTEO, puestaDe, puestaParaMotor, type LineaDeLaHoja } from '../../niveles/hoja'
import { leerListaDeProgresivas } from '../analisis/superficies'
import type { PropsHoja } from './PantallaNiveles'

const SELECTOR = 'min-h-11 w-full min-w-0 rounded-[10px] border border-borde-fuerte bg-tarjeta px-2 text-[15px] text-tinta'

function textoLectura(f: FilaNivel, unidad: 'm' | 'cm' | 'mm'): string {
  if (f.lectura === null) return '—'
  return f.lectura.toFixed(unidad === 'm' ? 3 : unidad === 'cm' ? 1 : 0)
}

function textoPendiente(p: number | null): string {
  if (p === null) return '—'
  return `${p > 0 ? '+' : p < 0 ? '−' : ''}${Math.abs(p).toFixed(2)} %`
}

/** De dónde salió la cota, en una etiqueta corta. */
function etiquetaComo(f: FilaNivel): string | null {
  if (f.como === 'proyectado') return `proyectado desde ${f.desde}`
  if (f.como === 'extrapolado') return 'extrapolado'
  return null
}

/**
 * El recuadro «Nivel a registrar» de su hoja: se elige el conjunto (el
 * replanteo, la vereda…) y se escriben las progresivas; sale la cota y la
 * lectura de mira en cada una, siguiendo las pendientes ya establecidas. Si
 * el conjunto no tiene línea en esa progresiva, se proyecta desde la línea
 * más cercana; si ninguna la cubre, se prolonga el tramo extremo. La lectura
 * se juzga con la mira del instrumento del proyecto.
 */
export default function NivelARegistrar({ hoja, cambiar, lineas }: PropsHoja & { lineas: Map<string, LineaDeLaHoja> }) {
  const instrumento = useAlmacen((s) => s.proyecto.instrumento)
  const idTitulo = useId()
  const registrar = hoja.registrar ?? { conjuntoId: null, progresivas: '', puestaId: null }
  const conjunto =
    hoja.conjuntos.find((c) => c.id === registrar.conjuntoId) ??
    hoja.conjuntos.find((c) => c.categoria === CATEGORIA_REPLANTEO) ??
    hoja.conjuntos[0] ??
    null
  const puesta = hoja.puestas.find((p) => p.id === registrar.puestaId) ?? (conjunto ? puestaDe(hoja, conjunto) : null)
  const [elegida, setElegida] = useState(0)

  function fijar(cambios: Partial<NonNullable<typeof hoja.registrar>>) {
    cambiar((h) => ({ ...h, registrar: { ...(h.registrar ?? { conjuntoId: null, progresivas: '', puestaId: null }), ...cambios } }))
  }

  const leidas = leerListaDeProgresivas(registrar.progresivas, parsearProgresiva)
  const resultado = useMemo(() => {
    if (!conjunto || !puesta || leidas.progresivas.length === 0) return null
    const propia = lineas.get(conjunto.id)
    if (!propia) return null
    return nivelARegistrar({
      linea: propia.linea,
      otras: [...lineas.values()].filter((l) => l.conjunto.id !== conjunto.id).map((l) => l.linea),
      progresivas: leidas.progresivas.slice(0, 60),
      ai: puestaParaMotor(puesta),
      instrumento,
      forma: { unidad: hoja.unidad, mira: hoja.mira },
    })
    // `leidas` se rehace en cada dibujado: se mira el texto.
  }, [conjunto, puesta, lineas, registrar.progresivas, instrumento, hoja.unidad, hoja.mira])

  const filas = resultado?.filas ?? []
  const fila = filas[Math.min(elegida, filas.length - 1)]
  const ai = puesta ? alturaDe(puesta, instrumento) : null
  const avisos = [...new Set((resultado?.avisos ?? []).filter((a) => !/no comprobad|sin cierre/i.test(a)))]

  return (
    <section aria-labelledby={idTitulo} className={`${TARJETA} flex min-w-0 flex-col gap-3`}>
      <h3 id={idTitulo} className={CEJA}>
        Nivel a registrar
      </h3>
      <p className="text-[13px] text-tenue">
        Elige el conjunto y escribe la progresiva: sale la cota y lo que debe marcar la mira, siguiendo las pendientes
        ya establecidas. Puedes escribir varias separadas por coma.
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="text-[13px] font-medium text-tenue">Conjunto</span>
          <select value={conjunto?.id ?? ''} onChange={(e) => fijar({ conjuntoId: e.target.value })} className={SELECTOR}>
            {hoja.conjuntos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
                {c.categoria ? ` (${c.categoria})` : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[13px] font-medium text-tenue">Progresiva(s)</span>
          <input
            inputMode="decimal"
            autoComplete="off"
            placeholder="10, 20, 30"
            value={registrar.progresivas}
            onChange={(e) => {
              fijar({ progresivas: e.target.value })
              setElegida(0)
            }}
            className={`${SELECTOR} numerico`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[13px] font-medium text-tenue">Leer con la puesta</span>
          <select
            value={registrar.puestaId ?? ''}
            onChange={(e) => fijar({ puestaId: e.target.value === '' ? null : e.target.value })}
            className={SELECTOR}
          >
            <option value="">La del conjunto</option>
            {hoja.puestas.map((p) => {
              const altura = alturaDe(p, instrumento)
              return (
                <option key={p.id} value={p.id}>
                  {p.nombre} (AI {altura !== null ? formatearCota(altura) : '—'})
                </option>
              )
            })}
          </select>
        </label>
      </div>
      {leidas.noEntendidas.length > 0 && (
        <AvisoLinea tono="aviso">No se entiende como progresiva: {leidas.noEntendidas.join(', ')}.</AvisoLinea>
      )}

      {fila && (
        <div role="status" aria-label="Lectura a registrar" className="grid grid-cols-2 gap-2">
          <div className="rounded-[10px] border border-borde bg-tarjeta px-3 py-2">
            <p className="text-[13px] text-tenue">
              En <span className="numerico">{formatearProgresiva(fila.progresiva)}</span>, cota
            </p>
            <p className="numerico text-[22px] font-semibold">{fila.cota !== null ? formatearCota(fila.cota) : '—'}</p>
            {etiquetaComo(fila) && <p className="text-xs font-semibold text-aviso">△ {etiquetaComo(fila)}</p>}
          </div>
          <div className="rounded-[10px] bg-cabecera px-3 py-2 text-white">
            <p className="text-[13px] text-cabecera-tenue">La mira debe marcar</p>
            <p className="numerico text-[30px] leading-tight font-bold text-[#FDBA74]">
              {textoLectura(fila, hoja.unidad)}
              {fila.lectura !== null && hoja.unidad !== 'm' && <span className="text-sm font-normal"> {hoja.unidad}</span>}
            </p>
            {fila.cota === null && <p className="text-xs text-cabecera-texto">{fila.motivoSinCota}</p>}
            {fila.rango === 'imposible' && <p className="text-xs font-semibold text-[#F28B8B]">✗ no se puede leer: cambie de estación</p>}
          </div>
        </div>
      )}

      {filas.length > 1 && (
        <table className="numerico w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-tenue">
              <th className="py-1 font-medium">Progresiva</th>
              <th className="py-1 font-medium">Cota</th>
              <th className="py-1 font-medium">Lectura</th>
              <th className="py-1 font-medium">Pendiente</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => (
              <tr
                key={`${f.progresiva}-${i}`}
                onClick={() => setElegida(i)}
                className={`cursor-pointer border-t border-borde ${f === fila ? 'bg-fondo font-semibold' : ''}`}
              >
                <td className="py-2">
                  <button type="button" onClick={() => setElegida(i)} className="text-left">
                    {formatearProgresiva(f.progresiva)}
                  </button>
                  {etiquetaComo(f) && <span className="block text-[11px] font-semibold text-aviso">{etiquetaComo(f)}</span>}
                </td>
                <td className="py-2">{f.cota !== null ? formatearCota(f.cota) : '—'}</td>
                <td className={`py-2 text-[15px] font-bold ${f.rango === 'imposible' ? 'text-falla' : ''}`}>
                  {textoLectura(f, hoja.unidad)}
                  {f.rango === 'imposible' && ' ⚠'}
                </td>
                <td className="py-2">{textoPendiente(f.pendientePct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {conjunto && puesta && (
        <p className="text-[13px] text-tenue">
          {conjunto.nombre} · puesta «{puesta.nombre}» (AI {ai !== null ? formatearCota(ai) : '—'}).
          {filas.some((f) => f.como === 'proyectado') &&
            ' Proyectado: el conjunto no tiene línea en esa progresiva; se parte de su punto más cercano y se siguen las pendientes de la línea más cercana.'}
          {filas.some((f) => f.como === 'extrapolado') &&
            ' Extrapolado: ninguna otra línea cubre esa progresiva; se prolonga la pendiente del tramo extremo.'}
        </p>
      )}
      {avisos.map((a) => (
        <AvisoLinea key={a} tono="aviso">
          {a}
        </AvisoLinea>
      ))}
    </section>
  )
}
