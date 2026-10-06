import { describe, expect, it } from 'vitest'
import { analizarDrenaje, bombeo, compararBombeo } from './drenaje'

/*
 * Jr. Lima. Proyecto: −0.50 % desde 0+000 (cota 100.000) hasta 0+100, y
 * +0.20 % después. El sumidero está en 0+100, el punto bajo del proyecto.
 *   0+000 100.000
 *   0+100 100.000 − 0.005 × 100 = 99.500
 *   0+140  99.500 + 0.002 × 40  = 99.580
 */
const proyectoJrLima = [
  { progresiva: 0, cota: 100 },
  { progresiva: 100, cota: 99.5 },
  { progresiva: 140, cota: 99.58 },
]

/*
 * Medido: igual que el proyecto salvo
 *   0+100 a +25 mm → 99.525
 *   0+120 a −20 mm → proyecto 99.500 + 0.002 × 20 = 99.540; 99.540 − 0.020 = 99.520
 */
const medidoJrLima = [
  { progresiva: 0, cota: 100 },
  { progresiva: 50, cota: 99.75 },
  { progresiva: 100, cota: 99.525 },
  { progresiva: 120, cota: 99.52 },
  { progresiva: 140, cota: 99.58 },
]

describe('analizarDrenaje — Jr. Lima', () => {
  const r = analizarDrenaje(medidoJrLima, proyectoJrLima, {
    sumideros: [100],
    casiPlanoPorcentaje: 0.1,
  })

  it('el tramo 0+100–0+120 corre al revés que el proyecto', () => {
    // medido: (99.520 − 99.525) / 20 × 100 = −0.025 % → el agua avanza
    // proyecto: (99.540 − 99.500) / 20 × 100 = +0.200 % → el agua retrocede
    const tramo = r.tramos.find((t) => t.desde === 100)!
    expect(tramo.hasta).toBe(120)
    expect(tramo.pendienteMedida).toBe(-0.025)
    expect(tramo.pendienteProyecto).toBe(0.2)
    expect(tramo.sentidoMedido).toBe('avanza')
    expect(tramo.contraPendiente).toBe(true)
    // |−0.025| < 0.1 → casi plano
    expect(tramo.casiPlano).toBe(true)
  })

  it('los demás tramos van con el proyecto', () => {
    // 0+000–0+050: (99.75 − 100) / 50 × 100 = −0.500 %
    // 0+050–0+100: (99.525 − 99.75) / 50 × 100 = −0.450 %
    // 0+120–0+140: (99.58 − 99.52) / 20 × 100 = +0.300 % → retrocede, como el proyecto (+0.20)
    expect(r.tramos.map((t) => t.pendienteMedida)).toEqual([-0.5, -0.45, -0.025, 0.3])
    expect(r.tramos.map((t) => t.contraPendiente)).toEqual([false, false, true, false])
    expect(r.tramos[3]!.sentidoMedido).toBe('retrocede')
    expect(r.tramos[3]!.casiPlano).toBe(false)
  })

  it('cada tramo trae su desnivel en milímetros', () => {
    // 99.750 − 100.000 = −250; 99.525 − 99.750 = −225; 99.520 − 99.525 = −5; 99.580 − 99.520 = +60
    expect(r.tramos.map((t) => t.desnivelMm)).toEqual([-250, -225, -5, 60])
  })

  it('ningún tramo cruza un quiebre del proyecto: 0+100 es punta de tramo, no interior', () => {
    expect(r.tramos.map((t) => t.quiebresDeProyecto)).toEqual([[], [], [], []])
  })

  it('el punto bajo quedó en 0+120, lejos del sumidero: se empoza', () => {
    // 99.520 es menor que 99.525 (antes) y que 99.580 (después)
    // profundidad: el vecino más bajo es 99.525 → 99.525 − 99.520 = 5 mm
    const bajo = {
      progresiva: 120,
      hasta: 120,
      cota: 99.52,
      profundidadMm: 5,
      enSumidero: false,
      extremo: false,
    }
    expect(r.puntosBajos).toEqual([bajo])
    expect(r.empozamientos).toEqual([bajo])
  })

  it('sin decir lo contrario, el resultado no está comprobado', () => {
    expect(r.comprobado).toBe(false)
  })
})

describe('analizarDrenaje — casos de borde', () => {
  it('un punto bajo a menos de 2 m del sumidero no se empoza', () => {
    // mínimo en 0+101.5; sumidero en 0+100 → 1.5 m ≤ 2 m
    const r = analizarDrenaje(
      [
        { progresiva: 90, cota: 10.1 },
        { progresiva: 101.5, cota: 10 },
        { progresiva: 110, cota: 10.1 },
      ],
      null,
      { sumideros: [100], casiPlanoPorcentaje: 0.1 },
    )
    expect(r.puntosBajos[0]!.enSumidero).toBe(true)
    expect(r.empozamientos).toEqual([])
  })

  it('a 2.5 m del sumidero ya no cuenta', () => {
    // 102.5 − 100 = 2.5 m > 2 m
    const r = analizarDrenaje(
      [
        { progresiva: 90, cota: 10.1 },
        { progresiva: 102.5, cota: 10 },
        { progresiva: 110, cota: 10.1 },
      ],
      null,
      { sumideros: [100], casiPlanoPorcentaje: 0.1 },
    )
    // profundidad: 10.100 − 10.000 = 100 mm
    const bajo = {
      progresiva: 102.5,
      hasta: 102.5,
      cota: 10,
      profundidadMm: 100,
      enSumidero: false,
      extremo: false,
    }
    expect(r.puntosBajos).toEqual([bajo])
    expect(r.empozamientos).toEqual([bajo])
  })

  it('a exactamente 2 m del sumidero todavía cuenta', () => {
    // 102.1 − 100.1 = 2.000 m en papel; en flotante sale 2.0000000000000x: el margen lo absorbe
    const r = analizarDrenaje(
      [
        { progresiva: 90, cota: 10.1 },
        { progresiva: 102.1, cota: 10 },
        { progresiva: 110, cota: 10.1 },
      ],
      null,
      { sumideros: [100.1] },
    )
    expect(r.puntosBajos[0]!.enSumidero).toBe(true)
    expect(r.empozamientos).toEqual([])
  })

  it('sin proyecto no hay pendiente de proyecto ni contrapendiente', () => {
    const r = analizarDrenaje(
      [
        { progresiva: 0, cota: 10 },
        { progresiva: 20, cota: 10.1 },
      ],
      null,
      { sumideros: [], casiPlanoPorcentaje: 0.1 },
    )
    // (10.1 − 10) / 20 × 100 = +0.500 % → retrocede; desnivel +100 mm
    expect(r.tramos).toEqual([
      {
        desde: 0,
        hasta: 20,
        pendienteMedida: 0.5,
        desnivelMm: 100,
        pendienteProyecto: null,
        quiebresDeProyecto: [],
        sentidoMedido: 'retrocede',
        contraPendiente: false,
        casiPlano: false,
      },
    ])
    expect(r.tramosSinProyecto).toEqual([{ desde: 0, hasta: 20 }])
  })

  it('un tramo fuera del proyecto no se extrapola', () => {
    const r = analizarDrenaje(
      [
        { progresiva: 0, cota: 10 },
        { progresiva: 20, cota: 9.9 },
        { progresiva: 40, cota: 9.8 },
      ],
      [
        { progresiva: 0, cota: 10 },
        { progresiva: 20, cota: 9.9 },
      ],
      { sumideros: [], casiPlanoPorcentaje: 0.1 },
    )
    // 0+000–0+020 sí: (9.9 − 10) / 20 × 100 = −0.500 %
    expect(r.tramos[0]!.pendienteProyecto).toBe(-0.5)
    expect(r.tramos[1]!.pendienteProyecto).toBeNull()
    expect(r.tramosSinProyecto).toEqual([{ desde: 20, hasta: 40 }])
  })

  it('tramo exactamente plano', () => {
    const r = analizarDrenaje(
      [
        { progresiva: 0, cota: 10 },
        { progresiva: 20, cota: 10 },
      ],
      [
        { progresiva: 0, cota: 10 },
        { progresiva: 20, cota: 9.9 },
      ],
      { sumideros: [], casiPlanoPorcentaje: 0.1 },
    )
    expect(r.tramos[0]!.sentidoMedido).toBe('plano')
    // plano no es contrapendiente, pero sí casi plano: lo señala la otra bandera
    expect(r.tramos[0]!.contraPendiente).toBe(false)
    expect(r.tramos[0]!.casiPlano).toBe(true)
  })

  it('un fondo plano de varios puntos es un solo punto bajo', () => {
    // 0+020 y 0+040 a la misma cota 9.9, ambos vecinos más altos (10.0)
    const r = analizarDrenaje(
      [
        { progresiva: 0, cota: 10 },
        { progresiva: 20, cota: 9.9 },
        { progresiva: 40, cota: 9.9 },
        { progresiva: 60, cota: 10 },
      ],
      null,
      { sumideros: [41], casiPlanoPorcentaje: 0.1 },
    )
    // el sumidero en 0+041 está a 1 m del fondo (0+020 a 0+040) → recoge
    // profundidad: 10.000 − 9.900 = 100 mm
    expect(r.puntosBajos).toEqual([
      { progresiva: 20, hasta: 40, cota: 9.9, profundidadMm: 100, enSumidero: true, extremo: false },
    ])
    expect(r.empozamientos).toEqual([])
  })

  it('un extremo más bajo que su vecino se informa como extremo, no como empozamiento', () => {
    // el agua corre hacia 0+000 y sale de lo medido: no se sabe si ahí se empoza
    // profundidad: 10.000 − 9.900 = 100 mm (su único vecino)
    const r = analizarDrenaje(
      [
        { progresiva: 0, cota: 9.9 },
        { progresiva: 20, cota: 10 },
      ],
      null,
      { sumideros: [], casiPlanoPorcentaje: 0.1 },
    )
    expect(r.puntosBajos).toEqual([
      { progresiva: 0, hasta: 0, cota: 9.9, profundidadMm: 100, enSumidero: false, extremo: true },
    ])
    expect(r.empozamientos).toEqual([])
  })

  it('progresivas repetidas o sin número se descartan contadas', () => {
    const r = analizarDrenaje(
      [
        { progresiva: 20, cota: 10.1 },
        { progresiva: 0, cota: 10 },
        { progresiva: 20, cota: 10.5 },
        { progresiva: 30, cota: Number.NaN },
      ],
      null,
      { sumideros: [], casiPlanoPorcentaje: 0.1 },
    )
    // queda 0+000 10.0 → 0+020 10.1 (el primero que llegó): (10.1 − 10) / 20 × 100 = +0.500 %
    expect(r.tramos).toHaveLength(1)
    expect(r.tramos[0]!.pendienteMedida).toBe(0.5)
    // el índice es la posición en la lista que llegó
    expect(r.descartados).toEqual([
      { indice: 3, progresiva: 30, cota: null, motivo: 'sin cota' },
      { indice: 2, progresiva: 20, cota: 10.5, motivo: 'progresiva repetida' },
    ])
  })

  it('un punto con cota pero sin progresiva se descarta como «sin progresiva», con su cota', () => {
    const r = analizarDrenaje(
      [
        { progresiva: 0, cota: 10 },
        { progresiva: Number.NaN, cota: 9.87 },
      ],
      null,
      { sumideros: [] },
    )
    expect(r.descartados).toEqual([{ indice: 1, progresiva: null, cota: 9.87, motivo: 'sin progresiva' }])
  })

  it('listas vacías: nada que analizar, nada inventado', () => {
    const r = analizarDrenaje([], [], { sumideros: [] })
    expect(r.tramos).toEqual([])
    expect(r.puntosBajos).toEqual([])
    expect(r.empozamientos).toEqual([])
    expect(r.tramosSinProyecto).toEqual([])
    expect(r.descartados).toEqual([])
  })

  it('un proyecto vacío deja todos los tramos sin proyecto', () => {
    const r = analizarDrenaje(
      [
        { progresiva: 0, cota: 10 },
        { progresiva: 20, cota: 9.9 },
      ],
      [],
      { sumideros: [] },
    )
    expect(r.tramos[0]!.pendienteProyecto).toBeNull()
    expect(r.tramosSinProyecto).toEqual([{ desde: 0, hasta: 20 }])
  })

  it('una calle medida toda plana no drena: es empozamiento si no hay sumidero', () => {
    // 0+000, 0+020, 0+040 a 10.000: el agua no tiene hacia dónde ir, ni siquiera fuera de lo medido
    const r = analizarDrenaje(
      [
        { progresiva: 0, cota: 10 },
        { progresiva: 20, cota: 10 },
        { progresiva: 40, cota: 10 },
      ],
      null,
      { sumideros: [] },
    )
    const bajo = { progresiva: 0, hasta: 40, cota: 10, profundidadMm: 0, enSumidero: false, extremo: true }
    expect(r.puntosBajos).toEqual([bajo])
    expect(r.empozamientos).toEqual([bajo])
  })

  it('la misma calle toda plana con un sumidero dentro no se empoza', () => {
    const r = analizarDrenaje(
      [
        { progresiva: 0, cota: 10 },
        { progresiva: 20, cota: 10 },
        { progresiva: 40, cota: 10 },
      ],
      null,
      { sumideros: [20] },
    )
    expect(r.empozamientos).toEqual([])
  })

  it('la marca de comprobado pasa tal cual al resultado', () => {
    const r = analizarDrenaje([], null, { sumideros: [], comprobado: true })
    expect(r.comprobado).toBe(true)
  })
})

describe('analizarDrenaje — milímetros como la calculadora', () => {
  it('se redondea el desnivel, no cada cota: 0.8 mm de bajada es 1 mm', () => {
    // 99.9796 − 99.9804 = −0.0008 → −0.001 m → avanza; −0.001 / 10 × 100 = −0.010 %
    const r = analizarDrenaje(
      [
        { progresiva: 0, cota: 99.9804 },
        { progresiva: 10, cota: 99.9796 },
      ],
      null,
      { sumideros: [] },
    )
    expect(r.tramos[0]!.desnivelMm).toBe(-1)
    expect(r.tramos[0]!.sentidoMedido).toBe('avanza')
    expect(r.tramos[0]!.pendienteMedida).toBe(-0.01)
  })

  it('0.2 mm no es desnivel: plano y con pendiente cero', () => {
    // 99.9806 − 99.9804 = 0.0002 → 0.000 m → plano; pendiente 0
    const r = analizarDrenaje(
      [
        { progresiva: 0, cota: 99.9804 },
        { progresiva: 10, cota: 99.9806 },
      ],
      null,
      { sumideros: [] },
    )
    expect(r.tramos[0]!.desnivelMm).toBe(0)
    expect(r.tramos[0]!.sentidoMedido).toBe('plano')
    expect(r.tramos[0]!.pendienteMedida).toBe(0)
  })

  it('el fondo plano informa la cota más baja de la racha', () => {
    // 0+010 99.9806 y 0+020 99.9804 difieren 0.2 mm → mismo fondo; el más bajo es 99.9804
    // profundidad: 100.000 − 99.9804 = 19.6 mm → 20 mm
    const r = analizarDrenaje(
      [
        { progresiva: 0, cota: 100 },
        { progresiva: 10, cota: 99.9806 },
        { progresiva: 20, cota: 99.9804 },
        { progresiva: 30, cota: 100 },
      ],
      null,
      { sumideros: [] },
    )
    expect(r.puntosBajos).toEqual([
      { progresiva: 10, hasta: 20, cota: 99.9804, profundidadMm: 20, enSumidero: false, extremo: false },
    ])
  })
})

describe('analizarDrenaje — quiebre del proyecto entre dos estacas', () => {
  it('el sumidero del proyecto cae entre 0+090 y 0+110: se lista y se mira cada mitad', () => {
    // proyecto en 0+090: 100 − 0.005 × 90 = 99.550; en 0+110: 99.500 + 0.002 × 10 = 99.520
    // cuerda del proyecto: (99.520 − 99.550) / 20 × 100 = −0.150 %
    // medido 99.560 → 99.550: (−0.010) / 20 × 100 = −0.050 % → avanza
    // mitad 0+090–0+100 del proyecto baja (avanza): va con lo medido
    // mitad 0+100–0+110 del proyecto sube (retrocede): lo medido corre al revés → contrapendiente
    // (con la sola cuerda, −0.150 % y −0.050 % irían iguales y no se vería)
    const r = analizarDrenaje(
      [
        { progresiva: 90, cota: 99.56 },
        { progresiva: 110, cota: 99.55 },
      ],
      proyectoJrLima,
      { sumideros: [100] },
    )
    const tramo = r.tramos[0]!
    expect(tramo.pendienteMedida).toBe(-0.05)
    expect(tramo.pendienteProyecto).toBe(-0.15)
    expect(tramo.quiebresDeProyecto).toEqual([100])
    expect(tramo.contraPendiente).toBe(true)
  })

  it('y si lo medido sube en ese tramo, la otra mitad es la que va al revés', () => {
    // medido 99.550 → 99.560: +0.050 % → retrocede; la mitad 0+090–0+100 del proyecto baja
    const r = analizarDrenaje(
      [
        { progresiva: 90, cota: 99.55 },
        { progresiva: 110, cota: 99.56 },
      ],
      proyectoJrLima,
      { sumideros: [100] },
    )
    expect(r.tramos[0]!.quiebresDeProyecto).toEqual([100])
    expect(r.tramos[0]!.contraPendiente).toBe(true)
  })
})

describe('bombeo', () => {
  it('positivo baja al alejarse del eje', () => {
    // eje 100.000, borde 99.920 a 4 m: (100 − 99.92) / 4 × 100 = 2.000 %
    expect(bombeo(100, 99.92, 4)).toBe(2)
    // borde más alto que el eje: (100 − 100.04) / 4 × 100 = −1.000 %
    expect(bombeo(100, 100.04, 4)).toBe(-1)
  })

  it('la distancia del lado izquierdo (negativa) cuenta igual', () => {
    expect(bombeo(100, 99.92, -4)).toBe(2)
  })

  it('distancia cero no tiene bombeo', () => {
    expect(() => bombeo(100, 99.92, 0)).toThrow(RangeError)
  })

  it('una cota sin número no da bombeo: avisa en vez de devolver NaN', () => {
    expect(() => bombeo(Number.NaN, 99.92, 4)).toThrow(RangeError)
    expect(() => bombeo(100, Number.NaN, 4)).toThrow(RangeError)
  })
})

describe('compararBombeo', () => {
  it('dentro de la tolerancia de fábrica (0.5 %)', () => {
    // 1.7 − 2.0 = −0.3 → |0.3| ≤ 0.5 → conforme; da menos bombeo que el proyecto
    expect(compararBombeo(1.7, 2)).toEqual({
      diferencia: -0.3,
      estado: 'conforme',
      menosQueProyecto: true,
      aguaAlReves: false,
    })
  })

  it('al límite hasta el doble de la tolerancia', () => {
    // 2.8 − 2.0 = +0.8 → 0.5 < 0.8 ≤ 1.0 → al límite
    expect(compararBombeo(2.8, 2).estado).toBe('alLimite')
  })

  it('fuera pasado el doble; el agua corre hacia el eje', () => {
    // −0.5 − 2.0 = −2.5 → |2.5| > 1.0 → fuera; medido negativo con proyecto positivo
    const r = compararBombeo(-0.5, 2)
    expect(r.diferencia).toBe(-2.5)
    expect(r.estado).toBe('fuera')
    expect(r.aguaAlReves).toBe(true)
    expect(r.menosQueProyecto).toBe(false)
  })

  it('la tolerancia se puede cambiar', () => {
    // 2.8 − 2.0 = 0.8 ≤ 1.0 → conforme
    expect(compararBombeo(2.8, 2, 1).estado).toBe('conforme')
  })

  it('una vereda a −1.5 % medida a −1.5 % está conforme y el agua va bien', () => {
    // −1.5 − (−1.5) = 0
    expect(compararBombeo(-1.5, -1.5)).toEqual({
      diferencia: 0,
      estado: 'conforme',
      menosQueProyecto: false,
      aguaAlReves: false,
    })
  })

  it('la vereda a −1.0 % con proyecto −1.5 % bota el agua más despacio', () => {
    // −1.0 − (−1.5) = +0.5 → conforme; |1.0| < |1.5| con el mismo signo → menos que el proyecto
    expect(compararBombeo(-1, -1.5)).toEqual({
      diferencia: 0.5,
      estado: 'conforme',
      menosQueProyecto: true,
      aguaAlReves: false,
    })
  })

  it('el lado bajo de un peralte (−2 %) medido a +1 % corre al revés', () => {
    // 1 − (−2) = 3 → |3| > 1.0 → fuera
    const r = compararBombeo(1, -2)
    expect(r.diferencia).toBe(3)
    expect(r.estado).toBe('fuera')
    expect(r.aguaAlReves).toBe(true)
    expect(r.menosQueProyecto).toBe(false)
  })

  it('medido en 0 con proyecto 2 %: no corre al revés, pero bota menos', () => {
    const r = compararBombeo(0, 2)
    expect(r.aguaAlReves).toBe(false)
    expect(r.menosQueProyecto).toBe(true)
  })

  it('sin número no hay comparación: avisa en vez de pintar rojo', () => {
    expect(() => compararBombeo(Number.NaN, 2)).toThrow(RangeError)
    expect(() => compararBombeo(2, Number.NaN)).toThrow(RangeError)
  })
})
