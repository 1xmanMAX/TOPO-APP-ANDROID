import { describe, expect, it } from 'vitest'
import type { Capa, Rasante } from '../modelo/tipos'
import { cotaTeoricaDeCapa, espesoresPorEncimaDe } from './espesores'

function capas(): Capa[] {
  return [
    { id: 'terreno', nombre: 'TERRENO EXISTENTE', orden: 0, espesor: 0, toleranciaMm: 20 },
    { id: 'subrasante', nombre: 'SUBRASANTE', orden: 1, espesor: 0.25, toleranciaMm: 20 },
    { id: 'base', nombre: 'BASE', orden: 2, espesor: 0.2, toleranciaMm: 10 },
    { id: 'carpeta', nombre: 'CARPETA', orden: 3, espesor: 0.05, toleranciaMm: 5 },
  ]
}

function rasante(): Rasante {
  return {
    progresivaArranque: 0,
    cotaArranque: 3245.18,
    pendienteLongitudinal: -1.25,
    tramos: [{ nombre: 'Calzada', hastaOffset: 4.2, tipo: 'pendiente', valor: 2 }],
    simetrica: true,
    tramosIzquierda: null,
  }
}

describe('espesoresPorEncimaDe', () => {
  it('la capa de más arriba no tiene nada encima', () => {
    expect(espesoresPorEncimaDe(capas(), 'carpeta')).toBe(0)
  })

  it('suma solo las capas de orden mayor', () => {
    expect(espesoresPorEncimaDe(capas(), 'base')).toBe(0.05)
    expect(espesoresPorEncimaDe(capas(), 'subrasante')).toBe(0.25)
    expect(espesoresPorEncimaDe(capas(), 'terreno')).toBe(0.5)
  })

  it('una capa que no está en el paquete no suma nada', () => {
    expect(espesoresPorEncimaDe(capas(), 'inventada')).toBe(0)
  })
})

describe('cotaTeoricaDeCapa', () => {
  it('la carpeta terminada coincide con la rasante', () => {
    expect(cotaTeoricaDeCapa(rasante(), capas(), 'carpeta', 0, 0)).toBe(3245.18)
  })

  it('cada capa de debajo baja lo que suman las de encima', () => {
    expect(cotaTeoricaDeCapa(rasante(), capas(), 'base', 0, 0)).toBe(3245.13)
    expect(cotaTeoricaDeCapa(rasante(), capas(), 'subrasante', 0, 0)).toBe(3244.93)
    expect(cotaTeoricaDeCapa(rasante(), capas(), 'terreno', 0, 0)).toBe(3244.68)
  })

  it('el bombeo se conserva en las capas de abajo', () => {
    // 3245.13 de la base en el eje, menos los 84 mm del bombeo
    expect(cotaTeoricaDeCapa(rasante(), capas(), 'base', 0, 4.2)).toBe(3245.046)
  })

  it('fuera de la sección definida no hay cota teórica', () => {
    expect(cotaTeoricaDeCapa(rasante(), capas(), 'base', 0, 9)).toBeNull()
  })
})
