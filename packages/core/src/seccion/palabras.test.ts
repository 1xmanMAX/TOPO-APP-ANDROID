import { describe, expect, it } from 'vitest'
import { mismaPalabra, normalizarPalabra } from './palabras'

describe('normalizarPalabra', () => {
  it('no distingue mayúsculas, tildes ni espacios de sobra', () => {
    expect(normalizarPalabra(' Bórde-Í ')).toBe('borde-i')
    expect(normalizarPalabra('ZKJ')).toBe('zkj')
    expect(normalizarPalabra(' Zkj ')).toBe('zkj')
  })

  it('deja igual lo que ya está normalizado', () => {
    expect(normalizarPalabra('eje')).toBe('eje')
  })

  it('mismaPalabra compara ya normalizado por los dos lados', () => {
    expect(mismaPalabra('vereda ', 'VEREDA')).toBe(true)
    expect(mismaPalabra('vereda', 'veredas')).toBe(false)
  })
})
