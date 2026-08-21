import { describe, expect, it } from 'vitest'
import { estadoDeDiferencia } from './evaluar'

describe('estadoDeDiferencia', () => {
  it('dentro de la tolerancia está conforme', () => {
    expect(estadoDeDiferencia(0, 10)).toBe('conforme')
    expect(estadoDeDiferencia(7, 10)).toBe('conforme')
    expect(estadoDeDiferencia(-7, 10)).toBe('conforme')
  })

  it('justo en la tolerancia todavía está conforme', () => {
    expect(estadoDeDiferencia(10, 10)).toBe('conforme')
    expect(estadoDeDiferencia(-10, 10)).toBe('conforme')
  })

  it('entre la tolerancia y su doble está al límite', () => {
    expect(estadoDeDiferencia(11, 10)).toBe('alLimite')
    expect(estadoDeDiferencia(-18, 10)).toBe('alLimite')
  })

  it('justo en el doble todavía está al límite', () => {
    expect(estadoDeDiferencia(20, 10)).toBe('alLimite')
    expect(estadoDeDiferencia(-20, 10)).toBe('alLimite')
  })

  it('pasado el doble está fuera', () => {
    expect(estadoDeDiferencia(21, 10)).toBe('fuera')
    expect(estadoDeDiferencia(-45, 10)).toBe('fuera')
  })

  it('con tolerancia cero, cualquier diferencia está fuera y el cero exacto es conforme', () => {
    expect(estadoDeDiferencia(0, 0)).toBe('conforme')
    expect(estadoDeDiferencia(1, 0)).toBe('fuera')
  })
})
