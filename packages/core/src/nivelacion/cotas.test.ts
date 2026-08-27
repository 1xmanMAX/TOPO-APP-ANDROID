import { describe, expect, it } from 'vitest'
import { BM_1, tomaEjemplo } from '../pruebas/libretaEjemplo'
import { calcularCotas, claveDestino } from './cotas'
import type { Toma } from '../modelo/tipos'

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
    const resultado = calcularCotas(tomaEjemplo(), [BM_1])
    expect(resultado.cotasInstrumento[0]).toBeCloseTo(3246.605, 6)
    expect(resultado.cotasInstrumento[1]).toBeCloseTo(3247.085, 6)
  })

  it('calcula la cota cruda de cada punto intermedio', () => {
    const resultado = calcularCotas(tomaEjemplo(), [BM_1])
    const porClave = new Map(resultado.puntos.map((p) => [p.claveDestino, p.cotaCruda]))
    expect(porClave.get('0|EJE')).toBeCloseTo(3244.625, 6)
    expect(porClave.get('0|BOR-I')).toBeCloseTo(3244.56, 6)
    expect(porClave.get('20|EJE')).toBeCloseTo(3244.615, 6)
  })

  it('calcula la cota del punto de cambio y la usa en la estación siguiente', () => {
    const resultado = calcularCotas(tomaEjemplo(), [BM_1])
    const pc = resultado.puntos.find((p) => p.claveDestino === 'cambio:PC-1')
    expect(pc?.cotaCruda).toBeCloseTo(3245.455, 6)
  })

  it('devuelve la cota de llegada del circuito', () => {
    const resultado = calcularCotas(tomaEjemplo(), [BM_1])
    expect(resultado.cotaLlegada).toBeCloseTo(3245.175, 6)
  })

  it('registra a qué estación pertenece cada punto', () => {
    const resultado = calcularCotas(tomaEjemplo(), [BM_1])
    const punto = resultado.puntos.find((p) => p.claveDestino === '20|EJE')
    expect(punto?.estacionIndice).toBe(1)
  })

  it('recalcula todo cuando cambia la cota del BM', () => {
    const bmCorregido = { ...BM_1, cota: 3245.28 }
    const resultado = calcularCotas(tomaEjemplo(), [bmCorregido])
    const punto = resultado.puntos.find((p) => p.claveDestino === '0|EJE')
    expect(punto?.cotaCruda).toBeCloseTo(3244.725, 6)
  })

  it('avisa si el BM inicial no existe', () => {
    expect(() => calcularCotas(tomaEjemplo(), [])).toThrow(
      'No se encontró el banco de nivel inicial de la campaña',
    )
  })

  it('avisa si una vista atrás apunta a un punto de cambio desconocido', () => {
    const campania = tomaEjemplo()
    campania.estaciones[1]!.vistaAtras.destino = { tipo: 'cambio', nombre: 'PC-9' }
    expect(() => calcularCotas(campania, [BM_1])).toThrow(
      'La estación 2 arranca en PC-9, que no fue medido antes',
    )
  })

  it('avisa si dos puntos de cambio se llaman igual', () => {
    const campania = tomaEjemplo()
    campania.estaciones[1]!.vistaAdelante!.destino = { tipo: 'cambio', nombre: 'PC-1' }
    expect(() => calcularCotas(campania, [BM_1])).toThrow(
      'El punto de cambio PC-1 está repetido: dos estaciones distintas lo usan como punto de llegada. Renombra uno de los dos.',
    )
  })

  it('una visada intermedia a un BM no fija la cota de llegada', () => {
    // Circuito de 3 estaciones: la segunda pasa cerca del BM inicial y toma
    // una visada de control contra él, pero el circuito sigue: la tercera
    // estación remata en un punto de cambio, no en el BM de cierre.
    const campania: Toma = {
      ...tomaEjemplo(),
      estaciones: [
        {
          id: 'e-1',
          vistaAtras: { id: 'l-1', destino: { tipo: 'bm', bmId: 'bm-1' }, valor: 1.425 },
          intermedias: [],
          vistaAdelante: { id: 'l-2', destino: { tipo: 'cambio', nombre: 'PC-1' }, valor: 1.15 },
        },
        {
          id: 'e-2',
          vistaAtras: { id: 'l-3', destino: { tipo: 'cambio', nombre: 'PC-1' }, valor: 1.63 },
          intermedias: [],
          // Visada de control a mitad de recorrido: no es la última estación.
          vistaAdelante: { id: 'l-4', destino: { tipo: 'bm', bmId: 'bm-1' }, valor: 1.91 },
        },
        {
          id: 'e-3',
          vistaAtras: { id: 'l-5', destino: { tipo: 'bm', bmId: 'bm-1' }, valor: 1.5 },
          intermedias: [],
          vistaAdelante: { id: 'l-6', destino: { tipo: 'cambio', nombre: 'PC-2' }, valor: 1.2 },
        },
      ],
    }

    const resultado = calcularCotas(campania, [BM_1])
    expect(resultado.cotaLlegada).toBeNull()
  })

  it('una lectura de 0 no produce punto', () => {
    const campania = tomaEjemplo()
    campania.estaciones[0]!.intermedias[0]!.valor = 0
    const resultado = calcularCotas(campania, [BM_1])
    expect(resultado.puntos.find((p) => p.claveDestino === '0|EJE')).toBeUndefined()
  })

  it('una lectura de 14.230 no produce punto', () => {
    const campania = tomaEjemplo()
    campania.estaciones[0]!.intermedias[0]!.valor = 14.23
    const resultado = calcularCotas(campania, [BM_1])
    expect(resultado.puntos.find((p) => p.claveDestino === '0|EJE')).toBeUndefined()
  })

  it('una vista atrás no usable deja esa estación sin cotas, sin lanzar', () => {
    const campania = tomaEjemplo()
    campania.estaciones[1]!.vistaAtras.valor = 0
    let resultado: ReturnType<typeof calcularCotas> | undefined
    expect(() => {
      resultado = calcularCotas(campania, [BM_1])
    }).not.toThrow()
    expect(Number.isNaN(resultado!.cotasInstrumento[1])).toBe(true)
    expect(resultado!.puntos.some((p) => p.estacionIndice === 1)).toBe(false)
  })

  it('una vista atrás que apunta a un punto de cambio pendiente de lectura no lanza y conserva las cotas anteriores', () => {
    // Es justo lo que pasa al trasladar el instrumento: la vista adelante al
    // punto de cambio queda en 0 (pendiente) hasta que se teclea la lectura.
    const campania = tomaEjemplo()
    campania.estaciones[0]!.vistaAdelante!.valor = 0

    let resultado: ReturnType<typeof calcularCotas> | undefined
    expect(() => {
      resultado = calcularCotas(campania, [BM_1])
    }).not.toThrow()

    expect(Number.isNaN(resultado!.cotasInstrumento[1])).toBe(true)
    expect(resultado!.cotasInstrumento[0]).toBeCloseTo(3246.605, 6)
    expect(resultado!.puntos.some((p) => p.claveDestino === '0|EJE')).toBe(true)
    expect(resultado!.puntos.some((p) => p.claveDestino === '0|BOR-I')).toBe(true)
  })

  it('una vista atrás que apunta a un punto que nunca fue destino de nadie sí lanza', () => {
    const campania = tomaEjemplo()
    campania.estaciones[1]!.vistaAtras.destino = { tipo: 'cambio', nombre: 'PC-9' }
    expect(() => calcularCotas(campania, [BM_1])).toThrow(
      'La estación 2 arranca en PC-9, que no fue medido antes',
    )
  })
})
