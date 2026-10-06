import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { compartirArchivo, descargarBytes } from './salida'

const BYTES = new TextEncoder().encode('%PDF-1.4\n')

describe('compartir y descargar', () => {
  let clics: string[]
  beforeEach(() => {
    clics = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clics.push(this.download)
    })
    URL.createObjectURL = vi.fn(() => 'blob:prueba')
    URL.revokeObjectURL = vi.fn()
  })
  afterEach(() => vi.restoreAllMocks())

  it('descarga con el nombre pedido', () => {
    descargarBytes(BYTES, 'Protocolo.pdf')
    expect(clics).toEqual(['Protocolo.pdf'])
  })

  it('comparte el archivo si el navegador sabe compartir archivos', async () => {
    const share = vi.fn(async (_datos: ShareData) => undefined)
    const r = await compartirArchivo(BYTES, 'Protocolo.pdf', undefined, { share, canShare: () => true })
    expect(r).toBe('compartido')
    const datos = share.mock.calls[0]![0]
    expect(datos.files?.[0]?.name).toBe('Protocolo.pdf')
    expect(datos.files?.[0]?.type).toBe('application/pdf')
    expect(clics).toEqual([])
  })

  it('si no sabe compartir archivos, lo descarga', async () => {
    expect(await compartirArchivo(BYTES, 'a.pdf', undefined, {})).toBe('descargado')
    expect(await compartirArchivo(BYTES, 'b.pdf', undefined, { share: vi.fn(), canShare: () => false })).toBe('descargado')
    expect(clics).toEqual(['a.pdf', 'b.pdf'])
  })

  it('si se cierra el menú sin elegir, no descarga nada', async () => {
    const cancelar = Object.assign(new Error('cancelado'), { name: 'AbortError' })
    const r = await compartirArchivo(BYTES, 'a.pdf', undefined, { share: vi.fn(async () => Promise.reject(cancelar)), canShare: () => true })
    expect(r).toBe('cancelado')
    expect(clics).toEqual([])
  })

  it('si compartir falla por otra cosa, al menos se descarga', async () => {
    const r = await compartirArchivo(BYTES, 'a.pdf', undefined, {
      share: vi.fn(async () => Promise.reject(new Error('NotAllowedError'))),
      canShare: () => true,
    })
    expect(r).toBe('descargado')
    expect(clics).toEqual(['a.pdf'])
  })
})
