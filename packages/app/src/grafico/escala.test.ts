import { describe, expect, it } from 'vitest'
import { escalaLineal, extension, marcas } from './escala'

describe('escalaLineal', () => {
  it('mapea el dominio al rango', () => {
    const escala = escalaLineal([0, 10], [0, 100])
    expect(escala(0)).toBe(0)
    expect(escala(5)).toBe(50)
    expect(escala(10)).toBe(100)
  })

  it('admite un rango invertido, como el eje Y de la pantalla', () => {
    const escala = escalaLineal([3244, 3245], [200, 0])
    expect(escala(3244)).toBe(200)
    expect(escala(3245)).toBe(0)
  })

  it('devuelve el centro del rango si el dominio es un punto', () => {
    const escala = escalaLineal([5, 5], [0, 100])
    expect(escala(5)).toBe(50)
  })
})

describe('extension', () => {
  it('agrega margen proporcional arriba y abajo', () => {
    expect(extension([10, 20], 0.1)).toEqual([9, 21])
  })

  it('abre un margen fijo cuando todos los valores son iguales', () => {
    expect(extension([3244.625, 3244.625], 0.1)).toEqual([3244.575, 3244.675])
  })

  it('devuelve cero a uno con una lista vacía', () => {
    expect(extension([], 0.1)).toEqual([0, 1])
  })

  it('funciona con valores negativos, como los offsets a la izquierda del eje', () => {
    const [minimo, maximo] = extension([-5.6, 4.2], 0.1)

    expect(minimo).toBeCloseTo(-6.58, 9)
    expect(maximo).toBeCloseTo(5.18, 9)
  })
})

describe('marcas', () => {
  it('genera valores redondos dentro del dominio', () => {
    expect(marcas([0, 10], 5)).toEqual([0, 2, 4, 6, 8, 10])
  })

  it('usa pasos legibles con cotas', () => {
    const valores = marcas([3244.5, 3245.1], 4)
    expect(valores[0]).toBeCloseTo(3244.6, 6)
    expect(valores[valores.length - 1]).toBeLessThanOrEqual(3245.1)
  })

  it('devuelve un solo valor si el dominio es un punto', () => {
    expect(marcas([5, 5], 4)).toEqual([5])
  })

  it('admite un dominio al revés y da las mismas marcas', () => {
    expect(marcas([10, 0], 5)).toEqual(marcas([0, 10], 5))
  })
})
