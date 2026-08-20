import { describe, expect, it } from 'vitest'
import { BM_1, campaniaEjemplo } from '../pruebas/libretaEjemplo'
import { calcularCotas } from './cotas'
import { compensarPuntos, correccionesAcumuladas } from './compensacion'

describe('correccionesAcumuladas', () => {
  it('reparte el error en partes iguales y con signo contrario', () => {
    expect(correccionesAcumuladas(-5, 2)).toEqual([0.0025, 0.005])
  })

  it('la última acumulada cancela exactamente el error', () => {
    const acumuladas = correccionesAcumuladas(18, 7)
    expect(acumuladas[6]).toBeCloseTo(-0.018, 12)
  })

  it('devuelve una sola corrección si hay una sola estación', () => {
    expect(correccionesAcumuladas(-5, 1)).toEqual([0.005])
  })

  it('devuelve cero cuando no hay error', () => {
    expect(correccionesAcumuladas(0, 3)).toEqual([0, 0, 0])
  })

  it('devuelve lista vacía si no hay estaciones', () => {
    expect(correccionesAcumuladas(-5, 0)).toEqual([])
  })
})

describe('compensarPuntos', () => {
  it('aplica a cada punto la corrección de su estación', () => {
    const cotas = calcularCotas(campaniaEjemplo(), [BM_1])
    const compensados = compensarPuntos(cotas.puntos, correccionesAcumuladas(-5, 2))
    const porClave = new Map(compensados.map((p) => [p.claveDestino, p.cota]))

    expect(porClave.get('0|EJE')).toBeCloseTo(3244.6275, 9)
    expect(porClave.get('20|EJE')).toBeCloseTo(3244.62, 9)
  })

  it('conserva la cota cruda intacta', () => {
    const cotas = calcularCotas(campaniaEjemplo(), [BM_1])
    const compensados = compensarPuntos(cotas.puntos, correccionesAcumuladas(-5, 2))
    const punto = compensados.find((p) => p.claveDestino === '0|EJE')

    expect(punto?.cotaCruda).toBeCloseTo(3244.625, 9)
    expect(punto?.correccion).toBeCloseTo(0.0025, 9)
  })

  it('deja las cotas sin tocar cuando no hay correcciones', () => {
    const cotas = calcularCotas(campaniaEjemplo(), [BM_1])
    const compensados = compensarPuntos(cotas.puntos, [])
    const punto = compensados.find((p) => p.claveDestino === '0|EJE')

    expect(punto?.cota).toBeCloseTo(3244.625, 9)
    expect(punto?.correccion).toBe(0)
  })
})
