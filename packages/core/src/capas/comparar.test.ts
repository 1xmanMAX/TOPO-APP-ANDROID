import { describe, expect, it } from 'vitest'
import type { CotaCelda, ResultadoCampania } from '../nivelacion/calcularCampania'
import { compararCapas } from './comparar'

function celda(clave: string, progresiva: number, elemento: string, cota: number): CotaCelda {
  return {
    clave,
    progresiva,
    elementoClave: elemento,
    offset: 0,
    cota,
    cotaCruda: cota,
    correccion: 0,
    lecturas: [1],
  }
}

function resultado(celdas: CotaCelda[]): ResultadoCampania {
  return {
    cotasPorCelda: new Map(celdas.map((c) => [c.clave, c])),
    cotasInstrumento: [],
    cierre: {
      tipo: 'cerrado',
      cotaLlegadaCalculada: null,
      cotaLlegadaConocida: null,
      errorMm: null,
      longitudKKm: 0,
      toleranciaMm: null,
      pasa: true,
    },
    avisos: [],
    celdasTotales: 10,
    celdasLlenas: celdas.length,
    error: null,
  }
}

describe('compararCapas', () => {
  it('el espesor es la diferencia entre la capa de arriba y la de abajo', () => {
    const inferior = resultado([celda('0|EJE', 0, 'EJE', 3244.625)])
    const superior = resultado([celda('0|EJE', 0, 'EJE', 3244.873)])

    const comparacion = compararCapas(inferior, superior)

    expect(comparacion.celdas.get('0|EJE')?.espesor).toBeCloseTo(0.248, 9)
    expect(comparacion.comparables).toBe(1)
  })

  it('no inventa espesor donde falta una de las dos medidas', () => {
    const inferior = resultado([celda('0|EJE', 0, 'EJE', 3244.625)])
    const superior = resultado([celda('20|EJE', 20, 'EJE', 3244.873)])

    const comparacion = compararCapas(inferior, superior)

    expect(comparacion.celdas.get('0|EJE')?.espesor).toBeNull()
    expect(comparacion.celdas.get('20|EJE')?.espesor).toBeNull()
    expect(comparacion.comparables).toBe(0)
    expect(comparacion.sinPareja).toBe(2)
  })

  it('resume el espesor mínimo, máximo y medio', () => {
    const inferior = resultado([
      celda('0|EJE', 0, 'EJE', 3244.600),
      celda('20|EJE', 20, 'EJE', 3244.600),
    ])
    const superior = resultado([
      celda('0|EJE', 0, 'EJE', 3244.800),
      celda('20|EJE', 20, 'EJE', 3244.900),
    ])

    const comparacion = compararCapas(inferior, superior)

    expect(comparacion.espesorMinimo).toBeCloseTo(0.2, 9)
    expect(comparacion.espesorMaximo).toBeCloseTo(0.3, 9)
    expect(comparacion.espesorMedio).toBeCloseTo(0.25, 9)
  })

  it('avisa cuando la capa de arriba queda por debajo de la de abajo', () => {
    const inferior = resultado([celda('0|EJE', 0, 'EJE', 3244.900)])
    const superior = resultado([celda('0|EJE', 0, 'EJE', 3244.625)])

    const comparacion = compararCapas(inferior, superior)

    const aviso = comparacion.avisos.find((a) => a.clave === '0|EJE')
    expect(aviso?.nivel).toBe('advertencia')
    expect(aviso?.mensaje).toContain('por debajo')
    expect(comparacion.celdas.get('0|EJE')?.espesor).toBeCloseTo(-0.275, 9)
  })

  it('devuelve un resumen vacío sin celdas comparables', () => {
    const comparacion = compararCapas(resultado([]), resultado([]))

    expect(comparacion.comparables).toBe(0)
    expect(comparacion.espesorMedio).toBeNull()
    expect(comparacion.avisos).toEqual([])
  })
})
