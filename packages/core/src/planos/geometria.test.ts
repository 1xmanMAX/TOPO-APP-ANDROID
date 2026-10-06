import { describe, expect, it } from 'vitest'
import {
  calibrar,
  clasificarCotas,
  clasificarCotasDePista,
  estacasDePista,
  cotasCercanas,
  largoPolilinea,
  pendientesPorTramo,
  progresivasSobrePolilinea,
  proyectarSobrePolilinea,
  proyectarSobrePista,
  puntoA,
  puntoEnProgresiva,
  puntoPdfAImagen,
  validarCalibracion,
  type Calibracion,
  type Pista,
  type Punto2,
} from './geometria'

// Plano de prueba: 1 unidad del dibujo = 0.5 m (como un DXF dibujado a otra
// escala). El Jr. Lima va recto de (0,0) a (400,0): 400 u × 0.5 = 200 m.
const jrLima: Punto2[] = [
  { x: 0, y: 0 },
  { x: 400, y: 0 },
]
const mediaUnidad: Calibracion = { metrosPorUnidad: 0.5 }

// Una L: 30 u hacia +X y luego 40 u hacia +Y. Largo 30 + 40 = 70 u.
const ele: Punto2[] = [
  { x: 0, y: 0 },
  { x: 30, y: 0 },
  { x: 30, y: 40 },
]

describe('largoPolilinea', () => {
  it('suma los tramos', () => {
    // 30 + 40 = 70
    expect(largoPolilinea(ele)).toBe(70)
  })

  it('un tramo inclinado usa Pitágoras', () => {
    // √(3² + 4²) = 5
    expect(largoPolilinea([{ x: 0, y: 0 }, { x: 3, y: 4 }])).toBe(5)
  })

  it('con menos de dos vértices no hay largo', () => {
    expect(largoPolilinea([])).toBe(0)
    expect(largoPolilinea([{ x: 1, y: 1 }])).toBe(0)
  })
})

describe('puntoA', () => {
  it('cae en el primer tramo con su rumbo', () => {
    // 10 u por el primer tramo (+X): (10, 0), rumbo atan2(0, 30) = 0°
    expect(puntoA(ele, 10)).toEqual({ x: 10, y: 0, rumbo: 0 })
  })

  it('pasa al segundo tramo y toma su rumbo', () => {
    // 50 u = 30 del primero + 20 del segundo: (30, 20), rumbo atan2(40, 0) = 90°
    expect(puntoA(ele, 50)).toEqual({ x: 30, y: 20, rumbo: 90 })
  })

  it('en los extremos devuelve el vértice', () => {
    expect(puntoA(ele, 0)).toEqual({ x: 0, y: 0, rumbo: 0 })
    expect(puntoA(ele, 70)).toEqual({ x: 30, y: 40, rumbo: 90 })
  })

  it('fuera de la polilínea no inventa un punto', () => {
    expect(puntoA(ele, -1)).toBeNull()
    expect(puntoA(ele, 70.5)).toBeNull()
    expect(puntoA([{ x: 0, y: 0 }], 0)).toBeNull()
  })

  it('salta los tramos de largo cero sin dividir entre cero', () => {
    const conRepetido = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 }]
    // 5 u por el tramo real: (5, 0), rumbo 0°
    expect(puntoA(conRepetido, 5)).toEqual({ x: 5, y: 0, rumbo: 0 })
  })
})

describe('calibrar', () => {
  it('dos puntos a 100 u que en obra miden 50 m dan 0.5 m por unidad', () => {
    // 50 / 100 = 0.5
    expect(calibrar({ x: 0, y: 0 }, { x: 60, y: 80 }, 50)).toEqual({
      metrosPorUnidad: 0.5,
      ejeY: 'arriba',
    })
  })

  it('anota que en una imagen la Y crece hacia abajo', () => {
    // √(30² + 40²) = 50 u; 25 / 50 = 0.5
    expect(calibrar({ x: 0, y: 0 }, { x: 30, y: 40 }, 25, 'abajo')).toEqual({
      metrosPorUnidad: 0.5,
      ejeY: 'abajo',
    })
  })

  it('rechaza puntos repetidos o metros no positivos', () => {
    expect(() => calibrar({ x: 1, y: 1 }, { x: 1, y: 1 }, 10)).toThrow()
    expect(() => calibrar({ x: 0, y: 0 }, { x: 1, y: 0 }, 0)).toThrow()
    expect(() => calibrar({ x: 0, y: 0 }, { x: 1, y: 0 }, -5)).toThrow()
  })
})

describe('progresivasSobrePolilinea', () => {
  it('cada 20 m sobre el Jr. Lima, incluido el final', () => {
    // 200 m / 20 = 10 intervalos → 11 progresivas; la de 40 m está a 40/0.5 = 80 u
    const estacas = progresivasSobrePolilinea(jrLima, mediaUnidad)
    expect(estacas).toHaveLength(11)
    expect(estacas[0]).toEqual({ progresiva: 0, x: 0, y: 0, rumbo: 0 })
    expect(estacas[2]).toEqual({ progresiva: 40, x: 80, y: 0, rumbo: 0 })
    expect(estacas[10]).toEqual({ progresiva: 200, x: 400, y: 0, rumbo: 0 })
  })

  it('con inicio que no es múltiplo pone el arranque, los múltiplos y el final', () => {
    // Pista de 70 u × 1 m/u = 70 m arrancando en 0+010 → termina en 0+080.
    // Múltiplos de 20 dentro: 20, 40, 60. 20 m está a 20 − 10 = 10 u: (10, 0).
    // 60 m está a 50 u: 30 del primer tramo + 20 del segundo → (30, 20).
    const estacas = progresivasSobrePolilinea(ele, { metrosPorUnidad: 1 }, 20, 10)
    expect(estacas.map((e) => e.progresiva)).toEqual([10, 20, 40, 60, 80])
    expect(estacas[1]).toEqual({ progresiva: 20, x: 10, y: 0, rumbo: 0 })
    expect(estacas[3]).toEqual({ progresiva: 60, x: 30, y: 20, rumbo: 90 })
  })

  it('rechaza un intervalo que no es positivo', () => {
    expect(() => progresivasSobrePolilinea(jrLima, mediaUnidad, 0)).toThrow()
  })
})

describe('proyectarSobrePolilinea', () => {
  // Con la Y hacia arriba (DXF) y avanzando hacia +X, la izquierda es +Y.
  it('DXF: un punto arriba del eje queda a la izquierda (negativo)', () => {
    // (100, 6): progresiva 100 × 0.5 = 50 m; desplazamiento 6 × 0.5 = 3 m a la izquierda
    expect(proyectarSobrePolilinea(jrLima, { x: 100, y: 6 }, mediaUnidad)).toEqual({
      progresiva: 50,
      desplazamiento: -3,
      fueraDeLaPista: false,
    })
  })

  it('DXF: un punto abajo del eje queda a la derecha (positivo)', () => {
    // (100, −6) → 50 m, +3 m
    expect(proyectarSobrePolilinea(jrLima, { x: 100, y: -6 }, mediaUnidad)).toEqual({
      progresiva: 50,
      desplazamiento: 3,
      fueraDeLaPista: false,
    })
  })

  it('imagen: con la Y hacia abajo el mismo punto cambia de lado', () => {
    // En la pantalla (100, 6) está DEBAJO del eje: avanzando a la derecha de
    // la pantalla, eso es la derecha → +3 m.
    const raster: Calibracion = { metrosPorUnidad: 0.5, ejeY: 'abajo' }
    expect(proyectarSobrePolilinea(jrLima, { x: 100, y: 6 }, raster).desplazamiento).toBe(3)
    expect(proyectarSobrePolilinea(jrLima, { x: 100, y: -6 }, raster).desplazamiento).toBe(-3)
  })

  it('en el segundo tramo de la L la progresiva sigue sumando', () => {
    // Segundo tramo va hacia +Y. Punto (25, 10): pie en (30, 10) → 30 + 10 = 40 m.
    // Avanzando hacia +Y con Y arriba, la izquierda es −X: (25,10) está a 5 m a la izquierda.
    expect(proyectarSobrePolilinea(ele, { x: 25, y: 10 }, { metrosPorUnidad: 1 })).toEqual({
      progresiva: 40,
      desplazamiento: -5,
      fueraDeLaPista: false,
    })
  })

  it('suma la progresiva de inicio', () => {
    // 50 m desde el arranque + 1000 = 1050
    expect(
      proyectarSobrePolilinea(jrLima, { x: 100, y: 0 }, mediaUnidad, { inicio: 1000 }).progresiva,
    ).toBe(1050)
  })

  it('más allá del final avisa que cae fuera de la pista', () => {
    // (410, 0): el pie se queda en el final (200 m), a 10 × 0.5 = 5 m del vértice
    const r = proyectarSobrePolilinea(jrLima, { x: 410, y: 0 }, mediaUnidad)
    expect(r.progresiva).toBe(200)
    expect(r.fueraDeLaPista).toBe(true)
  })
})

describe('cotasCercanas y pendientesPorTramo: Jr. Lima', () => {
  const textos = [
    // Cotas escritas en el plano, al costado del eje y desordenadas.
    { x: 400, y: 2, valor: 3244.1 }, // 400 × 0.5 = 200 m, 1 m a la izquierda
    { x: 0, y: -4, valor: 3244.4 }, //   0 m, 2 m a la derecha
    { x: 200, y: 6, valor: 3243.9 }, // 100 m, 3 m a la izquierda
    { x: 150, y: 40, valor: 3250.0 }, // 75 m pero a 20 m del eje: es de otra calle
    { x: 600, y: 0, valor: 3240.0 }, // 300 m: más allá del final
    { x: 50, y: 0, valor: Number.NaN }, // texto que no se pudo leer como número
  ]

  it('toma solo las cotas junto al eje, ordenadas por progresiva', () => {
    expect(cotasCercanas(jrLima, textos, mediaUnidad)).toEqual([
      { progresiva: 0, cota: 3244.4, desplazamiento: 2 },
      { progresiva: 100, cota: 3243.9, desplazamiento: -3 },
      { progresiva: 200, cota: 3244.1, desplazamiento: -1 },
    ])
  })

  it('lo que deja fuera lo cuenta con su motivo', () => {
    const { descartadas } = clasificarCotas(jrLima, textos, mediaUnidad)
    expect(descartadas.map((d) => d.motivo)).toEqual(['lejosDelEje', 'fueraDeLaPista', 'noEsNumero'])
  })

  it('el límite de desplazamiento se puede abrir', () => {
    // Con 25 m entra también la de 20 m del eje (75 m de progresiva)
    expect(cotasCercanas(jrLima, textos, mediaUnidad, 25)).toHaveLength(4)
  })

  it('−0.50 % de 0 a 100 y +0.20 % de 100 a 200', () => {
    // (3243.900 − 3244.400) / 100 × 100 = −0.50 %
    // (3244.100 − 3243.900) / 100 × 100 = +0.20 %
    const vertices = cotasCercanas(jrLima, textos, mediaUnidad)
    expect(pendientesPorTramo(vertices)).toEqual([
      { desde: 0, hasta: 100, porcentaje: expect.closeTo(-0.5, 9), sentido: 'baja' },
      { desde: 100, hasta: 200, porcentaje: expect.closeTo(0.2, 9), sentido: 'sube' },
    ])
  })
})

describe('pendientesPorTramo', () => {
  it('calcula con el mismo criterio que el perfil del planificador', () => {
    // (3244.1 − 3244.4) / 200 × 100 = −0.15 %
    expect(
      pendientesPorTramo([
        { progresiva: 0, cota: 3244.4 },
        { progresiva: 200, cota: 3244.1 },
      ]),
    ).toEqual([{ desde: 0, hasta: 200, porcentaje: expect.closeTo(-0.15, 9), sentido: 'baja' }])
  })

  it('no redondea: redondea quien muestra, una sola vez', () => {
    // 0.100 m en 30 m = 0.3333… %. Antes salía 0.333 y la pantalla lo volvía a
    // redondear; ahora llega entero y la pantalla decide los decimales.
    const [tramo] = pendientesPorTramo([
      { progresiva: 0, cota: 3244 },
      { progresiva: 30, cota: 3244.1 },
    ])
    expect(tramo!.porcentaje).toBeCloseTo(1 / 3, 9)
    expect(tramo!.porcentaje).not.toBe(0.333)
  })

  it('no reordena a escondidas: un vértice fuera de orden es un error', () => {
    // Igual que revisarPerfil: reordenar movería la pista sin que nadie lo sepa.
    expect(() =>
      pendientesPorTramo([
        { progresiva: 200, cota: 3244.1 },
        { progresiva: 0, cota: 3244.4 },
      ]),
    ).toThrow(/vértice 2/)
  })

  it('una cota o progresiva que no es número no pasa como 0 % plano', () => {
    // Antes: redondear3(NaN) || 0 = 0 → «plano». Ahora dice qué vértice falla.
    expect(() =>
      pendientesPorTramo([
        { progresiva: 0, cota: 3244 },
        { progresiva: 20, cota: Number.NaN },
      ]),
    ).toThrow(/vértice 2/)
    expect(() =>
      pendientesPorTramo([
        { progresiva: Number.NaN, cota: 3244 },
        { progresiva: 20, cota: 3244 },
      ]),
    ).toThrow(/vértice 1/)
    expect(() => pendientesPorTramo([{ progresiva: 0, cota: Number.NaN }])).toThrow(/vértice 1/)
  })

  it('un tramo sin desnivel es plano', () => {
    // 0 / 20 × 100 = 0 %
    expect(
      pendientesPorTramo([
        { progresiva: 0, cota: 3244 },
        { progresiva: 20, cota: 3244 },
      ]),
    ).toEqual([{ desde: 0, hasta: 20, porcentaje: 0, sentido: 'plano' }])
  })

  it('una pista empinada: 3.5 m en 25 m es 14 %', () => {
    // (3247.5 − 3244) / 25 × 100 = 14 %
    expect(
      pendientesPorTramo([
        { progresiva: 0, cota: 3244 },
        { progresiva: 25, cota: 3247.5 },
      ])[0]!.porcentaje,
    ).toBeCloseTo(14, 9)
  })

  it('con menos de dos vértices no hay tramos', () => {
    expect(pendientesPorTramo([])).toEqual([])
    expect(pendientesPorTramo([{ progresiva: 0, cota: 1 }])).toEqual([])
  })

  it('dos cotas en la misma progresiva es un error del dato, no una pendiente infinita', () => {
    expect(() =>
      pendientesPorTramo([
        { progresiva: 40, cota: 3244 },
        { progresiva: 40, cota: 3245 },
      ]),
    ).toThrow(/vértice 2/)
  })
})

// ---------------------------------------------------------------------------
// Correcciones de la revisión
// ---------------------------------------------------------------------------

describe('dos cotas en la misma estaca (bordes, NTN y rasante)', () => {
  // Jr. Lima a 0.5 m/u. En 0+100 hay una cota en cada borde:
  //   (200, 6)    → 200 × 0.5 = 100.000 m, 6 × 0.5 = 3 m a la izquierda (−3)
  //   (200.6, −6) → 200.6 × 0.5 = 100.300 m, 3 m a la derecha (+3)
  // Distan 0.3 m de progresiva < 1 m: son la misma estaca.
  const bordes = [
    { x: 0, y: -4, valor: 3244.4 }, // 0 m, +2
    { x: 200, y: 6, valor: 3243.95 },
    { x: 200.6, y: -6, valor: 3243.8 },
    { x: 400, y: 2, valor: 3244.1 }, // 200 m, −1
  ]

  it('no inventa un tramo de 30 cm: las devuelve como conflicto para elegir', () => {
    const r = clasificarCotas(jrLima, bordes, mediaUnidad)
    expect(r.conflictos).toEqual([
      {
        progresiva: 100,
        cotas: [
          { progresiva: 100, cota: 3243.95, desplazamiento: -3 },
          { progresiva: 100.3, cota: 3243.8, desplazamiento: 3 },
        ],
      },
    ])
    expect(r.cercanas.map((c) => c.progresiva)).toEqual([0, 200])
  })

  it('la cadena cotasCercanas → pendientesPorTramo no inventa quiebres', () => {
    // Sin la estaca en conflicto queda un solo tramo:
    // (3244.1 − 3244.4) / 200 × 100 = −0.15 %. Antes salía −50 % de 100.0 a 100.3.
    expect(pendientesPorTramo(cotasCercanas(jrLima, bordes, mediaUnidad))).toEqual([
      { desde: 0, hasta: 200, porcentaje: expect.closeTo(-0.15, 9), sentido: 'baja' },
    ])
  })

  it('con las dos en la misma X tampoco aborta el cálculo', () => {
    // (200, 6) y (200, −6) → las dos en 100 m. Antes: «Hay dos cotas en la misma progresiva».
    const mismaX = [
      bordes[0]!,
      { x: 200, y: 6, valor: 3243.95 },
      { x: 200, y: -6, valor: 3243.8 },
      bordes[3]!,
    ]
    const vertices = cotasCercanas(jrLima, mismaX, mediaUnidad)
    expect(() => pendientesPorTramo(vertices)).not.toThrow()
    expect(clasificarCotas(jrLima, mismaX, mediaUnidad).conflictos).toHaveLength(1)
  })

  it('si las dos dicen lo mismo, se toma una y la otra se cuenta como repetida', () => {
    // (200, 6) y (200, −6) con 3243.900: no hay nada que elegir.
    const iguales = [
      bordes[0]!,
      { x: 200, y: 6, valor: 3243.9 },
      { x: 200, y: -6, valor: 3243.9 },
      bordes[3]!,
    ]
    const r = clasificarCotas(jrLima, iguales, mediaUnidad)
    expect(r.conflictos).toEqual([])
    expect(r.cercanas.map((c) => c.cota)).toEqual([3244.4, 3243.9, 3244.1])
    expect(r.descartadas).toEqual([{ texto: iguales[2], motivo: 'repetida' }])
    // −0.50 % y +0.20 %, como el Jr. Lima de siempre
    expect(pendientesPorTramo(r.cercanas).map((t) => t.porcentaje)).toEqual([expect.closeTo(-0.5, 9), expect.closeTo(0.2, 9)])
  })

  it('se puede quedar con un solo lado; lo del otro lado se cuenta', () => {
    // Derecha = desplazamiento positivo: (0,−4) +2 y (200.6,−6) +3 entran;
    // (200,6) −3 y (400,2) −1 son del otro lado.
    const r = clasificarCotas(jrLima, bordes, mediaUnidad, 15, { lado: 'derecha' })
    expect(r.cercanas.map((c) => c.progresiva)).toEqual([0, 100.3])
    expect(r.conflictos).toEqual([])
    expect(r.descartadas.map((d) => d.motivo)).toEqual(['otroLado', 'otroLado'])
  })

  it('la tolerancia de «misma estaca» se puede cambiar', () => {
    // Con 0.2 m, 100.000 y 100.300 ya son estacas distintas.
    const r = clasificarCotas(jrLima, bordes, mediaUnidad, 15, { toleranciaMismaEstacaM: 0.2 })
    expect(r.conflictos).toEqual([])
    expect(r.cercanas).toHaveLength(4)
  })
})

describe('holgura en el arranque y el final', () => {
  it('una cota 0.5 m antes del arranque es la de 0+000', () => {
    // (−1, 4): pie 1 × 0.5 = 0.5 m antes del arranque (< 3 m de holgura).
    // Se queda en la progresiva 0; 4 × 0.5 = 2 m a la izquierda → −2.
    const r = clasificarCotas(jrLima, [{ x: -1, y: 4, valor: 3244.4 }], mediaUnidad)
    expect(r.cercanas).toEqual([{ progresiva: 0, cota: 3244.4, desplazamiento: -2 }])
    expect(r.descartadas).toEqual([])
  })

  it('una cota 1 m después del final es la del final', () => {
    // (402, −2): 2 × 0.5 = 1 m pasado el final → 200 m; 2 × 0.5 = 1 m a la derecha
    expect(proyectarSobrePolilinea(jrLima, { x: 402, y: -2 }, mediaUnidad)).toEqual({
      progresiva: 200,
      desplazamiento: 1,
      fueraDeLaPista: false,
    })
  })

  it('lo claramente más allá sigue fuera, y la holgura se puede cambiar', () => {
    // (−20, 0): 20 × 0.5 = 10 m antes → fuera con 3 m; dentro con 12 m.
    expect(proyectarSobrePolilinea(jrLima, { x: -20, y: 0 }, mediaUnidad).fueraDeLaPista).toBe(true)
    expect(
      proyectarSobrePolilinea(jrLima, { x: -20, y: 0 }, mediaUnidad, { holguraExtremosM: 12 })
        .fueraDeLaPista,
    ).toBe(false)
  })

  it('pista diagonal: las cotas justo en los extremos no se pierden por el punto flotante', () => {
    // Pista de (0,0) a (0.1k, 0.3k), 1 m/u. Normal izquierda (Y arriba):
    // (−dy, dx)/largo. Una cota 2 u a la izquierda del arranque y otra 2 u
    // a la derecha del final: desplazamientos −2 y +2, nunca «fuera».
    const unMetro = { metrosPorUnidad: 1 }
    let perdidas = 0
    for (let k = 1; k <= 2000; k++) {
      const b = { x: 0.1 * k, y: 0.3 * k }
      const largo = Math.hypot(b.x, b.y)
      const nx = -b.y / largo
      const ny = b.x / largo
      const pista = [{ x: 0, y: 0 }, b]
      const enArranque = proyectarSobrePolilinea(pista, { x: 2 * nx, y: 2 * ny }, unMetro)
      const enFinal = proyectarSobrePolilinea(pista, { x: b.x - 2 * nx, y: b.y - 2 * ny }, unMetro)
      if (enArranque.fueraDeLaPista || enFinal.fueraDeLaPista) perdidas++
      if (k === 1000) {
        // largo = √(100² + 300²) = 316.228 m
        expect(enArranque).toEqual({ progresiva: 0, desplazamiento: -2, fueraDeLaPista: false })
        expect(enFinal).toEqual({ progresiva: 316.228, desplazamiento: 2, fueraDeLaPista: false })
      }
    }
    expect(perdidas).toBe(0)
  })
})

describe('cotas inverosímiles', () => {
  // '6.00' (un ancho de calzada) a 2 m del eje en 0+050 de una calle a 3244 m.
  const conAncho = [
    { x: 0, y: -4, valor: 3244.4 },
    { x: 100, y: 4, valor: 6 }, // 50 m, −2
    { x: 200, y: 6, valor: 3243.9 },
    { x: 400, y: 2, valor: 3244.1 },
  ]

  it('un número lejos de la mediana se descarta como fueraDeRango', () => {
    // Mediana de 6, 3243.9, 3244.1, 3244.4 = (3243.9 + 3244.1)/2 = 3244.0;
    // |6 − 3244| = 3238 m > 100 m → fuera de rango.
    const r = clasificarCotas(jrLima, conAncho, mediaUnidad)
    expect(r.cercanas.map((c) => c.cota)).toEqual([3244.4, 3243.9, 3244.1])
    expect(r.descartadas).toEqual([{ texto: conAncho[1], motivo: 'fueraDeRango' }])
  })

  it('o con un rango de cotas que se pasa', () => {
    // Rango 3244.0 a 3245.0: quedan fuera el 6 y también 3243.9.
    const r = clasificarCotas(jrLima, conAncho, mediaUnidad, 15, {
      rangoCota: { min: 3244, max: 3245 },
    })
    expect(r.cercanas.map((c) => c.cota)).toEqual([3244.4, 3244.1])
    expect(r.descartadas.map((d) => d.motivo)).toEqual(['fueraDeRango', 'fueraDeRango'])
  })
})

describe('progresivasSobrePolilinea con inicio fraccionario', () => {
  it('la primera estaca tiene posición aunque el inicio tenga más de 3 decimales', () => {
    // inicio 10.0004 → se rotula 10; su posición es el arranque (0 u).
    // fin = 10.0004 + 200 = 210.0004 → 210. Múltiplos de 20: 20..200 (10) → 12 estacas.
    const estacas = progresivasSobrePolilinea(jrLima, mediaUnidad, 20, 10.0004)
    expect(estacas[0]).toEqual({ progresiva: 10, x: 0, y: 0, rumbo: 0 })
    expect(estacas).toHaveLength(12)
    for (const e of estacas) expect(Number.isFinite(e.x) && Number.isFinite(e.y)).toBe(true)
  })
})

describe('datos inválidos no dan basura en silencio', () => {
  it('validarCalibracion rechaza metros por unidad no positivos o no numéricos y un ejeY raro', () => {
    expect(() => validarCalibracion({ metrosPorUnidad: 0 })).toThrow()
    expect(() => validarCalibracion({ metrosPorUnidad: Number.NaN })).toThrow()
    expect(() => validarCalibracion({ metrosPorUnidad: -1 })).toThrow()
    expect(() => validarCalibracion({ metrosPorUnidad: 1, ejeY: 'lado' as never })).toThrow()
    expect(() => validarCalibracion({ metrosPorUnidad: 0.5, ejeY: 'abajo' })).not.toThrow()
  })

  it('las funciones que usan la calibración la validan al entrar', () => {
    const cero = { metrosPorUnidad: 0 }
    const nan = { metrosPorUnidad: Number.NaN }
    expect(() => progresivasSobrePolilinea(jrLima, cero)).toThrow()
    expect(() => progresivasSobrePolilinea(jrLima, nan)).toThrow()
    expect(() => proyectarSobrePolilinea(jrLima, { x: 1, y: 1 }, nan)).toThrow()
    expect(() => clasificarCotas(jrLima, [], cero)).toThrow()
  })

  it('un inicio no numérico o demasiadas estacas se rechazan', () => {
    expect(() => progresivasSobrePolilinea(jrLima, mediaUnidad, 20, Number.NaN)).toThrow()
    expect(() =>
      proyectarSobrePolilinea(jrLima, { x: 1, y: 1 }, mediaUnidad, { inicio: Number.NaN }),
    ).toThrow()
    // 200 m / 0.0004 = 500 000 estacas: un intervalo así es un error de digitación.
    expect(() => progresivasSobrePolilinea(jrLima, mediaUnidad, 0.0004)).toThrow(/estacas/)
  })

  it('un texto sin posición numérica se cuenta como posicionInvalida', () => {
    const textos = [{ x: Number.NaN, y: 0, valor: 3244 }]
    expect(clasificarCotas(jrLima, textos, mediaUnidad).descartadas).toEqual([
      { texto: textos[0], motivo: 'posicionInvalida' },
    ])
    expect(() => proyectarSobrePolilinea(jrLima, { x: Number.NaN, y: 0 }, mediaUnidad)).toThrow()
  })
})

describe('textos tal como los entregan los lectores DXF y PDF', () => {
  it('acepta valor null (texto que no es cota) y lo cuenta como noEsNumero', () => {
    // TextoPlano de pdf.ts: { texto, x, y, valor: number | null }
    const textos = [
      { texto: 'JR. LIMA', x: 100, y: 3, valor: null },
      { texto: '3244.40', x: 0, y: -4, valor: 3244.4 },
    ]
    const r = clasificarCotas(jrLima, textos, mediaUnidad)
    expect(r.cercanas).toEqual([{ progresiva: 0, cota: 3244.4, desplazamiento: 2 }])
    // El texto original vuelve entero, con su campo `texto`.
    expect(r.descartadas).toEqual([{ texto: textos[0], motivo: 'noEsNumero' }])
    expect(r.descartadas[0]!.texto.texto).toBe('JR. LIMA')
  })

  it('puntoPdfAImagen pasa de puntos PDF (Y arriba) a píxeles (Y abajo)', () => {
    // px = 100 × 2 = 200; py = (842 − 700) × 2 = 284
    expect(puntoPdfAImagen({ x: 100, y: 700 }, 842, 2)).toEqual({ x: 200, y: 284 })
  })
})

describe('Pista con su progresiva de arranque', () => {
  // Jr. Lima dibujado a 0.5 m/u que arranca en 0+120 → termina en 0+320.
  const pista: Pista = {
    id: 'p1',
    nombre: 'Jr. Lima',
    polilinea: jrLima,
    calibracion: mediaUnidad,
    progresivaInicio: 120,
  }

  it('puntoEnProgresiva convierte metros a posición en el plano', () => {
    // (170 − 120) / 0.5 = 100 u → (100, 0)
    expect(puntoEnProgresiva(pista, 170)).toEqual({ x: 100, y: 0, rumbo: 0 })
    // 0+320 es el final (400, 0)
    expect(puntoEnProgresiva(pista, 320)).toEqual({ x: 400, y: 0, rumbo: 0 })
    // Fuera de 0+120..0+320 no inventa
    expect(puntoEnProgresiva(pista, 100)).toBeNull()
    expect(puntoEnProgresiva(pista, 321)).toBeNull()
  })

  it('estacas, proyección y cotas reciben la pista entera', () => {
    // Estacas: 120, 140, …, 320 → 11
    expect(estacasDePista(pista).map((e) => e.progresiva)).toEqual([
      120, 140, 160, 180, 200, 220, 240, 260, 280, 300, 320,
    ])
    // (100, 6): 120 + 50 = 170 m, −3
    expect(proyectarSobrePista(pista, { x: 100, y: 6 })).toEqual({
      progresiva: 170,
      desplazamiento: -3,
      fueraDeLaPista: false,
    })
    // (200, 6) → 120 + 100 = 220 m
    expect(clasificarCotasDePista(pista, [{ x: 200, y: 6, valor: 3243.9 }]).cercanas).toEqual([
      { progresiva: 220, cota: 3243.9, desplazamiento: -3 },
    ])
  })
})
