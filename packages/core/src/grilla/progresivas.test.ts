import { describe, expect, it } from 'vitest'
import { formatearProgresiva, parsearProgresiva } from './progresivas'

// Aquí vivían las ocho pruebas de `generarProgresivas`. Se retiran con la
// función: fabricaba la serie de progresivas de una calle desde un rango
// configurado, y ese rango ya no existe en el modelo —la grilla sale de las
// progresivas medidas (`progresivasMedidas`, con sus propias pruebas en
// `grilla.test.ts`) y de la hoja de campo, fila a fila—. No se traducen a
// otro sitio porque no vigilaban ninguna capacidad que siga siendo
// alcanzable: nada del proyecto puede pedir hoy una progresiva inventada.

describe('formatearProgresiva', () => {
  it('usa el formato km+metros con tres dígitos', () => {
    expect(formatearProgresiva(0)).toBe('0+000')
    expect(formatearProgresiva(20)).toBe('0+020')
    expect(formatearProgresiva(180)).toBe('0+180')
    expect(formatearProgresiva(1000)).toBe('1+000')
  })

  it('muestra dos decimales solo cuando los hay', () => {
    expect(formatearProgresiva(1247.5)).toBe('1+247.50')
    expect(formatearProgresiva(47.25)).toBe('0+047.25')
  })

  it('acarrea correctamente cuando la fracción redondea a un metro completo', () => {
    expect(formatearProgresiva(999.995)).toBe('1+000')
    expect(formatearProgresiva(0.995)).toBe('0+001')
    expect(formatearProgresiva(47.996)).toBe('0+048')
  })

  it('sobrevive el viaje de ida y vuelta con parsearProgresiva', () => {
    for (const valor of [0, 20, 180, 1000, 1247.5, 47.25, 2999.99]) {
      expect(parsearProgresiva(formatearProgresiva(valor))).toBeCloseTo(valor, 6)
    }
  })
})

describe('parsearProgresiva', () => {
  it('acepta el formato km+metros', () => {
    expect(parsearProgresiva('0+020')).toBe(20)
    expect(parsearProgresiva('1+247.50')).toBe(1247.5)
  })

  it('acepta metros sueltos', () => {
    expect(parsearProgresiva('20')).toBe(20)
    expect(parsearProgresiva('47.25')).toBe(47.25)
  })

  it('devuelve null si no se entiende', () => {
    expect(parsearProgresiva('abc')).toBeNull()
    expect(parsearProgresiva('')).toBeNull()
  })
})
