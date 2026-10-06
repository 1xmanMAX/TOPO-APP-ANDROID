import { seccionDeFabrica, type Calle, type PistaCalibrada } from '@topo/core'
import { describe, expect, it } from 'vitest'
import { anguloHaciaDondeBaja, datosDePista, estacasDeCroquis, rasanteDeCroquis, rasanteDesdeCotas, trozoDePista } from './datosPista'

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
