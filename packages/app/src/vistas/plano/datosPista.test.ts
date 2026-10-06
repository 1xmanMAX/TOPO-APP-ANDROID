import { cotaEjeRasante, seccionDeFabrica, type Calle, type PistaCalibrada } from '@topo/core'
import { describe, expect, it } from 'vitest'
import { construirObraSimulada, IDS } from '../../pruebas/obraSimulada'
import {
  anguloHaciaDondeBaja,
  cambioDeCotaProyecto,
  datosDePista,
  estacasDeCroquis,
  estadoDeNivelaciones,
  rasanteDeCroquis,
  rasanteDesdeCotas,
  trozoDePista,
} from './datosPista'

/** Pista quebrada: 60 m hacia +X y 40 m hacia +Y, en metros. */
const pista: PistaCalibrada = {
  id: 'p',
  nombre: 'Psje. Las Lomas',
  polilinea: [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 40 }],
  calibracion: { metrosPorUnidad: 1, ejeY: 'arriba' },
  progresivaInicio: 0,
}

function calle(extra: Partial<Calle> = {}): Calle {
  return { id: 'c', nombre: 'Psje.', seccion: seccionDeFabrica(), nivelaciones: [], rasante: null, ...extra }
}

describe('datos de una pista sobre el plano', () => {
  it('largo, tramo y estacas cada 20 m', () => {
    const d = datosDePista(pista, [], undefined)
    expect(d.largoM).toBe(100)
    expect([d.inicio, d.fin]).toEqual([0, 100])
    expect(d.estacas.map((e) => e.progresiva)).toEqual([0, 20, 40, 60, 80, 100])
    expect(d.fuente).toBeNull()
  })

  it('las pendientes salen de las cotas del plano, y la empinada se marca', () => {
    const cotas = [
      { x: 0, y: 1, valor: 3244 },
      { x: 60, y: -1, valor: 3248.42 },
      { x: 61, y: 40, valor: 3249 },
    ]
    const d = datosDePista(pista, cotas, undefined)
    expect(d.fuente).toBe('plano')
    expect(d.tramos).toHaveLength(2)
    expect(d.tramos[0]!.tramo.porcentaje).toBeCloseTo(7.3667, 3)
    expect(d.tramos[0]!.empinada).toBe(true)
    expect(d.tramos[1]!.empinada).toBe(false)
    // El rótulo del primer tramo va en su mitad (0+030), sobre el tramo hacia +X.
    expect(d.tramos[0]!.rotulo).toMatchObject({ x: 30, y: 0, rumbo: 0 })
  })

  it('sin cotas en el plano, la pendiente es la de la rasante de su calle', () => {
    const d = datosDePista(pista, [], calle({ rasante: rasanteDeCroquis(3000, -2, null) }))
    expect(d.fuente).toBe('rasante')
    expect(d.tramos).toHaveLength(1)
    expect(d.tramos[0]!.tramo.porcentaje).toBeCloseTo(-2)
    expect(d.tramos[0]!.tramo.sentido).toBe('baja')
  })

  it('ubica los controles planificados de la calle sobre la pista', () => {
    const d = datosDePista(
      pista,
      [],
      calle({ planControles: { opciones: {}, controles: [{ progresiva: 80, cota: 3250, motivos: [{ tipo: 'fin', texto: 'fin de la pista' }] }] } }),
    )
    expect(d.controles[0]!.punto).toMatchObject({ x: 60, y: 20 })
  })

  it('el trozo de un tramo incluye los vértices que quedan dentro', () => {
    expect(trozoDePista(pista, 30, 80)).toEqual([{ x: 30, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 20 }])
  })

  it('la flecha apunta hacia donde baja', () => {
    expect(anguloHaciaDondeBaja({ desde: 0, hasta: 1, porcentaje: -3, sentido: 'baja' }, 90)).toBe(90)
    expect(anguloHaciaDondeBaja({ desde: 0, hasta: 1, porcentaje: 3, sentido: 'sube' }, 90)).toBe(270)
    expect(anguloHaciaDondeBaja({ desde: 0, hasta: 1, porcentaje: 0, sentido: 'plano' }, 90)).toBeNull()
  })

  it('la rasante desde cotas toma el primer tramo y avisa si hay quiebres', () => {
    const r = rasanteDesdeCotas(
      [
        { progresiva: 0, cota: 3244.4, desplazamiento: 0 },
        { progresiva: 100, cota: 3243.9, desplazamiento: 0 },
        { progresiva: 200, cota: 3244.1, desplazamiento: 0 },
      ],
      null,
    )!
    expect(r.rasante.cotaArranque).toBe(3244.4)
    expect(r.rasante.pendienteLongitudinal).toBeCloseTo(-0.5)
    expect(r.aviso).toMatch(/una sola/)
    // Lo guardado solo vale hasta el primer quiebre, y se dice dónde.
    expect(r.valeHasta).toBe(100)
    expect(r.aviso).toMatch(/solo vale de 0\+000 a 0\+100/i)
    expect(rasanteDesdeCotas([{ progresiva: 0, cota: 1, desplazamiento: 0 }], null)).toBeNull()
  })

  it('sin quiebres, la rasante vale en todo el tramo de las cotas y no avisa', () => {
    const r = rasanteDesdeCotas(
      [
        { progresiva: 0, cota: 100, desplazamiento: 0 },
        { progresiva: 50, cota: 101, desplazamiento: 0 },
        { progresiva: 100, cota: 102, desplazamiento: 0 },
      ],
      null,
    )!
    expect(r.aviso).toBeNull()
    expect(r.valeHasta).toBeNull()
  })

  it('la rasante desde cotas conserva la sección transversal que ya tenía la calle', () => {
    const base = { ...rasanteDeCroquis(10, 1, null), tramos: [{ nombre: 'Calzada', hastaOffset: 3, tipo: 'pendiente' as const, valor: 3 }] }
    const r = rasanteDesdeCotas(
      [
        { progresiva: 20, cota: 100, desplazamiento: 0 },
        { progresiva: 40, cota: 101, desplazamiento: 0 },
      ],
      base,
    )!
    expect(r.rasante).toMatchObject({ progresivaArranque: 20, cotaArranque: 100, pendienteLongitudinal: 5, tramos: base.tramos })
  })

  it('las estacas de un croquis piden escala y dos vértices', () => {
    expect(estacasDeCroquis([{ x: 0, y: 0 }], { metrosPorUnidad: 1 })).toEqual([])
    expect(estacasDeCroquis([{ x: 0, y: 0 }, { x: 50, y: 0 }], null)).toEqual([])
    expect(estacasDeCroquis([{ x: 0, y: 0 }, { x: 50, y: 0 }], { metrosPorUnidad: 1 }).map((e) => e.progresiva)).toEqual([0, 20, 40, 50])
  })
})

describe('rasante desde las cotas del plano sin quiebres (Psje. Las Lomas)', () => {
  // Las cotas del DXF de la obra simulada: +7.37 % y +7.40 %, que no llegan a quiebre (0.5 %).
  const cotasLasLomas = [
    { progresiva: 0, cota: 3244, desplazamiento: 0 },
    { progresiva: 60, cota: 3248.42, desplazamiento: 0 },
    { progresiva: 120, cota: 3252.86, desplazamiento: 0 },
  ]

  it('la pendiente sale de la primera y la última cota, no del primer tramo', () => {
    const r = rasanteDesdeCotas(cotasLasLomas, null)!
    expect(r.valeHasta).toBeNull()
    expect(r.rasante.pendienteLongitudinal).toBeCloseTo((8.86 / 120) * 100, 9)
    // La cota de proyecto en 0+120 es la del plano, no 3252.840 (20 mm abajo, la tolerancia entera de la subrasante).
    expect(cotaEjeRasante(r.rasante, 120)).toBe(3252.86)
    expect(cotaEjeRasante(r.rasante, 0)).toBe(3244)
  })

  it('dice cuánto se aparta cada cota y avisa la de 0+060 (−10 mm)', () => {
    const r = rasanteDesdeCotas(cotasLasLomas, null)!
    expect(r.residuos).toEqual([
      { progresiva: 0, mm: 0 },
      { progresiva: 60, mm: -10 },
      { progresiva: 120, mm: 0 },
    ])
    expect(r.mayorResiduo).toEqual({ progresiva: 60, mm: -10 })
    expect(r.aviso).toMatch(/0\+060 queda a -10 mm/)
  })

  it('un residuo chico se muestra pero no se avisa', () => {
    const r = rasanteDesdeCotas(
      [
        { progresiva: 0, cota: 100, desplazamiento: 0 },
        { progresiva: 50, cota: 101.003, desplazamiento: 0 },
        { progresiva: 100, cota: 102, desplazamiento: 0 },
      ],
      null,
    )!
    expect(r.mayorResiduo).toEqual({ progresiva: 50, mm: 3 })
    expect(r.aviso).toBeNull()
  })

  it('las cotas desordenadas dan la misma rasante', () => {
    const r = rasanteDesdeCotas([cotasLasLomas[2]!, cotasLasLomas[0]!, cotasLasLomas[1]!], null)!
    expect(r.rasante.cotaArranque).toBe(3244)
    expect(cotaEjeRasante(r.rasante, 120)).toBe(3252.86)
  })

  it('contra la +7.38 % que ya tenía la calle, la cota de proyecto cambia +4 mm en 0+120', () => {
    const { proyecto } = construirObraSimulada()
    const actual = proyecto.calles.find((c) => c.id === IDS.lasLomas)!.rasante!
    const nueva = rasanteDesdeCotas(cotasLasLomas, actual)!.rasante
    expect(cambioDeCotaProyecto(actual, nueva, [0, 60, 120])).toEqual([
      { progresiva: 0, mm: 0 },
      { progresiva: 60, mm: 2 },
      { progresiva: 120, mm: 4 },
    ])
  })
})

describe('capas medidas de la ficha (obra simulada)', () => {
  const { proyecto } = construirObraSimulada()
  const calleDe = (id: string) => proyecto.calles.find((c) => c.id === id)!

  it('la nivelación sin cerrar de Jr. Lima se dice «no comprobada» con ·, nunca con △', () => {
    const [lima] = estadoDeNivelaciones(calleDe(IDS.jrLima), proyecto)
    expect(lima).toMatchObject({ simbolo: '·', texto: 'SUBRASANTE · 02/10/2026' })
    expect(lima!.estado).toMatch(/no comprobad/i)
  })

  it('las de Av. Sol cerraron: ✓ y fecha en dd/mm/aaaa', () => {
    const sol = estadoDeNivelaciones(calleDe(IDS.avSol), proyecto)
    expect(sol.map((n) => [n.simbolo, n.texto, n.estado])).toEqual([
      ['✓', 'SUBRASANTE · 14/09/2026', 'cerró'],
      ['✓', 'BASE · 28/09/2026', 'cerró'],
    ])
  })
})
