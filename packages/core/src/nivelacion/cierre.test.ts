import { describe, expect, it } from 'vitest'
import { BM_1, tomaEjemplo } from '../pruebas/libretaEjemplo'
import { calcularCotas } from './cotas'
import { calcularCierre, calcularLongitudKAuto, calcularToleranciaMm } from './cierre'

describe('calcularToleranciaMm', () => {
  it('aplica T = e por raiz de K', () => {
    expect(calcularToleranciaMm(12, 0.36)).toBeCloseTo(7.2, 6)
    expect(calcularToleranciaMm(7, 1)).toBeCloseTo(7, 6)
    expect(calcularToleranciaMm(15, 4)).toBeCloseTo(30, 6)
  })

  it('devuelve cero si el circuito tiene longitud cero', () => {
    expect(calcularToleranciaMm(12, 0)).toBe(0)
  })

  it('rechaza una longitud negativa', () => {
    expect(() => calcularToleranciaMm(12, -1)).toThrow('La longitud del circuito no puede ser negativa')
  })
})

describe('calcularLongitudKAuto', () => {
  // La toma de ejemplo mide de 0+000 a 0+020: 20 m entre el primero y el
  // último punto medido, no el rango configurado de una calle (que ya no
  // existe): la longitud sale del propio recorrido de la toma.
  it('cuenta ida y vuelta en un circuito cerrado', () => {
    expect(calcularLongitudKAuto(tomaEjemplo(), 'cerrado')).toBeCloseTo(0.04, 6)
  })

  it('cuenta un solo recorrido en un enlace', () => {
    expect(calcularLongitudKAuto(tomaEjemplo(), 'enlace')).toBeCloseTo(0.02, 6)
  })

  it('cuenta un solo recorrido en un circuito abierto', () => {
    expect(calcularLongitudKAuto(tomaEjemplo(), 'abierto')).toBeCloseTo(0.02, 6)
  })

  it('sin ninguna progresiva medida, la longitud es cero', () => {
    const sinCeldas = { ...tomaEjemplo(), estaciones: [] }
    expect(calcularLongitudKAuto(sinCeldas, 'cerrado')).toBe(0)
  })
})

describe('calcularCierre', () => {
  it('calcula el error del circuito cerrado de ejemplo', () => {
    const campania = tomaEjemplo()
    const cotas = calcularCotas(campania, [BM_1])
    const cierre = calcularCierre(campania, [BM_1], cotas, 0.36)

    expect(cierre.errorMm).toBeCloseTo(-5, 6)
    expect(cierre.toleranciaMm).toBeCloseTo(7.2, 6)
    expect(cierre.pasa).toBe(true)
  })

  it('marca que no pasa cuando el error supera la tolerancia', () => {
    const campania = tomaEjemplo()
    campania.estaciones[1]!.vistaAdelante!.valor = 1.887
    const cotas = calcularCotas(campania, [BM_1])
    const cierre = calcularCierre(campania, [BM_1], cotas, 0.36)

    expect(cierre.errorMm).toBeCloseTo(18, 6)
    expect(cierre.pasa).toBe(false)
  })

  it('acepta un error exactamente igual a la tolerancia', () => {
    const campania = tomaEjemplo()
    campania.estaciones[1]!.vistaAdelante!.valor = 1.9122
    const cotas = calcularCotas(campania, [BM_1])
    const cierre = calcularCierre(campania, [BM_1], cotas, 0.36)

    expect(cierre.errorMm).toBeCloseTo(-7.2, 3)
    expect(cierre.pasa).toBe(true)
  })

  it('cierra por enlace contra un segundo BM', () => {
    const bm2 = { ...BM_1, id: 'bm-2', nombre: 'BM-2', cota: 3245.175 }
    const campania = tomaEjemplo()
    campania.cierre = { ...campania.cierre, tipo: 'enlace', bmFinalId: 'bm-2' }
    campania.estaciones[1]!.vistaAdelante!.destino = { tipo: 'bm', bmId: 'bm-2' }

    const cotas = calcularCotas(campania, [BM_1, bm2])
    const cierre = calcularCierre(campania, [BM_1, bm2], cotas, 0.18)

    expect(cierre.errorMm).toBeCloseTo(0, 6)
    expect(cierre.pasa).toBe(true)
  })

  it('no da veredicto si la última estación remata en un BM distinto del configurado como final', () => {
    const bm2 = { ...BM_1, id: 'bm-2', nombre: 'BM-2', cota: 3245.18 }
    const campania = tomaEjemplo()
    // El cierre sigue configurado contra bm-1, pero la última estación remató
    // en un BM distinto (bm-2): no es el cierre que se pidió verificar.
    campania.estaciones[1]!.vistaAdelante!.destino = { tipo: 'bm', bmId: 'bm-2' }

    const cotas = calcularCotas(campania, [BM_1, bm2])
    const cierre = calcularCierre(campania, [BM_1, bm2], cotas, 0.36)

    expect(cierre.pasa).toBeNull()
  })

  it('deja el circuito abierto sin veredicto', () => {
    const campania = tomaEjemplo()
    campania.cierre = { ...campania.cierre, tipo: 'abierto', bmFinalId: undefined }
    delete campania.estaciones[1]!.vistaAdelante

    const cotas = calcularCotas(campania, [BM_1])
    const cierre = calcularCierre(campania, [BM_1], cotas, 0.18)

    expect(cierre.errorMm).toBeNull()
    expect(cierre.toleranciaMm).toBeNull()
    expect(cierre.pasa).toBeNull()
  })
})
