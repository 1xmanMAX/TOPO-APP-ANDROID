import { describe, expect, it } from 'vitest'
import { analizarZona, areaPoligono, dentroDePoligono } from './zona'
import { triangular } from './triangulacion'
import { cono, grilla, plano } from './superficiesDePrueba'

const cuadrado = (x0: number, y0: number, x1: number, y1: number) => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
]

// L: el cuadrado 0..4 sin la esquina 2..4 × 2..4 → 12 m²
const ele = [
  { x: 0, y: 0 },
  { x: 4, y: 0 },
  { x: 4, y: 2 },
  { x: 2, y: 2 },
  { x: 2, y: 4 },
  { x: 0, y: 4 },
]

describe('areaPoligono', () => {
  it('área en planta, sin importar el sentido', () => {
    expect(areaPoligono(cuadrado(0, 0, 3, 2))).toBeCloseTo(6, 12)
    expect(areaPoligono([...cuadrado(0, 0, 3, 2)].reverse())).toBeCloseTo(6, 12)
    expect(areaPoligono(ele)).toBeCloseTo(12, 12)
  })
  it('menos de tres vértices: 0', () => {
    expect(areaPoligono([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(0)
  })
})

describe('dentroDePoligono', () => {
  it('polígono cóncavo', () => {
    expect(dentroDePoligono({ x: 1, y: 1 }, ele)).toBe(true)
    expect(dentroDePoligono({ x: 3, y: 3 }, ele)).toBe(false)
    expect(dentroDePoligono({ x: 1, y: 3 }, ele)).toBe(true)
  })
})

describe('analizarZona', () => {
  // plano z = 100.1 + 0.25 x sobre 0..10
  const sup = triangular(grilla(0, 10, 1, plano))

  it('prisma bajo un plano inclinado: volumen exacto respecto a una cota', () => {
    // zona 2..6 × 2..6 (16 m²), referencia 100.1: z − ref = 0.25 x, media en x = 4 → 1 m
    const r = analizarZona(sup, cuadrado(2, 2, 6, 6), { referencia: 100.1 })
    expect(r.areaPlanta).toBeCloseTo(16, 9)
    expect(r.areaConSuperficie).toBeCloseTo(16, 9)
    expect(r.areaSinSuperficie).toBeCloseTo(0, 9)
    expect(r.volumenCorte).toBeCloseTo(16, 9)
    expect(r.volumenRelleno).toBeCloseTo(0, 9)
    expect(r.cotaMin).toBeCloseTo(plano(2), 9)
    expect(r.cotaMax).toBeCloseTo(plano(6), 9)
    expect(r.cotaMedia).toBeCloseTo(plano(4), 9)
    expect(r.comprobado).toBe(true)
    expect(r.areaNoComprobada).toBeCloseTo(0, 9)
  })

  it('la referencia cruza la zona: corte y relleno por separado, sin cancelarse', () => {
    // referencia 101.1 → z − ref = 0.25 x − 1, cero en x = 4: 2 m³ de corte y 2 de relleno
    const r = analizarZona(sup, cuadrado(2, 2, 6, 6), { referencia: plano(4) })
    expect(r.volumenCorte).toBeCloseTo(2, 9)
    expect(r.volumenRelleno).toBeCloseTo(2, 9)
  })

  it('polígono cóncavo (L), en los dos sentidos', () => {
    // ∫ 0.25 x sobre la L = 2 + 3 = 5 m³
    for (const zona of [ele, [...ele].reverse()]) {
      const r = analizarZona(sup, zona, { referencia: 100.1 })
      expect(r.areaPlanta).toBeCloseTo(12, 9)
      expect(r.areaConSuperficie).toBeCloseTo(12, 9)
      expect(r.volumenCorte).toBeCloseTo(5, 9)
      expect(r.volumenRelleno).toBeCloseTo(0, 9)
    }
  })

  it('sin referencia: área y cotas, volúmenes en cero', () => {
    const r = analizarZona(sup, cuadrado(2, 2, 6, 6))
    expect(r.volumenCorte).toBe(0)
    expect(r.volumenRelleno).toBe(0)
    expect(r.cotaMedia).toBeCloseTo(plano(4), 9)
  })

  it('zona que sale de la superficie: se dice cuánta área no tiene terreno', () => {
    const r = analizarZona(sup, cuadrado(8, 8, 12, 12), { referencia: 100.1 })
    expect(r.areaPlanta).toBeCloseTo(16, 9)
    expect(r.areaConSuperficie).toBeCloseTo(4, 9)
    expect(r.areaSinSuperficie).toBeCloseTo(12, 9)
    // solo cuenta 8..10 × 8..10: ∫ 0.25 x = 0.25 · 18 · 2 = 9
    expect(r.volumenCorte).toBeCloseTo(9, 9)
  })

  it('zona entera fuera: sin datos, sin cotas', () => {
    const r = analizarZona(sup, cuadrado(20, 20, 22, 22), { referencia: 100 })
    expect(r.sinDatos).toBe(true)
    expect(r.cotaMin).toBeNull()
    expect(r.cotaMax).toBeNull()
    expect(r.cotaMedia).toBeNull()
    expect(r.volumenCorte).toBe(0)
  })

  it('un hueco de la superficie no cuenta como terreno', () => {
    const conHueco = triangular(grilla(0, 20, 1, plano).filter((q) => !(q.x > 7 && q.x < 13 && q.y > 7 && q.y < 13)))
    const r = analizarZona(conHueco, cuadrado(0, 0, 20, 20))
    // con el lado máximo por defecto (3 × 1.41 m) las esquinas del hueco se
    // cierran con triángulos de hasta 4.24 m: queda vacía la mitad del medio
    // (los 4 triángulos de 4.24 m de cada esquina): 18 de los 36 m²
    expect(r.areaSinSuperficie).toBeCloseTo(18, 9)
    expect(r.areaConSuperficie).toBeCloseTo(400 - 18, 9)
    // con un lado máximo más corto queda vacío casi todo el hueco
    const estricto = analizarZona(triangular(conHueco.puntos, { ladoMaximo: 2 }), cuadrado(0, 0, 20, 20))
    // con 2 m solo quedan los triángulos de las 4 esquinas (medio m² cada uno): 34 m²
    expect(estricto.areaSinSuperficie).toBeCloseTo(34, 9)
  })

  it('parte no comprobada: área y aviso', () => {
    // sin comprobar los puntos con x < 5: todo triángulo con x < 5 toca alguno
    const mixta = triangular(grilla(0, 10, 1, plano, (x) => x >= 5))
    const r = analizarZona(mixta, cuadrado(2, 2, 6, 6), { referencia: 100.1 })
    expect(r.comprobado).toBe(false)
    expect(r.areaNoComprobada).toBeCloseTo(12, 9)
    const solo = analizarZona(mixta, cuadrado(6, 2, 9, 6), { referencia: 100.1 })
    expect(solo.comprobado).toBe(true)
    expect(solo.areaNoComprobada).toBeCloseTo(0, 9)
  })

  describe('respecto a otra superficie', () => {
    it('contra un plano horizontal con otros puntos (grillas desfasadas): da lo mismo que contra la cota', () => {
      const fondo = triangular(grilla(-0.5, 10.5, 0.7, () => 100.1))
      const r = analizarZona(sup, cuadrado(2, 2, 6, 6), { referencia: fondo })
      expect(r.volumenCorte).toBeCloseTo(16, 9)
      expect(r.volumenRelleno).toBeCloseTo(0, 9)
    })

    it('superficie de referencia más arriba: todo relleno', () => {
      const arriba = triangular(grilla(0, 10, 2, (x) => plano(x) + 0.3))
      const r = analizarZona(sup, cuadrado(2, 2, 6, 6), { referencia: arriba })
      expect(r.volumenCorte).toBeCloseTo(0, 9)
      expect(r.volumenRelleno).toBeCloseTo(16 * 0.3, 9)
    })

    it('donde falta una de las dos superficies no se calcula volumen y se dice', () => {
      const chica = triangular(grilla(0, 4, 1, () => 100.1))
      const r = analizarZona(sup, cuadrado(2, 2, 6, 6), { referencia: chica })
      // solo 2..4 × 2..4 tiene las dos: ∫ 0.25 x = 0.25 · 6 · 2 = 3
      expect(r.volumenCorte).toBeCloseTo(3, 9)
      expect(r.areaConSuperficie).toBeCloseTo(4, 9)
      expect(r.areaSinSuperficie).toBeCloseTo(12, 9)
    })

    it('la referencia sin comprobar vuelve no comprobado el resultado', () => {
      const fondo = triangular(grilla(0, 10, 1, () => 100.1, () => false))
      const r = analizarZona(sup, cuadrado(2, 2, 6, 6), { referencia: fondo })
      expect(r.comprobado).toBe(false)
      expect(r.areaNoComprobada).toBeCloseTo(16, 9)
    })
  })

  it('cono: volumen sobre la base cercano al de un cono (1/3 · π r² h)', () => {
    const sup2 = triangular(cono(110, 10))
    const circulo = Array.from({ length: 360 }, (_, k) => ({
      x: 12 * Math.cos((2 * Math.PI * k) / 360),
      y: 12 * Math.sin((2 * Math.PI * k) / 360),
    }))
    const r = analizarZona(sup2, circulo, { referencia: 100 })
    const esperado = (Math.PI * 100 * 10) / 3
    expect(Math.abs(r.volumenCorte - esperado) / esperado).toBeLessThan(0.02)
    expect(r.cotaMax).toBeCloseTo(110, 9)
  })
})

describe('analizarZona con coordenadas UTM (no se pierden cifras)', () => {
  const E = 350000.123
  const N = 8600000.456
  const mover = <T extends { x: number; y: number }>(lista: T[], dx: number, dy: number): T[] =>
    lista.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy }))
  // el mismo plano z = 100.1 + 0.25 · (x local), corrido a E, N
  const local = triangular(grilla(0, 10, 1, plano))
  const utm = triangular(mover(grilla(0, 10, 1, plano), E, N))
  const zonaUtm = (x0: number, y0: number, x1: number, y1: number) => mover(cuadrado(x0, y0, x1, y1), E, N)

  it('prisma bajo el plano: mismo volumen, cota media y área que en local', () => {
    const r = analizarZona(utm, zonaUtm(2, 2, 6, 6), { referencia: 100.1 })
    expect(r.areaPlanta).toBeCloseTo(16, 6)
    expect(r.areaConSuperficie).toBeCloseTo(16, 6)
    expect(r.volumenCorte).toBeCloseTo(16, 6)
    expect(r.volumenRelleno).toBeCloseTo(0, 6)
    expect(r.cotaMedia).toBeCloseTo(plano(4), 6)
    expect(r.cotaMin).toBeCloseTo(plano(2), 6)
    expect(r.cotaMax).toBeCloseTo(plano(6), 6)
  })

  it('la referencia cruza la zona: corte 2.88 y relleno 1.28 m³, como a mano', () => {
    // z − 101 = 0.25 x − 0.9, cero en x = 3.6: corte ∫3.6..6, relleno ∫2..3.6, por 4 m de ancho
    for (const [s, z] of [
      [local, cuadrado(2, 2, 6, 6)],
      [utm, zonaUtm(2, 2, 6, 6)],
    ] as const) {
      const r = analizarZona(s, z, { referencia: 101 })
      expect(r.volumenCorte).toBeCloseTo(2.88, 6)
      expect(r.volumenRelleno).toBeCloseTo(1.28, 6)
    }
  })

  it('plano de 40 × 40 m con E 350 000 / N 8 500 000: corte 4500 y relleno 500 m³, como a mano', () => {
    const grande = triangular(mover(grilla(0, 40, 1, plano), 350000, 8500000))
    const r = analizarZona(grande, mover(cuadrado(0, 0, 40, 40), 350000, 8500000), { referencia: 102.6 })
    // z − 102.6 = 0.25 x − 2.5, cero en x = 10: corte ∫10..40, relleno ∫0..10, por 40 m de ancho
    const corte = 40 * (0.125 * (40 * 40 - 10 * 10) - 2.5 * 30)
    const relleno = 40 * (2.5 * 10 - 0.125 * 100)
    expect(r.volumenCorte).toBeCloseTo(corte, 5)
    expect(r.volumenRelleno).toBeCloseTo(relleno, 5)
    expect(r.areaConSuperficie).toBeCloseTo(1600, 6)
  })

  it('contra otra superficie en UTM: 16 × 0.3 m³ de relleno', () => {
    const arriba = triangular(mover(grilla(0, 10, 2, (x) => plano(x) + 0.3), E, N))
    const r = analizarZona(utm, zonaUtm(2, 2, 6, 6), { referencia: arriba })
    expect(r.volumenCorte).toBeCloseTo(0, 6)
    expect(r.volumenRelleno).toBeCloseTo(4.8, 6)
  })

  it('el área de un polígono en UTM es la misma que en local', () => {
    expect(areaPoligono(mover(ele, E, N))).toBeCloseTo(12, 6)
  })
})

describe('analizarZona sin datos no se da por comprobada', () => {
  it('zona fuera de la superficie: sinDatos y comprobado false', () => {
    const sup = triangular(grilla(0, 10, 1, plano, () => false))
    const r = analizarZona(sup, cuadrado(20, 20, 22, 22), { referencia: 100 })
    expect(r.sinDatos).toBe(true)
    expect(r.comprobado).toBe(false)
    const conTodo = triangular(grilla(0, 10, 1, plano))
    expect(analizarZona(conTodo, cuadrado(20, 20, 22, 22)).comprobado).toBe(false)
  })
})
