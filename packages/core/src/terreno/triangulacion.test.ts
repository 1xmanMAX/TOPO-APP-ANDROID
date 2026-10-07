import { describe, expect, it } from 'vitest'
import { cotaDeSuperficie, triangular, type PuntoTerreno } from './triangulacion'
import { cono, grilla, nubeAlAzar, plano } from './superficiesDePrueba'

const p = (id: string, x: number, y: number, z: number, comprobado = true): PuntoTerreno => ({
  id,
  x,
  y,
  z,
  origen: 'nivel',
  comprobado,
})

describe('triangular', () => {
  it('una grilla de 11 × 11 da 200 triángulos y la cota del plano en cualquier punto', () => {
    const sup = triangular(grilla(0, 10, 1, plano))
    expect(sup.puntos).toHaveLength(121)
    expect(sup.triangulos).toHaveLength(200)
    expect(sup.quitadosPorLado).toBe(0)
    const c = cotaDeSuperficie(sup, 3.3, 7.1)
    expect(c).not.toBeNull()
    expect(c!.z).toBeCloseTo(plano(3.3), 9)
    expect(c!.comprobado).toBe(true)
  })

  it('fuera de la superficie no hay cota (no se extrapola)', () => {
    const sup = triangular(grilla(0, 10, 1, plano))
    expect(cotaDeSuperficie(sup, -0.5, 5)).toBeNull()
    expect(cotaDeSuperficie(sup, 5, 10.01)).toBeNull()
    // en el borde mismo sí
    expect(cotaDeSuperficie(sup, 10, 5)!.z).toBeCloseTo(plano(10), 9)
  })

  it('un triángulo es comprobado solo si sus tres vértices lo son', () => {
    const sup = triangular(grilla(0, 10, 1, plano, (x) => x >= 5))
    for (const t of sup.triangulos) {
      const todos = [t.a, t.b, t.c].every((i) => sup.puntos[i]!.comprobado)
      expect(t.comprobado).toBe(todos)
    }
    expect(cotaDeSuperficie(sup, 7.5, 5)!.comprobado).toBe(true)
    expect(cotaDeSuperficie(sup, 2.5, 5)!.comprobado).toBe(false)
    // entre x = 4 y 5 los triángulos tocan un vértice sin comprobar
    expect(cotaDeSuperficie(sup, 4.5, 5.5)!.comprobado).toBe(false)
  })

  describe('duplicados (mismo x, y a menos de 1 mm)', () => {
    it('se queda el comprobado aunque venga después', () => {
      const sup = triangular([
        p('A', 0, 0, 100),
        p('B', 10, 0, 100),
        p('C', 0, 10, 100),
        p('D1', 5, 5, 101.2, false),
        p('D2', 5.0004, 5.0003, 101.0, true),
      ])
      expect(sup.puntos.map((q) => q.id)).toEqual(['A', 'B', 'C', 'D2'])
      expect(sup.avisos).toHaveLength(1)
      const a = sup.avisos[0]!
      expect(a.tipo).toBe('duplicado')
      if (a.tipo !== 'duplicado') return
      expect(a.conservado).toBe('D2')
      expect(a.descartado).toBe('D1')
      expect(a.diferenciaZ).toBeCloseTo(0.2, 9)
    })

    it('si los dos son iguales de fiables se queda el primero y se avisa la diferencia de cota', () => {
      const sup = triangular([p('A', 0, 0, 100), p('B', 10, 0, 100), p('C', 0, 10, 100), p('A2', 0.0005, 0, 100.035)])
      expect(sup.puntos.map((q) => q.id)).toEqual(['A', 'B', 'C'])
      const a = sup.avisos[0]!
      expect(a.tipo).toBe('duplicado')
      if (a.tipo !== 'duplicado') return
      expect(a.conservado).toBe('A')
      expect(a.descartado).toBe('A2')
      expect(a.diferenciaZ).toBeCloseTo(0.035, 9)
      expect(a.mensaje).toContain('35 mm')
    })

    it('a 1 mm o más ya no son duplicados (pero se avisan como cercanos)', () => {
      const sup = triangular([p('A', 0, 0, 100), p('B', 10, 0, 100), p('C', 0, 10, 100), p('A2', 0.0011, 0, 100)])
      expect(sup.puntos).toHaveLength(4)
      expect(sup.avisos.filter((a) => a.tipo === 'duplicado')).toHaveLength(0)
      expect(sup.avisos).toEqual([expect.objectContaining({ tipo: 'cercanos', ids: ['A', 'A2'] })])
    })

    it('un punto exactamente encima de otro se avisa, no se pierde en silencio', () => {
      const sup = triangular([p('A', 0, 0, 100), p('B', 2, 0, 100), p('C', 0, 2, 100), p('D', 1, 1, 100), p('X', 1, 1, 200)])
      expect(sup.avisos).toEqual([expect.objectContaining({ tipo: 'duplicado', conservado: 'D', descartado: 'X' })])
      expect(sup.puntos.map((q) => q.id)).not.toContain('X')
    })
  })

  describe('puntos cercanos: el mismo punto medido dos veces a pocos cm', () => {
    const base = grilla(0, 4, 1, () => 100)
    const g = (id: string, x: number, y: number, z: number): PuntoTerreno => ({ id, x, y, z, origen: 'gnss', comprobado: false })

    it('GNSS re-medido a 2 cm con 8 cm de diferencia de cota: aviso con distancia y diferencia', () => {
      const sup = triangular([...base, g('R1', 2.5, 2.5, 100.0), g('R2', 2.52, 2.5, 100.08)])
      const cerca = sup.avisos.filter((a) => a.tipo === 'cercanos')
      expect(cerca).toHaveLength(1)
      const a = cerca[0]!
      if (a.tipo !== 'cercanos') return
      expect(a.ids).toEqual(['R1', 'R2'])
      expect(a.distancia).toBeCloseTo(0.02, 9)
      expect(a.diferenciaZ).toBeCloseTo(0.08, 9)
      expect(a.mensaje).toContain('80 mm')
      expect(a.mensaje).toContain('2.0 cm')
      // no se cambia nada: los dos siguen en la superficie
      expect(sup.puntos.map((q) => q.id)).toEqual(expect.arrayContaining(['R1', 'R2']))
    })

    it('con estación la tolerancia es 1 cm: a 2 cm no se avisa', () => {
      const e = (id: string, x: number, z: number): PuntoTerreno => ({ id, x, y: 2.5, z, origen: 'estacion', comprobado: true })
      const sup = triangular([...base, e('E1', 2.5, 100), e('E2', 2.52, 100.08)])
      expect(sup.avisos.filter((a) => a.tipo === 'cercanos')).toHaveLength(0)
      const fina = triangular([...base, e('E1', 2.5, 100), e('E2', 2.505, 100.08)])
      expect(fina.avisos.filter((a) => a.tipo === 'cercanos')).toHaveLength(1)
    })

    it('la tolerancia se puede fijar a mano', () => {
      const sup = triangular([...base, g('R1', 2.5, 2.5, 100), g('R2', 2.52, 2.5, 100)], { toleranciaCercanos: 0.01 })
      expect(sup.avisos.filter((a) => a.tipo === 'cercanos')).toHaveLength(0)
    })

    it('una grilla de 1 m no da avisos de cercanos', () => {
      expect(triangular(grilla(0, 10, 1, plano)).avisos).toEqual([])
    })
  })

  describe('picos: un punto muy por encima o por debajo de sus vecinos', () => {
    const plataforma = (): PuntoTerreno[] => grilla(0, 10, 1, () => 100)

    it('un GNSS 1.5 m arriba en una plataforma plana se avisa (altura de antena)', () => {
      const puntos = plataforma().map((q) =>
        q.x === 5 && q.y === 5 ? { ...q, id: 'G1', z: 101.5, origen: 'gnss' as const } : q,
      )
      const sup = triangular(puntos)
      const picos = sup.avisos.filter((a) => a.tipo === 'pico')
      expect(picos).toHaveLength(1)
      const a = picos[0]!
      if (a.tipo !== 'pico') return
      expect(a.id).toBe('G1')
      expect(a.origen).toBe('gnss')
      expect(a.diferencia).toBeCloseTo(1.5, 9)
      expect(a.mensaje).toContain('antena')
      expect(a.mensaje).toContain('por encima')
    })

    it('un hoyo falso también (prisma con altura de más)', () => {
      const puntos = plataforma().map((q) => (q.x === 3 && q.y === 7 ? { ...q, id: 'H', z: 99.4 } : q))
      const picos = triangular(puntos).avisos.filter((a) => a.tipo === 'pico')
      expect(picos).toEqual([expect.objectContaining({ id: 'H', mensaje: expect.stringContaining('por debajo') })])
    })

    it('un pico chico (bajo el umbral) no se avisa; con un umbral menor sí', () => {
      const puntos = plataforma().map((q) => (q.x === 5 && q.y === 5 ? { ...q, z: 100.2 } : q))
      expect(triangular(puntos).avisos.filter((a) => a.tipo === 'pico')).toHaveLength(0)
      expect(triangular(puntos, { umbralPico: 0.1 }).avisos.filter((a) => a.tipo === 'pico')).toHaveLength(1)
    })

    it('terreno real no da picos: plano, cono (cima pareja), nube ondulada, un sardinel', () => {
      expect(triangular(grilla(0, 10, 1, plano)).avisos.filter((a) => a.tipo === 'pico')).toHaveLength(0)
      expect(triangular(cono(110, 10)).avisos.filter((a) => a.tipo === 'pico')).toHaveLength(0)
      expect(triangular(nubeAlAzar(2000, 300)).avisos.filter((a) => a.tipo === 'pico')).toHaveLength(0)
      const sardinel = grilla(0, 10, 1, (x) => (x >= 5 ? 100.2 : 100))
      expect(triangular(sardinel).avisos.filter((a) => a.tipo === 'pico')).toHaveLength(0)
    })

    it('en UTM se avisa igual', () => {
      const puntos = plataforma().map((q) => ({
        ...q,
        x: q.x + 350000.123,
        y: q.y + 8600000.456,
        z: q.x === 5 && q.y === 5 ? 101.5 : q.z,
      }))
      const picos = triangular(puntos).avisos.filter((a) => a.tipo === 'pico')
      expect(picos).toHaveLength(1)
      if (picos[0]!.tipo === 'pico') expect(picos[0]!.diferencia).toBeCloseTo(1.5, 6)
    })
  })

  describe('opciones inválidas: error, no un resultado raro', () => {
    const puntos = grilla(0, 3, 1, plano)
    it.each([
      ['toleranciaDuplicado', 0],
      ['toleranciaDuplicado', -0.001],
      ['toleranciaDuplicado', Number.NaN],
      ['ladoMaximo', Number.NaN],
      ['ladoMaximo', 0],
      ['ladoMaximo', -5],
      ['ladoMaximo', Number.POSITIVE_INFINITY],
      ['toleranciaCercanos', 0],
      ['umbralPico', -1],
    ])('%s = %s', (opcion, valor) => {
      expect(() => triangular(puntos, { [opcion]: valor })).toThrow(/número positivo/)
    })
  })

  it('un punto sin número no entra y se avisa (nunca en silencio)', () => {
    const sup = triangular([p('A', 0, 0, 100), p('B', 10, 0, 100), p('C', 0, 10, 100), p('X', 3, 3, Number.NaN)])
    expect(sup.puntos).toHaveLength(3)
    expect(sup.avisos).toEqual([expect.objectContaining({ tipo: 'sin-numero', id: 'X' })])
  })

  it('puntos en línea o menos de tres: superficie vacía con aviso, sin romperse', () => {
    const enLinea = triangular([p('A', 0, 0, 100), p('B', 1, 1, 100), p('C', 2, 2, 100)])
    expect(enLinea.triangulos).toHaveLength(0)
    expect(enLinea.avisos).toEqual([expect.objectContaining({ tipo: 'sin-superficie' })])
    expect(cotaDeSuperficie(enLinea, 1, 1)).toBeNull()
    expect(triangular([]).triangulos).toHaveLength(0)
  })

  describe('huecos: no se inventa terreno', () => {
    // grilla de 0 a 20 sin los puntos de 8 a 12: hueco de 6 × 6 m en el medio
    const conHueco = grilla(0, 20, 1, plano).filter((q) => !(q.x > 7 && q.x < 13 && q.y > 7 && q.y < 13))

    it('el medio del hueco queda sin superficie', () => {
      const sup = triangular(conHueco)
      expect(sup.quitadosPorLado).toBeGreaterThan(0)
      expect(cotaDeSuperficie(sup, 10, 10)).toBeNull()
      expect(cotaDeSuperficie(sup, 3, 3)).not.toBeNull()
    })

    it('los triángulos quitados se avisan con el lado máximo y el área (nunca en silencio)', () => {
      const sup = triangular(conHueco)
      const avisos = sup.avisos.filter((a) => a.tipo === 'lado-maximo')
      expect(avisos).toHaveLength(1)
      const a = avisos[0]!
      if (a.tipo !== 'lado-maximo') return
      expect(a.quitados).toBe(sup.quitadosPorLado)
      expect(a.ladoMaximo).toBeCloseTo(3 * Math.SQRT2, 9)
      // hueco de 6 × 6 = 36 m²; con el lado máximo por defecto queda vacía la mitad
      expect(a.areaQuitada).toBeCloseTo(18, 9)
      expect(a.puntosSueltos).toEqual([])
      expect(a.mensaje).toContain('4.24 m')
      expect(a.mensaje).toContain('18 m²')
      // sin triángulos quitados no hay aviso
      expect(triangular(grilla(0, 10, 1, plano)).avisos).toEqual([])
    })

    it('levantamiento mixto: la ladera rala se pierde, y se dice cuánto y qué puntos', () => {
      // lote denso a 1 m (0..20 × 0..20) y ladera tomada cada 5 × 12 m más al norte
      const lote = grilla(0, 20, 1, plano)
      const ladera: PuntoTerreno[] = []
      for (let i = 0; i <= 4; i++) {
        for (let j = 1; j <= 4; j++) ladera.push(p(`L${i}-${j}`, i * 5, 20 + j * 12, 100 + j))
      }
      const sup = triangular([...lote, ...ladera])
      expect(cotaDeSuperficie(sup, 10, 40)).toBeNull()
      const a = sup.avisos.find((x) => x.tipo === 'lado-maximo')
      expect(a).toBeDefined()
      if (a?.tipo !== 'lado-maximo') return
      expect(a.areaQuitada).toBeGreaterThan(20 * 48 - 1)
      expect(a.puntosSueltos).toHaveLength(ladera.length)
      expect(a.mensaje).toContain('suba el lado máximo')
      // con el lado máximo que pide la ladera, vuelve
      expect(cotaDeSuperficie(triangular([...lote, ...ladera], { ladoMaximo: 15 }), 10, 40)).not.toBeNull()
    })

    it('el lado máximo por defecto es 3 × la mediana del lado mayor de cada triángulo', () => {
      const sup = triangular(grilla(0, 10, 1, plano))
      // en una grilla de 1 m el lado mayor de cada triángulo es la diagonal
      expect(sup.ladoMaximo).toBeCloseTo(3 * Math.SQRT2, 9)
    })

    it('con un lado máximo grande sí se rellena', () => {
      const sup = triangular(conHueco, { ladoMaximo: 100 })
      expect(sup.quitadosPorLado).toBe(0)
      expect(cotaDeSuperficie(sup, 10, 10)!.z).toBeCloseTo(plano(10), 9)
    })

    it('una muesca cóncava en el borde tampoco se rellena', () => {
      // forma de L: falta el cuadrante x > 10, y > 10
      const ele = grilla(0, 20, 1, plano).filter((q) => !(q.x > 10 && q.y > 10))
      const sup = triangular(ele)
      expect(cotaDeSuperficie(sup, 16, 16)).toBeNull()
      expect(cotaDeSuperficie(sup, 5, 16)).not.toBeNull()
    })

    it('secciones transversales separadas (pocas tomas por sección) no se borran', () => {
      // 6 secciones cada 20 m con tomas cada 1.5 m: los triángulos van de una sección a otra
      const puntos: PuntoTerreno[] = []
      for (let s = 0; s <= 5; s++) {
        for (let k = 0; k <= 6; k++) puntos.push(p(`S${s}-${k}`, s * 20, k * 1.5, 100 + s * 0.1))
      }
      const sup = triangular(puntos)
      expect(sup.quitadosPorLado).toBe(0)
      expect(cotaDeSuperficie(sup, 50, 4)!.z).toBeCloseTo(100.25, 9)
    })
  })

  // Holgura amplia: en una máquina cargada el tiempo varía; lo que se vigila es
  // que no se vuelva cuadrático (eso tardaría decenas de segundos).
  it('rinde: 5 000 puntos sin volverse lento', () => {
    const nube = nubeAlAzar(5000, 500)
    const t0 = Date.now()
    const sup = triangular(nube)
    const ms = Date.now() - t0
    expect(sup.triangulos.length).toBeGreaterThan(9000)
    expect(ms).toBeLessThan(5000)
  })
})
