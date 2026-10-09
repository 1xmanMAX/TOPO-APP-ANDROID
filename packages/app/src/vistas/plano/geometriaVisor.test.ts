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

describe('origen del visor (planos en UTM)', () => {
  it('cerca del cero no se corre; en UTM se corre al centro redondeado', async () => {
    const g = await import('./geometriaVisor')
    expect(g.origenPara({ minX: 0, minY: 0, maxX: 500, maxY: 300 })).toEqual({ x: 0, y: 0 })
    expect(g.origenPara({ minX: 480000, minY: 8660000, maxX: 482880, maxY: 8665000 })).toEqual({ x: 481000, y: 8663000 })
  })

  it('con origen, el SVG recibe números chicos y el toque vuelve al mismo punto del plano', async () => {
    const g = await import('./geometriaVisor')
    try {
      g.fijarOrigenDelVisor({ x: 481000, y: 8662000 })
      const p = { x: 481234.5678, y: 8662345.6789 }
      const s = g.aSvg(p)
      expect(s.x).toBeCloseTo(234.5678, 9)
      expect(s.y).toBeCloseTo(-345.6789, 9)
      expect(g.puntosSvg([p])).toBe(`${p.x - 481000},${8662000 - p.y}`)
      const vista = g.encuadrar({ minX: p.x - 1, minY: p.y - 1, maxX: p.x + 1, maxY: p.y + 1 }, { width: 100, height: 100 }, 0)
      const caja = { left: 0, top: 0, width: 100, height: 100 }
      const w = g.pantallaAMundo(50, 50, caja, vista)
      expect(w.x).toBeCloseTo(p.x, 6)
      expect(w.y).toBeCloseTo(p.y, 6)
    } finally {
      g.fijarOrigenDelVisor({ x: 0, y: 0 })
    }
  })
})
