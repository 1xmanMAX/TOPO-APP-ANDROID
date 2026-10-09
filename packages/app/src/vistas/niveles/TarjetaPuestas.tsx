import { useState } from 'react'
import CampoNumero from '../../componentes/CampoNumero'
import Segmentado from '../../componentes/Segmentado'
import { BOTON_SECUNDARIO, CEJA, TARJETA } from '../../componentes/ui'
import { useAlmacen } from '../../estado/almacen'
import { formatearCota } from '../../formato'
import { alturaDe } from '../../niveles/puestas'
import EditorPuestas from './EditorPuestas'
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

/**
 * Las puestas del nivel, como en su hoja: cada una con su cota BM y su
 * lectura atrás; si se cambia la lectura, se mueven todas las cotas de los
 * conjuntos leídos desde ella. Para otro día, una puesta nueva y se pasan los
 * conjuntos a ella. Las puestas son del proyecto: las mismas en el plano, la
 * calculadora, Replantear y la hoja de estacas.
 */
export default function TarjetaPuestas({ hoja, cambiar }: PropsHoja) {
  const proyecto = useAlmacen((s) => s.proyecto)
  const [mensaje, setMensaje] = useState('')

  return (
    <section aria-label="Puestas del nivel" className={`${TARJETA} flex min-w-0 flex-col gap-3`}>
      <h3 className={CEJA}>Puestas del nivel</h3>
      <EditorPuestas
        extra={(activa) => (
          <div className="col-span-2 flex flex-col gap-1">
            <button
              type="button"
              onClick={() => {
                const otros = hoja.conjuntos.filter((c) => c.tipo === 'lectura' && c.puestaId !== activa.id)
                cambiar((h) => ({ ...h, conjuntos: h.conjuntos.map((c) => (c.tipo === 'lectura' ? { ...c, puestaId: activa.id } : c)) }))
                const ai = alturaDe(activa, proyecto)
                setMensaje(
                  otros.length === 0
                    ? 'Todos los conjuntos ya usan esta puesta.'
                    : `${otros.length === 1 ? 'Pasó 1 conjunto' : `Pasaron ${otros.length} conjuntos`} a «${activa.nombre}»${ai !== null ? ` (AI ${formatearCota(ai)})` : ''}.`,
                )
              }}
              className={`${BOTON_SECUNDARIO} self-start`}
            >
              Pasar todos los conjuntos a esta puesta
            </button>
            <p aria-live="polite" className="text-[13px] text-tenue">
              {mensaje}
            </p>
          </div>
        )}
      />

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
