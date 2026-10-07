import { describe, expect, it } from 'vitest'
import { curvasDeNivel, type Curva } from './curvas'
import { triangular } from './triangulacion'
import { cono, grilla, nubeAlAzar, plano } from './superficiesDePrueba'

const largo = (c: Curva): number => {
  let l = 0
  for (let i = 1; i < c.puntos.length; i++) {
    const a = c.puntos[i - 1]!
    const b = c.puntos[i]!
    l += Math.hypot(b.x - a.x, b.y - a.y)
  }
  return l
}

describe('curvasDeNivel', () => {
  describe('plano inclinado (sube 0.25 m por metro hacia el este)', () => {
    const sup = triangular(grilla(0, 10, 1, plano))
    const r = curvasDeNivel(sup, { intervalo: 0.5, cadaMaestra: 2 })

    it('una curva por cota, recta, abierta y a la distancia exacta', () => {
      // cotas 100.1 a 102.6: curvas 100.5, 101, 101.5, 102, 102.5
      expect(r.curvas.map((c) => c.cota)).toEqual([100.5, 101, 101.5, 102, 102.5])
      for (const c of r.curvas) {
        const xEsperada = (c.cota - 100.1) / 0.25
        expect(c.cerrada).toBe(false)
        for (const q of c.puntos) expect(q.x).toBeCloseTo(xEsperada, 9)
        // va de un borde al otro, de y = 0 a y = 10
        const ys = c.puntos.map((q) => q.y).sort((a, b) => a - b)
        expect(ys[0]).toBeCloseTo(0, 9)
        expect(ys[ys.length - 1]).toBeCloseTo(10, 9)
        expect(largo(c)).toBeCloseTo(10, 9)
      }
      // paralelas: 0.5 m de cota / 0.25 de pendiente = 2 m entre curvas
      for (let i = 1; i < r.curvas.length; i++) {
        expect(r.curvas[i]!.puntos[0]!.x - r.curvas[i - 1]!.puntos[0]!.x).toBeCloseTo(2, 9)
      }
    })

    it('maestras cada 2 curvas: las de metro entero', () => {
      expect(r.curvas.filter((c) => c.maestra).map((c) => c.cota)).toEqual([101, 102])
    })

    it('todo comprobado: cada tramo y la curva', () => {
      for (const c of r.curvas) {
        expect(c.comprobada).toBe(true)
        expect(c.tramosComprobados).toHaveLength(c.puntos.length - 1)
        expect(c.tramosComprobados.every(Boolean)).toBe(true)
      }
    })

    it('rótulos sobre la curva, en las maestras, legibles (ángulo entre −90° y 90°)', () => {
      for (const c of r.curvas) {
        if (!c.maestra) {
          expect(c.rotulos).toHaveLength(0)
          continue
        }
        expect(c.rotulos.length).toBeGreaterThanOrEqual(1)
        for (const ro of c.rotulos) {
          expect(ro.x).toBeCloseTo((c.cota - 100.1) / 0.25, 9)
          expect(ro.texto).toBe(c.cota.toFixed(2))
          expect(Math.abs(ro.angulo)).toBeCloseTo(90, 9)
          expect(ro.angulo).toBeGreaterThan(-90.0001)
          expect(ro.angulo).toBeLessThanOrEqual(90.0001)
        }
      }
    })
  })

  it('una cota que cae justo en los vértices da una sola curva seguida', () => {
    // z = 100 + 0.25 x: la curva 100.5 pasa justo por los puntos de x = 2
    const sup = triangular(grilla(0, 10, 1, (x) => 100 + 0.25 * x))
    const r = curvasDeNivel(sup, { intervalo: 0.5 })
    const c = r.curvas.filter((k) => k.cota === 100.5)
    expect(c).toHaveLength(1)
    expect(largo(c[0]!)).toBeCloseTo(10, 9)
    for (const q of c[0]!.puntos) expect(q.x).toBeCloseTo(2, 9)
  })

  it('un terreno plano justo en una cota no da curvas de largo cero', () => {
    const sup = triangular(grilla(0, 4, 1, () => 100))
    const r = curvasDeNivel(sup, { intervalo: 0.5 })
    expect(r.curvas).toHaveLength(0)
    expect(r.cotaMin).toBe(100)
    expect(r.cotaMax).toBe(100)
  })

  it('cono: curvas cerradas, una por cota, a la distancia de la punta que corresponde', () => {
    const sup = triangular(cono(110.5, 10))
    const r = curvasDeNivel(sup, { intervalo: 1, cadaMaestra: 5 })
    // cotas 100.5 a 110.5 → curvas 101 … 110
    expect(r.curvas.map((c) => c.cota)).toEqual([101, 102, 103, 104, 105, 106, 107, 108, 109, 110])
    for (const c of r.curvas) {
      expect(c.cerrada).toBe(true)
      const primero = c.puntos[0]!
      const ultimo = c.puntos[c.puntos.length - 1]!
      expect(primero.x).toBeCloseTo(ultimo.x, 9)
      expect(primero.y).toBeCloseTo(ultimo.y, 9)
      const radio = 110.5 - c.cota
      for (const q of c.puntos) expect(Math.abs(Math.hypot(q.x, q.y) - radio)).toBeLessThan(0.05)
    }
    expect(r.curvas.filter((c) => c.maestra).map((c) => c.cota)).toEqual([105, 110])
  })

  it('tramos sin comprobar marcados: la curva es no comprobada si algún tramo lo es', () => {
    const sup = triangular(grilla(0, 10, 1, plano, (_x, y) => y <= 5))
    const r = curvasDeNivel(sup, { intervalo: 0.5 })
    const c = r.curvas.find((k) => k.cota === 101)!
    expect(c.comprobada).toBe(false)
    expect(c.tramosComprobados.some(Boolean)).toBe(true)
    expect(c.tramosComprobados.some((v) => !v)).toBe(true)
    // un tramo comprobado está entero en y ≤ 5
    c.tramosComprobados.forEach((ok, i) => {
      if (ok) expect(Math.max(c.puntos[i]!.y, c.puntos[i + 1]!.y)).toBeLessThanOrEqual(5 + 1e-9)
    })
  })

  describe('recorte a una zona', () => {
    const sup = triangular(grilla(0, 10, 1, plano))

    it('zona rectangular: las curvas quedan dentro y se cortan en su borde', () => {
      const zona = [
        { x: 1, y: 2 },
        { x: 9, y: 2 },
        { x: 9, y: 6 },
        { x: 1, y: 6 },
      ]
      const r = curvasDeNivel(sup, { intervalo: 0.5, zona })
      // la curva 100.5 (x = 1.6) entra; todas van de y = 2 a y = 6
      expect(r.curvas.map((c) => c.cota)).toEqual([100.5, 101, 101.5, 102])
      for (const c of r.curvas) expect(largo(c)).toBeCloseTo(4, 9)
    })

    it('zona cóncava (en U): la curva se corta en el entrante', () => {
      // U abierta hacia arriba: dos brazos x 1..9, con el hueco 3..7 sobre y = 4
      const zona = [
        { x: 1, y: 1 },
        { x: 9, y: 1 },
        { x: 9, y: 9 },
        { x: 7, y: 9 },
        { x: 7, y: 4 },
        { x: 3, y: 4 },
        { x: 3, y: 9 },
        { x: 1, y: 9 },
      ]
      const r = curvasDeNivel(sup, { intervalo: 0.5, zona })
      // la curva 101 está en x = 3.6: dentro solo de y = 1 a 4
      const c101 = r.curvas.filter((c) => c.cota === 101)
      expect(c101).toHaveLength(1)
      expect(largo(c101[0]!)).toBeCloseTo(3, 9)
      // la curva 102.5 está en x = 9.6: fuera de la zona
      expect(r.curvas.some((c) => c.cota === 102.5)).toBe(false)
      // la curva 100.5 (x = 1.6) está en el brazo izquierdo entero: y = 1 a 9
      const c1005 = r.curvas.filter((c) => c.cota === 100.5)
      expect(c1005).toHaveLength(1)
      expect(largo(c1005[0]!)).toBeCloseTo(8, 9)
    })

    it('zona cóncava (en C, abierta al este): una curva que cruza los dos brazos sale en dos pedazos', () => {
      const zona = [
        { x: 1, y: 1 },
        { x: 9, y: 1 },
        { x: 9, y: 3 },
        { x: 3, y: 3 },
        { x: 3, y: 7 },
        { x: 9, y: 7 },
        { x: 9, y: 9 },
        { x: 1, y: 9 },
      ]
      const r = curvasDeNivel(sup, { intervalo: 0.5, zona })
      const c = r.curvas.filter((k) => k.cota === 101.5)
      expect(c).toHaveLength(2)
      for (const k of c) {
        expect(k.cerrada).toBe(false)
        expect(largo(k)).toBeCloseTo(2, 9)
      }
    })

    it('una zona en sentido horario da lo mismo', () => {
      const zona = [
        { x: 1, y: 2 },
        { x: 1, y: 6 },
        { x: 9, y: 6 },
        { x: 9, y: 2 },
      ]
      const r = curvasDeNivel(sup, { intervalo: 0.5, zona })
      expect(r.curvas.map((c) => c.cota)).toEqual([100.5, 101, 101.5, 102])
    })
  })

  it('un intervalo que no es positivo es un error', () => {
    const sup = triangular(grilla(0, 2, 1, plano))
    expect(() => curvasDeNivel(sup, { intervalo: 0 })).toThrow()
    expect(() => curvasDeNivel(sup, { intervalo: -1 })).toThrow()
  })

  it('una separación de rótulos que no es positiva es un error (con 0 no terminaba nunca)', () => {
    const sup = triangular(grilla(0, 2, 1, plano))
    expect(() => curvasDeNivel(sup, { intervalo: 0.25, separacionRotulos: 0 })).toThrow(/rótulos/)
    expect(() => curvasDeNivel(sup, { intervalo: 0.25, separacionRotulos: -5 })).toThrow(/rótulos/)
    expect(() => curvasDeNivel(sup, { intervalo: 0.25, separacionRotulos: NaN })).toThrow(/rótulos/)
    expect(() => curvasDeNivel(sup, { intervalo: 0.25, separacionRotulos: Infinity })).toThrow(/rótulos/)
  })

  it('superficie vacía: sin curvas', () => {
    expect(curvasDeNivel(triangular([]), { intervalo: 1 }).curvas).toEqual([])
  })

  // Holgura amplia: en una máquina cargada el tiempo varía; lo que se vigila es
  // que no se vuelva cuadrático (eso tardaría decenas de segundos).
  it('rinde: 5 000 puntos triangulados y con curvas cada 0.25 m sin volverse lento', () => {
    const nube = nubeAlAzar(5000, 500)
    const t0 = Date.now()
    const sup = triangular(nube)
    const r = curvasDeNivel(sup, { intervalo: 0.25, cadaMaestra: 4 })
    const ms = Date.now() - t0
    expect(r.curvas.length).toBeGreaterThan(20)
    expect(ms).toBeLessThan(5000)
  })
})
