import type { PlanoImportado } from '@topo/core'
import { useEffect, useMemo, useState } from 'react'
import type { LimitesPlano, PlanoVectorial } from '../../planos/dxf'
import { cargarPdf, leerDxfDeBytes, type PdfCargado } from './cargarPlano'

export type PlanoCargado =
  | { estado: 'sinPlano' }
  | { estado: 'sinArchivo' }
  | { estado: 'cargando' }
  | { estado: 'error'; mensaje: string }
  | { estado: 'dxf'; vectorial: PlanoVectorial; limites: LimitesPlano }
  | { estado: 'pdf'; pdf: PdfCargado; limites: LimitesPlano }

function mensajeDe(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/**
 * Lee el plano de sus bytes: el DXF al momento (es texto), el PDF en
 * segundo plano (hay que pintarlo). La imagen del PDF se libera al cambiar
 * de plano o de página.
 */
export function usePlanoCargado(plano: PlanoImportado | undefined, bytes: Uint8Array | undefined): PlanoCargado {
  const formato = plano?.formato
  const pagina = plano?.pagina ?? 1

  const dxf = useMemo<PlanoCargado | null>(() => {
    if (formato !== 'dxf' || !bytes) return null
    try {
      const vectorial = leerDxfDeBytes(bytes)
      return { estado: 'dxf', vectorial, limites: vectorial.limites }
    } catch (e) {
      return { estado: 'error', mensaje: mensajeDe(e) }
    }
  }, [formato, bytes])

  const [pdf, setPdf] = useState<{ bytes: Uint8Array; pagina: number; resultado: PlanoCargado } | null>(null)

  useEffect(() => {
    if (formato !== 'pdf' || !bytes) return
    let vigente = true
    let url: string | null = null
    cargarPdf(bytes, pagina).then(
      (cargado) => {
        url = cargado.url
        if (!vigente) {
          URL.revokeObjectURL?.(cargado.url)
          return
        }
        setPdf({
          bytes,
          pagina,
          resultado: {
            estado: 'pdf',
            pdf: cargado,
            limites: { minX: 0, minY: 0, maxX: cargado.anchoPt, maxY: cargado.altoPt },
          },
        })
      },
      (e: unknown) => {
        if (vigente) setPdf({ bytes, pagina, resultado: { estado: 'error', mensaje: mensajeDe(e) } })
      },
    )
    return () => {
      vigente = false
      if (url) URL.revokeObjectURL?.(url)
    }
  }, [formato, bytes, pagina])

  if (!plano) return { estado: 'sinPlano' }
  if (!bytes) return { estado: 'sinArchivo' }
  if (formato === 'dxf') return dxf ?? { estado: 'cargando' }
  if (pdf && pdf.bytes === bytes && pdf.pagina === pagina) return pdf.resultado
  return { estado: 'cargando' }
}
