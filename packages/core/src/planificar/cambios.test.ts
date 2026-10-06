import { describe, expect, it } from 'vitest'
import {
  OPCIONES_NIVELACION,
  planDeVuelta,
  revisarOpciones,
  type OpcionesNivelacion,
  planificarNivelacion,
  revisarEstacion,
  visualMaximaDesde,
} from './cambios'
import type { Perfil } from './perfil'

/** Pasaje Las Lomas: +8.20 % hasta la 0+060 y +7.40 % hasta la 0+120. */
const lasLomas: Perfil = [
  { progresiva: 0, cota: 3243.5 },
  { progresiva: 60, cota: 3248.42 },
  { progresiva: 120, cota: 3252.86 },
]

/** La misma pista recorrida cuesta abajo: −7.40 % y luego −8.20 %. */
const lasLomasBajando: Perfil = [
  { progresiva: 0, cota: 3252.86 },
  { progresiva: 60, cota: 3248.42 },
  { progresiva: 120, cota: 3243.5 },
]

const plana300: Perfil = [
  { progresiva: 0, cota: 3200 },
  { progresiva: 300, cota: 3200 },
]

describe('valores de fábrica', () => {
  it('son los de la sección 2 del diseño', () => {
    expect(OPCIONES_NIVELACION).toMatchObject({
      largoMira: 4,
      alturaInstrumento: 1.5,
      lecturaMin: 0.3,
      margenSuperior: 0.3,
      visualMax: 50,
      desequilibrioMax: 5,
      intervaloEsperadas: 10,
      visualMin: 1,
      holguraPlan: 0.05,
    })
  })
})

describe('visualMaximaDesde', () => {
  it('Las Lomas subiendo al 8.2 %: la lectura de adelante manda', () => {
    // Visuales iguales d a cada lado, h = 1.50:
    //   adelante = 1.50 − 0.082·d ≥ 0.30  →  d ≤ 1.20 / 0.082 = 14.634 m
    //   atrás    = 1.50 + 0.082·d ≤ 3.70  →  d ≤ 2.20 / 0.082 = 26.829 m
    // Manda la menor: d = 14.634 m, paso entre cambios = 2·14.634 = 29.268 m.
    const visual = visualMaximaDesde(lasLomas, 0, 60)

    expect(visual.distancia).toBeCloseTo(14.634146, 5)
    expect(2 * visual.distancia).toBeCloseTo(29.268293, 5)
    expect(visual.limitante).toBe('lecturaMin')
  })

  it('bajando al 8.2 % manda la lectura de atrás, con la misma distancia', () => {
    // El punto de atrás queda más alto: atrás = 1.50 − 0.082·d ≥ 0.30 → d ≤ 14.634 m
    const visual = visualMaximaDesde(lasLomasBajando, 60, 120)

    expect(visual.distancia).toBeCloseTo(14.634146, 5)
    expect(visual.limitante).toBe('lecturaMin')
  })

  it('con el instrumento alto manda la punta de la mira', () => {
    // h = 3.00: atrás = 3.00 + 0.082·d ≤ 3.70 → d ≤ 0.70 / 0.082 = 8.537 m
    //           adelante = 3.00 − 0.082·d ≥ 0.30 → d ≤ 32.927 m
    const visual = visualMaximaDesde(lasLomas, 0, 60, { alturaInstrumento: 3 })

    expect(visual.distancia).toBeCloseTo(8.536585, 5)
    expect(visual.limitante).toBe('lecturaMax')
  })

  it('en plano manda la visual más larga: 50 m', () => {
    const visual = visualMaximaDesde(plana300, 0, 300)

    expect(visual.distancia).toBe(50)
    expect(visual.limitante).toBe('visualMax')
  })

  it('cerca del final manda el fin del tramo', () => {
    // Quedan 30 m: la estación va al medio, d = 15 m.
    const visual = visualMaximaDesde(plana300, 270, 300)

    expect(visual.distancia).toBeCloseTo(15, 9)
    expect(visual.limitante).toBe('finDelTramo')
  })

  it('si la estación cruza un quiebre, calcula con el perfil real y no con una sola pendiente', () => {
    // Desde la 0+040: la estación (40 + d) queda antes del quiebre de la 0+060 y
    // el punto de adelante (40 + 2d) después.
    //   z(adelante) − z(estación) = 0.082·(60 − 40 − d) + 0.074·(40 + 2d − 60)
    //                             = 1.640 − 0.082·d + 0.148·d − 1.480 = 0.160 + 0.066·d
    //   adelante = 1.50 − 0.160 − 0.066·d = 1.340 − 0.066·d ≥ 0.30
    //   →  d ≤ 1.040 / 0.066 = 15.7576 m  (estación 0+055.76, adelante 0+071.52)
    // Con el 8.2 % solo darían 14.634 m y con el 7.4 % solo, 16.216 m.
    const visual = visualMaximaDesde(lasLomas, 40, 120)

    expect(visual.distancia).toBeCloseTo(15.757576, 5)
    expect(visual.limitante).toBe('lecturaMin')
  })
})

describe('revisarEstacion', () => {
  it('una estación en medio y bien leída no tiene problemas', () => {
    // Estación 0+010 de Las Lomas: AI = 3243.500 + 0.820 + 1.500 = 3245.820
    //   atrás 0+000 = 3245.820 − 3243.500 = 2.320; adelante 0+020 = 3245.820 − 3245.140 = 0.680
    const revision = revisarEstacion(lasLomas, 0, 10, 20)

    expect(revision.ok).toBe(true)
    expect(revision.problemas).toEqual([])
    expect(revision.desequilibrio).toBe(0)
    expect(revision.lecturaAtras).toBeCloseTo(2.32, 9)
    expect(revision.lecturaAdelante).toBeCloseTo(0.68, 9)
  })

  it('avisa si atrás y adelante se desequilibran más de 5 m', () => {
    // Atrás 0+000 a 0+004 = 4 m; adelante 0+004 a 0+014 = 10 m: desequilibrio 6 m.
    // Lecturas: 1.500 + 0.082·4 = 1.828 y 1.500 − 0.082·10 = 0.680, ambas legibles.
    const revision = revisarEstacion(lasLomas, 0, 4, 14)

    expect(revision.ok).toBe(false)
    expect(revision.desequilibrio).toBeCloseTo(6, 9)
    expect(revision.problemas).toEqual(['atrás mide 4.00 m y adelante 10.00 m: se desequilibran 6.00 m (máximo 5.00 m)'])
  })

  it('en una hondonada avisa que el fondo no se alcanza a leer', () => {
    // Atrás 0+000 (100.000), fondo 0+010 (97.500), estación 0+020 (100.000), adelante 0+040 (100.000).
    // AI = 100.000 + 1.500 = 101.500; en el fondo la mira marcaría 101.500 − 97.500 = 4.000 > 3.70.
    const hondonada: Perfil = [
      { progresiva: 0, cota: 100 },
      { progresiva: 10, cota: 97.5 },
      { progresiva: 20, cota: 100 },
      { progresiva: 40, cota: 100 },
    ]
    const revision = revisarEstacion(hondonada, 0, 20, 40)

    expect(revision.ok).toBe(false)
    expect(revision.problemas).toEqual([
      'en la 0+010 la mira marcaría 4.000 m, más de 3.700 m: el terreno baja demasiado entre los puntos',
    ])
  })

  it('en una loma avisa que la visual pasa demasiado cerca del suelo', () => {
    // Loma de 101.300 en la 0+010: 101.500 − 101.300 = 0.200 < 0.30.
    const loma: Perfil = [
      { progresiva: 0, cota: 100 },
      { progresiva: 10, cota: 101.3 },
      { progresiva: 20, cota: 100 },
      { progresiva: 40, cota: 100 },
    ]
    const revision = revisarEstacion(loma, 0, 20, 40)

    expect(revision.ok).toBe(false)
    expect(revision.problemas).toEqual([
      'en la 0+010 la visual pasa a 0.200 m del suelo, menos de 0.300 m: la refracción engaña o el terreno tapa la mira',
    ])
  })
})

describe('planificarNivelacion — Las Lomas, primer tramo (0+000 a 0+060, +8.20 %)', () => {
  // Paso máximo 29.268 m → 60 / 29.268 = 2.05 → hacen falta 3 estaciones.
  // Repartidas parejo: paso 60 / 3 = 20 m, d = 10 m (≤ 14.634, cabe).
  const plan = planificarNivelacion(lasLomas, 0, 60)

  it('es posible y reparte parejo tres estaciones', () => {
    expect(plan.posible).toBe(true)
    expect(plan.motivo).toBeNull()
    expect(plan.reparto).toBe('parejo')
    expect(plan.estaciones.map((e) => e.progresiva)).toEqual([10, 30, 50])
  })

  it('la primera estación lee 2.320 atrás y 0.680 adelante, equilibrada', () => {
    // AI = z(10) + 1.500 = 3243.500 + 0.820 + 1.500 = 3245.820
    // atrás  0+000: 3245.820 − 3243.500 = 2.320
    // adelante 0+020: z = 3243.500 + 1.640 = 3245.140 → 3245.820 − 3245.140 = 0.680
    const [primera] = plan.estaciones
    expect(primera!.numero).toBe(1)
    expect(primera!.cotaSuelo).toBeCloseTo(3244.32, 9)
    expect(primera!.alturaInstrumental).toBeCloseTo(3245.82, 9)
    expect(primera!.atras).toMatchObject({ progresiva: 0, distancia: 10 })
    expect(primera!.atras.cota).toBeCloseTo(3243.5, 9)
    expect(primera!.atras.lectura).toBeCloseTo(2.32, 9)
    expect(primera!.adelante).toMatchObject({ progresiva: 20, distancia: 10 })
    expect(primera!.adelante.cota).toBeCloseTo(3245.14, 9)
    expect(primera!.adelante.lectura).toBeCloseTo(0.68, 9)
    expect(primera!.desequilibrio).toBe(0)
    // Lo más que podía estirarse desde la 0+000: 14.634 m, por la lectura de adelante.
    expect(primera!.visualMaxima).toBeCloseTo(14.634146, 5)
    expect(primera!.limitante).toBe('lecturaMin')
  })

  it('los puntos de cambio caen en la 0+020 y la 0+040, con su lectura de ida y de vuelta', () => {
    // 0+040: z = 3243.500 + 3.280 = 3246.780.
    //   Desde la estación 2 (AI = 3245.960 + 1.5 = 3247.460) adelante: 0.680
    //   Desde la estación 3 (AI = 3247.600 + 1.5 = 3249.100) atrás:    2.320
    expect(plan.cambios.map((c) => c.progresiva)).toEqual([20, 40])
    const segundo = plan.cambios[1]!
    expect(segundo.numero).toBe(2)
    expect(segundo.cota).toBeCloseTo(3246.78, 9)
    expect(segundo.lecturaAdelante).toBeCloseTo(0.68, 9)
    expect(segundo.lecturaAtras).toBeCloseTo(2.32, 9)
  })

  it('da lo esperado en cada progresiva redonda, una sola vez', () => {
    // Estación 1 cubre 0, 10, 20; estación 2 cubre 30, 40; estación 3 cubre 50, 60.
    // En la propia estación la mira marca h = 1.500; 10 m adelante, 1.500 − 0.820 = 0.680.
    const esperadas = plan.esperadas.map((e) => [e.progresiva, e.estacion, Number(e.lectura.toFixed(3))])
    expect(esperadas).toEqual([
      [0, 1, 2.32],
      [10, 1, 1.5],
      [20, 1, 0.68],
      [30, 2, 1.5],
      [40, 2, 0.68],
      [50, 3, 1.5],
      [60, 3, 0.68],
    ])
    // 0+060 es el quiebre: 3248.420.
    expect(plan.esperadas[6]!.cota).toBeCloseTo(3248.42, 9)
  })
})

describe('planificarNivelacion — Las Lomas de punta a punta, cruzando el quiebre', () => {
  // El avance máximo da 4 estaciones:
  //   E1: d = 14.634 (8.2 %)                         → cambio 0+029.268
  //   E2: d = 14.634 (todo en 8.2 %: 29.268 + 29.268 = 58.537 < 60) → cambio 0+058.537
  //   E3: estación pasado el quiebre: adelante = 1.500 − 0.074·d ≥ 0.30 → d = 16.216
  //       → cambio 0+058.537 + 32.432 = 0+090.969
  //   E4: faltan 120 − 90.969 = 29.031 m → d = 14.515, termina en la 0+120.
  // Pero el plan no se queda con lecturas pegadas a 0.300: con 5 cm de holgura
  // (mínimo 0.35, máximo 3.65) prueba repartir parejo con 4, 5 y 6 estaciones.
  //   4 de 30 m: d = 15 → adelante 1.500 − 0.082·15 = 0.270 < 0.35, no cabe.
  //   5 de 24 m: d = 12 → en el 8.2 %: atrás 1.500 + 0.984 = 2.484, adelante 0.516;
  //     E3 en la 0+060 (el quiebre): AI = 3248.420 + 1.500 = 3249.920;
  //       atrás 0+048: 3243.500 + 3.936 = 3247.436 → 2.484
  //       adelante 0+072: 3248.420 + 0.888 = 3249.308 → 0.612
  //     en el 7.4 %: atrás 1.500 + 0.888 = 2.388, adelante 0.612. Todo entre 0.35 y 3.65: cabe.
  const plan = planificarNivelacion(lasLomas, 0, 120)

  it('reparte parejo cinco estaciones de 24 m, con margen en todas las lecturas', () => {
    expect(plan.posible).toBe(true)
    expect(plan.reparto).toBe('parejo')
    expect(plan.estaciones.map((e) => e.progresiva)).toEqual([12, 36, 60, 84, 108])
    expect(plan.cambios.map((c) => c.progresiva)).toEqual([24, 48, 72, 96])
    expect(plan.estaciones[2]!.atras.lectura).toBeCloseTo(2.484, 9)
    expect(plan.estaciones[2]!.adelante.lectura).toBeCloseTo(0.612, 9)
    expect(plan.estaciones.every((e) => !e.alLimite)).toBe(true)
    // La menor holgura: adelante 0.516 − 0.300 = 0.216 m (E1 y E2).
    expect(Math.min(...plan.estaciones.map((e) => e.holguraMinima))).toBeCloseTo(0.216, 9)
  })

  it('con el trípode 5 cm más bajo (1.45 m) todas las estaciones del plan siguen pasando', () => {
    // E1: adelante 1.450 − 0.984 = 0.466 ≥ 0.30.
    for (const e of plan.estaciones) {
      const revision = revisarEstacion(lasLomas, e.atras.progresiva, e.progresiva, e.adelante.progresiva, {
        alturaInstrumento: 1.45,
      })
      expect(revision.problemas).toEqual([])
    }
  })

  it('el avance máximo cruza el quiebre con el perfil real (E3: 16.216 m)', () => {
    // Desde el cambio 0+058.537 la estación y el adelante quedan en el 7.4 %:
    // d = 1.20 / 0.074 = 16.216 m.
    // Dos pasos máximos de 29.268 m en el 8.2 %: 4·1.20/0.082 = 58.537.
    const desdeCambio = 4 * (1.2 / 0.082)
    const visual = visualMaximaDesde(lasLomas, desdeCambio, 120)
    expect(desdeCambio).toBeCloseTo(58.536585, 5)
    expect(visual.distancia).toBeCloseTo(16.216216, 5)
    expect(visual.limitante).toBe('lecturaMin')
  })

  it('ninguna lectura sale de 0.30 a 3.70', () => {
    for (const e of plan.estaciones) {
      for (const lectura of [e.atras.lectura, e.adelante.lectura]) {
        expect(lectura).toBeGreaterThanOrEqual(0.3)
        expect(lectura).toBeLessThanOrEqual(3.7)
      }
    }
    for (const esperada of plan.esperadas) {
      expect(esperada.lectura).toBeGreaterThanOrEqual(0.3)
      expect(esperada.lectura).toBeLessThanOrEqual(3.7)
    }
    // 0, 10, …, 120: trece progresivas redondas.
    expect(plan.esperadas.map((e) => e.progresiva)).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120])
  })
})

describe('planificarNivelacion — bajada', () => {
  it('bajando al −7.40 % de la 0+000 a la 0+060 reparte dos estaciones de 30 m', () => {
    // Paso máximo 2·1.20/0.074 = 32.432 m → 60 / 32.432 = 1.85 → 2 estaciones de 30 m (d = 15).
    // E1 en la 0+015: AI = 3252.860 − 1.110 + 1.500 = 3253.250
    //   atrás 0+000: 3253.250 − 3252.860 = 0.390 (el punto alto, la lectura chica)
    //   adelante 0+030: z = 3252.860 − 2.220 = 3250.640 → 3253.250 − 3250.640 = 2.610
    const plan = planificarNivelacion(lasLomasBajando, 0, 60)

    expect(plan.posible).toBe(true)
    expect(plan.reparto).toBe('parejo')
    expect(plan.estaciones.map((e) => e.progresiva)).toEqual([15, 45])
    expect(plan.estaciones[0]!.atras.lectura).toBeCloseTo(0.39, 9)
    expect(plan.estaciones[0]!.adelante.lectura).toBeCloseTo(2.61, 9)
    expect(plan.cambios.map((c) => c.progresiva)).toEqual([30])
  })
})

describe('planificarNivelacion — pista plana de 300 m', () => {
  it('manda la visual de 50 m: tres estaciones con paso de 100 m', () => {
    // 300 / 100 = 3 estaciones, en la 0+050, 0+150 y 0+250; cambios en la 0+100 y la 0+200.
    // A nivel todas las lecturas son la altura del instrumento: 1.500.
    const plan = planificarNivelacion(plana300, 0, 300)

    expect(plan.posible).toBe(true)
    expect(plan.estaciones.map((e) => e.progresiva)).toEqual([50, 150, 250])
    expect(plan.cambios.map((c) => c.progresiva)).toEqual([100, 200])
    expect(plan.estaciones.every((e) => e.limitante === 'visualMax')).toBe(true)
    expect(plan.esperadas).toHaveLength(31)
    expect(plan.esperadas.every((e) => Math.abs(e.lectura - 1.5) < 1e-9)).toBe(true)
  })
})

describe('planificarNivelacion — lo que no se puede', () => {
  it('con el instrumento más alto que la punta legible de la mira no hay plan', () => {
    const plan = planificarNivelacion(lasLomas, 0, 60, { alturaInstrumento: 3.8 })

    expect(plan.posible).toBe(false)
    expect(plan.estaciones).toEqual([])
    expect(plan.motivo).toBe(
      'la altura del instrumento (3.800 m) queda fuera de lo que se lee en la mira (0.300 a 3.700 m)',
    )
  })

  it('una pendiente tan fuerte que obliga a visuales de menos de 1 m se dice, con dónde', () => {
    // 150 %: d = 1.20 / 1.50 = 0.80 m < 1.00 m.
    const muro: Perfil = [
      { progresiva: 0, cota: 100 },
      { progresiva: 10, cota: 115 },
    ]
    const plan = planificarNivelacion(muro, 0, 10)

    expect(plan.posible).toBe(false)
    expect(plan.motivo).toBe(
      'desde la 0+000 la pendiente obliga a visuales de 0.80 m, menos que el mínimo de 1.00 m',
    )
  })

  it('si se traba a medio camino, devuelve lo que sí se pudo planificar', () => {
    // 0+000 a 0+100 a nivel: una estación en la 0+050 (d = 50) llega a la 0+100.
    // Desde ahí sube al 150 %: d = 0.80 m < 1.00 m, y el plan se detiene.
    const pared: Perfil = [
      { progresiva: 0, cota: 100 },
      { progresiva: 100, cota: 100 },
      { progresiva: 110, cota: 115 },
    ]
    const plan = planificarNivelacion(pared, 0, 110)

    expect(plan.posible).toBe(false)
    expect(plan.motivo).toBe(
      'desde la 0+100 la pendiente obliga a visuales de 0.80 m, menos que el mínimo de 1.00 m',
    )
    expect(plan.estaciones.map((e) => [e.progresiva, e.adelante.progresiva])).toEqual([[50, 100]])
    expect(plan.esperadas.map((e) => e.progresiva)).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100])
  })

  it('un tramo al revés o fuera del perfil no se planifica', () => {
    expect(planificarNivelacion(lasLomas, 60, 0).motivo).toBe(
      'el tramo debe avanzar en el sentido de la progresiva (de 0+060 a 0+000 retrocede)',
    )
    expect(planificarNivelacion(lasLomas, 0, 130).motivo).toBe(
      'el tramo 0+000 a 0+130 sale del perfil (0+000 a 0+120)',
    )
  })

  it('un perfil mal formado no se planifica y dice por qué', () => {
    const plan = planificarNivelacion([{ progresiva: 0, cota: 1 }], 0, 0)
    expect(plan.posible).toBe(false)
    expect(plan.motivo).toBe('el perfil necesita al menos dos vértices (tiene 1)')
  })
})

/** Generador pseudoaleatorio con semilla (mulberry32): las pruebas al azar dan siempre lo mismo. */
function azar(semilla: number): () => number {
  let a = semilla >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Pista al azar cerca de los 3000 m, con pendientes de hasta ±15 % y tramos de 10 a 110 m. */
function pistaAlAzar(siguiente: () => number): Perfil {
  const vertices = [{ progresiva: Math.round(siguiente() * 50 * 1000) / 1000, cota: 3000 }]
  const cuantos = 2 + Math.floor(siguiente() * 4)
  for (let i = 0; i < cuantos; i++) {
    const anterior = vertices[vertices.length - 1]!
    const largo = 10 + siguiente() * 100
    const pendiente = (siguiente() * 2 - 1) * 0.15
    vertices.push({
      progresiva: Math.round((anterior.progresiva + largo) * 1000) / 1000,
      cota: Math.round((anterior.cota + pendiente * largo) * 1000) / 1000,
    })
  }
  return vertices
}

describe('planificarNivelacion — lo que el plan promete, en 3000 pistas al azar', () => {
  const siguiente = azar(20261005)
  const planes = Array.from({ length: 3000 }, () => {
    const perfil = pistaAlAzar(siguiente)
    const desde = perfil[0]!.progresiva
    const hasta = perfil[perfil.length - 1]!.progresiva
    return { perfil, plan: planificarNivelacion(perfil, desde, hasta) }
  })
  const posibles = planes.filter((p) => p.plan.posible)

  it('casi todas se pueden nivelar, y algunas solo con avance máximo', () => {
    expect(posibles.length).toBeGreaterThan(2500)
    expect(posibles.some((p) => p.plan.reparto === 'maximo')).toBe(true)
  })

  it('toda estación de un plan posible pasa revisarEstacion, aun con cotas de 3000 m', () => {
    const rechazadas = posibles.flatMap(({ perfil, plan }) =>
      plan.estaciones
        .map((e) => revisarEstacion(perfil, e.atras.progresiva, e.progresiva, e.adelante.progresiva))
        .filter((r) => !r.ok)
        .map((r) => r.problemas.join('; ')),
    )
    expect(rechazadas).toEqual([])
  })

  it('ninguna estación queda con visuales de menos de 1 m', () => {
    // Las pistas al azar miden al menos 20 m: nunca hace falta una estación tan corta.
    const cortas = posibles.flatMap(({ plan }) =>
      plan.estaciones.filter((e) => e.atras.distancia < 1).map((e) => e.atras.distancia),
    )
    expect(cortas).toEqual([])
  })
})

describe('planificarNivelacion — la última estación no queda ridícula', () => {
  it('en el perfil que dejaba una última estación de 7 cm, todas miden 1 m o más', () => {
    // Antes: 16 estaciones de avance máximo y la última con visuales de 0.081 m
    // (lo que sobraba hasta la 0+386.788 después de la estación 15).
    const perfil: Perfil = [
      { progresiva: 19, cota: 3000 },
      { progresiva: 97.605, cota: 3010.971 },
      { progresiva: 195.08, cota: 3024.482 },
      { progresiva: 285.463, cota: 3027.285 },
      { progresiva: 386.788, cota: 3017.289 },
    ]
    const plan = planificarNivelacion(perfil, 19, 386.788)

    expect(plan.posible).toBe(true)
    expect(plan.estaciones.every((e) => e.atras.distancia >= 1)).toBe(true)
    expect(plan.estaciones[plan.estaciones.length - 1]!.adelante.progresiva).toBeCloseTo(386.788, 9)
  })
})

describe('planificarNivelacion — escalones (pasajes con escalinata)', () => {
  it('un escalón de 1.50 m al inicio se salva con una sola estación en la 0+010', () => {
    // 0+000 a 0+000.50 a 100.000; sube a 101.500 en la 0+001; sigue a nivel hasta la 0+020.
    // Estación en la 0+010: AI = 101.500 + 1.500 = 103.000.
    //   atrás 0+000: 3.000 ≤ 3.70; pie del escalón 0+000.50: 3.000; cabeza 0+001: 1.500; adelante 0+020: 1.500.
    // Con visuales cortas la estación queda abajo y el adelante arriba (lee menos de 0.30):
    // lo factible no empieza en cero, pero existe.
    const escalon: Perfil = [
      { progresiva: 0, cota: 100 },
      { progresiva: 0.5, cota: 100 },
      { progresiva: 1, cota: 101.5 },
      { progresiva: 20, cota: 101.5 },
    ]
    const plan = planificarNivelacion(escalon, 0, 20)

    expect(revisarEstacion(escalon, 0, 10, 20).ok).toBe(true)
    expect(plan.posible).toBe(true)
    expect(plan.estaciones.map((e) => e.progresiva)).toEqual([10])
    expect(plan.estaciones[0]!.atras.lectura).toBeCloseTo(3, 9)
    expect(plan.estaciones[0]!.adelante.lectura).toBeCloseTo(1.5, 9)
    const visual = visualMaximaDesde(escalon, 0, 20)
    expect(visual.distancia).toBeCloseTo(10, 9)
    expect(visual.limitante).toBe('finDelTramo')
  })

  it('un escalón de 1.80 m a media pista: una estación en la 0+030, no en la cara del escalón', () => {
    // 0+000 a 0+020 a 100.000; sube a 101.800 en la 0+020.50; a nivel hasta la 0+060.
    // Estación en la 0+030: AI = 101.800 + 1.500 = 103.300.
    //   atrás 0+000: 3.300 ≤ 3.65 (con holgura); pie 0+020: 3.300; cabeza 0+020.50: 1.500; adelante 0+060: 1.500.
    const escalon: Perfil = [
      { progresiva: 0, cota: 100 },
      { progresiva: 20, cota: 100 },
      { progresiva: 20.5, cota: 101.8 },
      { progresiva: 60, cota: 101.8 },
    ]
    const plan = planificarNivelacion(escalon, 0, 60)

    expect(revisarEstacion(escalon, 0, 30, 60).ok).toBe(true)
    expect(plan.posible).toBe(true)
    expect(plan.reparto).toBe('parejo')
    expect(plan.estaciones.map((e) => e.progresiva)).toEqual([30])
    expect(plan.estaciones[0]!.atras.lectura).toBeCloseTo(3.3, 9)
    expect(visualMaximaDesde(escalon, 0, 60).distancia).toBeCloseTo(30, 9)
  })
})

describe('planificarNivelacion — holgura del plan (el trípode nunca queda exacto a 1.50)', () => {
  it('en una cresta prueba con una estación más antes de dejar la visual rozando la cumbre', () => {
    // 0+000 100.000, 0+050 103.000 (cumbre), 0+100 100.000: ±6 %.
    // Avance máximo: 2 estaciones (0+000→0+040 y 0+040→0+100); la segunda pasa la
    // cumbre a 0.300 m justos: AI = 103.600 − 0.06·30 + 1.500 = 103.300 → 103.300 − 103.000.
    // Parejo con 2 (d = 25): estación en la 0+025 (101.500, AI 103.000),
    //   adelante en la cumbre 103.000 → 0.000. No cabe.
    // Parejo con 3 (paso 33.333, d = 16.667):
    //   E1 0+016.667 (101.000, AI 102.500): atrás 0+000 → 2.500; adelante 0+033.333 (102.000) → 0.500
    //   E2 0+050 (103.000, AI 104.500): atrás 102.000 → 2.500; cumbre → 1.500; adelante 102.000 → 2.500
    //   E3 0+083.333 (101.000, AI 102.500): atrás 102.000 → 0.500; adelante 0+100 → 2.500
    // Menor holgura: 0.500 − 0.300 = 0.200 m.
    const cresta: Perfil = [
      { progresiva: 0, cota: 100 },
      { progresiva: 50, cota: 103 },
      { progresiva: 100, cota: 100 },
    ]
    const plan = planificarNivelacion(cresta, 0, 100)

    expect(plan.reparto).toBe('parejo')
    expect(plan.estaciones).toHaveLength(3)
    expect(plan.estaciones[1]!.progresiva).toBeCloseTo(50, 9)
    expect(Math.min(...plan.estaciones.map((e) => e.holguraMinima))).toBeCloseTo(0.2, 9)
    expect(plan.estaciones.some((e) => e.alLimite)).toBe(false)
  })

  it('si no hay reparto con holgura, el plan marca las estaciones que quedan al límite', () => {
    // Holgura de 1.30 m: la lectura mínima con holgura sería 1.60 > h = 1.50; no hay plan holgado.
    // Queda el parejo de 3 estaciones con las reglas justas: adelante 0.680, a 0.380 del límite.
    const plan = planificarNivelacion(lasLomas, 0, 60, { holguraPlan: 1.3 })

    expect(plan.posible).toBe(true)
    expect(plan.estaciones.map((e) => e.progresiva)).toEqual([10, 30, 50])
    expect(plan.estaciones.every((e) => e.alLimite)).toBe(true)
    expect(plan.estaciones[0]!.holguraMinima).toBeCloseTo(0.38, 9)
    expect(plan.estaciones[0]!.adelante.alLimite).toBe(true)
    // Atrás 2.320: a 1.380 de 3.70, más que 1.30 de holgura.
    expect(plan.estaciones[0]!.atras.alLimite).toBe(false)
  })

  it('sin reparto parejo posible cae al avance máximo y marca las lecturas en 0.300', () => {
    // Las Lomas de punta a punta, sin holgura posible: 4 parejas de 30 m no caben
    // (adelante 0.270) y queda el avance máximo de siempre:
    //   d = 14.634, 14.634, 16.216 (cruza el quiebre), 14.515 (lo que falta: 29.031 / 2).
    const plan = planificarNivelacion(lasLomas, 0, 120, { holguraPlan: 1.3 })

    expect(plan.posible).toBe(true)
    expect(plan.reparto).toBe('maximo')
    const distancias = plan.estaciones.map((e) => e.atras.distancia)
    expect(distancias[0]).toBeCloseTo(14.634146, 5)
    expect(distancias[1]).toBeCloseTo(14.634146, 5)
    expect(distancias[2]).toBeCloseTo(16.216216, 5)
    expect(distancias[3]).toBeCloseTo(14.515491, 5)
    expect(plan.cambios[2]!.progresiva).toBeCloseTo(90.969018, 5)
    // Las lecturas en el límite no lo pasan: quedan en 0.300 o encima.
    expect(plan.estaciones.every((e) => e.adelante.lectura >= 0.3)).toBe(true)
    expect(plan.estaciones[2]!.adelante.lectura).toBeCloseTo(0.3, 6)
    expect(plan.estaciones.map((e) => e.adelante.alLimite)).toEqual([true, true, true, true])
    expect(plan.estaciones[3]!.limitante).toBe('finDelTramo')
  })
})

describe('opciones que no sirven', () => {
  it('revisarOpciones no pone peros a los valores de fábrica', () => {
    expect(revisarOpciones(OPCIONES_NIVELACION)).toEqual([])
  })

  it('una clave con undefined (un formulario vacío) deja el valor de fábrica', () => {
    const plan = planificarNivelacion(lasLomas, 0, 60, { lecturaMin: undefined } as unknown as Partial<OpcionesNivelacion>)
    expect(plan.posible).toBe(true)
    expect(plan.estaciones.map((e) => e.progresiva)).toEqual([10, 30, 50])
  })

  it('un valor negativo, NaN o cero donde no cabe da un plan imposible con el motivo, sin lanzar', () => {
    expect(planificarNivelacion(lasLomas, 0, 60, { visualMax: -5 })).toMatchObject({
      posible: false,
      motivo: 'la visual más larga debe ser mayor que cero (llegó -5)',
    })
    expect(planificarNivelacion(lasLomas, 0, 60, { visualMax: Number.NaN }).motivo).toBe(
      'la visual más larga no es un número (llegó NaN)',
    )
    expect(planificarNivelacion(lasLomas, 0, 60, { visualMin: 0 }).motivo).toBe(
      'la visual más corta debe ser mayor que cero (llegó 0)',
    )
    expect(planificarNivelacion(lasLomas, 0, 60, { intervaloEsperadas: 0.001 }).motivo).toBe(
      'el intervalo de las lecturas esperadas debe ser de 1 m o más (llegó 0.001)',
    )
    expect(revisarOpciones({ visualMin: 60 })).toEqual(['la visual más corta (60 m) pasa de la más larga (50 m)'])
    expect(revisarOpciones({ lecturaMin: 3.8 })).toEqual([
      'no queda nada legible en la mira: la lectura mínima (3.800 m) no es menor que la máxima (3.700 m)',
    ])
  })

  it('un instrumento a ras de la lectura mínima no avanza: se dice rápido, no se amontonan estaciones', () => {
    // h = 0.30 en subida: adelante = 0.30 − 0.082·d ≥ 0.30 → d = 0.
    const inicio = Date.now()
    const plan = planificarNivelacion(lasLomas, 0, 6, { alturaInstrumento: 0.3, visualMin: 0.01 })
    expect(Date.now() - inicio).toBeLessThan(1000)
    expect(plan.posible).toBe(false)
    expect(plan.motivo).toBe('desde la 0+000 la pendiente obliga a visuales de 0.00 m, menos que el mínimo de 0.01 m')
    expect(plan.estaciones).toEqual([])
  })
})

describe('revisarEstacion — datos que no sirven', () => {
  it('una progresiva NaN o fuera del perfil se dice como problema, sin inventar lecturas', () => {
    const conNaN = revisarEstacion(lasLomas, Number.NaN, 10, 20)
    expect(conNaN.ok).toBe(false)
    expect(conNaN.problemas).toEqual(['el punto de atrás no es un número'])
    expect(Number.isNaN(conNaN.lecturaAtras)).toBe(true)

    const fuera = revisarEstacion(lasLomas, 100, 120, 140)
    expect(fuera.ok).toBe(false)
    expect(fuera.problemas).toEqual(['el punto de adelante (0+140) está fuera del perfil (0+000 a 0+120)'])
  })
})

describe('planDeVuelta', () => {
  it('Las Lomas 0+000 a 0+060: la vuelta recorre las mismas estaciones al revés', () => {
    // Ida: estaciones 0+010, 0+030, 0+050; cambios 0+020, 0+040.
    // Vuelta: E1 en la 0+050 (AI = 3247.600 + 1.500 = 3249.100):
    //   atrás 0+060 (3248.420) → 0.680; adelante 0+040 (3246.780) → 2.320.
    // Cambio 1 de la vuelta en la 0+040: adelante 2.320 desde E1; atrás desde E2 en la 0+030
    //   (AI 3245.960 + 1.500 = 3247.460) → 3247.460 − 3246.780 = 0.680.
    // Desnivel de la vuelta: Σ(atrás − adelante) = 3·(0.680 − 2.320) = −4.920 (la ida da +4.920).
    const ida = planificarNivelacion(lasLomas, 0, 60)
    const vuelta = planDeVuelta(ida)

    expect(ida.sentido).toBe('ida')
    expect(vuelta.sentido).toBe('vuelta')
    expect([vuelta.desde, vuelta.hasta]).toEqual([60, 0])
    expect(vuelta.estaciones.map((e) => [e.numero, e.progresiva])).toEqual([
      [1, 50],
      [2, 30],
      [3, 10],
    ])
    const primera = vuelta.estaciones[0]!
    expect(primera.atras.progresiva).toBe(60)
    expect(primera.atras.lectura).toBeCloseTo(0.68, 9)
    expect(primera.adelante.progresiva).toBe(40)
    expect(primera.adelante.lectura).toBeCloseTo(2.32, 9)
    expect(vuelta.cambios.map((c) => [c.numero, c.progresiva])).toEqual([
      [1, 40],
      [2, 20],
    ])
    expect(vuelta.cambios[0]!.lecturaAdelante).toBeCloseTo(2.32, 9)
    expect(vuelta.cambios[0]!.lecturaAtras).toBeCloseTo(0.68, 9)
    const desnivel = vuelta.estaciones.reduce((s, e) => s + e.atras.lectura - e.adelante.lectura, 0)
    expect(desnivel).toBeCloseTo(-4.92, 9)
    // Esperadas en el orden en que se caminan: 0+060 … 0+000, cada una desde la estación que la cubre.
    expect(vuelta.esperadas.map((e) => [e.progresiva, e.estacion, Number(e.lectura.toFixed(3))])).toEqual([
      [60, 1, 0.68],
      [50, 1, 1.5],
      [40, 1, 2.32],
      [30, 2, 1.5],
      [20, 2, 2.32],
      [10, 3, 1.5],
      [0, 3, 2.32],
    ])
  })
})
