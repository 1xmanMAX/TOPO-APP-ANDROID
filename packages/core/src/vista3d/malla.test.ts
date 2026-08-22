import { describe, expect, it } from 'vitest'
import { CAMARA_ISOMETRICA } from './proyeccion'
import { armarCaras, proyectarCaras, type EntradaMalla } from './malla'

/** Tres progresivas por tres elementos, todo medido: cuatro cuadros. */
function entradaCompleta(): EntradaMalla {
  const cotas = new Map<string, number>()
  for (const progresiva of [0, 20, 40]) {
    for (const elemento of ['BOR-I', 'EJE', 'BOR-D']) {
      cotas.set(`${progresiva}|${elemento}`, 3245 - progresiva * 0.01)
    }
  }
  return {
    progresivas: [0, 20, 40],
    elementos: ['BOR-I', 'EJE', 'BOR-D'],
    offsets: new Map([['BOR-I', -4.2], ['EJE', 0], ['BOR-D', 4.2]]),
    cotaDe: (clave) => cotas.get(clave) ?? null,
  }
}

describe('armarCaras', () => {
  it('forma un cuadro entre cada dos progresivas y dos elementos vecinos', () => {
    // 3 progresivas x 3 elementos = 2 x 2 = 4 cuadros
    expect(armarCaras(entradaCompleta())).toHaveLength(4)
  })

  it('cada cara sabe entre qué progresivas y qué elementos está', () => {
    const primera = armarCaras(entradaCompleta())[0]!

    expect(primera.progresivaDesde).toBe(0)
    expect(primera.progresivaHasta).toBe(20)
    expect(primera.elementoDesde).toBe('BOR-I')
    expect(primera.elementoHasta).toBe('EJE')
  })

  it('sin la esquina de la malla cae solo el cuadro que la tocaba', () => {
    const entrada = entradaCompleta()
    const original = entrada.cotaDe
    // 0|BOR-I es una esquina del borde: solo pertenece a un cuadro.
    entrada.cotaDe = (clave) => (clave === '0|BOR-I' ? null : original(clave))

    const caras = armarCaras(entrada)

    expect(caras).toHaveLength(3)
    expect(caras.every((c) => c.esquinas.every((e) => Number.isFinite(e.cota)))).toBe(true)
  })

  it('sin la celda del centro no queda ninguna cara, porque la tocan las cuatro', () => {
    const entrada = entradaCompleta()
    const original = entrada.cotaDe
    // 20|EJE está en la progresiva de en medio y en el elemento de en medio,
    // así que es esquina de los cuatro cuadros a la vez.
    entrada.cotaDe = (clave) => (clave === '20|EJE' ? null : original(clave))

    expect(armarCaras(entrada)).toHaveLength(0)
  })

  it('sin dos progresivas no hay ninguna cara que formar', () => {
    const entrada = { ...entradaCompleta(), progresivas: [0] }

    expect(armarCaras(entrada)).toHaveLength(0)
  })

  it('sin dos elementos tampoco', () => {
    const entrada = { ...entradaCompleta(), elementos: ['EJE'] }

    expect(armarCaras(entrada)).toHaveLength(0)
  })

  it('cada esquina lleva su offset real, no el índice de la columna', () => {
    const primera = armarCaras(entradaCompleta())[0]!
    const offsets = primera.esquinas.map((e) => e.offset).sort((a, b) => a - b)

    expect(offsets).toEqual([-4.2, -4.2, 0, 0])
  })
})

describe('proyectarCaras', () => {
  it('devuelve las caras de atrás primero, para que las de delante las tapen', () => {
    const proyectadas = proyectarCaras(armarCaras(entradaCompleta()), CAMARA_ISOMETRICA)
    const profundidades = proyectadas.map((c) => c.profundidad)

    expect(profundidades).toEqual([...profundidades].sort((a, b) => a - b))
  })

  it('cada cara proyectada conserva sus cuatro puntos', () => {
    const proyectadas = proyectarCaras(armarCaras(entradaCompleta()), CAMARA_ISOMETRICA)

    expect(proyectadas.every((c) => c.puntos.length === 4)).toBe(true)
  })

  it('sin caras que proyectar, devuelve una lista vacía y no revienta', () => {
    expect(proyectarCaras([], CAMARA_ISOMETRICA)).toEqual([])
  })
})
