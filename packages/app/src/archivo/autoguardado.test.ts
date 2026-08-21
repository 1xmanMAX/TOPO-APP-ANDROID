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

const { guardarBorrador, leerBorrador } = await import('./autoguardado')

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
})
