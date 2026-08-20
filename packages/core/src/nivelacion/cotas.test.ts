import { describe, expect, it } from 'vitest'
import { BM_1, campaniaEjemplo } from '../pruebas/libretaEjemplo'
import { calcularCotas, claveDestino } from './cotas'

describe('claveDestino', () => {
  it('distingue cada tipo de destino', () => {
    expect(claveDestino({ tipo: 'bm', bmId: 'bm-1' })).toBe('bm:bm-1')
    expect(claveDestino({ tipo: 'cambio', nombre: 'PC-1' })).toBe('cambio:PC-1')
    expect(
      claveDestino({ tipo: 'celda', celda: { progresiva: 20, elementoClave: 'EJE' } }),
    ).toBe('20|EJE')
    expect(
      claveDestino({ tipo: 'suelto', punto: { etiqueta: 'Buzón', offset: 1.2, notas: '' } }),
    ).toBe('suelto:Buzón')
  })
})

describe('calcularCotas', () => {
  it('calcula la cota instrumento de cada estación', () => {
    const resultado = calcularCotas(campaniaEjemplo(), [BM_1])
    expect(resultado.cotasInstrumento[0]).toBeCloseTo(3246.605, 6)
    expect(resultado.cotasInstrumento[1]).toBeCloseTo(3247.085, 6)
  })

  it('calcula la cota cruda de cada punto intermedio', () => {
    const resultado = calcularCotas(campaniaEjemplo(), [BM_1])
    const porClave = new Map(resultado.puntos.map((p) => [p.claveDestino, p.cotaCruda]))
    expect(porClave.get('0|EJE')).toBeCloseTo(3244.625, 6)
    expect(porClave.get('0|BOR-I')).toBeCloseTo(3244.56, 6)
    expect(porClave.get('20|EJE')).toBeCloseTo(3244.615, 6)
  })

  it('calcula la cota del punto de cambio y la usa en la estación siguiente', () => {
    const resultado = calcularCotas(campaniaEjemplo(), [BM_1])
    const pc = resultado.puntos.find((p) => p.claveDestino === 'cambio:PC-1')
    expect(pc?.cotaCruda).toBeCloseTo(3245.455, 6)
  })

  it('devuelve la cota de llegada del circuito', () => {
    const resultado = calcularCotas(campaniaEjemplo(), [BM_1])
    expect(resultado.cotaLlegada).toBeCloseTo(3245.175, 6)
  })

  it('registra a qué estación pertenece cada punto', () => {
    const resultado = calcularCotas(campaniaEjemplo(), [BM_1])
    const punto = resultado.puntos.find((p) => p.claveDestino === '20|EJE')
    expect(punto?.estacionIndice).toBe(1)
  })

  it('recalcula todo cuando cambia la cota del BM', () => {
    const bmCorregido = { ...BM_1, cota: 3245.28 }
    const resultado = calcularCotas(campaniaEjemplo(), [bmCorregido])
    const punto = resultado.puntos.find((p) => p.claveDestino === '0|EJE')
    expect(punto?.cotaCruda).toBeCloseTo(3244.725, 6)
  })

  it('avisa si el BM inicial no existe', () => {
    expect(() => calcularCotas(campaniaEjemplo(), [])).toThrow(
      'No se encontró el banco de nivel inicial de la campaña',
    )
  })

  it('avisa si una vista atrás apunta a un punto de cambio desconocido', () => {
    const campania = campaniaEjemplo()
    campania.estaciones[1]!.vistaAtras.destino = { tipo: 'cambio', nombre: 'PC-9' }
    expect(() => calcularCotas(campania, [BM_1])).toThrow(
      'La estación 2 arranca en PC-9, que no fue medido antes',
    )
  })
})
