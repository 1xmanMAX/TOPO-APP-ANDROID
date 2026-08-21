import { describe, expect, it } from 'vitest'
import type { Capa } from './tipos'
import { moverCapa, ordenarCapas, renumerarCapas } from './capas'

const capas: Capa[] = [
  { id: 'b', nombre: 'BASE', orden: 2, espesor: 0.2, toleranciaMm: 10 },
  { id: 't', nombre: 'TERRENO', orden: 0, espesor: 0, toleranciaMm: 20 },
  { id: 's', nombre: 'SUBRASANTE', orden: 1, espesor: 0.25, toleranciaMm: 20 },
]

describe('ordenarCapas', () => {
  it('ordena de arriba hacia abajo del paquete', () => {
    expect(ordenarCapas(capas).map((c) => c.nombre)).toEqual(['TERRENO', 'SUBRASANTE', 'BASE'])
  })

  it('no altera el arreglo que recibe', () => {
    const copia = [...capas]
    ordenarCapas(capas)
    expect(capas).toEqual(copia)
  })

  it('deja las de igual orden en el orden en que venían', () => {
    const empatadas: Capa[] = [
      { id: 'x', nombre: 'X', orden: 1, espesor: 0.1, toleranciaMm: 10 },
      { id: 'y', nombre: 'Y', orden: 1, espesor: 0.1, toleranciaMm: 10 },
    ]
    expect(ordenarCapas(empatadas).map((c) => c.id)).toEqual(['x', 'y'])
  })

  it('una capa con espesor y tolerancia se ordena igual que antes', () => {
    const capas: Capa[] = [
      { id: 'c2', nombre: 'BASE', orden: 1, espesor: 0.2, toleranciaMm: 10 },
      { id: 'c1', nombre: 'SUBRASANTE', orden: 0, espesor: 0.25, toleranciaMm: 20 },
    ]

    expect(ordenarCapas(capas).map((capa) => capa.nombre)).toEqual(['SUBRASANTE', 'BASE'])
  })
})

describe('renumerarCapas', () => {
  it('cierra los huecos que deja un borrado', () => {
    const conHuecos: Capa[] = [
      { id: 't', nombre: 'TERRENO', orden: 0, espesor: 0, toleranciaMm: 20 },
      { id: 'b', nombre: 'BASE', orden: 7, espesor: 0.2, toleranciaMm: 10 },
    ]
    expect(renumerarCapas(conHuecos).map((c) => c.orden)).toEqual([0, 1])
  })

  it('conserva el orden relativo', () => {
    expect(renumerarCapas(capas).map((c) => c.nombre)).toEqual(['TERRENO', 'SUBRASANTE', 'BASE'])
  })
})

describe('moverCapa', () => {
  it('sube una capa un lugar', () => {
    expect(moverCapa(capas, 's', -1).map((c) => c.nombre)).toEqual(['SUBRASANTE', 'TERRENO', 'BASE'])
  })

  it('baja una capa un lugar', () => {
    expect(moverCapa(capas, 's', 1).map((c) => c.nombre)).toEqual(['TERRENO', 'BASE', 'SUBRASANTE'])
  })

  it('subir la primera no hace nada', () => {
    expect(moverCapa(capas, 't', -1)).toEqual(capas)
  })

  it('bajar la última no hace nada', () => {
    expect(moverCapa(capas, 'b', 1)).toEqual(capas)
  })

  it('una capa inexistente no altera la lista', () => {
    expect(moverCapa(capas, 'no-existe', -1)).toEqual(capas)
  })

  it('deja el resultado renumerado sin huecos', () => {
    expect(moverCapa(capas, 's', -1).map((c) => c.orden)).toEqual([0, 1, 2])
  })
})
