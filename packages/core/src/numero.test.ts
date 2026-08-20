import { describe, expect, it } from 'vitest'
import { aMetros, aMilimetros, redondear3 } from './numero'

describe('redondear3', () => {
  it('redondea a tres decimales', () => {
    expect(redondear3(3244.6275)).toBe(3244.628)
    expect(redondear3(3244.6274)).toBe(3244.627)
  })

  it('no arrastra error de punto flotante', () => {
    expect(redondear3(1.005)).toBe(1.005)
    expect(redondear3(0.1 + 0.2)).toBe(0.3)
  })

  it('conserva el signo de los negativos', () => {
    expect(redondear3(-0.0125)).toBe(-0.013)
  })
})

describe('conversión de unidades', () => {
  it('pasa metros a milímetros', () => {
    expect(aMilimetros(-0.005)).toBeCloseTo(-5, 9)
    expect(aMilimetros(0.0072)).toBeCloseTo(7.2, 9)
  })

  it('pasa milímetros a metros', () => {
    expect(aMetros(7.2)).toBeCloseTo(0.0072, 9)
  })
})
