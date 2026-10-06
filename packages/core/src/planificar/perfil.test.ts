import { describe, expect, it } from 'vitest'
import {
  cotaEn,
  cotaEnPerfilValido,
  formatearPendiente,
  primerVerticeDespues,
  pendientes,
  quiebres,
  quiebresDetallados,
  revisarPerfil,
  type Perfil,
} from './perfil'

/** Pasaje Las Lomas: sube al +8.20 % y, desde la 0+060, al +7.40 %. */
const lasLomas: Perfil = [
  { progresiva: 0, cota: 3243.5 },
  { progresiva: 60, cota: 3248.42 },
  { progresiva: 120, cota: 3252.86 },
]

describe('revisarPerfil', () => {
  it('un perfil bien formado no tiene problemas', () => {
    expect(revisarPerfil(lasLomas)).toEqual([])
  })

  it('con un solo vértice no hay pendiente que seguir', () => {
    expect(revisarPerfil([{ progresiva: 0, cota: 3243.5 }])).toEqual([
      'el perfil necesita al menos dos vértices (tiene 1)',
    ])
  })

  it('dice cada vértice que no avanza o que no es un número, sin descartarlo en silencio', () => {
    const problemas = revisarPerfil([
      { progresiva: 0, cota: 3243.5 },
      { progresiva: 0, cota: 3244 },
      { progresiva: 40, cota: Number.NaN },
    ])

    expect(problemas).toEqual([
      'el vértice 2 (0+000) no avanza: su progresiva debe ser mayor que la del vértice 1 (0+000)',
      'el vértice 3 tiene una cota que no es un número',
    ])
  })
})

describe('cotaEn', () => {
  it('interpola en línea recta entre vértices', () => {
    // 0+030: 3243.500 + 0.082·30 = 3243.500 + 2.460 = 3245.960
    expect(cotaEn(lasLomas, 30)).toBeCloseTo(3245.96, 9)
    // 0+090: 3248.420 + 0.074·30 = 3248.420 + 2.220 = 3250.640
    expect(cotaEn(lasLomas, 90)).toBeCloseTo(3250.64, 9)
  })

  it('en los vértices devuelve su cota tal cual', () => {
    expect(cotaEn(lasLomas, 0)).toBe(3243.5)
    expect(cotaEn(lasLomas, 60)).toBe(3248.42)
    expect(cotaEn(lasLomas, 120)).toBe(3252.86)
  })

  it('fuera del perfil no inventa: avisa', () => {
    expect(() => cotaEn(lasLomas, 130)).toThrow(
      'La progresiva 0+130 está fuera del perfil (0+000 a 0+120)',
    )
    expect(() => cotaEn(lasLomas, -5)).toThrow(RangeError)
  })

  it('con una progresiva que no es número avisa en vez de dar la cota del último vértice', () => {
    // Con NaN toda comparación es falsa: antes caía al final y devolvía 3252.860.
    expect(() => cotaEn(lasLomas, Number.NaN)).toThrow(RangeError)
    expect(() => cotaEn(lasLomas, Number.POSITIVE_INFINITY)).toThrow(RangeError)
  })
})

describe('cotaEnPerfilValido y primerVerticeDespues', () => {
  it('dan lo mismo que cotaEn en un perfil de muchos vértices', () => {
    // Zigzag de 201 vértices cada 5 m: cota = 100 + (i impar ? 1 : 0).
    // En la 0+012.5 (entre i=2 → 100 e i=3 → 101, a la mitad): 100.5.
    const zigzag: Perfil = Array.from({ length: 201 }, (_, i) => ({ progresiva: i * 5, cota: 100 + (i % 2) }))
    expect(cotaEnPerfilValido(zigzag, 12.5)).toBeCloseTo(100.5, 12)
    // Referencia sin búsqueda binaria: tramo k = floor(p/5), fracción t = p/5 − k.
    for (let p = 0; p < 1000; p += 0.37) {
      const k = Math.floor(p / 5)
      const t = p / 5 - k
      const esperada = 100 + (k % 2) + t * ((k + 1) % 2 - (k % 2))
      expect(cotaEnPerfilValido(zigzag, p)).toBeCloseTo(esperada, 9)
      expect(cotaEn(zigzag, p)).toBe(cotaEnPerfilValido(zigzag, p))
    }
    // Primer vértice con progresiva > 12.5 es el de la 0+015 (índice 3); > 15, el de la 0+020 (4).
    expect(primerVerticeDespues(zigzag, 12.5)).toBe(3)
    expect(primerVerticeDespues(zigzag, 15)).toBe(4)
    expect(primerVerticeDespues(zigzag, 1000)).toBe(201)
  })
})

describe('pendientes', () => {
  it('da la pendiente de cada tramo en por ciento, con su signo', () => {
    // (3248.420 − 3243.500) / 60 = 4.920 / 60 = 0.082 → +8.20 %
    // (3252.860 − 3248.420) / 60 = 4.440 / 60 = 0.074 → +7.40 %
    const tramos = pendientes(lasLomas)

    expect(tramos).toHaveLength(2)
    expect(tramos[0]).toMatchObject({ desde: 0, hasta: 60, cotaDesde: 3243.5, cotaHasta: 3248.42 })
    expect(tramos[0]!.pendientePorcentaje).toBeCloseTo(8.2, 9)
    expect(tramos[1]!.pendientePorcentaje).toBeCloseTo(7.4, 9)
  })

  it('una bajada da pendiente negativa', () => {
    // (3240.000 − 3243.000) / 50 = −0.060 → −6.00 %
    const bajada: Perfil = [
      { progresiva: 0, cota: 3243 },
      { progresiva: 50, cota: 3240 },
    ]
    expect(pendientes(bajada)[0]!.pendientePorcentaje).toBeCloseTo(-6, 9)
  })
})

describe('quiebres', () => {
  it('Las Lomas quiebra en la 0+060: de +8.20 % a +7.40 % (0.80 puntos ≥ 0.50)', () => {
    expect(quiebres(lasLomas)).toEqual([60])

    const [quiebre] = quiebresDetallados(lasLomas)
    expect(quiebre!.progresiva).toBe(60)
    expect(quiebre!.cota).toBe(3248.42)
    expect(quiebre!.pendienteAntes).toBeCloseTo(8.2, 9)
    expect(quiebre!.pendienteDespues).toBeCloseTo(7.4, 9)
  })

  it('un cambio menor que el umbral no es quiebre', () => {
    // +2.00 % → +2.30 %: cambia 0.30 puntos, menos que 0.50
    const casiRecta: Perfil = [
      { progresiva: 0, cota: 100 },
      { progresiva: 50, cota: 101 },
      { progresiva: 100, cota: 102.15 },
    ]
    expect(quiebres(casiRecta)).toEqual([])
    // Con un umbral de 0.20 puntos, sí lo es.
    expect(quiebres(casiRecta, 0.2)).toEqual([50])
  })

  it('un cambio justo igual al umbral cuenta como quiebre', () => {
    // +1.00 % → +1.50 %: 0.50 puntos exactos
    const perfil: Perfil = [
      { progresiva: 0, cota: 100 },
      { progresiva: 100, cota: 101 },
      { progresiva: 200, cota: 102.5 },
    ]
    expect(quiebres(perfil)).toEqual([100])
  })

  it('una cresta (sube y luego baja) es quiebre', () => {
    // +5.00 % → −3.00 %: 8 puntos
    const cresta: Perfil = [
      { progresiva: 0, cota: 100 },
      { progresiva: 40, cota: 102 },
      { progresiva: 80, cota: 100.8 },
    ]
    expect(quiebres(cresta)).toEqual([40])
  })
})

describe('formatearPendiente', () => {
  it('lleva siempre el signo y dos decimales', () => {
    expect(formatearPendiente(8.2)).toBe('+8.20 %')
    expect(formatearPendiente(-7.4)).toBe('-7.40 %')
    expect(formatearPendiente(0)).toBe('0.00 %')
    // El punto flotante de 4.92/60·100 no debe asomar.
    expect(formatearPendiente(((3248.42 - 3243.5) / 60) * 100)).toBe('+8.20 %')
  })
})
