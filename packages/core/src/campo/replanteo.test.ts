import { describe, expect, it } from 'vitest'
import type { Calle, Capa, Rasante } from '../modelo/tipos'
import { seccionDeFabrica, type Seccion } from '../seccion/seccion'
import { hojaDeReplanteo, veredictoReplanteo, type EntradaReplanteo } from './replanteo'

function capas(): Capa[] {
  return [
    { id: 'terreno', nombre: 'TERRENO EXISTENTE', orden: 0, espesor: 0, toleranciaMm: 20 },
    { id: 'subrasante', nombre: 'SUBRASANTE', orden: 1, espesor: 0.25, toleranciaMm: 20 },
    { id: 'base', nombre: 'BASE', orden: 2, espesor: 0.2, toleranciaMm: 10 },
    { id: 'carpeta', nombre: 'CARPETA', orden: 3, espesor: 0.05, toleranciaMm: 5 },
  ]
}

/** Rasante plana en el eje (pendiente 0) y bombeo 2 % hasta 4.20 m. */
function rasante(): Rasante {
  return {
    progresivaArranque: 0,
    cotaArranque: 3244.23,
    pendienteLongitudinal: 0,
    tramos: [{ nombre: 'Calzada', hastaOffset: 4.2, tipo: 'pendiente', valor: 2 }],
    simetrica: true,
    tramosIzquierda: null,
  }
}

/** Solo eje y bordes: así se cuentan a mano las cotas sin ruido. */
function seccionCorta(): Seccion {
  const fabrica = seccionDeFabrica()
  return { ...fabrica, puntos: fabrica.puntos.filter((p) => ['p-borde-i', 'p-eje', 'p-borde-d'].includes(p.id)) }
}

function seccionSoloEje(): Seccion {
  const fabrica = seccionDeFabrica()
  return { ...fabrica, puntos: fabrica.puntos.filter((p) => p.id === 'p-eje') }
}

function calle(r: Rasante | null = rasante(), seccion: Seccion = seccionCorta()): Calle {
  return { id: 'c1', nombre: 'Jr. Lima', seccion, nivelaciones: [], rasante: r }
}

/** Lo común: carpeta en 0+000 con AI 3246.632 sobre un circuito cerrado. */
function entrada(cambios: Partial<EntradaReplanteo> = {}): EntradaReplanteo {
  return {
    calle: calle(),
    capas: capas(),
    capaId: 'carpeta',
    progresivas: [0],
    alturaInstrumental: 3246.632,
    alturaComprobada: true,
    ...cambios,
  }
}

describe('veredictoReplanteo', () => {
  const comprobada = { alturaComprobada: true }

  it('el caso de Max: objetivo 2.652, leída 2.640 → corta 12 mm, conforme', () => {
    // objetivo = 3246.632 − 3243.980 = 2.652
    // la mira marca menos que el objetivo → el suelo está más alto → sobra
    // 2.652 − 2.640 = 0.012 m = 12 mm → corta 12; 12 ≤ 20 → conforme
    expect(veredictoReplanteo(2.652, 2.64, 20, comprobada)).toEqual({
      tipo: 'corta',
      mm: 12,
      estado: 'conforme',
      sospechosa: false,
      rangoLectura: 'legible',
      comprobado: true,
      avisos: [],
    })
  })

  it('la mira marca más que el objetivo → falta → rellena', () => {
    // 2.652 − 2.690 = −0.038 m → rellena 38; 20 < 38 ≤ 40 → al límite
    const v = veredictoReplanteo(2.652, 2.69, 20, comprobada)
    expect([v.tipo, v.mm, v.estado]).toEqual(['rellena', 38, 'alLimite'])
  })

  it('igual al objetivo → en cota', () => {
    const v = veredictoReplanteo(2.652, 2.652, 20, comprobada)
    expect([v.tipo, v.mm, v.estado]).toEqual(['enCota', 0, 'conforme'])
  })

  it('lejos del objetivo → fuera, y sospechosa', () => {
    // 1.200 − 1.302 = −0.102 → rellena 102 (y no 101.99999…); > 2×10 → fuera
    const v = veredictoReplanteo(1.2, 1.302, 10, comprobada)
    expect([v.tipo, v.mm, v.estado, v.sospechosa]).toEqual(['rellena', 102, 'fuera', true])
  })

  it('una leída NaN no es «en cota 0 mm» con una ✗ al lado', () => {
    const v = veredictoReplanteo(2.652, Number.NaN, 20, comprobada)
    expect(v.tipo).toBeNull()
    expect(v.mm).toBeNull()
    expect(v.estado).toBe('datoInvalido')
    expect(v.sospechosa).toBe(true)
    expect(v.avisos).toEqual(['La lectura no es un número: vuelva a anotarla.'])
  })

  it('una leída negativa o más larga que la mira no se juzga', () => {
    for (const leida of [-0.5, 5.2]) {
      const v = veredictoReplanteo(2.652, leida, 20, comprobada)
      expect(v.tipo).toBeNull()
      expect(v.estado).toBe('datoInvalido')
      expect(v.rangoLectura).toBe('imposible')
    }
  })

  it('un objetivo que no es número tampoco', () => {
    const v = veredictoReplanteo(Number.NaN, 2.64, 20, comprobada)
    expect(v.tipo).toBeNull()
    expect(v.estado).toBe('datoInvalido')
    expect(v.avisos).toEqual(['La lectura objetivo no es un número.'])
  })

  it('sobre una nivelación sin cerrar, el veredicto sale pero no comprobado', () => {
    // Mismo caso de Max: corta 12
    const v = veredictoReplanteo(2.652, 2.64, 20, { alturaComprobada: false })
    expect([v.tipo, v.mm, v.comprobado]).toEqual(['corta', 12, false])
    expect(v.avisos).toEqual(['Cota sobre una nivelación sin cerrar: no comprobada.'])
  })
})

describe('hojaDeReplanteo', () => {
  it('da cota de proyecto, lectura objetivo y rango aceptable por punto', () => {
    // Rasante (carpeta terminada) en el eje: 3244.230.
    // Encima de la base solo va la carpeta: 0.05 → eje de base = 3244.180.
    // Bordes a ±3.50: bombeo 2 % → baja 3.5 × 0.02 = 0.070 → 3244.110.
    // AI 3246.632:
    //   eje   → 3246.632 − 3244.180 = 2.452; ±10 mm → 2.442 … 2.462
    //   borde → 3246.632 − 3244.110 = 2.522; ±10 mm → 2.512 … 2.532
    const hoja = hojaDeReplanteo(entrada({ capaId: 'base', progresivas: [20] }))
    expect(hoja.avisos).toEqual([])
    expect(hoja.toleranciaMm).toBe(10)
    expect(hoja.comprobado).toBe(true)
    const comun = { progresiva: 20, motivoSinObjetivo: null, rangoObjetivo: 'legible', distanciaEstacion: null, fueraDeAlcance: false }
    expect(hoja.filas).toEqual([
      { ...comun, puntoId: 'p-borde-i', nombre: 'Borde izquierdo', offset: -3.5, cotaProyecto: 3244.11, lecturaObjetivo: 2.522, aceptable: { desde: 2.512, hasta: 2.532 } },
      { ...comun, puntoId: 'p-eje', nombre: 'Eje', offset: 0, cotaProyecto: 3244.18, lecturaObjetivo: 2.452, aceptable: { desde: 2.442, hasta: 2.462 } },
      { ...comun, puntoId: 'p-borde-d', nombre: 'Borde derecho', offset: 3.5, cotaProyecto: 3244.11, lecturaObjetivo: 2.522, aceptable: { desde: 2.512, hasta: 2.532 } },
    ])
  })

  it('el caso de Max en el eje de la carpeta: objetivo 2.652', () => {
    // Rasante 3243.980 en el eje, carpeta sin nada encima → 3243.980.
    // objetivo = 3246.632 − 3243.980 = 2.652
    const hoja = hojaDeReplanteo(entrada({ calle: calle({ ...rasante(), cotaArranque: 3243.98 }) }))
    const eje = hoja.filas.find((f) => f.puntoId === 'p-eje')!
    expect(eje.cotaProyecto).toBe(3243.98)
    expect(eje.lecturaObjetivo).toBe(2.652)
  })

  it('sigue la pendiente longitudinal entre progresivas, ordenadas y sin repetir', () => {
    // Pendiente −1.25 %: en 0+040 baja 40 × 0.0125 = 0.500 → eje carpeta 3243.730
    // objetivo = 3246.632 − 3243.730 = 2.902; en 0+000 → 3246.632 − 3244.230 = 2.402
    const hoja = hojaDeReplanteo(
      entrada({ calle: calle({ ...rasante(), pendienteLongitudinal: -1.25 }), progresivas: [40, 0, 40] }),
    )
    const ejes = hoja.filas.filter((f) => f.puntoId === 'p-eje')
    expect(ejes.map((f) => [f.progresiva, f.lecturaObjetivo])).toEqual([[0, 2.402], [40, 2.902]])
    expect(hoja.filas).toHaveLength(6)
  })

  describe('fuera de la sección', () => {
    it('sale sin cota, con su motivo, y el aviso dice cuáles', () => {
      // La vereda de fábrica está a 5.15 m y la rasante solo llega a 4.20
      const hoja = hojaDeReplanteo(entrada({ calle: calle(rasante(), seccionDeFabrica()) }))
      const veredas = hoja.filas.filter((f) => f.puntoId.startsWith('p-vereda'))
      expect(veredas).toHaveLength(2)
      for (const v of veredas) {
        expect(v.cotaProyecto).toBeNull()
        expect(v.lecturaObjetivo).toBeNull()
        expect(v.motivoSinObjetivo).toBe('fueraDeSeccion')
        expect(v.rangoObjetivo).toBeNull()
        expect(v.aceptable).toBeNull()
      }
      expect(hoja.avisos).toEqual([
        '2 puntos (Vereda izquierda, Vereda derecha) caen fuera de la sección del proyecto en 1 progresiva y no tienen cota.',
      ])
    })

    it('cuenta puntos, no filas: un punto en dos progresivas es un punto', () => {
      // Solo la vereda izquierda (−5.15) y el eje, en 0+000 y 0+020
      const fabrica = seccionDeFabrica()
      const seccion = { ...fabrica, puntos: fabrica.puntos.filter((p) => ['p-vereda-i', 'p-eje'].includes(p.id)) }
      const hoja = hojaDeReplanteo(entrada({ calle: calle(rasante(), seccion), progresivas: [0, 20] }))
      expect(hoja.avisos).toEqual([
        '1 punto (Vereda izquierda) cae fuera de la sección del proyecto en 2 progresivas y no tiene cota.',
      ])
    })
  })

  describe('rango de la mira (diseño §2: 0.30 … largo − 0.30)', () => {
    // Solo el eje: carpeta en 0+000 = 3244.230. Objetivo = AI − 3244.230.
    function objetivoCon(alturaInstrumental: number) {
      const hoja = hojaDeReplanteo(entrada({ calle: calle(rasante(), seccionSoloEje()), alturaInstrumental }))
      return { fila: hoja.filas[0]!, avisos: hoja.avisos }
    }

    it('0.299 es poco precisa; 0.300 ya es legible', () => {
      // 3244.529 − 3244.230 = 0.299 → bajo 0.30
      const bajo = objetivoCon(3244.529)
      expect(bajo.fila.lecturaObjetivo).toBe(0.299)
      expect(bajo.fila.rangoObjetivo).toBe('pocoPrecisa')
      expect(bajo.avisos).toEqual([
        '1 lectura objetivo queda fuera de 0.300 … 3.700 m: poco precisa, mejor otra estación.',
      ])
      // 3244.530 − 3244.230 = 0.300 → borde, legible
      const borde = objetivoCon(3244.53)
      expect(borde.fila.lecturaObjetivo).toBe(0.3)
      expect(borde.fila.rangoObjetivo).toBe('legible')
      expect(borde.avisos).toEqual([])
    })

    it('3.700 es legible; 3.701 ya es poco precisa', () => {
      // 3247.930 − 3244.230 = 3.700 (4 − 0.30) → legible
      expect(objetivoCon(3247.93).fila.rangoObjetivo).toBe('legible')
      // 3247.931 − 3244.230 = 3.701 → poco precisa
      expect(objetivoCon(3247.931).fila.rangoObjetivo).toBe('pocoPrecisa')
    })

    it('el caso del revisor: AI 3244.35 sobre eje 3244.23 → 0.12, poco precisa', () => {
      // 3244.350 − 3244.230 = 0.120
      const { fila } = objetivoCon(3244.35)
      expect(fila.lecturaObjetivo).toBe(0.12)
      expect(fila.rangoObjetivo).toBe('pocoPrecisa')
    })

    it('un objetivo que no cabe en la mira es imposible, con aviso distinto', () => {
      // Eje 3244.230; AI 3248.500 → 4.270 > 4 m. Bordes 3244.160 → 4.340
      const hoja = hojaDeReplanteo(entrada({ alturaInstrumental: 3248.5 }))
      expect(hoja.filas.map((f) => [f.lecturaObjetivo, f.rangoObjetivo])).toEqual([
        [4.34, 'imposible'],
        [4.27, 'imposible'],
        [4.34, 'imposible'],
      ])
      expect(hoja.avisos).toEqual(['3 lecturas objetivo no caben en la mira de 4 m: cambie de estación.'])
    })

    it('un objetivo negativo (instrumento por debajo del punto) también es imposible', () => {
      // AI 3244.000 < eje 3244.230 → −0.230
      const { fila } = objetivoCon(3244)
      expect(fila.lecturaObjetivo).toBe(-0.23)
      expect(fila.rangoObjetivo).toBe('imposible')
    })

    it('la mira se puede configurar: con 5 m, 4.270 es legible (≤ 4.70)', () => {
      const hoja = hojaDeReplanteo(
        entrada({ calle: calle(rasante(), seccionSoloEje()), alturaInstrumental: 3248.5, mira: { largoMira: 5 } }),
      )
      expect(hoja.filas[0]!.rangoObjetivo).toBe('legible')
      expect(hoja.avisos).toEqual([])
    })

    it('reglas de mira absurdas se avisan y no se clasifica nada', () => {
      const hoja = hojaDeReplanteo(entrada({ mira: { largoMira: 0 } }))
      expect(hoja.filas.every((f) => f.rangoObjetivo === null)).toBe(true)
      expect(hoja.avisos).toEqual(['Las reglas de la mira no son válidas (largo, lectura mínima, margen).'])
    })
  })

  describe('largo de la visual (diseño §2: 50 m)', () => {
    it('con la progresiva de la estación, marca las visuales de más de 50 m', () => {
      // Estación en 0+100: 0+050 → 50 m (borde, vale); 0+040 → 60 m; 0+160 → 60 m
      const hoja = hojaDeReplanteo(
        entrada({ calle: calle(rasante(), seccionSoloEje()), progresivas: [40, 50, 160], progresivaEstacion: 100 }),
      )
      expect(hoja.filas.map((f) => [f.progresiva, f.distanciaEstacion, f.fueraDeAlcance])).toEqual([
        [40, 60, true],
        [50, 50, false],
        [160, 60, true],
      ])
      expect(hoja.avisos).toEqual(['2 progresivas quedan a más de 50 m de la estación: visual demasiado larga.'])
    })

    it('la visual máxima se puede cambiar', () => {
      // Estación 0+100, máximo 30 m: 0+140 → 40 m, fuera
      const hoja = hojaDeReplanteo(
        entrada({ calle: calle(rasante(), seccionSoloEje()), progresivas: [140], progresivaEstacion: 100, visualMax: 30 }),
      )
      expect(hoja.filas[0]!.fueraDeAlcance).toBe(true)
      expect(hoja.avisos).toEqual(['1 progresiva queda a más de 30 m de la estación: visual demasiado larga.'])
    })

    it('una progresiva de estación que no es número se dice', () => {
      const hoja = hojaDeReplanteo(entrada({ progresivaEstacion: Number.NaN }))
      expect(hoja.filas.every((f) => f.distanciaEstacion === null && !f.fueraDeAlcance)).toBe(true)
      expect(hoja.avisos).toEqual([
        'La progresiva de la estación no es un número: no se comprobó el largo de las visuales.',
      ])
    })

    it('una visual máxima absurda también', () => {
      const hoja = hojaDeReplanteo(entrada({ progresivaEstacion: 0, visualMax: 0 }))
      expect(hoja.avisos).toEqual([
        'La visual máxima no es válida: no se comprobó el largo de las visuales.',
      ])
    })
  })

  describe('altura instrumental', () => {
    it('sin cerrar el circuito, la hoja sale pero marcada como no comprobada', () => {
      const hoja = hojaDeReplanteo(entrada({ alturaComprobada: false }))
      expect(hoja.comprobado).toBe(false)
      expect(hoja.filas.every((f) => f.lecturaObjetivo !== null)).toBe(true)
      expect(hoja.avisos).toEqual(['Cotas sobre una nivelación sin cerrar: no comprobadas.'])
    })

    it('una AI que no es número no da objetivos «válidos» en silencio', () => {
      // Las cotas de proyecto no dependen de la AI: salen igual (eje 3244.230)
      const hoja = hojaDeReplanteo(entrada({ alturaInstrumental: Number.NaN }))
      const eje = hoja.filas.find((f) => f.puntoId === 'p-eje')!
      expect(eje.cotaProyecto).toBe(3244.23)
      expect(eje.lecturaObjetivo).toBeNull()
      expect(eje.motivoSinObjetivo).toBe('alturaInvalida')
      expect(eje.rangoObjetivo).toBeNull()
      expect(eje.aceptable).toBeNull()
      expect(hoja.avisos).toEqual(['La altura instrumental no es un número: no hay lecturas objetivo.'])
    })
  })

  it('sin rasante no inventa cotas: filas vacías, motivo y aviso', () => {
    const hoja = hojaDeReplanteo(entrada({ calle: calle(null) }))
    expect(hoja.filas).toHaveLength(3)
    expect(hoja.filas.every((f) => f.cotaProyecto === null && f.lecturaObjetivo === null)).toBe(true)
    expect(hoja.filas.every((f) => f.motivoSinObjetivo === 'sinRasante')).toBe(true)
    expect(hoja.avisos).toEqual(['La calle «Jr. Lima» no tiene rasante de proyecto cargada.'])
  })

  it('una capa que no existe no se trata como la de arriba: se avisa y no hay cotas', () => {
    const hoja = hojaDeReplanteo(entrada({ capaId: 'inventada' }))
    expect(hoja.toleranciaMm).toBeNull()
    expect(hoja.filas.every((f) => f.cotaProyecto === null && f.motivoSinObjetivo === 'capaInexistente')).toBe(true)
    expect(hoja.avisos).toEqual(['La capa «inventada» no está en el paquete de capas.'])
  })

  it('progresivas que no son números se cuentan, no se pierden', () => {
    const hoja = hojaDeReplanteo(entrada({ progresivas: [Number.NaN, 0, Number.POSITIVE_INFINITY] }))
    expect(hoja.filas).toHaveLength(3)
    expect(hoja.avisos).toEqual(['2 progresivas no son números y se dejaron fuera.'])
  })

  it('sin progresivas, la hoja en blanco dice por qué', () => {
    const hoja = hojaDeReplanteo(entrada({ progresivas: [] }))
    expect(hoja.filas).toEqual([])
    expect(hoja.avisos).toEqual(['No hay progresivas que replantear.'])
  })

  it('sin puntos en la sección, también', () => {
    const hoja = hojaDeReplanteo(entrada({ calle: calle(rasante(), { ...seccionDeFabrica(), puntos: [] }) }))
    expect(hoja.filas).toEqual([])
    expect(hoja.avisos).toEqual(['La sección de la calle «Jr. Lima» no tiene puntos.'])
  })
})
