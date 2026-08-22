import { describe, expect, it } from 'vitest'
import type { Rasante } from '../modelo/tipos'
import { cotaEjeRasante, cotaRasante, desnivelTransversal } from './geometria'

function rasanteEjemplo(): Rasante {
  return {
    progresivaArranque: 0,
    cotaArranque: 3245.18,
    pendienteLongitudinal: -1.25,
    tramos: [
      { nombre: 'Calzada', hastaOffset: 4.2, tipo: 'pendiente', valor: 2 },
      { nombre: 'Sardinel', hastaOffset: 4.4, tipo: 'salto', valor: -0.15 },
      { nombre: 'Vereda', hastaOffset: 5.6, tipo: 'pendiente', valor: -1.5 },
    ],
    simetrica: true,
    tramosIzquierda: null,
  }
}

describe('cotaEjeRasante', () => {
  it('baja según la pendiente al avanzar de progresiva', () => {
    const rasante = rasanteEjemplo()

    expect(cotaEjeRasante(rasante, 0)).toBe(3245.18)
    expect(cotaEjeRasante(rasante, 20)).toBe(3244.93)
    expect(cotaEjeRasante(rasante, 40)).toBe(3244.68)
  })

  it('una pendiente de cero deja la calle a nivel, y no es un error', () => {
    const rasante = { ...rasanteEjemplo(), pendienteLongitudinal: 0 }

    expect(cotaEjeRasante(rasante, 120)).toBe(3245.18)
  })

  it('una progresiva anterior al arranque sube', () => {
    const rasante = rasanteEjemplo()

    expect(cotaEjeRasante(rasante, -20)).toBe(3245.43)
  })
})

describe('desnivelTransversal', () => {
  it('en el eje no hay desnivel', () => {
    expect(desnivelTransversal(rasanteEjemplo(), 0)).toBe(0)
  })

  it('el bombeo de la calzada baja hacia el borde', () => {
    // 4.2 m al 2 % = 84 mm por debajo del eje
    expect(desnivelTransversal(rasanteEjemplo(), 4.2)).toBe(-0.084)
  })

  it('el sardinel sube de golpe sus 15 cm', () => {
    // -0.084 del bombeo, más los 0.15 del salto
    expect(desnivelTransversal(rasanteEjemplo(), 4.4)).toBe(0.066)
  })

  it('la vereda sigue subiendo al alejarse, porque cae hacia la calzada', () => {
    // 0.066 + 1.2 m al 1.5 % = 0.066 + 0.018
    expect(desnivelTransversal(rasanteEjemplo(), 5.6)).toBe(0.084)
  })

  it('el lado izquierdo es espejo del derecho cuando la rasante es simétrica', () => {
    const rasante = rasanteEjemplo()

    expect(desnivelTransversal(rasante, -4.2)).toBe(desnivelTransversal(rasante, 4.2))
    expect(desnivelTransversal(rasante, -5.6)).toBe(desnivelTransversal(rasante, 5.6))
  })

  it('más allá del último tramo no hay rasante, y no se inventa', () => {
    expect(desnivelTransversal(rasanteEjemplo(), 6)).toBeNull()
    expect(desnivelTransversal(rasanteEjemplo(), -6)).toBeNull()
  })

  it('con la rasante no simétrica, cada lado usa sus tramos', () => {
    const rasante: Rasante = {
      ...rasanteEjemplo(),
      simetrica: false,
      tramosIzquierda: [{ nombre: 'Berma', hastaOffset: 3, tipo: 'pendiente', valor: 4 }],
    }

    expect(desnivelTransversal(rasante, 3)).toBe(-0.06)
    expect(desnivelTransversal(rasante, -3)).toBe(-0.12)
  })
})

describe('cotaRasante', () => {
  it('junta la pendiente longitudinal con el desnivel transversal', () => {
    const rasante = rasanteEjemplo()

    expect(cotaRasante(rasante, 0, 0)).toBe(3245.18)
    expect(cotaRasante(rasante, 0, 4.2)).toBe(3245.096)
    expect(cotaRasante(rasante, 0, 4.4)).toBe(3245.246)
    expect(cotaRasante(rasante, 0, 5.6)).toBe(3245.264)
    expect(cotaRasante(rasante, 20, -4.2)).toBe(3244.846)
    expect(cotaRasante(rasante, 40, 5.6)).toBe(3244.764)
  })

  it('la vereda queda por encima del borde de calzada, que es lo que hace el sardinel', () => {
    const rasante = rasanteEjemplo()
    const vereda = cotaRasante(rasante, 0, 5.6)!
    const borde = cotaRasante(rasante, 0, 4.2)!

    expect(vereda - borde).toBeCloseTo(0.168, 3)
  })

  it('sin rasante en ese offset, no hay cota', () => {
    expect(cotaRasante(rasanteEjemplo(), 0, 7)).toBeNull()
  })
})
