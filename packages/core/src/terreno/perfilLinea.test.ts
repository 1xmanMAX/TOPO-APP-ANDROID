import { describe, expect, it } from 'vitest'
import { perfilDeLinea } from './perfilLinea'
import { triangular } from './triangulacion'
import { grilla, plano } from './superficiesDePrueba'

describe('perfilDeLinea', () => {
  const sup = triangular(grilla(0, 10, 1, plano))

  it('a lo largo de la pendiente: cotas del plano y 25 % en cada tramo', () => {
    const r = perfilDeLinea(sup, [
      { x: 1, y: 5.3 },
      { x: 9, y: 5.3 },
    ])
    expect(r.longitud).toBeCloseTo(8, 12)
    expect(r.fueraDeSuperficie).toBeCloseTo(0, 12)
    expect(r.comprobado).toBe(true)
    // corta cada arista del TIN: hay puntos en x = 1, 2, …, 9 por lo menos
    expect(r.puntos.length).toBeGreaterThanOrEqual(9)
    for (const q of r.puntos) {
      expect(q.z).not.toBeNull()
      expect(q.z!).toBeCloseTo(plano(q.x), 9)
      expect(q.distancia).toBeCloseTo(q.x - 1, 9)
    }
    // distancias crecientes, sin repetidas
    for (let i = 1; i < r.puntos.length; i++) expect(r.puntos[i]!.distancia).toBeGreaterThan(r.puntos[i - 1]!.distancia)
    for (const t of r.tramos) {
      expect(t.dentro).toBe(true)
      expect(t.pendiente).toBeCloseTo(25, 9)
    }
  })

  it('cuesta abajo la pendiente es negativa', () => {
    const r = perfilDeLinea(sup, [
      { x: 9, y: 5 },
      { x: 1, y: 5 },
    ])
    for (const t of r.tramos) expect(t.pendiente).toBeCloseTo(-25, 9)
  })

  it('una polilínea con quiebre: la distancia se acumula y la pendiente cambia', () => {
    const r = perfilDeLinea(sup, [
      { x: 1, y: 1 },
      { x: 9, y: 1 },
      { x: 9, y: 9 },
    ])
    expect(r.longitud).toBeCloseTo(16, 12)
    const quiebre = r.puntos.find((q) => Math.abs(q.distancia - 8) < 1e-9)
    expect(quiebre).toBeDefined()
    expect(quiebre!.z!).toBeCloseTo(plano(9), 9)
    const ultimo = r.puntos[r.puntos.length - 1]!
    expect(ultimo.distancia).toBeCloseTo(16, 9)
    for (const t of r.tramos) {
      if (t.hasta <= 8 + 1e-9) expect(t.pendiente).toBeCloseTo(25, 9)
      else expect(t.pendiente).toBeCloseTo(0, 9)
    }
  })

  it('la línea sale de la superficie: tramos fuera, sin cota inventada', () => {
    // de x = −5 a x = 15: fuera 5 m al principio y 5 m al final
    const r = perfilDeLinea(sup, [
      { x: -5, y: 5.5 },
      { x: 15, y: 5.5 },
    ])
    expect(r.longitud).toBeCloseTo(20, 12)
    expect(r.fueraDeSuperficie).toBeCloseTo(10, 9)
    const fuera = r.tramos.filter((t) => !t.dentro)
    expect(fuera).toHaveLength(2)
    expect(fuera[0]!.desde).toBeCloseTo(0, 9)
    expect(fuera[0]!.hasta).toBeCloseTo(5, 9)
    expect(fuera[1]!.desde).toBeCloseTo(15, 9)
    expect(fuera[1]!.hasta).toBeCloseTo(20, 9)
    for (const t of fuera) expect(t.pendiente).toBeNull()
    // los extremos de la línea están, sin cota
    expect(r.puntos[0]!.distancia).toBe(0)
    expect(r.puntos[0]!.z).toBeNull()
    expect(r.puntos[r.puntos.length - 1]!.z).toBeNull()
    // donde entra a la superficie
    const enBorde = r.puntos.filter((q) => Math.abs(q.distancia - 5) < 1e-9)
    expect(enBorde.map((q) => q.z === null)).toEqual([true, false])
    expect(enBorde[1]!.z!).toBeCloseTo(plano(0), 9)
    const salida = r.puntos.filter((q) => Math.abs(q.distancia - 15) < 1e-9)
    expect(salida.map((q) => q.z === null)).toEqual([false, true])
    // en medio, la cota del plano
    const medio = r.puntos.find((q) => Math.abs(q.distancia - 10) < 1e-9)
    expect(medio!.z!).toBeCloseTo(plano(5), 9)
  })

  it('cruza un hueco: tramo fuera en el medio', () => {
    const conHueco = triangular(grilla(0, 20, 1, plano).filter((q) => !(q.x > 7 && q.x < 13 && q.y > 7 && q.y < 13)))
    const r = perfilDeLinea(conHueco, [
      { x: 0.5, y: 10 },
      { x: 19.5, y: 10 },
    ])
    const fuera = r.tramos.filter((t) => !t.dentro)
    expect(fuera).toHaveLength(1)
    const hueco = fuera[0]!
    // por el medio del hueco (y = 10) la superficie llega a los puntos medidos
    // de x = 7 y x = 13; la línea empieza en x = 0.5
    expect(hueco.desde).toBeCloseTo(6.5, 9)
    expect(hueco.hasta).toBeCloseTo(12.5, 9)
    // en cada borde del hueco hay un punto con cota y otro sin cota, a la misma distancia
    const i = r.puntos.findIndex((q) => q.z === null)
    expect(i).toBeGreaterThan(0)
    expect(r.puntos[i - 1]!.z).not.toBeNull()
    expect(r.puntos[i]!.distancia).toBe(r.puntos[i - 1]!.distancia)
    const sinCota = r.puntos.filter((q) => q.z === null)
    expect(sinCota).toHaveLength(2)
    expect(sinCota[0]!.distancia).toBeCloseTo(hueco.desde, 9)
    expect(sinCota[1]!.distancia).toBeCloseTo(hueco.hasta, 9)
    const j = r.puntos.indexOf(sinCota[1]!)
    expect(r.puntos[j + 1]!.z).not.toBeNull()
    expect(r.puntos[j + 1]!.distancia).toBe(sinCota[1]!.distancia)
    // ningún par de puntos con cota consecutivos salta el hueco
    for (let k = 1; k < r.puntos.length; k++) {
      const a = r.puntos[k - 1]!
      const b = r.puntos[k]!
      if (a.z !== null && b.z !== null) expect(b.distancia <= hueco.desde + 1e-9 || a.distancia >= hueco.hasta - 1e-9).toBe(true)
    }
  })

  it('tramos sobre triángulos no comprobados quedan marcados', () => {
    const mixta = triangular(grilla(0, 10, 1, plano, (x) => x >= 5))
    const r = perfilDeLinea(mixta, [
      { x: 1, y: 5.5 },
      { x: 9, y: 5.5 },
    ])
    expect(r.comprobado).toBe(false)
    for (const t of r.tramos) {
      const xMedio = 1 + (t.desde + t.hasta) / 2
      if (xMedio < 5) expect(t.comprobado).toBe(false)
      if (xMedio > 5) expect(t.comprobado).toBe(true)
    }
    // y los puntos: uno en x = 7 es comprobado, uno en x = 2 no
    expect(r.puntos.find((q) => Math.abs(q.x - 7) < 1e-9)!.comprobado).toBe(true)
    expect(r.puntos.find((q) => Math.abs(q.x - 2) < 1e-9)!.comprobado).toBe(false)
  })

  it('línea entera fuera o polilínea de menos de dos puntos', () => {
    const fuera = perfilDeLinea(sup, [
      { x: 20, y: 20 },
      { x: 30, y: 20 },
    ])
    expect(fuera.fueraDeSuperficie).toBeCloseTo(10, 9)
    expect(fuera.tramos).toEqual([expect.objectContaining({ dentro: false, desde: 0 })])
    expect(fuera.sinDatos).toBe(true)
    expect(fuera.comprobado).toBe(false)
    expect(perfilDeLinea(sup, [{ x: 1, y: 1 }]).puntos).toHaveLength(0)
  })
})
