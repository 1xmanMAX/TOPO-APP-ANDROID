import { describe, expect, it } from 'vitest'
import {
  anadirPalabra, esPalabraDe, hayDistanciasDeFabrica, ladoDe,
  palabraDePunto, palabrasDeSeccion,
  puntoPorPalabraYLado, puntosConPalabra, seccionDeFabrica,
  type PuntoSeccion,
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

  it('con un punto que no existe no cambia nada, y no revienta', () => {
    const antes = seccionDeFabrica()

    expect(anadirPalabra(antes, 'p-que-no-existe', 'zkj').puntos).toEqual(antes.puntos)
  })
})

describe('la palabra con la que se enseña un punto', () => {
  it('es la primera de las suyas: la que Max escribe en su hoja', () => {
    const eje = seccionDeFabrica().puntos.find((p) => p.rol === 'eje')!

    expect(palabraDePunto(eje)).toBe('EJE')
  })

  it('sin ninguna palabra cae al nombre, que es lo único que queda para enseñar', () => {
    // Max añade y quita palabras: un punto puede quedarse sin ninguna, y
    // entonces la cabecera de su columna no puede salir en blanco.
    const sinPalabras: PuntoSeccion = {
      id: 'p-cuneta-i',
      rol: 'cuneta',
      nombre: 'Cuneta izquierda',
      distancia: -6,
      distanciaDeFabrica: false,
      palabras: [],
    }

    expect(palabraDePunto(sinPalabras)).toBe('Cuneta izquierda')
  })

  it('el mapa de la sección da esa misma palabra, buscable por el id del punto', () => {
    const seccion = seccionDeFabrica()

    const palabras = palabrasDeSeccion(seccion)

    expect(palabras.get('p-eje')).toBe('EJE')
    expect(palabras.get('p-vereda-i')).toBe('VI')
    expect(palabras.size).toBe(seccion.puntos.length)
  })

  it('el mapa usa el mismo respaldo al nombre, no uno propio', () => {
    // Es la razón de que las dos vivan juntas: con el respaldo copiado en
    // cada vista, dos pantallas podrían llamar distinto al mismo punto.
    const seccion = seccionDeFabrica()
    const sinPalabras = { ...seccion.puntos[0]!, palabras: [] }

    const palabras = palabrasDeSeccion({ ...seccion, puntos: [sinPalabras] })

    expect(palabras.get(sinPalabras.id)).toBe(palabraDePunto(sinPalabras))
    expect(palabras.get(sinPalabras.id)).toBe(sinPalabras.nombre)
  })

  it('un id que ya no está en la sección no tiene entrada: la llave no se enseña', () => {
    expect(palabrasDeSeccion(seccionDeFabrica()).get('p-borrado')).toBeUndefined()
  })
})
