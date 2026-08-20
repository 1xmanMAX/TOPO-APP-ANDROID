import { describe, expect, it } from 'vitest'
import { formatearProgresiva, generarProgresivas, parsearProgresiva } from './progresivas'

describe('generarProgresivas', () => {
  it('genera el intervalo regular incluyendo el final', () => {
    expect(generarProgresivas(0, 180, 20, [])).toEqual([0, 20, 40, 60, 80, 100, 120, 140, 160, 180])
  })

  it('inserta las progresivas extra en orden', () => {
    expect(generarProgresivas(0, 60, 20, [47, 12])).toEqual([0, 12, 20, 40, 47, 60])
  })

  it('no duplica una extra que coincide con el intervalo', () => {
    expect(generarProgresivas(0, 60, 20, [40])).toEqual([0, 20, 40, 60])
  })

  it('incluye el final aunque no caiga en el intervalo', () => {
    expect(generarProgresivas(0, 55, 20, [])).toEqual([0, 20, 40, 55])
  })

  it('ignora extras fuera del tramo', () => {
    expect(generarProgresivas(0, 40, 20, [-5, 100])).toEqual([0, 20, 40])
  })

  it('devuelve solo el inicio si el tramo tiene longitud cero', () => {
    expect(generarProgresivas(0, 0, 20, [])).toEqual([0])
  })

  it('rechaza un intervalo no positivo', () => {
    expect(() => generarProgresivas(0, 100, 0, [])).toThrow('El intervalo debe ser mayor que cero')
  })

  it('rechaza un tramo invertido', () => {
    expect(() => generarProgresivas(100, 0, 20, [])).toThrow(
      'La progresiva final no puede ser menor que la inicial',
    )
  })
})

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
