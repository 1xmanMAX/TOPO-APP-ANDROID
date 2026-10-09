import type { NivelesEnPlano, PuntoNivelPlano } from '@topo/core'
import { useState } from 'react'
import CampoNumero from '../../componentes/CampoNumero'
import Segmentado from '../../componentes/Segmentado'
import { useAlmacen } from '../../estado/almacen'
import { formatearCota } from '../../formato'
import { sinCotaPorque, textoDesnivel } from '../../niveles/enPlano'
import { BOTON_SECUNDARIO } from './estilos'

const CAMPO = 'min-h-11 w-full min-w-0 rounded-[10px] border border-borde-fuerte bg-tarjeta px-2 text-[15px] text-tinta'

type Origen = 'lectura' | 'bm' | 'relacion'

const ORIGENES: { valor: Origen; texto: string }[] = [
  { valor: 'lectura', texto: 'Lectura' },
  { valor: 'bm', texto: 'Es un BM' },
  { valor: 'relacion', texto: 'Desde otro punto' },
]

interface Props {
  punto: PuntoNivelPlano
  niveles: NivelesEnPlano
  cotas: ReadonlyMap<string, number>
  editarPunto: (id: string, cambios: Partial<PuntoNivelPlano>) => void
}

/**
 * De dónde sale la cota del punto elegido y cómo está respecto de los
 * demás. Puede ser una lectura de mira (en la tabla), un BM del proyecto
 * (el punto se pone donde está el BM en el plano y toma su cota), o la cota
 * de otro punto más un desnivel: «está 0.35 m más abajo que BM-1». Abajo se
 * compara con cualquier otro punto: cuánto más arriba o más abajo está.
 */
export default function CotaDelPunto({ punto, niveles, cotas, editarPunto }: Props) {
  const proyecto = useAlmacen((s) => s.proyecto)
  const agregarBM = useAlmacen((s) => s.agregarBM)
  const origen: Origen = punto.origen ?? 'lectura'
  const otros = niveles.puntos.filter((p) => p.id !== punto.id)
  const [comparaCon, setComparaCon] = useState<string>('')
  // El lado se recuerda aparte: con el desnivel aún en 0, el signo no lo guarda.
  const [ladoElegido, setLadoElegido] = useState<'arriba' | 'abajo'>((punto.relacion?.desnivel ?? 0) < 0 ? 'abajo' : 'arriba')
  const cota = cotas.get(punto.id)
  const motivo = sinCotaPorque(punto, niveles, proyecto, cotas)
  const relacion = punto.relacion ?? null
  const lado = relacion && relacion.desnivel !== 0 ? (relacion.desnivel < 0 ? 'abajo' : 'arriba') : ladoElegido
  const desde = relacion ? niveles.puntos.find((p) => p.id === relacion.desdeId) : undefined
  const otro = otros.find((p) => p.id === comparaCon) ?? null
  const cotaOtro = otro ? cotas.get(otro.id) : undefined
  const yaEsBM = proyecto.bms.some((b) => Math.abs(b.cota - (cota ?? NaN)) < 0.0005 && b.nombre === punto.nombre)

  function cambiarOrigen(o: Origen) {
    if (o === 'bm') {
      const bm = proyecto.bms.find((b) => b.id === punto.bmId) ?? proyecto.bms[0]
      // Un punto con número pasa a llamarse como su BM; un nombre puesto a mano se respeta.
      const nombre = bm && /^\d+$/.test(punto.nombre) ? bm.nombre : punto.nombre
      editarPunto(punto.id, { origen: 'bm', bmId: bm?.id ?? null, nombre })
    } else if (o === 'relacion') {
      const base = relacion?.desdeId ?? [...otros].reverse().find((p) => cotas.has(p.id))?.id ?? otros[0]?.id
      editarPunto(punto.id, { origen: 'relacion', relacion: base ? { desdeId: base, desnivel: relacion?.desnivel ?? 0 } : null })
    } else editarPunto(punto.id, { origen: 'lectura' })
  }

  return (
    <div className="flex flex-col gap-2 border-t border-dashed border-marca/40 pt-2">
      <span className="text-[13px] font-medium text-tenue">Su cota sale de</span>
      <Segmentado etiqueta="De dónde sale la cota del punto" opciones={ORIGENES} valor={origen} alCambiar={cambiarOrigen} anchoCompleto />

      {origen === 'lectura' && <p className="text-[13px] text-tenue">La lectura de mira, en la tabla de abajo (con su puesta).</p>}

      {origen === 'bm' &&
        (proyecto.bms.length === 0 ? (
          <p className="text-sm text-aviso">No hay BMs en el proyecto: créalos en Obra › Calles, o pon este punto «Desde otro punto».</p>
        ) : (
          <label className="flex flex-col gap-1">
            <span className="text-[13px] font-medium text-tenue">BM</span>
            <select aria-label="BM del punto" value={punto.bmId ?? ''} onChange={(e) => editarPunto(punto.id, { bmId: e.target.value })} className={CAMPO}>
              {proyecto.bms.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nombre} · {formatearCota(b.cota)}
                </option>
              ))}
            </select>
          </label>
        ))}

      {origen === 'relacion' &&
        (otros.length === 0 ? (
          <p className="text-sm text-aviso">Pon antes otro punto en el plano (un BM, o uno leído) para referirlo a él.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <label className="col-span-2 flex flex-col gap-1">
              <span className="text-[13px] font-medium text-tenue">Respecto de</span>
              <select
                aria-label="Punto de referencia"
                value={relacion?.desdeId ?? ''}
                onChange={(e) => editarPunto(punto.id, { relacion: { desdeId: e.target.value, desnivel: relacion?.desnivel ?? 0 } })}
                className={CAMPO}
              >
                {!relacion && <option value="">Elige…</option>}
                {otros.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                    {p.nota ? ` · ${p.nota}` : ''}
                    {cotas.has(p.id) ? ` · ${formatearCota(cotas.get(p.id)!)}` : ' · sin cota'}
                  </option>
                ))}
              </select>
            </label>
            <CampoNumero
              etiqueta="Diferencia de altura (m)"
              decimales={3}
              valor={Math.abs(relacion?.desnivel ?? 0)}
              alCambiar={(v) =>
                relacion && editarPunto(punto.id, { relacion: { ...relacion, desnivel: (lado === 'abajo' ? -1 : 1) * Math.abs(v) } })
              }
            />
            <div className="flex flex-col gap-1">
              <span className="text-[13px] font-medium text-tenue">Este punto está</span>
              <Segmentado
                etiqueta="Más arriba o más abajo"
                opciones={[
                  { valor: 'arriba' as const, texto: '↑ Arriba' },
                  { valor: 'abajo' as const, texto: '↓ Abajo' },
                ]}
                valor={lado}
                alCambiar={(nuevo) => {
                  setLadoElegido(nuevo)
                  if (relacion) editarPunto(punto.id, { relacion: { ...relacion, desnivel: (nuevo === 'abajo' ? -1 : 1) * Math.abs(relacion.desnivel) } })
                }}
                anchoCompleto
              />
            </div>
            {desde && relacion && (
              <p className="col-span-2 text-[13px] text-tenue">
                {punto.nombre} está <b>{textoDesnivel(relacion.desnivel)}</b> que {desde.nombre}.
              </p>
            )}
          </div>
        ))}

      <p className="text-[15px]">
        Cota: <b className="numerico text-[19px]">{cota !== undefined ? formatearCota(cota) : '—'}</b>
        {motivo && <span className="block text-sm text-aviso">Sin cota: {motivo}.</span>}
      </p>
      {cota !== undefined && origen !== 'bm' && !yaEsBM && (
        <button
          type="button"
          className={`${BOTON_SECUNDARIO} self-start`}
          onClick={() => {
            agregarBM({ nombre: punto.nombre, cota: Number(cota.toFixed(4)), tipo: 'auxiliar', descripcion: punto.nota ?? 'Puesto en el plano' })
            const nuevo = useAlmacen.getState().proyecto.bms.at(-1)
            if (nuevo) editarPunto(punto.id, { origen: 'bm', bmId: nuevo.id })
          }}
        >
          Guardar como BM del proyecto
        </button>
      )}

      {otros.length > 0 && (
        <div className="flex flex-col gap-1 rounded-[10px] bg-tarjeta p-2">
          <label className="flex flex-col gap-1">
            <span className="text-[13px] font-medium text-tenue">Comparar con</span>
            <select aria-label="Comparar con el punto" value={comparaCon} onChange={(e) => setComparaCon(e.target.value)} className={CAMPO}>
              <option value="">Elige un punto…</option>
              {otros.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                  {p.nota ? ` · ${p.nota}` : ''}
                </option>
              ))}
            </select>
          </label>
          {otro && (
            <p role="status" aria-label="Diferencia de altura" className="text-sm">
              {cota !== undefined && cotaOtro !== undefined ? (
                <>
                  <b>{punto.nombre}</b> está <b className="numerico">{textoDesnivel(cota - cotaOtro)}</b> que <b>{otro.nombre}</b>
                  {cota - cotaOtro !== 0 && (
                    <span className="block text-[13px] text-tenue">
                      {otro.nombre} está {textoDesnivel(cotaOtro - cota)} que {punto.nombre}.
                    </span>
                  )}
                </>
              ) : (
                <span className="text-aviso">Falta la cota de {cota === undefined ? punto.nombre : otro.nombre} para comparar.</span>
              )}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
