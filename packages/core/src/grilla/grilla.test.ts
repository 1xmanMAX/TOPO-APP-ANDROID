import { describe, expect, it } from 'vitest'
import type { Calle, Plantilla } from '../modelo/tipos'
import { claveCelda, construirGrilla } from './grilla'

const plantilla: Plantilla = {
  id: 'pl-1',
  nombre: 'Calle con vereda',
  elementos: [
    { clave: 'BOR-I', etiqueta: 'Borde izquierdo', offset: -4.2, tipo: 'calzada' },
    { clave: 'EJE', etiqueta: 'Eje', offset: 0, tipo: 'eje' },
    { clave: 'BOR-D', etiqueta: 'Borde derecho', offset: 4.2, tipo: 'calzada' },
  ],
}

const calle: Calle = {
  id: 'c-1',
  nombre: 'Av. Sol',
  plantillaId: 'pl-1',
  progresivaInicio: 0,
  progresivaFin: 40,
  intervalo: 20,
  progresivasExtra: [],
}

describe('claveCelda', () => {
  it('combina progresiva y elemento', () => {
    expect(claveCelda(20, 'EJE')).toBe('20|EJE')
  })

  it('normaliza decimales para que la clave sea estable', () => {
    expect(claveCelda(20.0, 'EJE')).toBe(claveCelda(20, 'EJE'))
    expect(claveCelda(47.25, 'EJE')).toBe('47.25|EJE')
  })
})

describe('construirGrilla', () => {
  it('genera una celda por progresiva y elemento', () => {
    const grilla = construirGrilla(calle, plantilla)
    expect(grilla).toHaveLength(9)
  })

  it('recorre primero las progresivas y dentro de ellas los elementos', () => {
    const grilla = construirGrilla(calle, plantilla)
    expect(grilla.slice(0, 4).map((c) => c.clave)).toEqual([
      '0|BOR-I',
      '0|EJE',
      '0|BOR-D',
      '20|BOR-I',
    ])
  })

  it('lleva el offset y la etiqueta del elemento', () => {
    const grilla = construirGrilla(calle, plantilla)
    const celda = grilla.find((c) => c.clave === '20|BOR-D')
    expect(celda?.offset).toBe(4.2)
    expect(celda?.etiqueta).toBe('Borde derecho')
  })

  it('devuelve grilla vacía si la plantilla no tiene elementos', () => {
    const vacia: Plantilla = { ...plantilla, elementos: [] }
    expect(construirGrilla(calle, vacia)).toEqual([])
  })
})
