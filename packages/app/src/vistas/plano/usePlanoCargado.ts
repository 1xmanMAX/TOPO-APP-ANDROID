import type { PlanoImportado } from '@topo/core'
import { useEffect, useMemo, useState } from 'react'
import type { LimitesPlano, PlanoVectorial } from '../../planos/dxf'
import { cargarDwg, cargarPdf, dwgYaLeido, leerDxfDeBytes, type PdfCargado } from './cargarPlano'

export type PlanoCargado =
  | { estado: 'sinPlano' }
  | { estado: 'sinArchivo' }
  | { estado: 'cargando' }
  | { estado: 'error'; mensaje: string }
  /** Un plano vectorial: DXF o DWG. */
  | { estado: 'dxf'; vectorial: PlanoVectorial; limites: LimitesPlano }
  | { estado: 'pdf'; pdf: PdfCargado; limites: LimitesPlano }

function mensajeDe(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/**
 * Lee el plano de sus bytes: el DXF al momento (es texto), el DWG y el PDF
 * en segundo plano (LibreDWG en su trabajador; el PDF hay que pintarlo).
 * Un DWG ya leído vuelve al instante. La imagen del PDF se libera al cambiar
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

  const [dwg, setDwg] = useState<{ bytes: Uint8Array; resultado: PlanoCargado } | null>(null)

  useEffect(() => {
    if (formato !== 'dwg' || !bytes || dwgYaLeido(bytes)) return
    let vigente = true
    cargarDwg(bytes).then(
      (vectorial) => vigente && setDwg({ bytes, resultado: { estado: 'dxf', vectorial, limites: vectorial.limites } }),
      (e: unknown) => vigente && setDwg({ bytes, resultado: { estado: 'error', mensaje: mensajeDe(e) } }),
    )
    return () => {
      vigente = false
    }
  }, [formato, bytes])

  // Un DWG ya leído antes (al importarlo, o en otra visita): el mismo objeto
  // en cada dibujado, para que lo que depende de él no se rehaga.
  const yaLeido = formato === 'dwg' && bytes ? dwgYaLeido(bytes) : undefined
  const dwgListo = useMemo<PlanoCargado | null>(
    () => (yaLeido ? { estado: 'dxf', vectorial: yaLeido, limites: yaLeido.limites } : null),
    [yaLeido],
  )

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
  if (formato === 'dwg') return dwgListo ?? (dwg && dwg.bytes === bytes ? dwg.resultado : { estado: 'cargando' })
  if (pdf && pdf.bytes === bytes && pdf.pagina === pagina) return pdf.resultado
  return { estado: 'cargando' }
}
