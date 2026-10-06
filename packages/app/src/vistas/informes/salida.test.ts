// @vitest-environment node
// En node: pdfjs abre el informe de verdad con su build «legacy», como en
// planos/pdf.test.ts. El lienzo es falso: lo que se prueba es que la vista
// previa pinta el PDF que se descarga, a su tamaño, y que cierra el documento.
import * as pdfjsLegacy from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import type { BibliotecaPdf, Dibujante } from '../../planos/pdf'
import { generarPdf, prepararInforme } from './adaptadores'
import { proyectoDeInformes } from './proyectoDePrueba'
import { pintarPrimeraPagina } from './salida'

const biblioteca = pdfjsLegacy as unknown as BibliotecaPdf

/** Lienzo que acepta cualquier orden de dibujo sin hacer nada y anota su tamaño. */
function dibujanteFalso() {
  const pedidos: { anchoPx: number; altoPx: number }[] = []
  const lienzo = { width: 0, height: 0, getContext: () => contexto }
  const contexto: object = new Proxy(
    {},
    {
      get: (_o, clave) => {
        if (clave === 'canvas') return lienzo
        if (clave === 'getTransform') return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })
        if (clave === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) })
        if (clave === 'createImageData')
          return (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h })
        if (clave === 'measureText') return () => ({ width: 0 })
        if (clave === 'getLineDash') return () => []
        return () => undefined
      },
      set: () => true,
    },
  )
  const dibujante: Dibujante = {
    crearLienzo(anchoPx, altoPx) {
      pedidos.push({ anchoPx, altoPx })
      lienzo.width = anchoPx
      lienzo.height = altoPx
      return lienzo as unknown as HTMLCanvasElement
    },
    exportar: async () => ({ blob: null, url: 'blob:pagina-1' }),
  }
  return { dibujante, pedidos }
}

describe('pintarPrimeraPagina', () => {
  it('pinta la primera página A4 del informe al ancho pedido', async () => {
    const r = prepararInforme('protocolo', proyectoDeInformes(), { calleId: 'c-1', tomaId: 'toma-sub' }, {
      notas: true,
      firmas: true,
    })
    if (!r.listo) throw new Error(r.motivo)
    const { dibujante, pedidos } = dibujanteFalso()
    const pagina = await pintarPrimeraPagina(generarPdf(r.informe), { anchoObjetivoPx: 595, biblioteca, dibujante })
    // A4 vertical: 595.28 × 841.89 pt → a 595 px de ancho, 841 de alto.
    expect(pedidos).toEqual([{ anchoPx: 595, altoPx: 841 }])
    expect(pagina.url).toBe('blob:pagina-1')
    expect(pagina.altoPt).toBeGreaterThan(pagina.anchoPt)
  })

  it('unos bytes que no son PDF fallan con motivo, no en silencio', async () => {
    const { dibujante } = dibujanteFalso()
    await expect(
      pintarPrimeraPagina(new TextEncoder().encode('hola'), { anchoObjetivoPx: 600, biblioteca, dibujante }),
    ).rejects.toMatchObject({ motivo: 'no-es-pdf' })
  })
})
