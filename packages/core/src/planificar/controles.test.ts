import { describe, expect, it } from 'vitest'
import { INSTRUMENTO_DE_FABRICA } from '../modelo/instrumento'
import { OPCIONES_CONTROLES, opcionesDeInstrumento, planificarConControles, revisarOpcionesControles } from './controles'
import type { Perfil } from './perfil'

/** Pasaje Las Lomas: +8.20 % hasta la 0+060 y +7.40 % hasta la 0+120. */
const lasLomas: Perfil = [
  { progresiva: 0, cota: 3243.5 },
  { progresiva: 60, cota: 3248.42 },
  { progresiva: 120, cota: 3252.86 },
]

describe('valores de fábrica', () => {
  it('son los de la sección 2 del diseño', () => {
    expect(OPCIONES_CONTROLES).toMatchObject({
      maxCambiosPorTramo: 4,
      sigmaPorEstacionMm: 1,
      k: 12,
      umbralQuiebrePorcentaje: 0.5,
      visualMax: 50,
      lecturaMin: 0.3,
    })
    expect(revisarOpcionesControles(OPCIONES_CONTROLES)).toEqual([])
  })

  it('salen del instrumento de fábrica: k, σ y cambios por tramo no se repiten aquí', () => {
    expect(OPCIONES_CONTROLES.k).toBe(INSTRUMENTO_DE_FABRICA.coeficienteK)
    expect(OPCIONES_CONTROLES.sigmaPorEstacionMm).toBe(INSTRUMENTO_DE_FABRICA.sigmaPorEstacionMm)
    expect(OPCIONES_CONTROLES.maxCambiosPorTramo).toBe(INSTRUMENTO_DE_FABRICA.maxCambiosPorTramo)
    expect(OPCIONES_CONTROLES.largoMira).toBe(INSTRUMENTO_DE_FABRICA.largoMira)
  })
})

describe('opcionesDeInstrumento', () => {
  it('pasa el instrumento del proyecto a opciones del planificador, con fábrica en lo que falte', () => {
    expect(opcionesDeInstrumento({ largoMira: 4, coeficienteK: 8 })).toEqual({
      largoMira: 4,
      alturaInstrumento: 1.5,
      lecturaMin: 0.3,
      margenSuperior: 0.3,
      visualMax: 50,
      desequilibrioMax: 5,
      maxCambiosPorTramo: 4,
      sigmaPorEstacionMm: 1,
      k: 8,
    })
    expect(opcionesDeInstrumento(null)).toMatchObject({ largoMira: 5, k: 12 })
  })

  it('con un nivel más preciso (σ = 0.5 mm por estación) Las Lomas sí cumple', () => {
    // 0+000–0+060: 2 × 0.5·√6 = 2.449 ≤ 4.157; 0+060–0+120: 2 × 0.5·√4 = 2.000 ≤ 4.157.
    const resultado = planificarConControles(lasLomas, opcionesDeInstrumento({ sigmaPorEstacionMm: 0.5 }))
    expect(resultado.ok).toBe(true)
    expect(resultado.tramos.map((t) => t.errorEsperadoMm)).toEqual([0.5 * Math.sqrt(6), 0.5 * Math.sqrt(4)])
  })
})

describe('planificarConControles — Pasaje Las Lomas', () => {
  const resultado = planificarConControles(lasLomas)

  it('pone controles al inicio, en el quiebre y al final, cada uno con su tipo y su porqué', () => {
    expect(resultado.posible).toBe(true)
    // Se puede nivelar, pero el primer tramo no cumple la regla del error (ver abajo).
    expect(resultado.ok).toBe(false)
    expect(resultado.motivo).toBeNull()
    expect(resultado.controles).toMatchObject([
      { progresiva: 0, cotaPerfil: 3243.5, motivos: [{ tipo: 'inicio', texto: 'inicio de la pista' }] },
      {
        progresiva: 60,
        cotaPerfil: 3248.42,
        motivos: [{ tipo: 'quiebre', texto: 'quiebre de pendiente: de +8.20 % a +7.40 %' }],
      },
      { progresiva: 120, cotaPerfil: 3252.86, motivos: [{ tipo: 'fin', texto: 'fin de la pista' }] },
    ])
    // (3248.420 − 3243.500)/60 = 8.20 %; (3252.860 − 3248.420)/60 = 7.40 %
    const quiebre = resultado.controles[1]!.motivos[0]!
    expect(quiebre.pendienteAntes).toBeCloseTo(8.2, 9)
    expect(quiebre.pendienteDespues).toBeCloseTo(7.4, 9)
  })

  it('el tramo 0+000 a 0+060 lleva tres estaciones y su error no cabe con 95 % de confianza', () => {
    // Paso máximo 2·1.20/0.082 = 29.268 m (manda la lectura mínima de adelante; la mira
    // de 5 m no cambia nada al subir) → 60/29.268 = 2.05 → 3 estaciones de 20 m, 2 cambios.
    // Error esperado de ida y vuelta: σ·√(2n) = 1·√6 = 2.449 mm.
    // Tolerancia: K = 2·0.060 = 0.120 km (ida y vuelta) → 12·√0.120 = 12·0.34641 = 4.157 mm.
    // 2 × 2.449 = 4.899 mm > 4.157 mm → no cabe.
    // Hace falta L/n ≥ 4000·σ²/k² = 4000/144 = 27.8 m de paso medio; aquí hay 60/3 = 20.0 m.
    // Partir no ayuda: 0+000–0+020 (1 estación) da 2·√2 = 2.83 > 12·√0.04 = 2.40, y
    // 0+020–0+060 (2 estaciones) da 2·√4 = 4.00 > 12·√0.08 = 3.39. Ningún corte deja bien las dos partes.
    const tramo = resultado.tramos[0]!
    expect(tramo).toMatchObject({ desde: 0, hasta: 60, estaciones: 3, cambios: 2, ok: false, notas: [] })
    expect(tramo.cotaPerfilDesde).toBe(3243.5)
    expect(tramo.cotaPerfilHasta).toBe(3248.42)
    expect(tramo.errorEsperadoMm).toBeCloseTo(2.44949, 5)
    expect(tramo.toleranciaMm).toBeCloseTo(4.156922, 5)
    expect(tramo.avisos).toEqual([
      'el doble del error esperado de ida y vuelta (2 × 2.45 = 4.90 mm, 6 estaciones) pasa de la tolerancia (4.16 mm): con un paso medio de 20.0 m haría falta al menos 27.8 m; partir el tramo no lo arregla, porque el error y la tolerancia crecen juntos con el largo',
    ])
    expect(tramo.plan.estaciones.map((e) => e.progresiva)).toEqual([10, 30, 50])
  })

  it('cada tramo trae su vuelta: las mismas estaciones al revés', () => {
    const tramo = resultado.tramos[0]!
    expect(tramo.vuelta.sentido).toBe('vuelta')
    expect([tramo.vuelta.desde, tramo.vuelta.hasta]).toEqual([60, 0])
    expect(tramo.vuelta.estaciones.map((e) => e.progresiva)).toEqual([50, 30, 10])
  })

  it('el tramo 0+060 a 0+120 lleva dos estaciones de 30 m', () => {
    // Paso máximo 2·1.20/0.074 = 32.432 m → 60/32.432 = 1.85 → 2 estaciones, 1 cambio en la 0+090.
    // d = 15: adelante 1.500 − 0.074·15 = 0.390 ≥ 0.35 (lectura mínima más 5 cm de holgura).
    // Error de ida y vuelta 1·√(2·2) = 2.000 mm; 2 × 2.000 = 4.000 ≤ 12·√0.120 = 4.157 mm → ok.
    const tramo = resultado.tramos[1]!
    expect(tramo).toMatchObject({ desde: 60, hasta: 120, estaciones: 2, cambios: 1, ok: true, avisos: [] })
    expect(tramo.errorEsperadoMm).toBeCloseTo(2, 9)
    expect(tramo.toleranciaMm).toBeCloseTo(4.156922, 5)
    expect(tramo.plan.estaciones.map((e) => e.progresiva)).toEqual([75, 105])
    expect(tramo.plan.cambios.map((c) => c.progresiva)).toEqual([90])
    // Solo el primer tramo avisa, y con su nombre delante.
    expect(resultado.avisos).toEqual([`tramo 0+000 a 0+060: ${resultado.tramos[0]!.avisos[0]}`])
  })
})

describe('planificarConControles — pista plana de 300 m', () => {
  it('solo inicio y fin: tres estaciones de 100 m alcanzan', () => {
    // 3 estaciones (visual 50 m), 2 cambios ≤ 4.
    // Error de ida y vuelta 1·√6 = 2.449 mm; K = 2·0.300 = 0.600 km → 12·√0.6 = 9.295 mm;
    // 2 × 2.449 = 4.899 ≤ 9.295 → ok (paso medio 100 m ≥ 27.8 m).
    const resultado = planificarConControles([
      { progresiva: 0, cota: 3200 },
      { progresiva: 300, cota: 3200 },
    ])

    expect(resultado.controles.map((c) => [c.progresiva, c.motivos.map((m) => m.tipo)])).toEqual([
      [0, ['inicio']],
      [300, ['fin']],
    ])
    expect(resultado.tramos).toHaveLength(1)
    expect(resultado.tramos[0]).toMatchObject({ estaciones: 3, cambios: 2, ok: true })
    expect(resultado.tramos[0]!.toleranciaMm).toBeCloseTo(9.29516, 4)
  })
})

describe('planificarConControles — bajada', () => {
  it('Las Lomas cuesta abajo: el quiebre se lee con signo negativo', () => {
    // −7.40 % hasta la 0+060: 2 estaciones (0+015, 0+045), atrás 1.500 − 1.110 = 0.390.
    // −8.20 % de la 0+060 a la 0+120: paso máx 29.268 → 3 estaciones de 20 m (0+070, 0+090, 0+110),
    //   atrás 1.500 − 0.820 = 0.680.
    const resultado = planificarConControles([
      { progresiva: 0, cota: 3252.86 },
      { progresiva: 60, cota: 3248.42 },
      { progresiva: 120, cota: 3243.5 },
    ])

    expect(resultado.controles[1]!.motivos.map((m) => m.texto)).toEqual(['quiebre de pendiente: de -7.40 % a -8.20 %'])
    expect(resultado.tramos.map((t) => t.plan.estaciones.map((e) => e.progresiva))).toEqual([
      [15, 45],
      [70, 90, 110],
    ])
    // −7.40 %: 2 estaciones de 30 m → 2·√4 = 4.000 ≤ 4.157 → ok.
    // −8.20 %: 3 estaciones de 20 m → 2·√6 = 4.899 > 4.157 → no cabe, como de subida.
    expect(resultado.tramos.map((t) => t.ok)).toEqual([true, false])
    expect(resultado.ok).toBe(false)
  })
})

describe('planificarConControles — más de 4 cambios', () => {
  it('una subida larga al 8.2 % se parte en un punto de cambio', () => {
    // 0+000 a 0+200 al +8.20 % (3243.500 → 3259.900), sin quiebres.
    // Avance máximo: 200 / 29.268 = 6.83 → 7 estaciones. Parejas de 200/7 = 28.571 m (d = 14.286)
    // dejarían adelante 1.500 − 0.082·14.286 = 0.329 < 0.35 (sin los 5 cm de holgura); con 8
    // estaciones de 25 m (d = 12.5): adelante 1.500 − 1.025 = 0.475. Cabe: 8 estaciones, 7 cambios > 4.
    // Se parte en ceil(8/5) = 2 partes; la primera con ceil(8/2) = 4 estaciones:
    // control en el cambio 4 = 4·25 = 0+100, cota 3243.500 + 0.082·100 = 3251.700.
    //   0+000 a 0+100: 100/29.268 = 3.42 → 4 estaciones de 25 m, 3 cambios.
    //     Error de ida y vuelta √8 = 2.828 mm; K = 0.200 km → 12·√0.2 = 5.367 mm;
    //     2 × 2.828 = 5.657 > 5.367 → el error no cabe (paso 25 m < 27.8 m).
    //     Ningún corte lo arregla: 0+000–0+025 da 2·√2 = 2.83 > 12·√0.05 = 2.68;
    //     0+000–0+050 da 2·√4 = 4.00 > 12·√0.1 = 3.79. No se clavan más estacas.
    //   0+100 a 0+200: igual.
    const resultado = planificarConControles([
      { progresiva: 0, cota: 3243.5 },
      { progresiva: 200, cota: 3259.9 },
    ])

    expect(resultado.controles).toHaveLength(3)
    const medio = resultado.controles[1]!
    expect(medio.progresiva).toBeCloseTo(100, 9)
    expect(medio.cotaPerfil).toBeCloseTo(3251.7, 9)
    expect(medio.motivos).toEqual([{ tipo: 'maxCambios', texto: 'para no pasar de 4 cambios' }])

    expect(resultado.tramos.map((t) => [t.estaciones, t.cambios, t.ok])).toEqual([
      [4, 3, false],
      [4, 3, false],
    ])
    expect(resultado.tramos[0]!.errorEsperadoMm).toBeCloseTo(Math.sqrt(8), 9)
    expect(resultado.tramos[0]!.toleranciaMm).toBeCloseTo(5.366563, 5)
    expect(resultado.tramos[0]!.plan.cambios.map((c) => c.progresiva)).toEqual([25, 50, 75])
  })

  it('con un máximo de 2 cambios parte más', () => {
    // 8 estaciones, máximo 3 por tramo: ceil(8/3) = 3 partes, la primera con ceil(8/3) = 3 → 0+075.
    // 0+075 a 0+200: 5 estaciones de 25 m → otra vez: la primera parte con 3 → 0+150.
    const resultado = planificarConControles(
      [
        { progresiva: 0, cota: 3243.5 },
        { progresiva: 200, cota: 3259.9 },
      ],
      { maxCambiosPorTramo: 2 },
    )

    expect(resultado.controles.map((c) => c.progresiva)).toEqual([0, 75, 150, 200])
    expect(resultado.tramos.every((t) => t.cambios <= 2)).toBe(true)
    expect(resultado.controles.slice(1, -1).every((c) => c.motivos[0]!.texto === 'para no pasar de 2 cambios')).toBe(
      true,
    )
  })
})

describe('planificarConControles — pendiente tan fuerte que el error no cabe', () => {
  it('lo dice con números y no siembra controles que no arreglan nada', () => {
    // 0+000 a 0+048 al +20 %: d máx = 1.20/0.20 = 6 m, paso 12 m → 48/12 = 4 estaciones.
    // Parejas de 12 m dejan adelante 1.500 − 1.200 = 0.300 < 0.35; con 5 de 9.6 m (d = 4.8):
    // adelante 1.500 − 0.960 = 0.540. Cabe: 5 estaciones, 4 cambios.
    // Error de ida y vuelta √10 = 3.162 mm; K = 0.096 km → 12·√0.096 = 12·0.309839 = 3.718 mm;
    // 2 × 3.162 = 6.325 > 3.718.
    // Partir no ayuda: las partes tienen el mismo paso de 9.6 m, y el error (√n) y la
    // tolerancia (√largo) crecen juntos. Hace falta 2·σ·√(2n) ≤ k·√(2·L/1000), o sea
    // L/n ≥ 4000·σ²/k² = 4000/144 = 27.8 m de paso medio; aquí hay 48/5 = 9.6 m.
    const resultado = planificarConControles([
      { progresiva: 0, cota: 100 },
      { progresiva: 48, cota: 109.6 },
    ])

    expect(resultado.posible).toBe(true)
    expect(resultado.ok).toBe(false)
    expect(resultado.controles.map((c) => c.progresiva)).toEqual([0, 48])
    const tramo = resultado.tramos[0]!
    expect(tramo).toMatchObject({ estaciones: 5, cambios: 4, ok: false })
    expect(tramo.errorEsperadoMm).toBeCloseTo(3.162278, 5)
    expect(tramo.avisos).toEqual([
      'el doble del error esperado de ida y vuelta (2 × 3.16 = 6.32 mm, 10 estaciones) pasa de la tolerancia (3.72 mm): con un paso medio de 9.6 m haría falta al menos 27.8 m; partir el tramo no lo arregla, porque el error y la tolerancia crecen juntos con el largo',
    ])
    expect(resultado.avisos).toEqual([`tramo 0+000 a 0+048: ${tramo.avisos[0]}`])
  })
})

describe('planificarConControles — escalinata: tramos cortos de una estación', () => {
  it('un tramo de una sola estación no se marca como falla por el error: queda como nota', () => {
    // Escalón: 0+000 y 0+000.50 a 100.000, 0+001 a 101.500, 0+020 a 101.500.
    // Quiebres en 0+000.50 (0 % → +300 %) y 0+001 (+300 % → 0 %): controles 0, 0.5, 1, 20.
    // Tramo 0+000 a 0+000.50: una estación (d = 0.25). Error de ida y vuelta 1·√2 = 1.414 mm;
    //   K = 2·0.0005 = 0.001 km → 12·√0.001 = 0.379 mm; 2 × 1.414 = 2.83 > 0.38. Con una
    //   estación no hay cómo hacerlo mejor: no es falla, es dato.
    // Tramo 0+000.50 a 0+001 (la cara): estación en 0+000.75 (100.750, AI 102.250):
    //   atrás 2.250, adelante 102.250 − 101.500 = 0.750. La misma nota.
    // Tramo 0+001 a 0+020: una estación, d = 9.5; 12·√0.038 = 2.339 < 2.83 → también nota
    //   (haría falta un paso de 27.8 m y el tramo mide 19 m).
    const resultado = planificarConControles([
      { progresiva: 0, cota: 100 },
      { progresiva: 0.5, cota: 100 },
      { progresiva: 1, cota: 101.5 },
      { progresiva: 20, cota: 101.5 },
    ])

    expect(resultado.controles.map((c) => c.progresiva)).toEqual([0, 0.5, 1, 20])
    expect(resultado.tramos.map((t) => [t.estaciones, t.ok])).toEqual([
      [1, true],
      [1, true],
      [1, true],
    ])
    expect(resultado.ok).toBe(true)
    expect(resultado.tramos[0]!.notas).toEqual([
      'una sola estación: el doble del error esperado de ida y vuelta (2.83 mm) pasa de la tolerancia (0.38 mm), pero con una estación no hay cómo mejorarlo; queda como dato',
    ])
    expect(resultado.tramos[1]!.plan.estaciones[0]!.adelante.lectura).toBeCloseTo(0.75, 9)
    expect(resultado.tramos[2]!.notas).toEqual([
      'una sola estación: el doble del error esperado de ida y vuelta (2.83 mm) pasa de la tolerancia (2.34 mm), pero con una estación no hay cómo mejorarlo; queda como dato',
    ])
  })
})

describe('planificarConControles — lecturas al límite', () => {
  it('si un tramo quedó con lecturas a menos de la holgura, la nota dice qué estaciones', () => {
    // Holgura de 1.30 m: ningún reparto la deja (la lectura mínima holgada sería 1.60 > h).
    // Las Lomas 0+000 a 0+060: estaciones 1, 2 y 3 leen 0.680 adelante, a 0.380 del límite.
    const resultado = planificarConControles(lasLomas, { holguraPlan: 1.3 })
    expect(resultado.tramos[0]!.notas).toEqual([
      'estaciones con alguna lectura a menos de 1.30 m del límite de la mira: 1, 2, 3',
    ])
  })
})

describe('planificarConControles — lo que no se puede', () => {
  it('un tramo imposible queda marcado y el conjunto no es posible', () => {
    const resultado = planificarConControles([
      { progresiva: 0, cota: 100 },
      { progresiva: 10, cota: 115 },
    ])

    expect(resultado.posible).toBe(false)
    expect(resultado.ok).toBe(false)
    expect(resultado.motivo).toBe(
      'tramo 0+000 a 0+010: desde la 0+000 la pendiente obliga a visuales de 0.80 m, menos que el mínimo de 1.00 m',
    )
    expect(resultado.tramos[0]!.ok).toBe(false)
  })

  it('un perfil mal formado no da controles y dice por qué', () => {
    const resultado = planificarConControles([{ progresiva: 0, cota: 1 }])

    expect(resultado.posible).toBe(false)
    expect(resultado.motivo).toBe('el perfil necesita al menos dos vértices (tiene 1)')
    expect(resultado.controles).toEqual([])
    expect(resultado.tramos).toEqual([])
  })

  it('opciones imposibles se dicen como motivo, sin lanzar ni dar tramos ok con NaN', () => {
    expect(planificarConControles(lasLomas, { maxCambiosPorTramo: -1 })).toMatchObject({
      posible: false,
      ok: false,
      motivo: 'el máximo de cambios por tramo debe ser un número entero de cero o más (llegó -1)',
      tramos: [],
    })
    expect(planificarConControles(lasLomas, { sigmaPorEstacionMm: Number.NaN }).motivo).toBe(
      'el error esperado por estación debe ser un número mayor que cero (llegó NaN)',
    )
    expect(planificarConControles(lasLomas, { k: 0 }).motivo).toBe(
      'el coeficiente de la tolerancia debe ser un número mayor que cero (llegó 0)',
    )
    expect(planificarConControles(lasLomas, { visualMax: -5 }).motivo).toBe(
      'la visual más larga debe ser mayor que cero (llegó -5)',
    )
  })

  it('una clave con undefined deja el valor de fábrica', () => {
    const resultado = planificarConControles(lasLomas, { maxCambiosPorTramo: undefined } as never)
    expect(resultado.posible).toBe(true)
    expect(resultado.controles).toHaveLength(3)
    expect(resultado).toEqual(planificarConControles(lasLomas))
  })
})

describe('planificarConControles — un perfil de muchos vértices', () => {
  it('1001 vértices en 1 km se planifican en poco tiempo', () => {
    // Antes: 11 s, porque cada cota revisaba el perfil entero. Lomas suaves de ±0.5 m.
    const vertices = Array.from({ length: 1001 }, (_, i) => ({
      progresiva: i,
      cota: 3000 + 0.03 * i + 0.5 * Math.sin(i / 40),
    }))
    const inicio = Date.now()
    const resultado = planificarConControles(vertices)
    expect(Date.now() - inicio).toBeLessThan(3000)
    expect(resultado.posible).toBe(true)
  })
})
