import { construirGrilla, type Calle } from '@topo/core'
import { describe, expect, it } from 'vitest'
import { progresivasPendientes, resumenPendientes, siguienteCeldaPendiente } from './navegacion'

const calle: Calle = {
  id: 'c-1',
  nombre: 'Av. Sol',
  seccion: {
    puntos: [
      { id: 'p-borde-i', rol: 'bordeCalzada', nombre: 'Borde izquierdo', distancia: -4.2, distanciaDeFabrica: false, palabras: ['BOR-I'] },
      { id: 'p-eje', rol: 'eje', nombre: 'Eje', distancia: 0, distanciaDeFabrica: false, palabras: ['EJE'] },
    ],
    palabrasProgresiva: [],
    palabrasPuntoControl: [],
    palabrasReferencia: [],
  },
  nivelaciones: [],
  rasante: null,
}

const grilla = construirGrilla(calle, [0, 20, 40])

describe('siguienteCeldaPendiente', () => {
  it('empieza por la primera celda cuando no hay nada llenado', () => {
    expect(siguienteCeldaPendiente(grilla, new Set(), null)?.clave).toBe('0|p-borde-i')
  })

  it('avanza a la siguiente celda vacía después de la actual', () => {
    expect(siguienteCeldaPendiente(grilla, new Set(['0|p-borde-i']), '0|p-borde-i')?.clave).toBe('0|p-eje')
  })

  it('se salta las celdas ya llenadas', () => {
    const llenas = new Set(['0|p-borde-i', '0|p-eje', '20|p-borde-i'])
    expect(siguienteCeldaPendiente(grilla, llenas, '0|p-borde-i')?.clave).toBe('20|p-eje')
  })

  it('vuelve al principio cuando llega al final', () => {
    const llenas = new Set(['40|p-borde-i', '40|p-eje'])
    expect(siguienteCeldaPendiente(grilla, llenas, '40|p-eje')?.clave).toBe('0|p-borde-i')
  })

  it('devuelve null cuando la grilla está completa', () => {
    const llenas = new Set(grilla.map((c) => c.clave))
    expect(siguienteCeldaPendiente(grilla, llenas, '0|p-eje')).toBeNull()
  })
})

describe('progresivasPendientes', () => {
  it('lista las progresivas con alguna celda vacía', () => {
    const llenas = new Set(['0|p-borde-i', '0|p-eje'])
    expect(progresivasPendientes(grilla, llenas)).toEqual([20, 40])
  })
})

describe('resumenPendientes', () => {
  it('describe cuántas celdas faltan y dónde', () => {
    const llenas = new Set(['0|p-borde-i', '0|p-eje', '20|p-borde-i'])
    expect(resumenPendientes(grilla, llenas)).toBe('Faltan 3 celdas por llenar en 0+020 y 0+040.')
  })

  it('usa singular con una sola celda', () => {
    const llenas = new Set(grilla.map((c) => c.clave).filter((c) => c !== '40|p-eje'))
    expect(resumenPendientes(grilla, llenas)).toBe('Falta 1 celda por llenar en 0+040.')
  })

  it('felicita cuando no falta nada', () => {
    const llenas = new Set(grilla.map((c) => c.clave))
    expect(resumenPendientes(grilla, llenas)).toBe('Grilla completa.')
  })
})
