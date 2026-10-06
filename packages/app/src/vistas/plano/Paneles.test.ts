import { describe, expect, it } from 'vitest'
import { leerDecimal } from './Paneles'

describe('leerDecimal', () => {
  it('lee coma o punto decimal, el menos tipográfico y el % del final', () => {
    expect(leerDecimal('3244,5')).toBe(3244.5)
    expect(leerDecimal(' 3244.5 ')).toBe(3244.5)
    expect(leerDecimal('−6')).toBe(-6)
    expect(leerDecimal('5%')).toBe(5)
    expect(leerDecimal('-2.5 %')).toBe(-2.5)
    expect(leerDecimal('+3')).toBe(3)
  })

  it('vacío no es cero, y lo ilegible tampoco', () => {
    expect(leerDecimal('')).toBeNull()
    expect(leerDecimal('   ')).toBeNull()
    expect(leerDecimal('6,5,')).toBeNull()
    expect(leerDecimal('32a0')).toBeNull()
    expect(leerDecimal('%')).toBeNull()
  })
})
