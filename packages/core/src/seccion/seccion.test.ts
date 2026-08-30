import { describe, expect, it } from 'vitest'
import {
  anadirPalabra, esPalabraDe, hayDistanciasDeFabrica, ladoDe,
  puntoPorPalabraYLado, puntosConPalabra, seccionDeFabrica,
} from './seccion'

describe('la sección de fábrica', () => {
  it('trae los siete puntos de una calle urbana, del eje hacia afuera', () => {
    const puntos = seccionDeFabrica().puntos

    expect(puntos.map((p) => p.distancia)).toEqual([-5.15, -3.65, -3.5, 0, 3.5, 3.65, 5.15])
    expect(puntos.map((p) => p.rol)).toEqual([
      'vereda', 'sardinel', 'bordeCalzada', 'eje', 'bordeCalzada', 'sardinel', 'vereda',
    ])
  })

  it('marca todas sus distancias como de fábrica', () => {
    // Sin esto, el bombeo saldría con cara de medido cuando lo puso la app.
    expect(seccionDeFabrica().puntos.every((p) => p.distanciaDeFabrica)).toBe(true)
    expect(hayDistanciasDeFabrica(seccionDeFabrica())).toBe(true)
  })

  it('conoce las palabras de la progresiva, del punto de control y de las referencias', () => {
    const s = seccionDeFabrica()

    expect(esPalabraDe(s.palabrasProgresiva, 'PROG')).toBe(true)
    expect(esPalabraDe(s.palabrasPuntoControl, 'pc')).toBe(true)
    expect(esPalabraDe(s.palabrasReferencia, 'existente ')).toBe(true)
  })

  it('cada punto tiene un nombre que se lee, con su lado dentro', () => {
    const nombres = seccionDeFabrica().puntos.map((p) => p.nombre)

    expect(nombres).toContain('Vereda izquierda')
    expect(nombres).toContain('Eje')
  })
})

describe('buscar por palabra', () => {
  it('una misma palabra puede estar en los dos lados', () => {
    // Es el caso de Max: escribe «vereda» dos veces, una a cada lado del eje.
    const conVereda = puntosConPalabra(seccionDeFabrica(), 'VEREDA')

    expect(conVereda).toHaveLength(2)
    expect(conVereda.map((p) => ladoDe(p.distancia))).toEqual(['izquierda', 'derecha'])
  })

  it('con el lado, la palabra repetida da un solo punto', () => {
    const punto = puntoPorPalabraYLado(seccionDeFabrica(), 'vereda', 'derecha')

    expect(punto?.distancia).toBe(5.15)
  })

  it('una palabra que nadie declara no da ningún punto', () => {
    expect(puntosConPalabra(seccionDeFabrica(), 'ZKJ')).toEqual([])
    expect(puntoPorPalabraYLado(seccionDeFabrica(), 'ZKJ', 'izquierda')).toBeNull()
  })
})

describe('ladoDe', () => {
  it('el signo de la distancia da el lado, y el cero es el eje', () => {
    expect(ladoDe(-3.5)).toBe('izquierda')
    expect(ladoDe(0)).toBe('eje')
    expect(ladoDe(3.5)).toBe('derecha')
  })
})

describe('anadirPalabra', () => {
  it('devuelve una sección nueva: la de entrada no se toca', () => {
    const antes = seccionDeFabrica()
    const eje = antes.puntos.find((p) => p.rol === 'eje')!

    const despues = anadirPalabra(antes, eje.id, 'ejito')

    expect(puntosConPalabra(despues, 'ejito')).toHaveLength(1)
    expect(puntosConPalabra(antes, 'ejito')).toEqual([])
  })

  it('no duplica una palabra que ya estaba, aunque venga escrita distinto', () => {
    const s = seccionDeFabrica()
    const eje = s.puntos.find((p) => p.rol === 'eje')!

    const despues = anadirPalabra(s, eje.id, ' Eje ')

    expect(despues.puntos.find((p) => p.id === eje.id)!.palabras).toEqual(
      s.puntos.find((p) => p.id === eje.id)!.palabras,
    )
  })
})
