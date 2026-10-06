import type { PlanoImportado, Pista } from '@topo/core'
import { describe, expect, it } from 'vitest'
import {
  acercar,
  aSvg,
  desfaseAlCostado,
  encuadrar,
  limitesDePuntos,
  metrosPorUnidadDe,
  mismaPolilinea,
  pantallaAMundo,
  pistaCalibrada,
  unidadesPorPixel,
  unirLimites,
} from './geometriaVisor'

const caja = { left: 10, top: 20, width: 800, height: 400 }

describe('geometría del visor', () => {
  it('el SVG tiene la Y al revés que el plano', () => {
    expect(aSvg({ x: 3, y: 5 })).toEqual({ x: 3, y: -5 })
  })

  it('encuadrar llena la caja sin deformar y deja el centro del plano al centro', () => {
    const vista = encuadrar({ minX: 0, minY: 0, maxX: 100, maxY: 100 }, caja, 0)
    // Caja 2:1 → el ancho se estira al doble del alto.
    expect(vista.alto).toBeCloseTo(100)
    expect(vista.ancho).toBeCloseTo(200)
    const centro = pantallaAMundo(caja.left + 400, caja.top + 200, caja, vista)
    expect(centro.x).toBeCloseTo(50)
    expect(centro.y).toBeCloseTo(50)
  })

  it('un toque arriba a la izquierda cae en el mínimo X y el máximo Y del plano', () => {
    const vista = encuadrar({ minX: 1000, minY: 2000, maxX: 1200, maxY: 2100 }, caja, 0)
    const punto = pantallaAMundo(caja.left, caja.top, caja, vista)
    expect(punto.x).toBeCloseTo(1000)
    expect(punto.y).toBeCloseTo(2100)
  })

  it('acercar deja quieto el punto bajo el dedo', () => {
    const vista = { x: 0, y: 0, ancho: 100, alto: 50 }
    const cerca = acercar(vista, { x: 25, y: 10 }, 2)
    expect(cerca.ancho).toBe(50)
    // El punto (25, 10) estaba a 1/4 del ancho y 1/5 del alto; sigue ahí.
    expect((25 - cerca.x) / cerca.ancho).toBeCloseTo(0.25)
    expect((10 - cerca.y) / cerca.alto).toBeCloseTo(0.2)
  })

  it('unidades por píxel: cuánto plano cabe en un píxel', () => {
    expect(unidadesPorPixel({ x: 0, y: 0, ancho: 1600, alto: 800 }, caja)).toBeCloseTo(2)
  })

  it('límites de puntos y su unión', () => {
    const a = limitesDePuntos([{ x: 1, y: 2 }, { x: -1, y: 5 }])
    expect(a).toEqual({ minX: -1, minY: 2, maxX: 1, maxY: 5 })
    expect(limitesDePuntos([])).toBeNull()
    expect(unirLimites(a, { minX: 0, minY: 0, maxX: 3, maxY: 3 })).toEqual({ minX: -1, minY: 0, maxX: 3, maxY: 5 })
  })

  it('las unidades del DXF dan la escala; sin unidades no se adivina', () => {
    expect(metrosPorUnidadDe('m')).toBe(1)
    expect(metrosPorUnidadDe('mm')).toBe(0.001)
    expect(metrosPorUnidadDe(undefined)).toBeNull()
  })

  it('una misma polilínea al derecho o al revés es la misma', () => {
    const p = [{ x: 0, y: 0 }, { x: 1, y: 1 }]
    expect(mismaPolilinea(p, [...p].reverse())).toBe(true)
    expect(mismaPolilinea(p, [{ x: 0, y: 0 }, { x: 1, y: 2 }])).toBe(false)
  })

  it('la pista calibrada toma la escala de su plano; sin escala, null', () => {
    const pista: Pista = { id: 'p', nombre: 'Jr. Lima', planoId: 'pl', polilinea: [{ x: 0, y: 0 }, { x: 10, y: 0 }], origen: 'croquis', calleId: 'c' }
    const plano: PlanoImportado = { id: 'pl', nombre: 'Plano', formato: 'pdf', calibracion: { metrosPorUnidad: 2 } }
    expect(pistaCalibrada(pista, plano)).toEqual({
      id: 'p',
      nombre: 'Jr. Lima',
      polilinea: pista.polilinea,
      calibracion: { metrosPorUnidad: 2, ejeY: 'arriba' },
      progresivaInicio: 0,
      calleId: 'c',
    })
    expect(pistaCalibrada(pista, { ...plano, calibracion: null })).toBeNull()
  })
})

describe('rótulos al costado de la pista', () => {
  it('en una pista que sube por la pantalla, las estacas van a la derecha y las pendientes a la izquierda', () => {
    // Rumbo 90°: hacia +Y del plano, hacia arriba en la pantalla.
    const derecha = desfaseAlCostado(90, 'derecha', 10)
    const izquierda = desfaseAlCostado(90, 'izquierda', 10)
    expect(derecha.dx).toBeCloseTo(10)
    expect(derecha.dy).toBeCloseTo(0)
    expect(derecha.ancla).toBe('start')
    expect(izquierda.dx).toBeCloseTo(-10)
    expect(izquierda.ancla).toBe('end')
  })

  it('en una pista que va hacia +X, la derecha es abajo en la pantalla y el rótulo se centra', () => {
    const derecha = desfaseAlCostado(0, 'derecha', 12)
    expect(derecha.dx).toBeCloseTo(0)
    expect(derecha.dy).toBeCloseTo(12)
    expect(derecha.ancla).toBe('middle')
    expect(desfaseAlCostado(0, 'izquierda', 12).dy).toBeCloseTo(-12)
  })

  it('los dos costados quedan siempre opuestos, sea cual sea el rumbo', () => {
    for (const rumbo of [-135, -30, 17, 245]) {
      const d = desfaseAlCostado(rumbo, 'derecha', 10)
      const i = desfaseAlCostado(rumbo, 'izquierda', 10)
      expect(d.dx + i.dx).toBeCloseTo(0)
      expect(d.dy + i.dy).toBeCloseTo(0)
      expect(Math.hypot(d.dx, d.dy)).toBeCloseTo(10)
    }
  })
})
