import type { Calle } from '@topo/core'
import type { ReactNode } from 'react'
import { useAlmacen } from '../../estado/almacen'
import { useContexto, type ContextoCampania } from '../../estado/derivados'

/** Lo mismo que los botones de la sub-barra: 44 px de alto para el dedo en campo. */
export const BOTON = 'min-h-11 rounded px-3 py-1 text-sm'
export const BOTON_INACTIVO =
  'border border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800'
export const BOTON_ACTIVO = 'border border-marca bg-marca font-medium text-white'
export const SELECTOR =
  'min-h-11 min-w-0 rounded border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900'

/**
 * La calle activa y, si la tiene, la toma activa de esa calle. Las pantallas
 * de la calle parten de `calleActivaId` (spec §5.2); la toma activa va
 * sincronizada con ella, pero se comprueba que sea de esta calle por si un
 * camino viejo la dejó apuntando a otra.
 */
export function useCalleYToma(): { calle: Calle | null; contexto: ContextoCampania | null } {
  const calleActivaId = useAlmacen((s) => s.calleActivaId)
  const calles = useAlmacen((s) => s.proyecto.calles)
  const contexto = useContexto()
  const calle = calles.find((c) => c.id === calleActivaId) ?? null
  return { calle, contexto: contexto && calle && contexto.calle.id === calle.id ? contexto : null }
}

/** Un aviso con su símbolo: el color nunca va solo. */
export function Aviso({
  tono,
  simbolo,
  children,
}: {
  tono: 'pasa' | 'falla' | 'aviso' | 'neutro'
  simbolo?: string
  children: ReactNode
}) {
  const clases = {
    pasa: 'border-pasa bg-pasa/10 text-pasa',
    falla: 'border-falla bg-falla/10 text-falla',
    aviso: 'border-aviso bg-aviso/10 text-aviso',
    neutro: 'border-dashed border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-300',
  }[tono]
  return (
    <div className={`rounded border px-3 py-2 text-sm ${clases}`}>
      {simbolo && <span aria-hidden="true">{simbolo} </span>}
      {children}
    </div>
  )
}

/**
 * Lo calculado sobre una nivelación que no cerró tampoco está comprobado
 * (spec §3). Se dice arriba de cada resultado, con un atajo al cierre.
 */
export function AvisoNoComprobado({ que, motivo }: { que: string; motivo: string }) {
  const abrirPantallaCalle = useAlmacen((s) => s.abrirPantallaCalle)
  return (
    <div className="flex flex-col gap-2 rounded border border-falla bg-falla/10 px-3 py-2 text-sm text-falla sm:flex-row sm:items-center">
      <p className="flex-1 font-semibold">
        <span aria-hidden="true">✗ </span>
        {que} NO COMPROBADOS — {motivo}
      </p>
      <button
        type="button"
        onClick={() => abrirPantallaCalle('cierre')}
        className={`${BOTON} border border-falla bg-white text-falla dark:bg-slate-950`}
      >
        Ver el cierre
      </button>
    </div>
  )
}

/** El porqué de un cierre que no respalda las cotas, en palabras. */
export function motivoSinCierre(pasa: boolean | null): string {
  if (pasa === false) return 'la nivelación está fuera de tolerancia'
  return 'la nivelación no se ha cerrado contra un BM'
}

/** Metros cúbicos con un decimal, como se escriben en el metrado. */
export function formatearM3(valor: number): string {
  // Sin separador de miles a propósito: el mismo número que sale en el Excel.
  return `${valor.toFixed(1)} m³`
}

/** Porcentaje con signo y el menos tipográfico. */
export function formatearPorcentaje(valor: number): string {
  const texto = Math.abs(valor).toFixed(2)
  if (Number(texto) === 0) return '0.00 %'
  return `${valor < 0 ? '−' : '+'}${texto} %`
}
