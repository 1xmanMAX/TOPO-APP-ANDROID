import { render, screen } from '@testing-library/react'
import type { Rasante } from '@topo/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAlmacen } from '../estado/almacen'
import { proyectoEjemplo } from '../estado/ejemplo'
import PerfilLongitudinal from './PerfilLongitudinal'

describe('PerfilLongitudinal', () => {
  beforeEach(() => {
    useAlmacen.getState().cargarProyecto(proyectoEjemplo())
  })

  it('dibuja un punto por progresiva medida del elemento', () => {
    render(<PerfilLongitudinal elementoClave="EJE" />)
    expect(screen.getAllByRole('button', { name: /cota/ })).toHaveLength(2)
  })

  it('avisa cuando el elemento no tiene lecturas', () => {
    render(<PerfilLongitudinal elementoClave="VER-D" />)
    expect(screen.getByText(/no tiene lecturas/i)).toBeInTheDocument()
  })
})

/**
 * Bombeo típico de +2.0 % hasta el borde de calzada (4.20 m), cota de
 * arranque igual a la del BM del ejemplo (3245.18) y sin pendiente
 * longitudinal: así la rasante del eje vale 3245.180 en toda la calle, y la
 * de BOR-D (offset 4.20) baja 84 mm — 4.20 × 2.0 % — a 3245.096, también
 * constante en toda la calle. La calle del ejemplo (c-1) llega hasta el
 * borde de calzada por ambos lados, así que EJE y BOR-D tienen rasante en
 * toda su longitud.
 */
function rasanteDeEjemplo(): Rasante {
  return {
    progresivaArranque: 0,
    cotaArranque: 3245.18,
    pendienteLongitudinal: 0,
    tramos: [{ nombre: 'Calzada', hastaOffset: 4.2, tipo: 'pendiente', valor: 2 }],
    simetrica: true,
    tramosIzquierda: null,
  }
}

function fijarRasanteDeEjemplo(): void {
  useAlmacen.getState().fijarRasante('c-1', rasanteDeEjemplo())
}

describe('PerfilLongitudinal con rasante', () => {
  beforeEach(() => {
    useAlmacen.getState().cargarProyecto(proyectoEjemplo())
  })

  it('dibuja la recta de la rasante junto al terreno medido', () => {
    fijarRasanteDeEjemplo()
    render(<PerfilLongitudinal elementoClave="EJE" />)

    expect(screen.getByLabelText(/rasante de proyecto/i)).toBeInTheDocument()
  })

  it('la rasante del perfil usa el elemento que se está mirando, no siempre el eje', () => {
    fijarRasanteDeEjemplo()
    render(<PerfilLongitudinal elementoClave="BOR-D" />)

    // En BOR-D la rasante va 84 mm por debajo de la del eje en toda la calle.
    expect(screen.getByLabelText(/rasante de proyecto/i)).toBeInTheDocument()
    expect(screen.getByText(/3245\.096/)).toBeInTheDocument()
  })

  it('sin rasante definida el perfil se dibuja como hasta ahora', () => {
    render(<PerfilLongitudinal elementoClave="EJE" />)

    expect(screen.queryByLabelText(/rasante de proyecto/i)).toBeNull()
  })
})
