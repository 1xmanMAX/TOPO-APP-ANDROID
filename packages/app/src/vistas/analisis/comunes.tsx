import type { Calle } from '@topo/core'
import type { ReactNode } from 'react'
import AvisoLinea from '../../componentes/AvisoLinea'
import { useAlmacen } from '../../estado/almacen'
import { useContexto, type ContextoCampania } from '../../estado/derivados'

/** Los selectores y campos de estas pantallas: 44 px de alto, con los tokens del lienzo. */
export const SELECTOR =
  'min-h-11 w-full min-w-0 rounded-[10px] border border-borde-fuerte bg-tarjeta px-2 text-[15px] text-tinta'

/** La etiqueta de un selector, encima de él. */
export const ETIQUETA = 'text-sm font-medium text-tenue'

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
    pasa: 'bg-pasa-suave text-pasa [.sol_&]:border [.sol_&]:border-current',
    falla: 'bg-falla-suave text-falla [.sol_&]:border [.sol_&]:border-current',
    aviso: 'bg-aviso-suave text-aviso [.sol_&]:border [.sol_&]:border-current',
    neutro: 'border border-dashed border-borde-fuerte bg-tarjeta text-tenue',
  }[tono]
  return (
    <div className={`rounded-[10px] px-3 py-2 text-sm leading-5 ${clases}`}>
      {simbolo && <span aria-hidden="true">{simbolo} </span>}
      {children}
    </div>
  )
}

/**
 * Lo calculado sobre una nivelación que no cerró tampoco está comprobado
 * (spec §3). Se dice arriba de cada resultado, con un atajo al cierre. Va en
 * aviso (△), no en rojo: no dice que esté mal, dice que falta comprobarlo.
 */
export function AvisoNoComprobado({ que, motivo }: { que: string; motivo: string }) {
  const abrirPantallaCalle = useAlmacen((s) => s.abrirPantallaCalle)
  return (
    <AvisoLinea
      tono="aviso"
      className="[.sol_&]:border [.sol_&]:border-current"
      accion={{ texto: 'Ver el cierre', alPulsar: () => abrirPantallaCalle('cierre') }}
    >
      <p className="font-semibold">
        {que} NO COMPROBADOS — {motivo}
      </p>
    </AvisoLinea>
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

/** «2026-09-28» → «28/09», como se dice en obra. Si no es una fecha así, tal cual. */
export function fechaCorta(fecha: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha)
  return m ? `${m[3]}/${m[2]}` : fecha
}
