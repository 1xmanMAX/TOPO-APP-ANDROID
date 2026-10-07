import { describe, expect, it } from 'vitest'
import { aplicarAmarre, calcularAmarre, invertirAmarre, type ParDeAmarre } from './amarre'

/** Gira `ang` grados (antihorario, como en matemáticas), escala y traslada. */
function transformar(p: { x: number; y: number }, ang: number, escala: number, tx: number, ty: number) {
  const r = (ang * Math.PI) / 180
  return {
    x: escala * (Math.cos(r) * p.x - Math.sin(r) * p.y) + tx,
    y: escala * (Math.sin(r) * p.x + Math.cos(r) * p.y) + ty,
  }
}

function pares(origenes: { x: number; y: number }[], ang: number, escala: number, tx: number, ty: number): ParDeAmarre[] {
  return origenes.map((o, i) => ({ id: `P${i + 1}`, origen: o, destino: transformar(o, ang, escala, tx, ty) }))
}

describe('calcularAmarre con 2 puntos', () => {
  const base = [
    { x: 100, y: 200 },
    { x: 180, y: 260 },
  ]

  it('escala fija 1 por defecto: recupera giro y traslación', () => {
    const r = calcularAmarre(pares(base, 30, 1, 476000, 8665000))
    expect(r.amarre).not.toBeNull()
    expect(r.amarre!.escala).toBe(1)
    expect(r.amarre!.rotacionGrados).toBeCloseTo(30, 9)
    expect(r.escalaLibre).toBeCloseTo(1, 9)
    const p = aplicarAmarre(r.amarre!, { x: 150, y: 150 })
    const esperado = transformar({ x: 150, y: 150 }, 30, 1, 476000, 8665000)
    expect(p.x).toBeCloseTo(esperado.x, 6)
    expect(p.y).toBeCloseTo(esperado.y, 6)
    for (const res of r.residuos) expect(res.distancia).toBeLessThan(1e-6)
  })

  it('escala fija con datos de otra escala: reparte el error y avisa la escala libre', () => {
    const r = calcularAmarre(pares(base, 0, 1.01, 0, 0))
    expect(r.amarre!.escala).toBe(1)
    expect(r.escalaLibre).toBeCloseTo(1.01, 9)
    // Base de 100 m: sobra 1 m, medio metro en cada punta.
    expect(r.residuos[0]!.distancia).toBeCloseTo(0.5, 6)
    expect(r.residuos[1]!.distancia).toBeCloseTo(0.5, 6)
    expect(r.avisos.join(' ')).toMatch(/escala/)
  })

  it('escala libre: ajusta exacto y dice que con 2 puntos no hay control', () => {
    const r = calcularAmarre(pares(base, -45, 0.9996, 10, 20), { escala: 'libre' })
    expect(r.amarre!.escala).toBeCloseTo(0.9996, 9)
    expect(r.amarre!.rotacionGrados).toBeCloseTo(-45, 9)
    for (const res of r.residuos) expect(res.distancia).toBeLessThan(1e-6)
    expect(r.avisos.join(' ')).toMatch(/2 puntos/)
  })

  it('residuos con signo: destino − transformado', () => {
    const ps = pares(base, 0, 1, 0, 0)
    ps[1] = { ...ps[1]!, destino: { x: ps[1]!.destino.x + 0.02, y: ps[1]!.destino.y } }
    const r = calcularAmarre(ps)
    expect(r.residuos[1]!.dx).toBeGreaterThan(0)
    expect(r.residuos[0]!.dx).toBeLessThan(0)
  })
})

describe('calcularAmarre con más puntos: mínimos cuadrados', () => {
  const base = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ]

  it('datos exactos: residuos cero, sin avisos', () => {
    const r = calcularAmarre(pares(base, 120, 1, 5000, 3000))
    expect(r.amarre!.rotacionGrados).toBeCloseTo(120, 9)
    expect(r.rmsM).toBeLessThan(1e-6)
    expect(r.avisos).toEqual([])
  })

  it('un punto movido: se ve en su residuo y se avisa por nombre', () => {
    const ps = pares(base, 0, 1, 0, 0)
    ps[2] = { ...ps[2]!, destino: { x: 100.2, y: 100 } }
    const r = calcularAmarre(ps)
    const peor = [...r.residuos].sort((a, b) => b.distancia - a.distancia)[0]!
    expect(peor.id).toBe('P3')
    expect(r.avisos.join(' ')).toMatch(/P3/)
  })

  it('giros de más de 90° se recuperan sin confundir cuadrantes', () => {
    for (const ang of [-170, 179, 200, 270, 359]) {
      const r = calcularAmarre(pares(base, ang, 1, 0, 0))
      const p = aplicarAmarre(r.amarre!, { x: 37, y: -12 })
      const e = transformar({ x: 37, y: -12 }, ang, 1, 0, 0)
      expect(p.x).toBeCloseTo(e.x, 6)
      expect(p.y).toBeCloseTo(e.y, 6)
    }
  })
})

describe('invertirAmarre', () => {
  it('ida y vuelta devuelve el punto de partida', () => {
    const r = calcularAmarre(
      pares(
        [
          { x: 0, y: 0 },
          { x: 80, y: 30 },
        ],
        63,
        1.002,
        476000,
        8665000,
      ),
      { escala: 'libre' },
    )
    const vuelta = invertirAmarre(r.amarre!)
    const p = { x: 12.345, y: -6.789 }
    const q = aplicarAmarre(vuelta!, aplicarAmarre(r.amarre!, p))
    expect(q.x).toBeCloseTo(p.x, 6)
    expect(q.y).toBeCloseTo(p.y, 6)
  })
})

describe('calcularAmarre: lo que no se puede', () => {
  it('menos de 2 puntos', () => {
    const r = calcularAmarre([{ id: 'A', origen: { x: 0, y: 0 }, destino: { x: 1, y: 1 } }])
    expect(r.amarre).toBeNull()
    expect(r.avisos.join(' ')).toMatch(/2 puntos/)
  })

  it('puntos de origen en el mismo sitio', () => {
    const r = calcularAmarre([
      { id: 'A', origen: { x: 5, y: 5 }, destino: { x: 1, y: 1 } },
      { id: 'B', origen: { x: 5, y: 5 }, destino: { x: 9, y: 9 } },
    ])
    expect(r.amarre).toBeNull()
    expect(r.avisos.length).toBeGreaterThan(0)
  })

  it('un par que no es número se deja fuera y se dice', () => {
    const r = calcularAmarre([
      { id: 'A', origen: { x: 0, y: 0 }, destino: { x: 0, y: 0 } },
      { id: 'B', origen: { x: 50, y: 0 }, destino: { x: 50, y: 0 } },
      { id: 'C', origen: { x: Number.NaN, y: 0 }, destino: { x: 0, y: 0 } },
    ])
    expect(r.amarre).not.toBeNull()
    expect(r.residuos.map((x) => x.id)).toEqual(['A', 'B'])
    expect(r.avisos.join(' ')).toMatch(/«C»/)
  })

  it('puntos muy juntos: avisa que el giro queda mal definido', () => {
    const r = calcularAmarre([
      { id: 'A', origen: { x: 0, y: 0 }, destino: { x: 0, y: 0 } },
      { id: 'B', origen: { x: 2, y: 0 }, destino: { x: 2, y: 0 } },
    ])
    expect(r.amarre).not.toBeNull()
    expect(r.avisos.join(' ')).toMatch(/juntos/)
  })
})

describe('calcularAmarre: los errores típicos de campo', () => {
  const cuadrado = [
    { x: 0, y: 0 },
    { x: 400, y: 0 },
    { x: 400, y: 400 },
    { x: 0, y: 400 },
  ]

  it('local a UTM con factor 0.99909 y escala fija: dice que parece factor de escala', () => {
    const r = calcularAmarre(pares(cuadrado, 12, 0.99909, 476000, 8665000))
    expect(r.amarre).not.toBeNull()
    for (const res of r.residuos) expect(res.distancia).toBeGreaterThan(0.03)
    const texto = r.avisos.join(' ')
    expect(texto).toMatch(/Parece factor de escala/)
    // Destino UTM: el umbral baja a 0.3 ‰ y la escala libre se avisa.
    expect(texto).toMatch(/0\.999090/)
    expect(texto).toMatch(/UTM/)
  })

  it('declarando el factor de escala, el mismo amarre casa al mm', () => {
    const r = calcularAmarre(pares(cuadrado, 12, 0.99909, 476000, 8665000), { factorEscala: 0.99909 })
    expect(r.amarre!.escala).toBe(0.99909)
    expect(r.rmsM).toBeLessThan(0.001)
    expect(r.avisos).toEqual([])
  })

  it('un factor de escala que no es número se dice y se usa 1', () => {
    const r = calcularAmarre(pares(cuadrado, 0, 1, 0, 0), { factorEscala: Number.NaN })
    expect(r.amarre!.escala).toBe(1)
    expect(r.avisos.join(' ')).toMatch(/factor de escala/)
  })

  it('un punto malo entre buenos no se confunde con factor de escala', () => {
    const ps = pares(cuadrado, 0, 1, 0, 0)
    ps[2] = { ...ps[2]!, destino: { x: 400.5, y: 400 } }
    const r = calcularAmarre(ps)
    expect(r.avisos.join(' ')).toMatch(/P3/)
    expect(r.avisos.join(' ')).not.toMatch(/Parece factor de escala/)
  })

  it('norte y este cambiados en el destino: no da amarre y dice que están espejados', () => {
    const ps = cuadrado.map((o, i) => ({ id: `P${i + 1}`, origen: o, destino: { x: o.y + 476000, y: o.x + 8665000 } }))
    const r = calcularAmarre(ps, { escala: 'libre' })
    expect(r.amarre).toBeNull()
    expect(r.avisos.join(' ')).toMatch(/norte y el este están cambiados/)
  })

  it('espejado con puntos sin simetría (escala libre lejos de 0): igual se detecta', () => {
    const origenes = [
      { x: 0, y: 0 },
      { x: 150, y: 20 },
      { x: 90, y: 210 },
      { x: -40, y: 75 },
    ]
    const ps = origenes.map((o, i) => ({ id: `P${i + 1}`, origen: o, destino: { x: o.y + 1000, y: o.x + 5000 } }))
    const r = calcularAmarre(ps)
    expect(r.amarre).toBeNull()
    expect(r.avisos.join(' ')).toMatch(/espejados/)
  })

  it('escala libre absurda (pies contra metros, otro sitio): no da amarre', () => {
    const r = calcularAmarre(pares(cuadrado, 0, 3.28084, 0, 0))
    expect(r.amarre).toBeNull()
    expect(r.escalaLibre).toBeCloseTo(3.28084, 6)
    expect(r.avisos.join(' ')).toMatch(/No se calculó/)
  })

  it('tolerancia NaN o negativa: se avisa y se usa 0.030, sin apagar el control', () => {
    const ps = pares(cuadrado, 0, 1, 0, 0)
    ps[1] = { ...ps[1]!, destino: { x: 410, y: 0 } }
    for (const t of [Number.NaN, -1]) {
      const r = calcularAmarre(ps, { toleranciaM: t })
      const texto = r.avisos.join(' ')
      expect(texto).toMatch(/tolerancia de residuos no es un número válido/)
      expect(texto).toMatch(/Residuo mayor que 0\.030 m en: .*«P2»/)
    }
  })

  it('ids repetidos: se avisa', () => {
    const ps = pares(cuadrado, 0, 1, 0, 0)
    ps[3] = { ...ps[3]!, id: 'P1' }
    const r = calcularAmarre(ps)
    expect(r.avisos.join(' ')).toMatch(/«P1» está dos veces/)
  })

  it('origen y destino ambos en UTM: residuos al mm y giro pequeño recuperado', () => {
    const origenes = cuadrado.map((p) => ({ x: p.x + 476123.456, y: p.y + 8665432.789 }))
    // Mismo sistema con una pequeña traslación y giro de 0.01°, alrededor del primer punto.
    const ps = origenes.map((o, i) => {
      const t = transformar({ x: o.x - 476123.456, y: o.y - 8665432.789 }, 0.01, 1, 476123.456 + 0.25, 8665432.789 - 0.4)
      return { id: `P${i + 1}`, origen: o, destino: t }
    })
    const r = calcularAmarre(ps)
    expect(r.amarre!.rotacionGrados).toBeCloseTo(0.01, 8)
    expect(r.rmsM!).toBeLessThan(1e-6)
    const p = aplicarAmarre(r.amarre!, { x: 476323.456, y: 8665632.789 })
    const e = transformar({ x: 200, y: 200 }, 0.01, 1, 476123.456 + 0.25, 8665432.789 - 0.4)
    expect(p.x).toBeCloseTo(e.x, 4)
    expect(p.y).toBeCloseTo(e.y, 4)
  })
})

describe('invertirAmarre: lo que no se puede invertir', () => {
  it('escala 0 o NaN devuelve null en vez de NaN o Infinity', () => {
    expect(invertirAmarre({ a: 0, b: 0, tx: 1, ty: 2, escala: 0, rotacionGrados: 0 })).toBeNull()
    expect(invertirAmarre({ a: Number.NaN, b: 0, tx: 1, ty: 2, escala: 1, rotacionGrados: 0 })).toBeNull()
  })

  it('la escala de la vuelta es la inversa de la de ida', () => {
    const v = invertirAmarre({ a: 0, b: 2, tx: 0, ty: 0, escala: 2, rotacionGrados: 90 })!
    expect(v.escala).toBeCloseTo(0.5, 12)
  })
})
