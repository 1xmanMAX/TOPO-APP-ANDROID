import { describe, expect, it } from 'vitest'
import { calcularCampania } from '../nivelacion/calcularCampania'
import type { Proyecto, Toma } from '../modelo/tipos'
import { BM_1, CALLE_EJEMPLO, CAPA_EJEMPLO, tomaEjemplo } from '../pruebas/libretaEjemplo'
import {
  alturaDePuesta,
  cotaDesdeLecturaDeMira,
  lecturaDeMiraParaCota,
  lecturaEnUnidad,
  lineaDeCapa,
  lineaDeConjunto,
  lineaDesdeTexto,
  nivelARegistrar,
  pendientesDeLinea,
  puestaDeLibreta,
  separacionEn,
  separacionEntreLineas,
  type ConjuntoNiveles,
  type LineaNivel,
  type Puesta,
  ERROR_MINIMO,
  ERROR_TOLERANCIA,
} from './niveles'

/*
 * Los datos de ejemplo de la herramienta de Max (`defaults()` de su HTML):
 * puesta 1 con BM 100.000 y atrás 1.500 → HI 101.500, lecturas en metros,
 * mira hacia abajo (Z = HI − L), separación mínima 5 cm, progresivas 0…40
 * cada 10 m.
 */
const PUESTA_1: Puesta = { tipo: 'rapida', nombre: 'Puesta 1', cotaBM: 100, lecturaAtras: 1.5 }
const texto = (lecturas: number[]) => lecturas.map((v, i) => `${i * 10}, ${v.toFixed(3)}`).join('\n')
const conjunto = (nombre: string, lecturas: number[]): ConjuntoNiveles => ({
  nombre,
  tipo: 'lectura',
  texto: texto(lecturas),
  puesta: PUESTA_1,
})
const EJEMPLO = {
  vi: conjunto('Vereda izquierda', [1.25, 1.26, 1.275, 1.29, 1.3]),
  bi: conjunto('Base izquierda', [1.45, 1.455, 1.47, 1.48, 1.49]),
  si: conjunto('Subbase izquierda', [1.65, 1.655, 1.67, 1.68, 1.69]),
  vd: conjunto('Vereda derecha', [1.24, 1.25, 1.265, 1.28, 1.29]),
  bd: conjunto('Base derecha', [1.44, 1.445, 1.46, 1.47, 1.48]),
  sd: conjunto('Subbase derecha', [1.64, 1.645, 1.66, 1.67, 1.68]),
}
const linea = (c: ConjuntoNiveles) => lineaDeConjunto(c).linea
const cotas = (l: LineaNivel) => l.puntos.map((p) => p.cota)

describe('lineaDesdeTexto: el formato «progresiva, valor» de su HTML', () => {
  it('acepta coma, punto y coma, tabulador y espacios; ordena por progresiva', () => {
    const leido = lineaDesdeTexto('20, 1.270\n0;1.250\n\n10\t1.260\n 30   1.280 ')
    expect(leido.pares).toEqual([
      { progresiva: 0, valor: 1.25 },
      { progresiva: 10, valor: 1.26 },
      { progresiva: 20, valor: 1.27 },
      { progresiva: 30, valor: 1.28 },
    ])
    expect(leido.avisos).toEqual([])
  })

  it('mejora: la línea que no se entiende se avisa con su número, no se pierde en silencio', () => {
    const leido = lineaDesdeTexto('0, 1.250\n10, abc\n20')
    expect(leido.pares).toHaveLength(1)
    expect(leido.avisos).toHaveLength(2)
    expect(leido.avisos[0]).toContain('Línea 2')
    expect(leido.avisos[1]).toContain('Línea 3')
  })

  it('con más de dos números toma los dos primeros, como su HTML, y lo dice', () => {
    const leido = lineaDesdeTexto('10, 1.250, 7')
    expect(leido.pares).toEqual([{ progresiva: 10, valor: 1.25 }])
    expect(leido.avisos[0]).toContain('Línea 1')
  })

  it('conserva las progresivas repetidas (su análisis las usa)', () => {
    expect(lineaDesdeTexto('10, 1.2\n10, 1.3').pares).toHaveLength(2)
  })
})

describe('puestas y unidades', () => {
  it('puesta rápida: HI = cota BM + atrás, y no está comprobada', () => {
    const a = alturaDePuesta(PUESTA_1)!
    expect(a.alturaInstrumental).toBeCloseTo(101.5, 9)
    expect(a.comprobado).toBe(false)
    expect(a.avisos.join(' ')).toContain('no comprobada')
  })

  it('puesta de la libreta: lleva su comprobación', () => {
    const a = alturaDePuesta({ tipo: 'libreta', alturaInstrumental: 3247.09, comprobado: true })!
    expect(a).toEqual({ alturaInstrumental: 3247.09, comprobado: true, avisos: [] })
  })

  it('puesta con un dato que no es número: null', () => {
    expect(alturaDePuesta({ tipo: 'rapida', cotaBM: Number.NaN, lecturaAtras: 1.5 })).toBeNull()
    expect(alturaDePuesta({ tipo: 'rapida', cotaBM: 100, lecturaAtras: 0 })).toBeNull()
  })

  it('mira hacia abajo: Z = HI − L; invertida: Z = HI + L', () => {
    expect(cotaDesdeLecturaDeMira(101.5, 1.25, { unidad: 'm', mira: 'normal' })).toBeCloseTo(100.25, 9)
    expect(cotaDesdeLecturaDeMira(101.5, 1.25, { unidad: 'm', mira: 'invertida' })).toBeCloseTo(102.75, 9)
  })

  it('lecturas en cm y mm', () => {
    expect(cotaDesdeLecturaDeMira(101.5, 125, { unidad: 'cm', mira: 'normal' })).toBeCloseTo(100.25, 9)
    expect(cotaDesdeLecturaDeMira(101.5, 1250, { unidad: 'mm', mira: 'normal' })).toBeCloseTo(100.25, 9)
  })

  it('lectura para una cota, en metros, y pasada a la unidad al milímetro', () => {
    expect(lecturaDeMiraParaCota(101.5, 100.235, 'normal')).toBeCloseTo(1.265, 9)
    expect(lecturaDeMiraParaCota(101.5, 102.735, 'invertida')).toBeCloseTo(1.235, 9)
    expect(lecturaEnUnidad(1.265, 'm')).toBe(1.265)
    expect(lecturaEnUnidad(1.265, 'cm')).toBe(126.5)
    expect(lecturaEnUnidad(1.265, 'mm')).toBe(1265)
  })
})

describe('lineaDeConjunto: zpts de su HTML', () => {
  it('Vereda izquierda con la puesta 1 da sus cotas', () => {
    expect(cotas(linea(EJEMPLO.vi))).toEqual([100.25, 100.24, 100.225, 100.21, 100.2].map((z) => expect.closeTo(z, 9)))
    expect(linea(EJEMPLO.vi).nombre).toBe('Vereda izquierda')
  })

  it('ajuste en cm por conjunto: sube o baja la línea entera', () => {
    const l = linea({ ...EJEMPLO.vi, ajusteCm: -2.5 })
    expect(l.puntos[0]!.cota).toBeCloseTo(100.225, 9)
    expect(l.nombre).toBe('Vereda izquierda (-2.5 cm)')
  })

  it('tipo cota: el valor tal cual; no comprobada salvo que se diga', () => {
    const l = linea({ nombre: 'Cotas', tipo: 'cota', texto: '0, 99.5\n10, 99.6' })
    expect(cotas(l)).toEqual([99.5, 99.6])
    expect(l.puntos.every((p) => !p.comprobado)).toBe(true)
    const c = linea({ nombre: 'Cotas', tipo: 'cota', texto: '0, 99.5', cotasComprobadas: true })
    expect(c.puntos[0]!.comprobado).toBe(true)
  })

  it('las cotas sobre una puesta rápida no están comprobadas; sobre una libreta cerrada, sí', () => {
    expect(linea(EJEMPLO.vi).puntos.every((p) => !p.comprobado)).toBe(true)
    const r = lineaDeConjunto({ ...EJEMPLO.vi, puesta: { tipo: 'libreta', alturaInstrumental: 101.5, comprobado: true } })
    expect(r.linea.puntos.every((p) => p.comprobado)).toBe(true)
  })

  it('mira invertida y cm', () => {
    const l = lineaDeConjunto({ ...EJEMPLO.vi, texto: '0, 125\n10, 126' }, { unidad: 'cm', mira: 'invertida' }).linea
    expect(cotas(l)).toEqual([expect.closeTo(102.75, 9), expect.closeTo(102.76, 9)])
  })

  it('mejora: la lectura que no cabe en la mira no se convierte en cota, y se avisa', () => {
    // 125 escrito en metros (se olvidó cambiar a cm): no es de una mira de 5 m.
    const r = lineaDeConjunto({ ...EJEMPLO.vi, texto: '0, 1.250\n10, 125' })
    expect(r.linea.puntos).toHaveLength(1)
    expect(r.avisos.join(' ')).toContain('no cabe en la mira')
  })

  it('mejora: la lectura poco precisa se usa, avisando', () => {
    const r = lineaDeConjunto({ ...EJEMPLO.vi, texto: '0, 0.150\n10, 1.25' })
    expect(r.linea.puntos).toHaveLength(2)
    expect(r.avisos.join(' ')).toContain('poco precisa')
  })

  it('sin puesta válida no hay cotas de lecturas', () => {
    const r = lineaDeConjunto({ ...EJEMPLO.vi, puesta: undefined })
    expect(r.linea.puntos).toEqual([])
    expect(r.avisos.join(' ')).toContain('puesta')
  })
})

describe('separacionEntreLineas: analyze de su HTML con sus datos', () => {
  it('lado izquierdo (Vereda sobre Subbase): cumple, mínima 39.0 cm en la 0+030', () => {
    const r = separacionEntreLineas(linea(EJEMPLO.vi), linea(EJEMPLO.si), 0.05)
    if (!r.ok) throw new Error(r.error)
    expect(r.desde).toBe(0)
    expect(r.hasta).toBe(40)
    expect(r.critico.progresiva).toBe(30)
    expect(r.critico.separacion).toBeCloseTo(0.39, 9)
    expect(r.critico.cotaSuperior).toBeCloseTo(100.21, 9)
    expect(r.critico.cotaInferior).toBeCloseTo(99.82, 9)
    expect(r.cumple).toBe(true)
    expect(r.noCumplen).toEqual([])
    expect(r.puntos.map((p) => p.separacion)).toEqual(
      [0.4, 0.395, 0.395, 0.39, 0.39].map((s) => expect.closeTo(s, 9)),
    )
  })

  it('lado derecho (Vereda sobre Subbase): igual, 39.0 cm en la 0+030', () => {
    const r = separacionEntreLineas(linea(EJEMPLO.vd), linea(EJEMPLO.sd), 0.05)
    if (!r.ok) throw new Error(r.error)
    expect(r.critico.progresiva).toBe(30)
    expect(r.critico.separacion).toBeCloseTo(0.39, 9)
  })

  it('con un mínimo de 39.5 cm: no cumplen la 0+030 y la 0+040', () => {
    const r = separacionEntreLineas(linea(EJEMPLO.vi), linea(EJEMPLO.si), 0.395)
    if (!r.ok) throw new Error(r.error)
    expect(r.cumple).toBe(false)
    expect(r.noCumplen.map((p) => p.progresiva)).toEqual([30, 40])
  })

  it('compara en los vértices de ambas líneas, interpolando en la otra', () => {
    const sup: LineaNivel = { nombre: 'A', puntos: [p(0, 10), p(10, 10)] }
    const inf: LineaNivel = { nombre: 'B', puntos: [p(0, 9.9), p(5, 9.98), p(10, 9.9)] }
    const r = separacionEntreLineas(sup, inf, 0.05)
    if (!r.ok) throw new Error(r.error)
    expect(r.puntos.map((q) => q.progresiva)).toEqual([0, 5, 10])
    expect(r.critico.progresiva).toBe(5)
    expect(r.critico.separacion).toBeCloseTo(0.02, 9)
  })

  it('solo en el tramo común', () => {
    const sup: LineaNivel = { nombre: 'A', puntos: [p(0, 10), p(30, 10)] }
    const inf: LineaNivel = { nombre: 'B', puntos: [p(10, 9), p(50, 9)] }
    const r = separacionEntreLineas(sup, inf, 0.05)
    if (!r.ok) throw new Error(r.error)
    expect([r.desde, r.hasta]).toEqual([10, 30])
    expect(r.puntos.map((q) => q.progresiva)).toEqual([10, 30])
  })

  it('progresiva repetida: la superior más baja y la inferior más alta', () => {
    const sup: LineaNivel = { nombre: 'A', puntos: [p(0, 10), p(10, 10.1), p(10, 10.05), p(20, 10)] }
    const inf: LineaNivel = { nombre: 'B', puntos: [p(0, 9.9), p(20, 9.9)] }
    const r = separacionEntreLineas(sup, inf, 0)
    if (!r.ok) throw new Error(r.error)
    expect(r.puntos.find((q) => q.progresiva === 10)!.cotaSuperior).toBeCloseTo(10.05, 9)
  })

  it('las líneas se cruzan: separación negativa, ✗ y se dice', () => {
    const sup: LineaNivel = { nombre: 'A', puntos: [p(0, 10), p(10, 9.8)] }
    const inf: LineaNivel = { nombre: 'B', puntos: [p(0, 9.9), p(10, 9.9)] }
    const r = separacionEntreLineas(sup, inf, 0.05)
    if (!r.ok) throw new Error(r.error)
    expect(r.critico.seCruzan).toBe(true)
    expect(r.estado).toBe('fuera')
    expect(r.simbolo).toBe('✗')
    expect(r.avisos.join(' ')).toContain('se cruzan')
  })

  it('errores de su HTML: menos de 2 puntos, sin superposición', () => {
    const r1 = separacionEntreLineas({ nombre: 'A', puntos: [p(0, 1)] }, linea(EJEMPLO.si), 0.05)
    expect(r1.ok).toBe(false)
    const r2 = separacionEntreLineas(
      { nombre: 'A', puntos: [p(100, 1), p(110, 1)] },
      linea(EJEMPLO.si),
      0.05,
    )
    expect(r2).toEqual({ ok: false, error: 'Las dos líneas no se superponen en progresiva.' })
  })

  it('mejora: semáforo con símbolo; sin tolerancia solo ✓ o ✗', () => {
    const r = separacionEntreLineas(linea(EJEMPLO.vi), linea(EJEMPLO.si), 0.05)
    if (!r.ok) throw new Error(r.error)
    expect(r.estado).toBe('conforme')
    expect(r.simbolo).toBe('✓')
    const malo = separacionEntreLineas(linea(EJEMPLO.vi), linea(EJEMPLO.si), 0.395)
    if (!malo.ok) throw new Error(malo.error)
    expect(malo.critico.estado).toBe('fuera')
    expect(malo.critico.simbolo).toBe('✗')
  })

  it('mejora: con tolerancia, △ hasta 2× tolerancia por debajo del mínimo', () => {
    // mínimo 0.40, tolerancia 3 mm: 0.395 está 5 mm abajo (≤ 6) → △; 0.390 está 10 mm abajo → ✗.
    const r = separacionEntreLineas(linea(EJEMPLO.vi), linea(EJEMPLO.si), 0.4, { toleranciaMm: 3 })
    if (!r.ok) throw new Error(r.error)
    expect(r.puntos.map((q) => q.simbolo)).toEqual(['✓', '△', '△', '✗', '✗'])
    expect(r.estado).toBe('fuera')
  })

  it('mejora: «no comprobado» si alguna línea no lo está en ese punto', () => {
    const sup: LineaNivel = { nombre: 'A', puntos: [p(0, 10), p(10, 10), p(20, 10, false)] }
    const inf: LineaNivel = { nombre: 'B', puntos: [p(0, 9), p(20, 9)] }
    const r = separacionEntreLineas(sup, inf, 0.05)
    if (!r.ok) throw new Error(r.error)
    // 0 y 10 caen entre puntos comprobados; 20 no.
    expect(r.puntos.map((q) => q.comprobado)).toEqual([true, true, false])
    expect(r.comprobado).toBe(false)
    expect(r.avisos.join(' ')).toContain('no comprobad')
  })
})

describe('separacionEn: el escáner', () => {
  it('interpola las dos líneas en cualquier progresiva del tramo común', () => {
    const s = separacionEn(linea(EJEMPLO.vi), linea(EJEMPLO.si), 25, 0.05)!
    // Vereda en 25: 100.2175; Subbase en 25: 99.825 → 0.3925
    expect(s.cotaSuperior).toBeCloseTo(100.2175, 9)
    expect(s.cotaInferior).toBeCloseTo(99.825, 9)
    expect(s.separacion).toBeCloseTo(0.3925, 9)
    expect(s.cumple).toBe(true)
  })

  it('fuera del tramo común: null (no se inventa)', () => {
    expect(separacionEn(linea(EJEMPLO.vi), linea(EJEMPLO.si), 45, 0.05)).toBeNull()
  })
})

describe('pendientesDeLinea', () => {
  it('pendiente por tramo en %', () => {
    const t = pendientesDeLinea(linea(EJEMPLO.vi))
    expect(t.map((x) => x.pendientePct)).toEqual([-0.1, -0.15, -0.15, -0.1].map((v) => expect.closeTo(v, 9)))
    expect(t[0]).toMatchObject({ desde: 0, hasta: 10 })
  })

  it('salta los tramos de largo cero', () => {
    expect(pendientesDeLinea({ nombre: 'A', puntos: [p(0, 1), p(0, 2), p(10, 2)] })).toHaveLength(1)
  })
})

function p(progresiva: number, cota: number, comprobado = true) {
  return { progresiva, cota, comprobado }
}

describe('nivelARegistrar: refreshCalc de su HTML', () => {
  const todas = Object.values(EJEMPLO).map(linea)
  const otrasQue = (l: LineaNivel) => todas.filter((o) => o.nombre !== l.nombre)

  it('su ejemplo: Vereda derecha en 10, 20 y 30 → cotas, lecturas y pendientes', () => {
    const vd = linea(EJEMPLO.vd)
    const r = nivelARegistrar({ linea: vd, otras: otrasQue(vd), progresivas: [10, 20, 30], ai: PUESTA_1 })
    expect(r.alturaInstrumental).toBeCloseTo(101.5, 9)
    expect(r.filas.map((f) => f.cota)).toEqual([100.25, 100.235, 100.22])
    expect(r.filas.map((f) => f.lectura)).toEqual([1.25, 1.265, 1.28])
    expect(r.filas.map((f) => f.pendientePct)).toEqual([-0.1, -0.15, -0.15].map((v) => expect.closeTo(v, 9)))
    expect(r.filas.every((f) => f.como === 'interpolado')).toBe(true)
  })

  it('proyectado: fuera de su línea, sigue la línea más cercana que cubre ambas progresivas', () => {
    const corta = linea({ ...EJEMPLO.vi, texto: '0, 1.250\n10, 1.260' })
    const r = nivelARegistrar({ linea: corta, otras: otrasQue(linea(EJEMPLO.vi)), progresivas: [30], ai: PUESTA_1 })
    const f = r.filas[0]!
    // ancla (10, 100.240); la más cercana en 10 es Vereda derecha (100.250):
    // 100.240 + (100.220 − 100.250) = 100.210
    expect(f.como).toBe('proyectado')
    expect(f.desde).toBe('Vereda derecha')
    expect(f.cota).toBe(100.21)
    expect(f.pendientePct).toBeCloseTo(-0.15, 9)
    expect(f.avisos.join(' ')).toContain('proyectado desde Vereda derecha')
  })

  it('extrapolado: si ninguna otra línea cubre, prolonga su tramo extremo', () => {
    const corta = linea({ ...EJEMPLO.vi, texto: '0, 1.250\n10, 1.260' })
    // 25 está 15 m más allá de la 0+010 (dentro de los 20 m que se dejan extrapolar).
    const r = nivelARegistrar({ linea: corta, otras: [], progresivas: [25], ai: PUESTA_1 })
    // 100.250 − 0.1 % × 25 = 100.225
    expect(r.filas[0]).toMatchObject({ como: 'extrapolado', cota: 100.225, desde: null })
    expect(r.filas[0]!.avisos.join(' ')).toContain('extrapolado a 15 m del punto extremo (0+010)')
  })

  it('un solo punto y nadie cubre: proyecta desde la línea ajena más cercana, extrapolándola', () => {
    const uno = linea({ ...EJEMPLO.vi, texto: '50, 1.300' })
    const r = nivelARegistrar({ linea: uno, otras: otrasQue(linea(EJEMPLO.vi)), progresivas: [60], ai: PUESTA_1 })
    // ancla (50, 100.200); Vereda derecha extrapolada en 50 = 100.200 (d = 0), en 60 = 100.190
    expect(r.filas[0]).toMatchObject({ como: 'proyectado', desde: 'Vereda derecha', cota: 100.19 })
  })

  it('sin línea para proyectar: fila sin cota y con el motivo', () => {
    const uno = linea({ ...EJEMPLO.vi, texto: '50, 1.300' })
    const r = nivelARegistrar({ linea: uno, otras: [], progresivas: [60], ai: PUESTA_1 })
    expect(r.filas[0]).toMatchObject({ cota: null, lectura: null, como: null })
    expect(r.filas[0]!.avisos.join(' ')).toContain('sin línea para proyectar')
  })

  it('mejora: desplazamiento — la capa siguiente = base + 0.20 m, con sus pendientes', () => {
    const base = linea(EJEMPLO.si)
    const r = nivelARegistrar({ linea: base, otras: [], progresivas: [10, 25], ai: PUESTA_1, desplazamientoM: 0.2 })
    // Subbase en 10 = 99.845 → 100.045; en 25 = 99.825 → 100.025
    expect(r.filas.map((f) => f.cota)).toEqual([100.045, 100.025])
    expect(r.filas.map((f) => f.lectura)).toEqual([1.455, 1.475])
    expect(r.linea).toBe('Subbase izquierda + 0.200 m')
  })

  it('lecturas en cm y mira invertida', () => {
    const vd = linea(EJEMPLO.vd)
    const cm = nivelARegistrar({ linea: vd, progresivas: [20], ai: PUESTA_1, forma: { unidad: 'cm', mira: 'normal' } })
    expect(cm.filas[0]!.lectura).toBe(126.5)
    expect(cm.filas[0]!.lecturaM).toBe(1.265)
    const alto: LineaNivel = { nombre: 'Techo', puntos: [p(0, 102.5), p(10, 102.6)] }
    const inv = nivelARegistrar({ linea: alto, progresivas: [0], ai: PUESTA_1, forma: { unidad: 'mm', mira: 'invertida' } })
    expect(inv.filas[0]!.lectura).toBe(1000)
  })

  it('avisa lectura negativa: la cota queda sobre el instrumento', () => {
    const vd = linea(EJEMPLO.vd)
    const r = nivelARegistrar({ linea: vd, progresivas: [0], ai: PUESTA_1, desplazamientoM: 2 })
    // 102.260 → lectura 101.5 − 102.26 = −0.760
    expect(r.filas[0]!.lectura).toBe(-0.76)
    expect(r.filas[0]!.rango).toBe('imposible')
    expect(r.filas[0]!.avisos.join(' ')).toContain('negativa')
    expect(r.filas[0]!.avisos.join(' ')).toContain('cambie de estación')
  })

  it('mejora: lectura fuera de lo legible del instrumento → «cambie de estación»', () => {
    const vd = linea(EJEMPLO.vd)
    // Mira de 4 m con 0.30 de margen: legible hasta 3.70. 101.5 − (100.26 − 2.8) = 4.04 → no cabe.
    const r = nivelARegistrar({
      linea: vd, progresivas: [0, 10], ai: PUESTA_1, desplazamientoM: -2.8, instrumento: { largoMira: 4 },
    })
    expect(r.filas[0]!.rango).toBe('imposible')
    expect(r.filas[0]!.avisos.join(' ')).toContain('cambie de estación')
    // Poco precisa: 101.5 − (100.26 + 1.1) = 0.14 < 0.30
    const q = nivelARegistrar({ linea: vd, progresivas: [0], ai: PUESTA_1, desplazamientoM: 1.1 })
    expect(q.filas[0]!.rango).toBe('pocoPrecisa')
    expect(q.filas[0]!.avisos.join(' ')).toContain('cambie de estación')
    expect(r.mira.largoMira).toBe(4)
  })

  it('mejora: «no comprobado» por la puesta o por la línea', () => {
    const vd = linea(EJEMPLO.vd)
    const rapida = nivelARegistrar({ linea: vd, progresivas: [10], ai: PUESTA_1 })
    expect(rapida.comprobado).toBe(false)
    expect(rapida.filas[0]!.comprobado).toBe(false)
    expect(rapida.avisos.join(' ')).toContain('no comprobad')

    const cerrada: Puesta = { tipo: 'libreta', alturaInstrumental: 101.5, comprobado: true }
    const comp: LineaNivel = { nombre: 'C', puntos: [p(0, 100), p(10, 100.1), p(20, 100.2, false)] }
    const r = nivelARegistrar({ linea: comp, progresivas: [5, 15], ai: cerrada })
    expect(r.filas.map((f) => f.comprobado)).toEqual([true, false])
    expect(r.comprobado).toBe(false)
  })

  it('sin altura instrumental: da la cota pero no la lectura', () => {
    const vd = linea(EJEMPLO.vd)
    const r = nivelARegistrar({ linea: vd, progresivas: [10], ai: { tipo: 'rapida', cotaBM: Number.NaN, lecturaAtras: 1 } })
    expect(r.alturaInstrumental).toBeNull()
    expect(r.filas[0]).toMatchObject({ cota: 100.25, lectura: null, lecturaM: null })
    expect(r.avisos.join(' ')).toContain('altura instrumental')
  })
})

describe('lineaDeCapa: la línea sale de lo que ya calcula el motor', () => {
  const proyecto = (toma: Toma): Proyecto => ({
    version: 1,
    meta: { nombre: '', obra: '', cliente: '', ubicacion: '', responsable: '', creado: '', modificado: '' },
    bms: [BM_1],
    capas: [CAPA_EJEMPLO],
    calles: [{ ...CALLE_EJEMPLO, nivelaciones: [{ id: 'n-1', nombre: 'Subrasante', color: '#000', tomas: [toma] }] }],
  })

  it('el eje de la subrasante: las cotas compensadas de calcularCampania, comprobadas', () => {
    const r = lineaDeCapa(proyecto(tomaEjemplo()), 'c-1', 'cap-1', 'p-eje')!
    const calculo = calcularCampania({ campania: tomaEjemplo(), calle: CALLE_EJEMPLO, bms: [BM_1] })
    expect(r.linea.puntos.map((q) => q.progresiva)).toEqual([0, 20])
    expect(r.linea.puntos.map((q) => q.cota)).toEqual([calcularPorClave(calculo, 0), calcularPorClave(calculo, 20)])
    // A mano: AI1 = 3246.605, eje 0 = 3244.625 + 2.5 mm; eje 20 = 3244.615 + 5 mm.
    expect(r.linea.puntos.map((q) => q.cota)).toEqual([expect.closeTo(3244.6275, 9), expect.closeTo(3244.62, 9)])
    expect(r.linea.puntos.every((q) => q.comprobado)).toBe(true)
    expect(r.linea.nombre).toBe('SUBRASANTE · Eje')
  })

  it('también por el nombre del punto', () => {
    expect(lineaDeCapa(proyecto(tomaEjemplo()), 'c-1', 'cap-1', 'Borde izquierdo')!.linea.puntos).toHaveLength(1)
  })

  it('circuito abierto: la línea sale, pero no comprobada', () => {
    const t = tomaEjemplo()
    t.cierre = { ...t.cierre, tipo: 'abierto' }
    const r = lineaDeCapa(proyecto(t), 'c-1', 'cap-1', 'p-eje')!
    expect(r.linea.puntos.every((q) => !q.comprobado)).toBe(true)
    expect(r.avisos.join(' ')).toContain('no comprobad')
  })

  it('otra capa sin tomas: línea vacía y se dice', () => {
    const r = lineaDeCapa(proyecto(tomaEjemplo()), 'c-1', 'otra', 'p-eje')!
    expect(r.linea.puntos).toEqual([])
    expect(r.avisos.length).toBeGreaterThan(0)
  })

  it('calle o punto que no existen: null', () => {
    expect(lineaDeCapa(proyecto(tomaEjemplo()), 'nada', 'cap-1', 'p-eje')).toBeNull()
    expect(lineaDeCapa(proyecto(tomaEjemplo()), 'c-1', 'cap-1', 'nada')).toBeNull()
  })

  it('dos tomas en la misma progresiva: vale la más reciente, y se avisa', () => {
    const vieja = tomaEjemplo()
    const nueva = { ...tomaEjemplo(), id: 'camp-2', fecha: '2026-08-20' }
    nueva.estaciones = JSON.parse(JSON.stringify(nueva.estaciones)) as Toma['estaciones']
    nueva.estaciones[0]!.intermedias[0]!.valor = 1.97
    const p0 = proyecto(vieja)
    p0.calles[0]!.nivelaciones[0]!.tomas = [nueva, vieja]
    const r = lineaDeCapa(p0, 'c-1', 'cap-1', 'p-eje')!
    expect(r.linea.puntos[0]!.cota).toBeCloseTo(3244.6375, 9)
    expect(r.avisos.join(' ')).toContain('más reciente')
  })

  it('puestaDeLibreta: la AI compensada de la estación; comprobada solo la última, si cerró', () => {
    const pr = proyecto(tomaEjemplo())
    const e1 = puestaDeLibreta(pr, 'camp-1', 0)!
    const e2 = puestaDeLibreta(pr, 'camp-1', 1)!
    if (e1.tipo !== 'libreta' || e2.tipo !== 'libreta') throw new Error('tipo')
    expect(e1.alturaInstrumental).toBeCloseTo(3246.6075, 9)
    expect(e2.alturaInstrumental).toBeCloseTo(3247.09, 9)
    expect(e2.comprobado).toBe(true)
    expect(e2.avisos!.join(' ')).toContain('sigue plantado')
    expect(puestaDeLibreta(pr, 'camp-1', 5)).toBeNull()
    const t = tomaEjemplo()
    t.cierre = { ...t.cierre, tipo: 'abierto' }
    expect(puestaDeLibreta(proyecto(t), 'camp-1', 1)).toMatchObject({ comprobado: false })
  })

  it('revisión: la AI de una estación de la que el equipo ya se movió no da lecturas comprobadas', () => {
    const pr = proyecto(tomaEjemplo())
    const e1 = puestaDeLibreta(pr, 'camp-1', 0)!
    if (e1.tipo !== 'libreta') throw new Error('tipo')
    // La toma cerró, pero la libreta ya pasó a la estación 2: el nivel no está ahí.
    expect(e1.comprobado).toBe(false)
    expect(e1.avisos!.join(' ')).toContain('el equipo se movió')
    const eje: LineaNivel = { nombre: 'Eje', puntos: [p(0, 3244.6), p(10, 3244.61), p(20, 3244.62)] }
    const r = nivelARegistrar({ linea: eje, progresivas: [10], ai: e1 })
    expect(r.comprobado).toBe(false)
    expect(r.filas[0]!.comprobado).toBe(false)
    expect(r.avisos.join(' ')).toContain('vista atrás nueva')
  })
})

describe('arreglos de la revisión', () => {
  const HI_1015: Puesta = { tipo: 'libreta', alturaInstrumental: 101.5, comprobado: true }
  const recta = (nombre: string, desde: number, hasta: number, paso: number, cota: (x: number) => number) => {
    const puntos = []
    for (let x = desde; x <= hasta + 1e-9; x += paso) puntos.push(p(x, cota(x)))
    return { nombre, puntos } as LineaNivel
  }

  describe('lineaDesdeTexto: coma decimal y progresivas 0+020', () => {
    it('«10, 1,260» es 1.260 (no 1): con HI 101.500 da 100.240', () => {
      expect(lineaDesdeTexto('10, 1,260').pares).toEqual([{ progresiva: 10, valor: 1.26 }])
      const l = lineaDeConjunto({ nombre: 'V', tipo: 'lectura', texto: '10, 1,260', puesta: PUESTA_1 }).linea
      expect(l.puntos[0]!.cota).toBeCloseTo(100.24, 9)
    })

    it('en tipo cota, «10, 3244,625» es 3244.625', () => {
      const l = lineaDeConjunto({ nombre: 'C', tipo: 'cota', texto: '10, 3244,625' }).linea
      expect(l.puntos[0]!.cota).toBeCloseTo(3244.625, 9)
    })

    it('punto y coma o tabulador con coma decimal', () => {
      expect(lineaDesdeTexto('10;1,260\n20\t1,270').pares).toEqual([
        { progresiva: 10, valor: 1.26 },
        { progresiva: 20, valor: 1.27 },
      ])
    })

    it('una coma decimal partida («10, 1, 260» o «10,1,260») no se usa: se pide confirmar', () => {
      for (const t of ['10, 1, 260', '10,1,260', '10,5,1.260']) {
        const leido = lineaDesdeTexto(t)
        expect(leido.pares).toEqual([])
        expect(leido.avisos[0]).toContain('coma decimal partida')
      }
    })

    it('la progresiva como la escribe Max: 0+020 y 1+005,50', () => {
      expect(lineaDesdeTexto('0+020, 1.250\n1+005,50; 1.3').pares).toEqual([
        { progresiva: 20, valor: 1.25 },
        { progresiva: 1005.5, valor: 1.3 },
      ])
    })

    it('no acepta 0x10 ni 1e3 como números: se avisa y no se usa', () => {
      const leido = lineaDesdeTexto('0x10, 1.25\n1e3, 1.25\n10, 1e0')
      expect(leido.pares).toEqual([])
      expect(leido.avisos).toHaveLength(3)
    })
  })

  describe('separación: el semáforo de siempre, y nada de veredictos sin datos', () => {
    const sup = (cota: number): LineaNivel => ({ nombre: 'A', puntos: [p(0, cota), p(10, cota)] })
    const INF: LineaNivel = { nombre: 'B', puntos: [p(0, 100), p(10, 100)] }

    it('con tolerancia 3 mm, un faltante de 1 mm es ✓ (como en la rasante), no △', () => {
      const r = separacionEntreLineas(sup(100.399), INF, 0.4, { toleranciaMm: 3 })
      if (!r.ok) throw new Error(r.error)
      expect(r.simbolo).toBe('✓')
      expect(r.cumple).toBe(true)
    })

    it('estado, símbolo y cumple siempre coinciden: △ no cumple', () => {
      const r = separacionEntreLineas(linea(EJEMPLO.vi), linea(EJEMPLO.si), 0.4, { toleranciaMm: 3 })
      if (!r.ok) throw new Error(r.error)
      for (const q of r.puntos) expect(q.cumple).toBe(q.estado === 'conforme')
      expect(r.noCumplen.map((q) => q.simbolo)).toEqual(['△', '△', '✗', '✗'])
    })

    it('con tolerancia 0 (o sin ella) no hay △, y se juzga al milímetro', () => {
      for (const opciones of [{ toleranciaMm: 0 }, {}]) {
        const casi = separacionEntreLineas(sup(100.3996), INF, 0.4, opciones)
        if (!casi.ok) throw new Error(casi.error)
        expect(casi.simbolo).toBe('✓')
        const falta2 = separacionEntreLineas(sup(100.398), INF, 0.4, opciones)
        if (!falta2.ok) throw new Error(falta2.error)
        expect(falta2.simbolo).toBe('✗')
        expect(falta2.cumple).toBe(false)
      }
    })

    it('un mínimo vacío (NaN) o negativo da error, no «fuera»', () => {
      expect(separacionEntreLineas(sup(101), INF, Number.NaN)).toEqual({ ok: false, error: ERROR_MINIMO })
      expect(separacionEntreLineas(sup(101), INF, -0.1)).toEqual({ ok: false, error: ERROR_MINIMO })
      expect(separacionEn(sup(101), INF, 5, Number.NaN)).toBeNull()
    })

    it('una tolerancia que no es número da error', () => {
      expect(separacionEntreLineas(sup(101), INF, 0.05, { toleranciaMm: Number.NaN })).toEqual({
        ok: false,
        error: ERROR_TOLERANCIA,
      })
      expect(separacionEn(sup(101), INF, 5, 0.05, { toleranciaMm: -1 })).toBeNull()
    })
  })

  describe('líneas hechas a mano: sin número o desordenadas', () => {
    it('una cota NaN no llega a la fila: se deja fuera y se avisa', () => {
      const l: LineaNivel = { nombre: 'L', puntos: [p(0, 100), p(10, Number.NaN), p(20, 100.2)] }
      const r = nivelARegistrar({ linea: l, progresivas: [10], ai: HI_1015 })
      expect(r.filas[0]!.cota).toBe(100.1)
      expect(Number.isNaN(r.filas[0]!.lecturaM)).toBe(false)
      expect(r.avisos.join(' ')).toContain('sin progresiva o cota numérica')
    })

    it('desordenada: da lo mismo que ordenada, y se avisa', () => {
      const orden = linea(EJEMPLO.vi)
      const revuelta: LineaNivel = { nombre: orden.nombre, puntos: [...orden.puntos].reverse() }
      const a = separacionEntreLineas(orden, linea(EJEMPLO.si), 0.05)
      const b = separacionEntreLineas(revuelta, linea(EJEMPLO.si), 0.05)
      if (!a.ok || !b.ok) throw new Error('error')
      expect(b.puntos).toEqual(a.puntos)
      expect(b.avisos.join(' ')).toContain('se ordenaron')
      const na = nivelARegistrar({ linea: orden, progresivas: [25], ai: PUESTA_1 })
      const nb = nivelARegistrar({ linea: revuelta, progresivas: [25], ai: PUESTA_1 })
      expect(nb.filas[0]!.cota).toBe(na.filas[0]!.cota)
      expect(separacionEn(revuelta, linea(EJEMPLO.si), 25, 0.05)).toEqual(separacionEn(orden, linea(EJEMPLO.si), 25, 0.05))
      expect(pendientesDeLinea(revuelta)).toEqual(pendientesDeLinea(orden))
    })
  })

  describe('extrapolado y proyectado: suposiciones, no medidas', () => {
    const MEDIDA = recta('Medida', 0, 40, 10, (x) => 100 - 0.001 * x)

    it('extrapolado con línea y puesta comprobadas: NO comprobado, con la distancia', () => {
      const r = nivelARegistrar({ linea: MEDIDA, progresivas: [50], ai: HI_1015 })
      expect(r.filas[0]).toMatchObject({ como: 'extrapolado', cota: 99.95, comprobado: false })
      expect(r.filas[0]!.avisos).toContain('no comprobada')
      expect(r.filas[0]!.avisos.join(' ')).toContain('a 10 m del punto extremo (0+040)')
      expect(r.comprobado).toBe(false)
    })

    it('proyectado: NO comprobado aunque todo lo demás lo esté', () => {
      const corta: LineaNivel = { nombre: 'Corta', puntos: [p(0, 100.2), p(10, 100.19)] }
      const r = nivelARegistrar({ linea: corta, otras: [MEDIDA], progresivas: [30], ai: HI_1015 })
      expect(r.filas[0]).toMatchObject({ como: 'proyectado', comprobado: false })
      expect(r.filas[0]!.avisos.join(' ')).toContain('a 20 m')
    })

    it('una progresiva mal tecleada (0+400 en vez de 0+040) no da cota', () => {
      const r = nivelARegistrar({ linea: MEDIDA, progresivas: [400, -100], ai: HI_1015 })
      expect(r.filas[0]).toMatchObject({ cota: null, lectura: null, comprobado: false })
      expect(r.filas[0]!.motivoSinCota).toContain('360 m')
      expect(r.filas[0]!.avisos.join(' ')).toContain('¿Está bien escrita la progresiva?')
      expect(r.filas[1]!.cota).toBeNull()
    })

    it('el máximo se puede cambiar', () => {
      const r = nivelARegistrar({ linea: MEDIDA, progresivas: [400], ai: HI_1015, extrapolacionMaximaM: 500 })
      expect(r.filas[0]!.cota).toBe(99.6)
    })

    it('una línea ajena que hay que prolongar demasiado tampoco da cota', () => {
      const uno: LineaNivel = { nombre: 'Uno', puntos: [p(50, 100)] }
      const r = nivelARegistrar({ linea: uno, otras: [MEDIDA], progresivas: [100], ai: HI_1015 })
      expect(r.filas[0]!.cota).toBeNull()
      expect(r.filas[0]!.motivoSinCota).toContain('60 m')
    })
  })

  describe('huecos: un tramo sin puntos mucho más largo que lo normal', () => {
    // Otra línea medida cada 10 m, plana en 99.0 salvo un bache: 99.5 en la 0+100.
    const OTRA = recta('Otra', 0, 200, 10, (x) => (x === 100 ? 99.5 : 99))

    it('si otra línea lo midió, se sigue su forma y se cierra en los dos extremos', () => {
      const larga: LineaNivel = { nombre: 'Larga', puntos: [p(0, 100), p(200, 100.2)] }
      const r = nivelARegistrar({ linea: larga, otras: [OTRA], progresivas: [0, 100, 200], ai: HI_1015 })
      // 100 + (99.5 − 99) + 0.5 × (0.2 − 0) = 100.6
      expect(r.filas.map((f) => f.cota)).toEqual([100, 100.6, 100.2])
      expect(r.filas[1]).toMatchObject({ como: 'proyectado', desde: 'Otra', comprobado: false })
      expect(r.filas[1]!.avisos.join(' ')).toContain('se sigue la forma de Otra')
    })

    it('si nadie lo midió, se interpola en recta pero se avisa y no se da por comprobado', () => {
      const conHueco: LineaNivel = { nombre: 'H', puntos: [p(0, 100), p(10, 100), p(20, 100), p(200, 101.8)] }
      const r = nivelARegistrar({ linea: conHueco, progresivas: [15, 110], ai: HI_1015 })
      expect(r.filas[0]).toMatchObject({ como: 'interpolado', comprobado: true })
      expect(r.filas[1]).toMatchObject({ como: 'interpolado', cota: 100.9, comprobado: false })
      expect(r.filas[1]!.avisos.join(' ')).toContain('tramo sin puntos de 180 m')
    })

    it('en la separación, comparar contra el hueco se avisa y no queda comprobado', () => {
      const larga: LineaNivel = { nombre: 'Larga', puntos: [p(0, 100), p(200, 100)] }
      const r = separacionEntreLineas(larga, OTRA, 0.05)
      if (!r.ok) throw new Error(r.error)
      expect(r.puntos.find((q) => q.progresiva === 100)!.comprobado).toBe(false)
      expect(r.puntos.find((q) => q.progresiva === 0)!.comprobado).toBe(true)
      expect(r.comprobado).toBe(false)
      expect(r.avisos.join(' ')).toContain('Larga: tramo sin puntos de 200 m')
    })
  })

  describe('rendimiento: 5 000 puntos por línea', () => {
    const N = 5000
    const A = recta('A', 0, (N - 1) * 2, 2, (x) => 101 + 0.0001 * x)
    const B = recta('B', 1, (N - 1) * 2 + 1, 2, (x) => 100 + 0.0001 * x)

    it('separación y nivel a registrar sin recorrer la línea por cada punto', () => {
      const t0 = Date.now()
      const r = separacionEntreLineas(A, B, 0.5)
      const t1 = Date.now()
      const n = nivelARegistrar({ linea: A, otras: [B], progresivas: B.puntos.map((q) => q.progresiva), ai: HI_1015 })
      const t2 = Date.now()
      if (!r.ok) throw new Error(r.error)
      expect(r.puntos.length).toBe(2 * N - 2)
      expect(n.filas).toHaveLength(N)
      // Antes: 1 415 ms y 658 ms. Con búsqueda binaria quedan en decenas de ms;
      // el margen es amplio para no fallar en una máquina cargada.
      expect(t1 - t0).toBeLessThan(400)
      expect(t2 - t1).toBeLessThan(400)
    })
  })
})

/** La cota del eje en esa progresiva, tal como la deja calcularCampania. */
function calcularPorClave(calculo: ReturnType<typeof calcularCampania>, progresiva: number): number {
  for (const c of calculo.cotasPorCelda.values()) if (c.progresiva === progresiva && c.elementoClave === 'p-eje') return c.cota
  return Number.NaN
}
