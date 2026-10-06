import { espesoresPorEncimaDe } from '@topo/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { proyectoEjemplo } from '../estado/ejemplo'

// idb-keyval necesita IndexedDB, que jsdom no implementa. Se reemplaza por un
// mapa en memoria para poder probar guardarBorrador/leerBorrador de verdad.
// vi.mock se eleva sobre los imports, así que esto corre antes de que
// autoguardado.ts importe idb-keyval.
const almacen = new Map<string, unknown>()

vi.mock('idb-keyval', () => ({
  get: (clave: string) => Promise.resolve(almacen.get(clave)),
  set: (clave: string, valor: unknown) => {
    almacen.set(clave, valor)
    return Promise.resolve()
  },
  del: (clave: string) => {
    almacen.delete(clave)
    return Promise.resolve()
  },
}))

const { borrarBorrador, guardarArchivosDePlano, guardarBorrador, leerBorrador } = await import('./autoguardado')

describe('autoguardado', () => {
  beforeEach(() => {
    almacen.clear()
  })

  // Un topógrafo con trabajo autoguardado antes de la Entrega 2B no debe
  // encontrarse con una cota teórica calculada sobre NaN al recuperarlo: el
  // proyecto guardado en el navegador tiene que pasar por la misma migración
  // que un archivo .topo.
  it('el proyecto recuperado del autoguardado pasa por la misma migración que un .topo', async () => {
    const original = proyectoEjemplo()
    const proyectoDeAntesDeLa2B = {
      ...original,
      capas: original.capas.map(({ espesor: _espesor, toleranciaMm: _tolerancia, ...resto }) => resto),
      calles: original.calles.map(({ rasante: _rasante, ...resto }) => resto),
    } as never

    await guardarBorrador(proyectoDeAntesDeLa2B)
    const borrador = await leerBorrador()

    expect(borrador).not.toBeNull()
    expect(borrador!.proyecto.capas.every((capa) => capa.espesor === 0)).toBe(true)
    expect(borrador!.proyecto.capas.every((capa) => capa.toleranciaMm > 0)).toBe(true)
    expect(borrador!.proyecto.calles.every((calle) => calle.rasante === null)).toBe(true)

    for (const capa of borrador!.proyecto.capas) {
      expect(Number.isFinite(espesoresPorEncimaDe(borrador!.proyecto.capas, capa.id))).toBe(true)
    }
  })

  it('leerBorrador da null cuando no hay nada guardado', async () => {
    expect(await leerBorrador()).toBeNull()
  })

  describe('planos', () => {
    const conPlanos = () => ({
      ...proyectoEjemplo(),
      planos: [
        { id: 'plano-a', nombre: 'A', formato: 'pdf' as const, calibracion: null },
        { id: 'plano-b', nombre: 'B', formato: 'dxf' as const, calibracion: null },
      ],
    })

    it('guarda y recupera los bytes de los planos junto al proyecto', async () => {
      const bytesA = new Uint8Array([37, 80, 68, 70])
      const bytesB = new Uint8Array([48, 10, 83, 69])
      await guardarBorrador(conPlanos())
      await guardarArchivosDePlano({ 'plano-a': bytesA, 'plano-b': bytesB })

      const borrador = await leerBorrador()

      expect(borrador!.archivosDePlano).toEqual({ 'plano-a': bytesA, 'plano-b': bytesB })
    })

    it('de los bytes guardados, solo vuelven los de planos que el proyecto declara', async () => {
      await guardarBorrador(conPlanos())
      await guardarArchivosDePlano({ 'plano-a': new Uint8Array([1]), 'plano-borrado': new Uint8Array([2]) })

      const borrador = await leerBorrador()

      expect(Object.keys(borrador!.archivosDePlano)).toEqual(['plano-a'])
    })

    it('un borrador de antes de los planos se recupera con la lista vacía', async () => {
      await guardarBorrador(proyectoEjemplo())
      expect((await leerBorrador())!.archivosDePlano).toEqual({})
    })

    it('descartar el borrador descarta también sus planos', async () => {
      await guardarBorrador(conPlanos())
      await guardarArchivosDePlano({ 'plano-a': new Uint8Array([1]) })
      await borrarBorrador()
      expect(almacen.size).toBe(0)
    })
  })
})
