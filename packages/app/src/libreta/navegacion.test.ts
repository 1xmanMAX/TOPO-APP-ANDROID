import { construirGrilla } from '@topo/core'
import { describe, expect, it } from 'vitest'
import { progresivasPendientes, resumenPendientes, siguienteCeldaPendiente } from './navegacion'

const plantilla = {
  id: 'pl-1',
  nombre: 'P',
  elementos: [
    { clave: 'BOR-I', etiqueta: 'Borde izq', offset: -4.2, tipo: 'calzada' as const },
    { clave: 'EJE', etiqueta: 'Eje', offset: 0, tipo: 'eje' as const },
  ],
}

const calle = {
  id: 'c-1',
  nombre: 'Av. Sol',
  plantillaId: 'pl-1',
  progresivaInicio: 0,
  progresivaFin: 40,
  intervalo: 20,
  progresivasExtra: [],
  rasante: null,
}

const grilla = construirGrilla(calle, plantilla)

describe('siguienteCeldaPendiente', () => {
  it('empieza por la primera celda cuando no hay nada llenado', () => {
    expect(siguienteCeldaPendiente(grilla, new Set(), null)?.clave).toBe('0|BOR-I')
  })

  it('avanza a la siguiente celda vacía después de la actual', () => {
    expect(siguienteCeldaPendiente(grilla, new Set(['0|BOR-I']), '0|BOR-I')?.clave).toBe('0|EJE')
  })

  it('se salta las celdas ya llenadas', () => {
    const llenas = new Set(['0|BOR-I', '0|EJE', '20|BOR-I'])
    expect(siguienteCeldaPendiente(grilla, llenas, '0|BOR-I')?.clave).toBe('20|EJE')
  })

  it('vuelve al principio cuando llega al final', () => {
    const llenas = new Set(['40|BOR-I', '40|EJE'])
    expect(siguienteCeldaPendiente(grilla, llenas, '40|EJE')?.clave).toBe('0|BOR-I')
  })

  it('devuelve null cuando la grilla está completa', () => {
    const llenas = new Set(grilla.map((c) => c.clave))
    expect(siguienteCeldaPendiente(grilla, llenas, '0|EJE')).toBeNull()
  })
})

describe('progresivasPendientes', () => {
  it('lista las progresivas con alguna celda vacía', () => {
    const llenas = new Set(['0|BOR-I', '0|EJE'])
    expect(progresivasPendientes(grilla, llenas)).toEqual([20, 40])
  })
})

describe('resumenPendientes', () => {
  it('describe cuántas celdas faltan y dónde', () => {
    const llenas = new Set(['0|BOR-I', '0|EJE', '20|BOR-I'])
    expect(resumenPendientes(grilla, llenas)).toBe('Faltan 3 celdas por llenar en 0+020 y 0+040.')
  })

  it('usa singular con una sola celda', () => {
    const llenas = new Set(grilla.map((c) => c.clave).filter((c) => c !== '40|EJE'))
    expect(resumenPendientes(grilla, llenas)).toBe('Falta 1 celda por llenar en 0+040.')
  })

  it('felicita cuando no falta nada', () => {
    const llenas = new Set(grilla.map((c) => c.clave))
    expect(resumenPendientes(grilla, llenas)).toBe('Grilla completa.')
  })
})
