import { describe, expect, it } from 'vitest'
import type { Capa } from './tipos'
import { moverCapa, ordenarCapas, renumerarCapas } from './capas'

const capas: Capa[] = [
  { id: 'b', nombre: 'BASE', orden: 2 },
  { id: 't', nombre: 'TERRENO', orden: 0 },
  { id: 's', nombre: 'SUBRASANTE', orden: 1 },
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
      { id: 'x', nombre: 'X', orden: 1 },
      { id: 'y', nombre: 'Y', orden: 1 },
    ]
    expect(ordenarCapas(empatadas).map((c) => c.id)).toEqual(['x', 'y'])
  })
})

describe('renumerarCapas', () => {
  it('cierra los huecos que deja un borrado', () => {
    const conHuecos: Capa[] = [
      { id: 't', nombre: 'TERRENO', orden: 0 },
      { id: 'b', nombre: 'BASE', orden: 7 },
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
