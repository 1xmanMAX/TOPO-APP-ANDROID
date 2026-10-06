import { describe, expect, it } from 'vitest'
import { BM_1, tomaEjemplo } from '../pruebas/libretaEjemplo'
import { calcularCotas } from './cotas'
import { compensarPuntos, correccionesAcumuladas, correccionesDeLaToma, tramoQueCierra } from './compensacion'

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
    const cotas = calcularCotas(tomaEjemplo(), [BM_1])
    const compensados = compensarPuntos(cotas.puntos, correccionesAcumuladas(-5, 2))
    const porClave = new Map(compensados.map((p) => [p.claveDestino, p.cota]))

    expect(porClave.get('0|p-eje')).toBeCloseTo(3244.6275, 9)
    expect(porClave.get('20|p-eje')).toBeCloseTo(3244.62, 9)
  })

  it('conserva la cota cruda intacta', () => {
    const cotas = calcularCotas(tomaEjemplo(), [BM_1])
    const compensados = compensarPuntos(cotas.puntos, correccionesAcumuladas(-5, 2))
    const punto = compensados.find((p) => p.claveDestino === '0|p-eje')

    expect(punto?.cotaCruda).toBeCloseTo(3244.625, 9)
    expect(punto?.correccion).toBeCloseTo(0.0025, 9)
  })

  it('deja las cotas sin tocar cuando no hay correcciones', () => {
    const cotas = calcularCotas(tomaEjemplo(), [BM_1])
    const compensados = compensarPuntos(cotas.puntos, [])
    const punto = compensados.find((p) => p.claveDestino === '0|p-eje')

    expect(punto?.cota).toBeCloseTo(3244.625, 9)
    expect(punto?.correccion).toBe(0)
  })
})

describe('correccionesDeLaToma', () => {
  it('sin re-arranque reparte en todas las estaciones, como correccionesAcumuladas', () => {
    expect(tramoQueCierra(tomaEjemplo())).toEqual({ primeraEstacion: 0, ultimaEstacion: 1 })
    expect(correccionesDeLaToma(-5, tomaEjemplo())).toEqual(correccionesAcumuladas(-5, 2))
  })

  it('si la segunda estación arranca en un BM, la primera recibe 0 y el error va todo a la segunda', () => {
    const toma = tomaEjemplo()
    toma.estaciones[1]!.vistaAtras.destino = { tipo: 'bm', bmId: 'bm-1' }
    expect(tramoQueCierra(toma)).toEqual({ primeraEstacion: 1, ultimaEstacion: 1 })
    // −5 mm en 1 estación: +0.005 m acumulado en ella.
    expect(correccionesDeLaToma(-5, toma)).toEqual([0, 0.005])
  })

  it('una toma sin estaciones no tiene correcciones', () => {
    expect(correccionesDeLaToma(-5, { ...tomaEjemplo(), estaciones: [] })).toEqual([])
  })
})
