import { describe, expect, it } from 'vitest'
import {
  areasEntreSuperficies,
  esponjamiento,
  viajesDeVolquete,
  volumenesPorAreasMedias,
} from './volumenes'

describe('areasEntreSuperficies', () => {
  it('todo en corte: un rectángulo de 10 m por 0.20 m', () => {
    // arriba 0.20 m sobre abajo en todo el ancho: 10 × 0.20 = 2.000 m²
    const r = areasEntreSuperficies([
      { offset: -5, cotaArriba: 100.2, cotaAbajo: 100 },
      { offset: 5, cotaArriba: 100.2, cotaAbajo: 100 },
    ])
    expect(r.corte).toBe(2)
    expect(r.relleno).toBe(0)
    expect(r.sinDatos).toBe(false)
  })

  it('todo en relleno: trapecio de 0.10 y 0.30 m de alto en 4 m', () => {
    // diferencias −0.10 y −0.30 → (0.10 + 0.30) / 2 × 4 = 0.800 m² de relleno
    const r = areasEntreSuperficies([
      { offset: 0, cotaArriba: 99.9, cotaAbajo: 100 },
      { offset: 4, cotaArriba: 99.7, cotaAbajo: 100 },
    ])
    expect(r.corte).toBe(0)
    expect(r.relleno).toBe(0.8)
  })

  it('parte el trapecio donde las superficies se cruzan', () => {
    // diferencias +0.20 en 0 y −0.20 en 4: se cruzan en 2 m.
    // corte = 0.20 × 2 / 2 = 0.200 m²; relleno = 0.20 × 2 / 2 = 0.200 m²
    // (sin partir saldría (0.20 − 0.20)/2 × 4 = 0, que es falso)
    const r = areasEntreSuperficies([
      { offset: 0, cotaArriba: 100.2, cotaAbajo: 100 },
      { offset: 4, cotaArriba: 99.8, cotaAbajo: 100 },
    ])
    expect(r.corte).toBe(0.2)
    expect(r.relleno).toBe(0.2)
  })

  it('cruce desigual: +0.30 y −0.10 en 4 m', () => {
    // el cruce está a 0.30 / (0.30 + 0.10) × 4 = 3 m del primer punto
    // corte = 0.30 × 3 / 2 = 0.450 m²; relleno = 0.10 × 1 / 2 = 0.050 m²
    const r = areasEntreSuperficies([
      { offset: 0, cotaArriba: 100.3, cotaAbajo: 100 },
      { offset: 4, cotaArriba: 99.9, cotaAbajo: 100 },
    ])
    expect(r.corte).toBe(0.45)
    expect(r.relleno).toBe(0.05)
  })

  it('ordena por offset aunque lleguen desordenados', () => {
    // mismos datos del rectángulo de 2.000 m², con un punto en medio
    const r = areasEntreSuperficies([
      { offset: 5, cotaArriba: 100.2, cotaAbajo: 100 },
      { offset: -5, cotaArriba: 100.2, cotaAbajo: 100 },
      { offset: 0, cotaArriba: 100.2, cotaAbajo: 100 },
    ])
    expect(r.corte).toBe(2)
    expect(r.descartados).toBe(0)
  })

  it('un punto sin número no se suma pero se cuenta', () => {
    const r = areasEntreSuperficies([
      { offset: -5, cotaArriba: 100.2, cotaAbajo: 100 },
      { offset: 0, cotaArriba: Number.NaN, cotaAbajo: 100 },
      { offset: 5, cotaArriba: 100.2, cotaAbajo: 100 },
    ])
    expect(r.corte).toBe(2)
    expect(r.descartados).toBe(1)
  })

  it('con menos de dos puntos no hay área, y se dice que faltan datos', () => {
    // 0 m² aquí no es «no hay movimiento de tierra» sino «no se pudo calcular»
    expect(areasEntreSuperficies([{ offset: 0, cotaArriba: 1, cotaAbajo: 0 }])).toEqual({
      corte: 0,
      relleno: 0,
      descartados: 0,
      sinDatos: true,
    })
  })

  it('dos puntos de los que uno no tiene número: sin datos', () => {
    const r = areasEntreSuperficies([
      { offset: 0, cotaArriba: 1, cotaAbajo: 0 },
      { offset: 5, cotaArriba: Number.NaN, cotaAbajo: 0 },
    ])
    expect(r.sinDatos).toBe(true)
    expect(r.descartados).toBe(1)
  })
})

describe('volumenesPorAreasMedias', () => {
  it('áreas medias entre tres secciones, desordenadas', () => {
    // 0+000 → 0+020: corte (2 + 4)/2 × 20 = 60; relleno (0 + 1)/2 × 20 = 10
    // 0+020 → 0+040: corte (4 + 0)/2 × 20 = 40; relleno (1 + 3)/2 × 20 = 40
    // totales: corte 100, relleno 50
    const r = volumenesPorAreasMedias([
      { progresiva: 20, corte: 4, relleno: 1 },
      { progresiva: 0, corte: 2, relleno: 0 },
      { progresiva: 40, corte: 0, relleno: 3 },
    ])
    expect(r.tramos).toEqual([
      { desde: 0, hasta: 20, volCorte: 60, volRelleno: 10, hueco: false },
      { desde: 20, hasta: 40, volCorte: 40, volRelleno: 40, hueco: false },
    ])
    expect(r.totalCorte).toBe(100)
    expect(r.totalRelleno).toBe(50)
    expect(r.huecos).toEqual([])
    expect(r.descartadas).toEqual([])
    expect(r.sinDatos).toBe(false)
    // sin decir lo contrario, no está comprobado
    expect(r.comprobado).toBe(false)
  })

  it('un tramo más largo que el intervalo se calcula pero se informa como hueco', () => {
    // 0+020 → 0+060 son 40 m sin sección (intervalo de fábrica 20 m)
    // volumen = (1 + 1)/2 × 40 = 40 m³, marcado como hueco
    const r = volumenesPorAreasMedias([
      { progresiva: 0, corte: 1, relleno: 0 },
      { progresiva: 20, corte: 1, relleno: 0 },
      { progresiva: 60, corte: 1, relleno: 0 },
    ])
    expect(r.tramos[1]).toEqual({ desde: 20, hasta: 60, volCorte: 40, volRelleno: 0, hueco: true })
    expect(r.huecos).toEqual([{ desde: 20, hasta: 60, longitud: 40, motivo: 'largo', sinSeccion: [] }])
  })

  it('secciones a 20 m con decimales no son hueco (32.2 − 12.2 da 20.000000000000004)', () => {
    const r = volumenesPorAreasMedias([
      { progresiva: 12.2, corte: 1, relleno: 0 },
      { progresiva: 32.2, corte: 1, relleno: 0 },
    ])
    // (1 + 1)/2 × 20 = 20 m³
    expect(r.tramos).toEqual([{ desde: 12.2, hasta: 32.2, volCorte: 20, volRelleno: 0, hueco: false }])
    expect(r.huecos).toEqual([])
  })

  it('una sección intermedia sin número no se tapa: el tramo que la cruza es hueco', () => {
    // 0+010 se cae; queda 0+000 → 0+020: (2 + 1)/2 × 20 = 30 m³
    // mide 20 m (no pasa el intervalo) pero le falta la sección de 0+010
    const r = volumenesPorAreasMedias([
      { progresiva: 0, corte: 2, relleno: 0 },
      { progresiva: 10, corte: Number.NaN, relleno: 0 },
      { progresiva: 20, corte: 1, relleno: 0 },
    ])
    expect(r.tramos).toEqual([{ desde: 0, hasta: 20, volCorte: 30, volRelleno: 0, hueco: true }])
    expect(r.huecos).toEqual([
      { desde: 0, hasta: 20, longitud: 20, motivo: 'seccionDescartada', sinSeccion: [10] },
    ])
    expect(r.descartadas).toEqual([{ indice: 1, progresiva: 10, motivo: 'area sin numero' }])
  })

  it('un área negativa no resta del metrado: se descarta con su motivo', () => {
    // queda 0+000 → 0+020: (1 + 1)/2 × 20 = 20 m³ (y no (1 − 5)/2 × 10 + (−5 + 1)/2 × 10 = −40)
    const r = volumenesPorAreasMedias([
      { progresiva: 0, corte: 1, relleno: 0 },
      { progresiva: 10, corte: -5, relleno: 0 },
      { progresiva: 20, corte: 1, relleno: 0 },
    ])
    expect(r.totalCorte).toBe(20)
    expect(r.descartadas).toEqual([{ indice: 1, progresiva: 10, motivo: 'area negativa' }])
    expect(r.huecos[0]!.sinSeccion).toEqual([10])
  })

  it('una sección sin progresiva se lista con su índice', () => {
    const r = volumenesPorAreasMedias([
      { progresiva: 0, corte: 1, relleno: 0 },
      { progresiva: Number.NaN, corte: 1, relleno: 0 },
      { progresiva: 20, corte: 1, relleno: 0 },
    ])
    expect(r.descartadas).toEqual([{ indice: 1, progresiva: null, motivo: 'sin progresiva' }])
    // no se sabe dónde iba: no puede marcar un tramo
    expect(r.huecos).toEqual([])
  })

  it('el intervalo se puede cambiar', () => {
    const r = volumenesPorAreasMedias(
      [
        { progresiva: 0, corte: 1, relleno: 0 },
        { progresiva: 40, corte: 1, relleno: 0 },
      ],
      { intervaloMaximo: 50 },
    )
    expect(r.huecos).toEqual([])
  })

  it('el intervalo tiene que ser mayor que cero', () => {
    expect(() => volumenesPorAreasMedias([], { intervaloMaximo: 0 })).toThrow(RangeError)
    expect(() => volumenesPorAreasMedias([], { intervaloMaximo: Number.NaN })).toThrow(RangeError)
  })

  it('dos secciones en la misma progresiva: se usa la primera y se avisa', () => {
    // 0+000 → 0+010 con la primera de 0+010: (2 + 2)/2 × 10 = 20
    const r = volumenesPorAreasMedias([
      { progresiva: 0, corte: 2, relleno: 0 },
      { progresiva: 10, corte: 2, relleno: 0 },
      { progresiva: 10, corte: 9, relleno: 0 },
    ])
    expect(r.totalCorte).toBe(20)
    expect(r.duplicadas).toEqual([10])
  })

  it('una sola sección no da volumen, y se dice que faltan datos', () => {
    const r = volumenesPorAreasMedias([{ progresiva: 0, corte: 2, relleno: 0 }])
    expect(r.tramos).toEqual([])
    expect(r.totalCorte).toBe(0)
    expect(r.sinDatos).toBe(true)
  })

  it('ninguna sección: sin datos', () => {
    expect(volumenesPorAreasMedias([]).sinDatos).toBe(true)
  })

  it('las secciones que perdieron puntos se listan como incompletas', () => {
    // el aviso de areasEntreSuperficies (descartados) pasa al metrado
    const r = volumenesPorAreasMedias([
      { progresiva: 0, corte: 1, relleno: 0 },
      { progresiva: 10, corte: 1, relleno: 0, descartados: 2 },
      { progresiva: 20, corte: 1, relleno: 0, descartados: 0 },
    ])
    expect(r.seccionesIncompletas).toEqual([10])
  })

  it('la marca de comprobado pasa tal cual al resultado', () => {
    expect(volumenesPorAreasMedias([], { comprobado: true }).comprobado).toBe(true)
  })
})

describe('esponjamiento y volquetes', () => {
  it('esponjamiento multiplica por el factor', () => {
    // 100 m³ en banco × 1.25 = 125 m³ sueltos
    expect(esponjamiento(100, 1.25)).toBe(125)
  })

  it('el factor tiene que ser positivo', () => {
    expect(() => esponjamiento(100, 0)).toThrow(RangeError)
  })

  it('el volumen tiene que ser un número', () => {
    expect(() => esponjamiento(Number.NaN, 1.2)).toThrow(RangeError)
  })

  it('los viajes se redondean hacia arriba', () => {
    // 125 / 15 = 8.33 → 9 viajes (el último va a medias, pero va)
    expect(viajesDeVolquete(125, 15)).toBe(9)
    // 30 / 15 = 2 exacto → 2, sin un viaje de más por el punto flotante
    expect(viajesDeVolquete(30, 15)).toBe(2)
    // 2.1 / 0.7 da 3.0000000000000004 en flotante: son 3 viajes, no 4
    expect(viajesDeVolquete(2.1, 0.7)).toBe(3)
    expect(viajesDeVolquete(0, 15)).toBe(0)
  })

  it('la capacidad tiene que ser positiva', () => {
    expect(() => viajesDeVolquete(10, 0)).toThrow(RangeError)
  })
})
