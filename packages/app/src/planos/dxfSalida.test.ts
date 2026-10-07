import { describe, expect, it } from 'vitest'
import DxfParser from 'dxf-parser'
import type { IPointEntity, IPolylineEntity } from 'dxf-parser'
import { aciAHex, leerDxf } from './dxf'
import {
  CAPAS_SALIDA,
  ErrorDxfSalida,
  escribirDxf,
  formatoCota,
  giroLegible,
  numeroDxf,
  type CurvaSalida,
  type EntradaDxf,
  type PerfilSalida,
} from './dxfSalida'

// ─── Ayudas ────────────────────────────────────────────────────────────────

/** Los pares código/valor del archivo, sin espacios. */
function grupos(texto: string): [string, string][] {
  const lineas = texto.split('\r\n')
  // El archivo termina en salto de línea: la última «línea» está vacía.
  expect(lineas[lineas.length - 1]).toBe('')
  lineas.pop()
  expect(lineas.length % 2).toBe(0)
  const pares: [string, string][] = []
  for (let i = 0; i < lineas.length; i += 2) pares.push([lineas[i]!.trim(), lineas[i + 1]!])
  return pares
}

/** Las entidades de la sección ENTITIES, cada una con sus grupos. */
function entidades(texto: string): { tipo: string; g: [string, string][] }[] {
  const pares = grupos(texto)
  const inicio = pares.findIndex(([c, v], i) => c === '0' && v === 'SECTION' && pares[i + 1]?.[1] === 'ENTITIES')
  expect(inicio).toBeGreaterThanOrEqual(0)
  const lista: { tipo: string; g: [string, string][] }[] = []
  for (let i = inicio + 2; i < pares.length; i++) {
    const [c, v] = pares[i]!
    if (c === '0' && v === 'ENDSEC') break
    if (c === '0') lista.push({ tipo: v, g: [] })
    else lista[lista.length - 1]!.g.push([c, v])
  }
  return lista
}

const valor = (g: [string, string][], codigo: string) => g.find(([c]) => c === codigo)?.[1]

/** Capa y número de vértices de cada POLYLINE, en orden. */
function polilineas(texto: string): { capa: string; vertices: number; bandera: string }[] {
  const lista: { capa: string; vertices: number; bandera: string }[] = []
  for (const e of entidades(texto)) {
    if (e.tipo === 'POLYLINE') lista.push({ capa: valor(e.g, '8')!, vertices: 0, bandera: valor(e.g, '70')! })
    else if (e.tipo === 'VERTEX') lista[lista.length - 1]!.vertices++
  }
  return lista
}

const curvaMenor: CurvaSalida = {
  cota: 3244.5,
  maestra: false,
  puntos: [
    { x: 1000, y: 2000 },
    { x: 1010, y: 2001.25 },
    { x: 1020, y: 2003 },
  ],
  cerrada: false,
  comprobada: true,
}
const curvaMaestra: CurvaSalida = {
  cota: 3245,
  maestra: true,
  puntos: [
    { x: 1000, y: 2010 },
    { x: 1020, y: 2010 },
    { x: 1020, y: 2030 },
    { x: 1000, y: 2030 },
  ],
  cerrada: true,
  comprobada: true,
  // Como los entrega el motor: uno cada tanto, con giro y texto ya puestos.
  rotulos: [
    { x: 1020, y: 2020, angulo: 90, texto: '3245.00' },
    { x: 1000, y: 2020, angulo: -90, texto: '3245.00' },
  ],
}

const completa: EntradaDxf = {
  curvas: [curvaMenor, curvaMaestra],
  puntos: [
    { x: 1005.1234, y: 2005.5678, z: 3244.8765, nombre: 'E-1', comprobado: true },
    { x: 1015, y: 2025, z: 3245.2, comprobado: true },
  ],
  perfil: [
    {
      puntos: [
        { x: 0, y: 0 },
        { x: 20, y: 1.5 },
        { x: 40, y: 0.8 },
      ],
      comprobado: true,
    },
  ],
  textos: [{ x: 1030, y: 2040, texto: 'Calle Lima', altura: 2, capa: 'ROTULOS' }],
  alturaTexto: 1.5,
}

const TODAS_LAS_CAPAS = ['0', ...CAPAS_SALIDA.map((c) => c.nombre)]

// ─── Números ───────────────────────────────────────────────────────────────

describe('numeroDxf', () => {
  it('escribe con punto decimal y 3 decimales', () => {
    expect(numeroDxf(1005.1234)).toBe('1005.123')
    expect(numeroDxf(2)).toBe('2.000')
    expect(numeroDxf(-12.3456)).toBe('-12.346')
  })
  it('redondea la mitad al milímetro alejándose del cero, sin error binario', () => {
    expect(numeroDxf(3244.8765)).toBe('3244.877')
    expect(numeroDxf(-1.0005)).toBe('-1.001')
  })
  it('no escribe −0', () => {
    expect(numeroDxf(-0)).toBe('0.000')
    expect(numeroDxf(-0.0001)).toBe('0.000')
  })
  it('rechaza lo que no es número', () => {
    expect(() => numeroDxf(Number.NaN)).toThrow(ErrorDxfSalida)
    expect(() => numeroDxf(Number.POSITIVE_INFINITY)).toThrow(ErrorDxfSalida)
  })
})

describe('formatoCota', () => {
  it('cota entera sin decimales, la demás con los que tenga hasta 2', () => {
    expect(formatoCota(3245)).toBe('3245')
    expect(formatoCota(3244.5)).toBe('3244.5')
    expect(formatoCota(3244.25)).toBe('3244.25')
    expect(formatoCota(3244.2500001)).toBe('3244.25')
  })
})

describe('giroLegible', () => {
  it('lleva el giro a (−90°, 90°]: 90 queda, −90 pasa a 90, 180 a 0, 225 a 45', () => {
    expect(giroLegible(90)).toBe(90)
    expect(giroLegible(-90)).toBe(90)
    expect(giroLegible(180)).toBe(0)
    expect(giroLegible(225)).toBe(45)
    expect(giroLegible(-135)).toBe(45)
    expect(giroLegible(450)).toBe(90)
    expect(giroLegible(30)).toBe(30)
  })
})

// ─── Estructura del archivo ────────────────────────────────────────────────

describe('estructura R12', () => {
  const { texto } = escribirDxf(completa)
  const pares = grupos(texto)

  it('empieza con HEADER y declara AC1009', () => {
    expect(pares[0]).toEqual(['0', 'SECTION'])
    expect(pares[1]).toEqual(['2', 'HEADER'])
    const i = pares.findIndex(([c, v]) => c === '9' && v === '$ACADVER')
    expect(pares[i + 1]).toEqual(['1', 'AC1009'])
  })

  it('las secciones van HEADER, TABLES, ENTITIES y termina en EOF', () => {
    const secciones = pares.flatMap(([c, v], i) => (c === '0' && v === 'SECTION' ? [pares[i + 1]![1]] : []))
    expect(secciones).toEqual(['HEADER', 'TABLES', 'ENTITIES'])
    expect(pares[pares.length - 1]).toEqual(['0', 'EOF'])
    const abiertas = pares.filter(([c, v]) => c === '0' && v === 'SECTION').length
    const cerradas = pares.filter(([c, v]) => c === '0' && v === 'ENDSEC').length
    expect(cerradas).toBe(abiertas)
  })

  it('la tabla LAYER trae la capa 0 y todas las capas, cada una con color y su tipo de línea', () => {
    const capas = pares.flatMap(([c, v], i) =>
      c === '0' && v === 'LAYER' && pares[i + 1]?.[0] === '2'
        ? [{ nombre: pares[i + 1]![1], color: pares[i + 3]![1], tipo: pares[i + 4]![1] }]
        : [],
    )
    expect(capas.map((c) => c.nombre)).toEqual(TODAS_LAS_CAPAS)
    expect(capas.find((c) => c.nombre === 'CURVAS_NO_COMPROBADAS')!.tipo).toBe('DASHED')
    expect(capas.find((c) => c.nombre === 'CURVAS_MAESTRAS_NO_COMPROBADAS')!.tipo).toBe('DASHED')
    expect(capas.find((c) => c.nombre === 'PERFIL_NO_COMPROBADO')!.tipo).toBe('DASHED')
    expect(capas.find((c) => c.nombre === 'CURVAS')!.tipo).toBe('CONTINUOUS')
    // Cuenta de la tabla (grupo 70 tras «2 LAYER»).
    const t = pares.findIndex(([c, v], i) => c === '0' && v === 'TABLE' && pares[i + 1]?.[1] === 'LAYER')
    expect(pares[t + 2]).toEqual(['70', String(CAPAS_SALIDA.length + 1)])
    // Los dos tipos de línea están definidos; la discontinua con trazo y hueco.
    const tl = pares.findIndex(([c, v], i) => c === '0' && v === 'TABLE' && pares[i + 1]?.[1] === 'LTYPE')
    expect(pares[tl + 2]).toEqual(['70', '2'])
    const d = pares.findIndex(([c, v]) => c === '2' && v === 'DASHED')
    expect(pares.slice(d + 3, d + 8)).toEqual([
      ['72', '65'],
      ['73', '2'],
      ['40', '4.500'],
      ['49', '3.000'],
      ['49', '-1.500'],
    ])
  })

  it('declara metros y los límites exactos del dibujo, con la cota mínima y máxima', () => {
    const i = pares.findIndex(([c, v]) => c === '9' && v === '$INSUNITS')
    expect(pares[i + 1]).toEqual(['70', '6'])
    const min = pares.findIndex(([c, v]) => c === '9' && v === '$EXTMIN')
    expect(pares.slice(min + 1, min + 4)).toEqual([
      ['10', '0.000'],
      ['20', '0.000'],
      ['30', '3244.500'],
    ])
    const max = pares.findIndex(([c, v]) => c === '9' && v === '$EXTMAX')
    expect(pares.slice(max + 1, max + 4)).toEqual([
      ['10', '1030.000'],
      ['20', '2040.000'],
      ['30', '3245.200'],
    ])
  })

  it('los puntos se dibujan visibles ($PDMODE 3)', () => {
    const i = pares.findIndex(([c, v]) => c === '9' && v === '$PDMODE')
    expect(pares[i + 1]).toEqual(['70', '3'])
  })

  it('todas las coordenadas (10-31) llevan punto y 3 decimales', () => {
    const coords = pares.filter(([c]) => ['10', '20', '30', '11', '21', '31'].includes(c))
    expect(coords.length).toBeGreaterThan(20)
    for (const [, v] of coords) expect(v).toMatch(/^-?\d+\.\d{3}$/)
    expect(texto).not.toMatch(/\d,\d/)
  })

  it('sin nada que dibujar sigue siendo un DXF completo', () => {
    const vacio = escribirDxf({})
    const p = grupos(vacio.texto)
    expect(p[p.length - 1]).toEqual(['0', 'EOF'])
    expect(entidades(vacio.texto)).toEqual([])
    expect(vacio.avisos).toEqual(['No hay nada que dibujar.'])
  })

  it('un terreno grande (200 curvas de 300 vértices) se escribe sin reventar la pila', () => {
    const curvas: CurvaSalida[] = []
    for (let k = 0; k < 200; k++) {
      const puntos = Array.from({ length: 300 }, (_, i) => ({ x: i * 0.5, y: k * 2 + Math.sin(i / 10) }))
      curvas.push({ cota: 3200 + k * 0.5, maestra: k % 10 === 0, cerrada: false, comprobada: true, puntos })
    }
    const r = escribirDxf({ curvas })
    expect(r.avisos).toEqual([])
    const lista = polilineas(r.texto)
    expect(lista).toHaveLength(200)
    expect(lista.every((p) => p.vertices === 300)).toBe(true)
    expect(r.texto.endsWith('  0\r\nEOF\r\n')).toBe(true)
  })
})

// ─── Curvas ────────────────────────────────────────────────────────────────

describe('curvas de nivel', () => {
  it('cada curva es una POLYLINE con su cota como elevación (grupo 30) y SEQEND', () => {
    const ents = entidades(escribirDxf({ curvas: [curvaMenor] }).texto)
    expect(ents.map((e) => e.tipo)).toEqual(['POLYLINE', 'VERTEX', 'VERTEX', 'VERTEX', 'SEQEND'])
    const [pl, v1, v2] = ents
    expect(valor(pl!.g, '8')).toBe('CURVAS')
    expect(valor(pl!.g, '66')).toBe('1')
    expect(valor(pl!.g, '30')).toBe('3244.500')
    expect(valor(pl!.g, '70')).toBe('0')
    expect(valor(v1!.g, '8')).toBe('CURVAS')
    expect(valor(v2!.g, '10')).toBe('1010.000')
    expect(valor(v2!.g, '20')).toBe('2001.250')
  })

  it('la maestra va en CURVAS_MAESTRAS y cerrada lleva 70=1 sin repetir el primer punto', () => {
    const ents = entidades(escribirDxf({ curvas: [curvaMaestra], rotularCurvas: false }).texto)
    expect(valor(ents[0]!.g, '8')).toBe('CURVAS_MAESTRAS')
    expect(valor(ents[0]!.g, '70')).toBe('1')
    expect(ents.filter((e) => e.tipo === 'VERTEX')).toHaveLength(4)
  })

  it('si el primer punto se repite al final de una cerrada, se escribe una sola vez', () => {
    const repetida = { ...curvaMaestra, puntos: [...curvaMaestra.puntos, curvaMaestra.puntos[0]!] }
    const ents = entidades(escribirDxf({ curvas: [repetida], rotularCurvas: false }).texto)
    expect(ents.filter((e) => e.tipo === 'VERTEX')).toHaveLength(4)
  })

  it('escribe los rótulos del motor: todos, en su sitio, con su texto y sin quedar de cabeza', () => {
    const ents = entidades(escribirDxf({ curvas: [curvaMaestra], alturaTexto: 1.5 }).texto)
    const rotulos = ents.filter((e) => e.tipo === 'TEXT').map((e) => e.g)
    expect(rotulos).toHaveLength(2)
    for (const t of rotulos) {
      expect(valor(t, '8')).toBe('ROTULOS')
      // El mismo texto que en pantalla.
      expect(valor(t, '1')).toBe('3245.00')
      expect(valor(t, '40')).toBe('1.500')
      expect(valor(t, '72')).toBe('4')
      expect(valor(t, '50')).toBe('90.000')
    }
    expect([valor(rotulos[0]!, '11'), valor(rotulos[0]!, '21')]).toEqual(['1020.000', '2020.000'])
    expect([valor(rotulos[1]!, '11'), valor(rotulos[1]!, '21')]).toEqual(['1000.000', '2020.000'])
  })

  it('un rótulo con ángulo de cabeza se endereza; sin rótulos o con rotularCurvas false no hay TEXT', () => {
    const deCabeza: CurvaSalida = { ...curvaMenor, rotulos: [{ x: 5, y: 0, angulo: 200, texto: '3244.50' }] }
    const t = entidades(escribirDxf({ curvas: [deCabeza] }).texto).find((e) => e.tipo === 'TEXT')!.g
    expect(Number(valor(t, '50'))).toBeCloseTo(20, 3)
    expect(entidades(escribirDxf({ curvas: [curvaMenor] }).texto).some((e) => e.tipo === 'TEXT')).toBe(false)
    expect(entidades(escribirDxf({ curvas: [deCabeza], rotularCurvas: false }).texto).some((e) => e.tipo === 'TEXT')).toBe(false)
  })

  it('una curva con menos de 2 puntos distintos o sin puntos no se escribe y se avisa', () => {
    const r = escribirDxf({
      curvas: [
        curvaMenor,
        { cota: 3246, maestra: false, cerrada: false, comprobada: true, puntos: [{ x: 1, y: 1 }, { x: 1, y: 1 }] },
        { cota: 3247, maestra: false, cerrada: false, comprobada: true, puntos: [] },
      ],
    })
    expect(polilineas(r.texto)).toHaveLength(1)
    expect(r.avisos).toEqual([
      'Curva de cota 3246 sin largo: no se escribió.',
      'Curva de cota 3247 sin largo: no se escribió.',
    ])
  })

  it('una coordenada que no es número detiene la escritura con un mensaje claro', () => {
    const mala: CurvaSalida = { ...curvaMenor, puntos: [{ x: 0, y: 0 }, { x: Number.NaN, y: 1 }] }
    expect(() => escribirDxf({ curvas: [mala] })).toThrow(/Curva de cota 3244.5/)
    expect(() => escribirDxf({ curvas: [{ ...curvaMenor, cota: Number.NaN }] })).toThrow(ErrorDxfSalida)
  })
})

// ─── Lo no comprobado ─────────────────────────────────────────────────────

describe('curvas no comprobadas', () => {
  it('una curva no comprobada va en su capa discontinua, su rótulo lo dice y se avisa', () => {
    const r = escribirDxf({ curvas: [{ ...curvaMaestra, comprobada: false }] })
    const lista = polilineas(r.texto)
    expect(lista).toEqual([{ capa: 'CURVAS_MAESTRAS_NO_COMPROBADAS', vertices: 4, bandera: '1' }])
    const textos = entidades(r.texto).filter((e) => e.tipo === 'TEXT')
    expect(textos.map((t) => valor(t.g, '1'))).toEqual(['3245.00 (no comprobada)', '3245.00 (no comprobada)'])
    expect(r.avisos).toHaveLength(1)
    expect(r.avisos[0]).toMatch(/^1 curva tiene tramos no comprobados/)
    // La menor no comprobada va a CURVAS_NO_COMPROBADAS.
    expect(polilineas(escribirDxf({ curvas: [{ ...curvaMenor, comprobada: false }] }).texto)[0]!.capa).toBe(
      'CURVAS_NO_COMPROBADAS',
    )
  })

  it('una curva abierta con tramos mezclados se parte por capas en el punto donde cambia', () => {
    const mezclada: CurvaSalida = {
      ...curvaMenor,
      puntos: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
        { x: 3, y: 0 },
        { x: 4, y: 0 },
      ],
      comprobada: false,
      tramosComprobados: [true, true, false, true],
    }
    const r = escribirDxf({ curvas: [mezclada] })
    expect(polilineas(r.texto)).toEqual([
      { capa: 'CURVAS', vertices: 3, bandera: '0' },
      { capa: 'CURVAS_NO_COMPROBADAS', vertices: 2, bandera: '0' },
      { capa: 'CURVAS', vertices: 2, bandera: '0' },
    ])
    // Todas a la misma cota.
    const elevaciones = entidades(r.texto).filter((e) => e.tipo === 'POLYLINE').map((e) => valor(e.g, '30'))
    expect(elevaciones).toEqual(['3244.500', '3244.500', '3244.500'])
  })

  it('una cerrada como la da el motor (primer punto repetido) con tramos mezclados une el pedazo que cruza el cierre', () => {
    const p = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 0, y: 0 },
    ]
    const r = escribirDxf({
      curvas: [{ cota: 3250, maestra: true, cerrada: true, comprobada: false, puntos: p, tramosComprobados: [true, false, true, true] }],
    })
    const lista = polilineas(r.texto)
    // Comprobado: (10,10)→(0,10)→(0,0)→(10,0); no comprobado: (10,0)→(10,10).
    expect(lista).toEqual([
      { capa: 'CURVAS_MAESTRAS', vertices: 4, bandera: '0' },
      { capa: 'CURVAS_MAESTRAS_NO_COMPROBADAS', vertices: 2, bandera: '0' },
    ])
    const v = entidades(r.texto).filter((e) => e.tipo === 'VERTEX').map((e) => [valor(e.g, '10'), valor(e.g, '20')])
    expect(v.slice(0, 4)).toEqual([
      ['10.000', '10.000'],
      ['0.000', '10.000'],
      ['0.000', '0.000'],
      ['10.000', '0.000'],
    ])
  })

  it('una cerrada sin el punto repetido acepta la marca del tramo de cierre', () => {
    const r = escribirDxf({
      curvas: [{ ...curvaMaestra, comprobada: false, rotulos: [], tramosComprobados: [true, true, true, false] }],
    })
    expect(polilineas(r.texto)).toEqual([
      { capa: 'CURVAS_MAESTRAS', vertices: 4, bandera: '0' },
      { capa: 'CURVAS_MAESTRAS_NO_COMPROBADAS', vertices: 2, bandera: '0' },
    ])
  })

  it('si las marcas de tramo no cuadran con los tramos, detiene con un mensaje', () => {
    expect(() => escribirDxf({ curvas: [{ ...curvaMenor, tramosComprobados: [true] }] })).toThrow(
      /Curva de cota 3244.5: trae 1 marcas de tramo comprobado para 2 tramos/,
    )
  })

  it('si la curva dice no comprobada se le cree aunque sus tramos digan que sí', () => {
    const r = escribirDxf({ curvas: [{ ...curvaMenor, comprobada: false, tramosComprobados: [true, true] }] })
    expect(polilineas(r.texto)[0]!.capa).toBe('CURVAS_NO_COMPROBADAS')
  })
})

// ─── Puntos, perfil y textos ───────────────────────────────────────────────

describe('puntos', () => {
  it('cada punto es un POINT con su cota en PUNTOS; el nombre va como TEXT en ROTULOS', () => {
    const ents = entidades(
      escribirDxf({ puntos: [{ x: 1005.1234, y: 2005.5678, z: 3244.8765, nombre: 'E-1', comprobado: true }] }).texto,
    )
    expect(ents.map((e) => e.tipo)).toEqual(['POINT', 'TEXT'])
    const p = ents[0]!.g
    expect(valor(p, '8')).toBe('PUNTOS')
    expect([valor(p, '10'), valor(p, '20'), valor(p, '30')]).toEqual(['1005.123', '2005.568', '3244.877'])
    const t = ents[1]!.g
    expect(valor(t, '8')).toBe('ROTULOS')
    expect(valor(t, '1')).toBe('E-1')
  })

  it('con rotularCotaPuntos el rótulo lleva también la cota', () => {
    const ents = entidades(
      escribirDxf({ puntos: [{ x: 0, y: 0, z: 3244.8765, nombre: 'E-1', comprobado: true }], rotularCotaPuntos: true }).texto,
    )
    expect(valor(ents[1]!.g, '1')).toBe('E-1 3244.877')
  })

  it('un punto sin nombre no lleva rótulo', () => {
    const ents = entidades(escribirDxf({ puntos: [{ x: 0, y: 0, z: 1, comprobado: true }] }).texto)
    expect(ents.map((e) => e.tipo)).toEqual(['POINT'])
  })

  it('un punto no comprobado (GNSS flotante, nivelación sin cerrar) va en su capa y su rótulo lo dice', () => {
    const r = escribirDxf({
      puntos: [{ x: 0, y: 0, z: 3244.8765, nombre: 'G-3', comprobado: false }],
      rotularCotaPuntos: true,
    })
    const ents = entidades(r.texto)
    expect(valor(ents[0]!.g, '8')).toBe('PUNTOS_NO_COMPROBADOS')
    expect(valor(ents[1]!.g, '1')).toBe('G-3 3244.877 (no comprobado)')
    expect(r.avisos).toEqual(['1 punto no comprobado va en la capa PUNTOS_NO_COMPROBADOS.'])
  })

  it('un punto sin cota o sin coordenadas se salta con su nombre en avisos; los demás se escriben', () => {
    const r = escribirDxf({
      puntos: [
        { x: 0, y: 0, z: 3244, nombre: 'E-1', comprobado: true },
        { x: 1, y: 1, z: Number.NaN, nombre: 'E-2', comprobado: true },
        { x: Number.NaN, y: 1, z: 3244, nombre: 'E-3', comprobado: true },
        { x: 2, y: 2, z: Number.NaN, comprobado: true },
      ],
    })
    const puntos = entidades(r.texto).filter((e) => e.tipo === 'POINT')
    expect(puntos).toHaveLength(1)
    expect(r.avisos).toEqual([
      'Punto E-2 sin cota: no se escribió.',
      'Punto E-3 sin coordenadas: no se escribió.',
      'Punto n.º 4 sin cota: no se escribió.',
    ])
  })

  it('dos puntos en el mismo sitio con cotas distintas se escriben y se avisa; con la misma cota no', () => {
    const r = escribirDxf({
      puntos: [
        { x: 10, y: 20, z: 3244.1, nombre: 'E-1', comprobado: true },
        { x: 10.0004, y: 20, z: 3244.35, nombre: 'E-9', comprobado: true },
        { x: 10, y: 20, z: 3244.1, nombre: 'E-10', comprobado: true },
      ],
    })
    expect(entidades(r.texto).filter((e) => e.tipo === 'POINT')).toHaveLength(3)
    expect(r.avisos).toEqual([
      'Punto E-1 y Punto E-9 están en el mismo sitio con cotas distintas (3244.100 y 3244.350): se escribieron los dos; revise cuál vale.',
    ])
  })
})

describe('perfil y textos sueltos', () => {
  it('el perfil es una POLYLINE 2D (70=0, elevación 0) en PERFIL', () => {
    const ents = entidades(escribirDxf({ perfil: completa.perfil }).texto)
    expect(ents.map((e) => e.tipo)).toEqual(['POLYLINE', 'VERTEX', 'VERTEX', 'VERTEX', 'SEQEND'])
    expect(valor(ents[0]!.g, '8')).toBe('PERFIL')
    expect(valor(ents[0]!.g, '70')).toBe('0')
    expect(valor(ents[0]!.g, '30')).toBe('0.000')
    expect(valor(ents[2]!.g, '20')).toBe('1.500')
  })

  it('los tramos no comprobados del perfil van en PERFIL_NO_COMPROBADO y se avisa', () => {
    const perfil: PerfilSalida = { ...completa.perfil![0]!, comprobado: false, tramosComprobados: [true, false] }
    const r = escribirDxf({ perfil: [perfil] })
    expect(polilineas(r.texto)).toEqual([
      { capa: 'PERFIL', vertices: 2, bandera: '0' },
      { capa: 'PERFIL_NO_COMPROBADO', vertices: 2, bandera: '0' },
    ])
    expect(r.avisos).toEqual(['El perfil tiene tramos no comprobados: van en la capa PERFIL_NO_COMPROBADO, con línea discontinua.'])
  })

  it('un perfil vacío o de un solo punto no se escribe y se avisa', () => {
    const r = escribirDxf({
      perfil: [
        { puntos: [], comprobado: true },
        { puntos: [{ x: 0, y: 0 }], comprobado: true },
      ],
    })
    expect(entidades(r.texto)).toEqual([])
    expect(r.avisos).toEqual(['Perfil 1 sin largo: no se escribió.', 'Perfil 2 sin largo: no se escribió.', 'No hay nada que dibujar.'])
  })

  it('un texto suelto conserva capa, altura y giro (±90° exactos); sin capa va a ROTULOS', () => {
    const ents = entidades(
      escribirDxf({
        textos: [
          { x: 1, y: 2, texto: 'Km 0+020', altura: 2, rotacion: 90, capa: 'PERFIL' },
          { x: 3, y: 4, texto: 'BM-1', altura: 1, rotacion: -90 },
        ],
      }).texto,
    )
    expect(valor(ents[0]!.g, '8')).toBe('PERFIL')
    expect(valor(ents[0]!.g, '40')).toBe('2.000')
    expect(valor(ents[0]!.g, '50')).toBe('90.000')
    expect(valor(ents[1]!.g, '8')).toBe('ROTULOS')
    expect(valor(ents[1]!.g, '50')).toBe('-90.000')
  })

  it('los caracteres fuera de ASCII van como \\U+XXXX y los saltos de línea como espacio', () => {
    const ents = entidades(escribirDxf({ textos: [{ x: 0, y: 0, texto: 'Pañuelo 45°\nlado', altura: 1 }] }).texto)
    expect(valor(ents[0]!.g, '1')).toBe('Pa\\U+00F1uelo 45\\U+00B0 lado')
  })

  it('un texto vacío no se escribe y se avisa; una altura no positiva o una x que no es número detienen', () => {
    const r = escribirDxf({ textos: [{ x: 0, y: 0, texto: '  ', altura: 1 }] })
    expect(entidades(r.texto)).toEqual([])
    expect(r.avisos).toContain('Texto vacío en (0.000, 0.000): no se escribió.')
    expect(() => escribirDxf({ textos: [{ x: 0, y: 0, texto: 'a', altura: 0 }] })).toThrow(ErrorDxfSalida)
    expect(() => escribirDxf({ textos: [{ x: Number.NaN, y: 0, texto: 'a', altura: 1 }] })).toThrow(/Texto «a»/)
  })
})

// ─── Ida y vuelta con el lector de la app ─────────────────────────────────

describe('ida y vuelta', () => {
  const { texto } = escribirDxf(completa)

  it('el lector de la app lo lee con las mismas capas, coordenadas y la cota de cada curva', () => {
    const plano = leerDxf(texto)
    expect(plano.capas.map((c) => c.nombre).sort()).toEqual([...TODAS_LAS_CAPAS].sort())
    for (const capa of CAPAS_SALIDA) {
      const leida = plano.capas.find((c) => c.nombre === capa.nombre)!
      expect(leida.visible).toBe(true)
      expect(leida.color).toBe(aciAHex(capa.color))
    }
    // 2 curvas + 1 perfil.
    expect(plano.polilineas).toHaveLength(3)
    const [menor, maestra, perfil] = plano.polilineas
    expect(menor!.capa).toBe('CURVAS')
    expect(menor!.puntos).toEqual(curvaMenor.puntos)
    expect(menor!.elevacion).toBe(3244.5)
    expect(maestra!.capa).toBe('CURVAS_MAESTRAS')
    expect(maestra!.cerrada).toBe(true)
    expect(maestra!.puntos).toEqual(curvaMaestra.puntos)
    expect(maestra!.elevacion).toBe(3245)
    expect(perfil!.capa).toBe('PERFIL')
    expect(perfil!.puntos).toEqual(completa.perfil![0]!.puntos)
    expect(perfil!.elevacion).toBeUndefined()
    // Rótulos de la maestra, nombre del punto y texto suelto.
    expect(plano.textos.map((t) => t.texto)).toEqual(['3245.00', '3245.00', 'E-1', 'Calle Lima'])
    expect(plano.textos[0]!.ancla).toBe('medio-centro')
    expect(plano.textos[0]!.altura).toBe(1.5)
    expect(plano.textos[3]!.altura).toBe(2)
    // El lector de la app no dibuja POINT, pero los cuenta.
    expect(plano.ignoradas).toEqual({ POINT: 2 })
    expect(plano.unidades).toBe('m')
  })

  it('las curvas no comprobadas vuelven en su capa y con su cota', () => {
    const r = escribirDxf({
      curvas: [{ ...curvaMenor, comprobada: false, tramosComprobados: [true, false] }],
    })
    const plano = leerDxf(r.texto)
    expect(plano.polilineas.map((p) => [p.capa, p.elevacion])).toEqual([
      ['CURVAS', 3244.5],
      ['CURVAS_NO_COMPROBADAS', 3244.5],
    ])
  })

  it('el texto con \\U+ vuelve como el original', () => {
    const plano = leerDxf(escribirDxf({ textos: [{ x: 0, y: 0, texto: 'Ñaña 45°', altura: 1 }] }).texto)
    expect(plano.textos[0]!.texto).toBe('Ñaña 45°')
  })

  it('dxf-parser lee las capas, los tipos de línea y las cotas de los puntos', () => {
    const dxf = new DxfParser().parseSync(texto)!
    const polis = dxf.entities.filter((e) => e.type === 'POLYLINE') as IPolylineEntity[]
    expect(polis).toHaveLength(3)
    expect(polis.every((p) => !p.is3dPolyline)).toBe(true)
    const puntos = dxf.entities.filter((e) => e.type === 'POINT') as IPointEntity[]
    expect(puntos.map((p) => [p.position.x, p.position.y, p.position.z])).toEqual([
      [1005.123, 2005.568, 3244.877],
      [1015, 2025, 3245.2],
    ])
    expect(Object.keys(dxf.tables.layer.layers).sort()).toEqual([...TODAS_LAS_CAPAS].sort())
    expect(Object.keys(dxf.tables.lineType.lineTypes).sort()).toEqual(['CONTINUOUS', 'DASHED'])
  })
})
