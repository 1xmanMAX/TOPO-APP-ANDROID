// @vitest-environment node
// En node, no en jsdom: pdfjs abre el archivo de verdad con su build
// «legacy», que es el que funciona fuera del navegador.
import { jsPDF } from 'jspdf'
import * as pdfjsLegacy from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it, vi } from 'vitest'
import { generarPdfPlano } from '../pruebas/muestras/generarPdfPlano'
import { valorDeCota } from './cotas'
import {
  abrirPdf,
  calcularEscalaRender,
  dibujanteNavegador,
  ErrorPdf,
  ptAPixel,
  renderizarPagina,
  textosDePagina,
  type BibliotecaPdf,
  type Dibujante,
} from './pdf'

/**
 * Sin biblioteca inyectada, abrirPdf carga pdfjs por su cuenta y antes tiene
 * que configurar el trabajador. En node se cambian los dos: el trabajador
 * real usa «?url», que solo entiende Vite. pdfjs es el build «legacy», el
 * mismo de la app. Aquí se anota el orden en que se cargan.
 */
const cargas = vi.hoisted(() => [] as string[])
vi.mock('./pdfTrabajador', () => {
  cargas.push('trabajador')
  return {}
})
vi.mock('pdfjs-dist/legacy/build/pdf.mjs', async (importarOriginal) => {
  // Las demás pruebas ya cargan este build: se anota cuando se usa, no cuando se carga.
  const real = await importarOriginal<typeof import('pdfjs-dist/legacy/build/pdf.mjs')>()
  return {
    ...real,
    getDocument: (...args: Parameters<typeof real.getDocument>) => {
      cargas.push('pdfjs')
      return real.getDocument(...args)
    },
  }
})

/** Lo justo de Node para leer la muestra; ver pruebas/muestras.ts. */
declare const process: { cwd(): string; getBuiltinModule(nombre: string): unknown }
interface ArchivosDeNode {
  readFileSync(ruta: string): Uint8Array
}
function leerMuestra(): Uint8Array {
  const fs = process.getBuiltinModule('node:fs') as ArchivosDeNode
  return new Uint8Array(fs.readFileSync(`${process.cwd()}/src/pruebas/muestras/plano-expediente.pdf`))
}

const biblioteca = pdfjsLegacy as unknown as BibliotecaPdf
const abrir = (bytes: Uint8Array) => abrirPdf(bytes, { biblioteca })

/** Atrapa el error de una promesa para revisar su motivo. */
async function errorDe(p: Promise<unknown>): Promise<ErrorPdf> {
  try {
    await p
  } catch (e) {
    expect(e).toBeInstanceOf(ErrorPdf)
    return e as ErrorPdf
  }
  throw new Error('se esperaba un error y no lo hubo')
}

/** Una biblioteca falsa cuya carga falla con el error dado (y, si se pide, antes pide contraseña). */
function bibliotecaQueFalla(error: Error, pedirContrasena = false): BibliotecaPdf {
  return {
    getDocument: (() => {
      const tarea = {
        onPassword: undefined as undefined | (() => void),
        destroy: async () => undefined,
        promise: Promise.resolve().then(() => {
          if (pedirContrasena) tarea.onPassword?.()
          throw error
        }),
      }
      return tarea
    }) as unknown as BibliotecaPdf['getDocument'],
  }
}

/** Unos bytes que pasan el control de firma, para las bibliotecas falsas. */
const BYTES_PDF = new TextEncoder().encode('%PDF-1.4\n')

describe('calcularEscalaRender', () => {
  it('ajusta al ancho pedido', () => {
    // A4 apaisado = 841.89 × 595.28 pt. Escala = 2000 / 841.89 = 2.37561
    // Alto = 595.28 × 2.37561 = 1414.14 → 1414 px
    const r = calcularEscalaRender(841.89, 595.28, { anchoObjetivoPx: 2000 })
    expect(r.escala).toBeCloseTo(2.37561, 4)
    expect(r.anchoPx).toBe(2000)
    expect(r.altoPx).toBe(1414)
    expect(r.limitada).toBe(false)
  })

  it('no pasa del lado máximo (8000 px de fábrica) y lo dice', () => {
    // Pedir 20000 px: 8000 / 841.89 = 9.50242 → alto 595.28 × 9.50242 = 5656.6 → 5657
    const r = calcularEscalaRender(841.89, 595.28, { anchoObjetivoPx: 20000 })
    expect(r.escala).toBeCloseTo(9.50242, 4)
    expect(r.anchoPx).toBe(8000)
    expect(r.altoPx).toBe(5657)
    expect(r.limitada).toBe(true)
  })

  it('en una hoja vertical el que manda es el alto', () => {
    // 595.28 × 841.89 pt, ancho 6000 → alto 6000 × 841.89 / 595.28 = 8485.6 > 8000
    // Escala = 8000 / 841.89 = 9.50242; ancho = 595.28 × 9.50242 = 5656.6 → 5657
    const r = calcularEscalaRender(595.28, 841.89, { anchoObjetivoPx: 6000 })
    expect(r.altoPx).toBe(8000)
    expect(r.anchoPx).toBe(5657)
    expect(r.limitada).toBe(true)
  })

  it('respeta un lado máximo propio', () => {
    // 1000 / 841.89 = 1.18781 → alto 595.28 × 1.18781 = 707.08 → 707
    const r = calcularEscalaRender(841.89, 595.28, { anchoObjetivoPx: 3000, ladoMaxPx: 1000 })
    expect(r.anchoPx).toBe(1000)
    expect(r.altoPx).toBe(707)
  })

  it('rechaza un ancho que no sirve', () => {
    expect(() => calcularEscalaRender(841.89, 595.28, { anchoObjetivoPx: 0 })).toThrow(ErrorPdf)
    expect(() => calcularEscalaRender(841.89, 595.28, { anchoObjetivoPx: Number.NaN })).toThrow(/ancho/)
  })

  it('rechaza una página sin tamaño (recuadro degenerado) en vez de dar NaN', () => {
    const casos: [number, number][] = [
      [0, 0],
      [841.89, 0],
      [Number.NaN, 595.28],
      [841.89, Number.POSITIVE_INFINITY],
      [-10, 595.28],
    ]
    for (const [ancho, alto] of casos) {
      let error: unknown
      try {
        calcularEscalaRender(ancho, alto, { anchoObjetivoPx: 100 })
      } catch (e) {
        error = e
      }
      expect(error).toBeInstanceOf(ErrorPdf)
      expect((error as ErrorPdf).motivo).toBe('danado')
    }
  })

  it('devuelve también el tamaño de la página en puntos', () => {
    const r = calcularEscalaRender(841.89, 595.28, { anchoObjetivoPx: 2000 })
    expect(r.anchoPt).toBe(841.89)
    expect(r.altoPt).toBe(595.28)
  })
})

describe('ptAPixel', () => {
  it('pasa de puntos (y hacia arriba) a píxeles de la imagen (y hacia abajo)', () => {
    // escala 2, alto 500 pt: x = 100 × 2 = 200; y = (500 − 400) × 2 = 200
    expect(ptAPixel({ escala: 2, altoPt: 500 }, { x: 100, y: 400 })).toEqual({ x: 200, y: 200 })
    // El origen del PDF (abajo a la izquierda) cae en la última fila: y = 500 × 2 = 1000
    expect(ptAPixel({ escala: 2, altoPt: 500 }, { x: 0, y: 0 })).toEqual({ x: 0, y: 1000 })
  })
})

describe('abrirPdf con la muestra de expediente', () => {
  it('tiene 1 página A4 apaisada', async () => {
    const doc = await abrir(leerMuestra())
    expect(doc.paginas).toBe(1)
    // 297 mm × 72/25.4 = 841.89 pt; 210 mm → 595.28 pt
    const t = await doc.tamanoPagina(1)
    expect(t.anchoPt).toBeCloseTo(841.89, 1)
    expect(t.altoPt).toBeCloseTo(595.28, 1)
    await doc.cerrar()
  })

  it('no le quita los bytes a quien los pasó', async () => {
    // pdfjs transfiere el búfer al trabajador y lo deja vacío; abrirPdf copia.
    const bytes = leerMuestra()
    const largo = bytes.byteLength
    const doc = await abrir(bytes)
    expect(bytes.byteLength).toBe(largo)
    await doc.cerrar()
  })

  it('el generador produce un PDF que también se abre', async () => {
    const doc = await abrir(generarPdfPlano())
    expect(doc.paginas).toBe(1)
    await doc.cerrar()
  })

  it('sin biblioteca inyectada configura el trabajador antes de cargar pdfjs', async () => {
    // Si la interfaz olvida importar pdfTrabajador, pdfjs falla con «No
    // GlobalWorkerOptions.workerSrc specified»; abrirPdf lo importa solo.
    cargas.length = 0
    const doc = await abrirPdf(leerMuestra())
    expect(doc.paginas).toBe(1)
    expect(cargas).toEqual(['trabajador', 'pdfjs'])
    await doc.cerrar()
  })
})

describe('textosDePagina', () => {
  it('aparecen los rótulos y las 5 cotas con su valor', async () => {
    const doc = await abrir(leerMuestra())
    const textos = await textosDePagina(doc, 1)
    const nombres = textos.map((t) => t.texto)
    expect(nombres).toContain('JR. LIMA')
    expect(nombres).toContain('AV. SOL')
    const cotas = textos.filter((t) => t.valor !== null).map((t) => t.valor)
    expect(cotas.sort()).toEqual([3243.68, 3243.9, 3244.1, 3244.4, 3245.18])
    // Los textos vacíos o de puro espacio que mete pdfjs no salen.
    expect(textos.every((t) => t.texto.trim() !== '')).toBe(true)
    // La barra de escala sale como texto, pero sin valor de cota.
    expect(textos.find((t) => t.texto === '20 m')?.valor).toBeNull()
    await doc.cerrar()
  })

  it('usa la misma regla de cota que el DXF (cotas.ts) y el mismo formato de texto', async () => {
    const doc = await abrir(leerMuestra())
    const textos = await textosDePagina(doc, 1)
    for (const t of textos) {
      expect(t.valor).toBe(valorDeCota(t.texto))
      // Mismo TextoPlano que dxf.ts: el PDF no tiene capas, va vacía.
      expect(t.capa).toBe('')
      expect(t.altura).toBeGreaterThan(0)
    }
    await doc.cerrar()
  })

  it('la altura del texto sale de su transformación, en puntos', async () => {
    const doc = await abrir(leerMuestra())
    const textos = await textosDePagina(doc, 1)
    const lima = textos.find((t) => t.texto === 'JR. LIMA')!
    // El generador escribe los rótulos de calle a 10 pt (jsPDF setFontSize(10)).
    expect(lima.altura).toBeCloseTo(10, 3)
    await doc.cerrar()
  })

  it('da la posición en puntos desde abajo a la izquierda, y hacia arriba', async () => {
    const doc = await abrir(leerMuestra())
    const textos = await textosDePagina(doc, 1)
    const lima = textos.find((t) => t.texto === 'JR. LIMA')!
    // En jsPDF: (60, 108) mm desde arriba. 1 mm = 72/25.4 = 2.834646 pt.
    // x = 60 × 2.834646 = 170.079 pt; y = (210 − 108) × 2.834646 = 289.134 pt
    // (jsPDF redondea a 2 decimales en mm, pdfjs lee 289.138: se acepta ±0.01)
    expect(lima.x).toBeCloseTo(170.079, 2)
    expect(Math.abs(lima.y - 289.134)).toBeLessThan(0.01)
    await doc.cerrar()
  })

  it('las distancias entre cotas salen a escala (1:1000)', async () => {
    const doc = await abrir(leerMuestra())
    const textos = await textosDePagina(doc, 1)
    const ini = textos.find((t) => t.valor === 3244.4)!
    const fin = textos.find((t) => t.valor === 3244.1)!
    // Las dos sobre Jr. Lima, separadas 200 mm de papel = 200 m de terreno:
    // 200 × 2.834646 = 566.929 pt, a la misma altura.
    expect(fin.x - ini.x).toBeCloseTo(566.929, 1)
    expect(fin.y).toBeCloseTo(ini.y, 3)
    await doc.cerrar()
  })

  it('pedir una página que no existe da error claro', async () => {
    const doc = await abrir(leerMuestra())
    for (const n of [0, 2, 1.5, -1]) {
      const e = await errorDe(textosDePagina(doc, n))
      expect(e.motivo).toBe('pagina-inexistente')
      expect(e.message).toMatch(/no existe/)
      expect(e.message).toMatch(/1 página/)
    }
    await doc.cerrar()
  })
})

describe('errores al abrir', () => {
  it('un archivo que no es PDF', async () => {
    const e = await errorDe(abrir(new TextEncoder().encode('hola, esto es un texto')))
    expect(e.motivo).toBe('no-es-pdf')
    expect(e.message).toMatch(/no es un PDF/)
  })

  it('un archivo vacío', async () => {
    const e = await errorDe(abrir(new Uint8Array(0)))
    expect(e.motivo).toBe('no-es-pdf')
  })

  it('un PDF dañado (empieza bien pero no tiene nada)', async () => {
    const e = await errorDe(abrir(new TextEncoder().encode('%PDF-1.4\nbasura sin objetos\n')))
    expect(e.motivo).toBe('danado')
    expect(e.message).toMatch(/dañado/)
  })

  it('un PDF con contraseña', async () => {
    const pdf = new jsPDF({
      encryption: { userPassword: 'secreto', ownerPassword: 'dueno', userPermissions: ['print'] },
    })
    pdf.text('privado', 10, 10)
    const e = await errorDe(abrir(new Uint8Array(pdf.output('arraybuffer'))))
    expect(e.motivo).toBe('con-contrasena')
    expect(e.message).toMatch(/contraseña/)
  })

  it('«Worker was destroyed» sin pedir contraseña no se toma por contraseña', async () => {
    const e = await errorDe(abrirPdf(BYTES_PDF, { biblioteca: bibliotecaQueFalla(new Error('Worker was destroyed')) }))
    expect(e.motivo).toBe('falla-del-lector')
    expect(e.message).not.toMatch(/contraseña/)
  })

  it('si pdfjs pidió contraseña, el error que sigue sí es de contraseña', async () => {
    const e = await errorDe(
      abrirPdf(BYTES_PDF, { biblioteca: bibliotecaQueFalla(new Error('Worker was destroyed'), true) }),
    )
    expect(e.motivo).toBe('con-contrasena')
  })

  it('sin trabajador configurado no se dice que el PDF está dañado', async () => {
    const e = await errorDe(
      abrirPdf(BYTES_PDF, {
        biblioteca: bibliotecaQueFalla(new Error('No "GlobalWorkerOptions.workerSrc" specified.')),
      }),
    )
    expect(e.motivo).toBe('falla-del-lector')
    expect(e.message).not.toMatch(/dañado/)
  })
})

describe('renderizarPagina', () => {
  /**
   * Dibujante simulado: un lienzo falso que anota qué se le pidió y un
   * contexto 2D que acepta cualquier orden sin hacer nada. Basta para ver
   * que el tamaño y la escala llegan bien sin un canvas de verdad.
   */
  function dibujanteSimulado(exportar?: Dibujante['exportar']) {
    const pedidos: { anchoPx: number; altoPx: number }[] = []
    const contexto = new Proxy(
      {},
      {
        get: (_o, clave) => {
          if (clave === 'canvas') return lienzo
          if (clave === 'getTransform') return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })
          if (clave === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) })
          if (clave === 'createImageData') return (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h })
          if (clave === 'measureText') return () => ({ width: 0 })
          if (clave === 'getLineDash') return () => []
          return () => undefined
        },
        set: () => true,
      },
    )
    const lienzo = { width: 0, height: 0, getContext: () => contexto }
    const dibujante: Dibujante = {
      crearLienzo(anchoPx, altoPx) {
        pedidos.push({ anchoPx, altoPx })
        lienzo.width = anchoPx
        lienzo.height = altoPx
        return lienzo as unknown as HTMLCanvasElement
      },
      exportar:
        exportar ??
        (async () => {
          const blob = new Blob(['imagen simulada'], { type: 'image/png' })
          return { blob, url: 'blob:simulada' }
        }),
    }
    return { dibujante, pedidos }
  }

  it('pinta la página al ancho pedido y devuelve la imagen', async () => {
    const doc = await abrir(leerMuestra())
    const { dibujante, pedidos } = dibujanteSimulado()
    const r = await renderizarPagina(doc, 1, { anchoObjetivoPx: 1200 }, dibujante)
    // 1200 / 841.89 = 1.42536; alto 595.28 × 1.42536 = 848.49 → 848
    expect(pedidos).toEqual([{ anchoPx: 1200, altoPx: 848 }])
    expect(r.anchoPx).toBe(1200)
    expect(r.altoPx).toBe(848)
    expect(r.escala).toBeCloseTo(1.42536, 4)
    expect(r.anchoPt).toBeCloseTo(841.89, 1)
    expect(r.altoPt).toBeCloseTo(595.28, 1)
    expect(r.url).toBe('blob:simulada')
    expect(r.blob).toBeInstanceOf(Blob)
    expect(r.limitada).toBe(false)
    await doc.cerrar()
  })

  it('una cota pasada a píxeles cae donde está en la imagen', async () => {
    const doc = await abrir(leerMuestra())
    const { dibujante } = dibujanteSimulado()
    const r = await renderizarPagina(doc, 1, { anchoObjetivoPx: 1200 }, dibujante)
    const lima = (await textosDePagina(doc, 1)).find((t) => t.texto === 'JR. LIMA')!
    // La hoja (297 mm) mide 1200 px: 1200 / 297 = 4.040404 px por mm.
    // JR. LIMA está en (60, 108) mm desde arriba a la izquierda:
    // x = 60 × 4.040404 = 242.424 px; y = 108 × 4.040404 = 436.364 px
    // (jsPDF redondea a 0.01 mm: se acepta ±0.05 px)
    const p = ptAPixel(r, lima)
    expect(Math.abs(p.x - 242.424)).toBeLessThan(0.05)
    expect(Math.abs(p.y - 436.364)).toBeLessThan(0.05)
    await doc.cerrar()
  })

  it('una página que no existe falla antes de crear lienzo', async () => {
    const doc = await abrir(leerMuestra())
    const { dibujante, pedidos } = dibujanteSimulado()
    const e = await errorDe(renderizarPagina(doc, 3, { anchoObjetivoPx: 1200 }, dibujante))
    expect(e.motivo).toBe('pagina-inexistente')
    expect(pedidos).toEqual([])
    await doc.cerrar()
  })

  it('si no se puede sacar la imagen, el error trae motivo propio', async () => {
    const doc = await abrir(leerMuestra())
    const { dibujante } = dibujanteSimulado(async () => {
      throw new Error('sin memoria')
    })
    const e = await errorDe(renderizarPagina(doc, 1, { anchoObjetivoPx: 1200 }, dibujante))
    expect(e.motivo).toBe('no-se-pudo-pintar')
    expect(e.message).toMatch(/sin memoria/)
    await doc.cerrar()
  })

  it('el dibujante del navegador avisa con ErrorPdf si el lienzo no da imagen', async () => {
    // toBlob entrega null cuando el lienzo es demasiado grande para el navegador.
    const lienzo = { toBlob: (cb: (b: Blob | null) => void) => cb(null) } as unknown as HTMLCanvasElement
    const e = await errorDe(dibujanteNavegador.exportar(lienzo))
    expect(e.motivo).toBe('no-se-pudo-pintar')
  })
})
