import { describe, expect, it } from 'vitest'
import { claveCelda } from '../grilla/grilla'
import type { Toma } from '../modelo/tipos'
import { BM_1, CALLE_EJEMPLO, tomaEjemplo } from '../pruebas/libretaEjemplo'
import { calcularCampania } from './calcularCampania'
import { alturaInstrumentalDeEstacion, estacionComprobada, estacionDeCelda, estacionesPorCelda } from './estaciones'

const calcular = (t: Toma) => calcularCampania({ campania: t, calle: CALLE_EJEMPLO, bms: [BM_1] })

describe('estaciones: las reglas de la libreta, una sola vez', () => {
  it('estacionComprobada: solo si el cierre pasa y la estación está en el tramo que cierra', () => {
    const r = calcular(tomaEjemplo())
    expect(estacionComprobada(r, 0)).toBe(true)
    expect(estacionComprobada(r, 1)).toBe(true)
    const abierta = tomaEjemplo()
    abierta.cierre = { ...abierta.cierre, tipo: 'abierto' }
    expect(estacionComprobada(calcular(abierta), 0)).toBe(false)
  })

  it('alturaInstrumentalDeEstacion: la cruda más la compensación si cerró', () => {
    const t = tomaEjemplo()
    const r = calcular(t)
    const { altura, correccionMm } = alturaInstrumentalDeEstacion(r, t, 0)
    expect(altura).toBeCloseTo(3246.6075, 9)
    expect(correccionMm).toBe(2.5)
    expect(Number.isNaN(alturaInstrumentalDeEstacion(r, t, 9).altura)).toBe(true)
  })

  it('estacionesPorCelda: la última estación que dio cota a cada celda', () => {
    const t = tomaEjemplo()
    const mapa = estacionesPorCelda(t)
    expect(mapa.get(claveCelda(0, 'p-eje'))).toBe(0)
    expect(mapa.get(claveCelda(20, 'p-eje'))).toBe(1)
    expect(estacionDeCelda(t, claveCelda(20, 'p-eje'))).toBe(1)
    expect(estacionDeCelda(t, claveCelda(99, 'p-eje'))).toBeNull()
  })

  it('una vista atrás sobre una celda no cuenta: no da cota (la copia vieja de niveles.ts sí la contaba)', () => {
    const t = tomaEjemplo()
    // La estación 2 arranca mirando atrás a la celda 0 del eje en vez de al PC-1.
    t.estaciones[1]!.vistaAtras = {
      id: 'l-x',
      destino: { tipo: 'celda', celda: { progresiva: 0, elementoClave: 'p-eje' } },
      valor: 1.5,
    }
    expect(estacionDeCelda(t, claveCelda(0, 'p-eje'))).toBe(0)
  })
})
