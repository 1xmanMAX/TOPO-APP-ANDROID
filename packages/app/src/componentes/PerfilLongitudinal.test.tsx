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
    render(<PerfilLongitudinal elementoClave="EJE" idCampaniaReferencia="camp-1" />)
    // Entrega 3: el ejemplo mide EJE en 0+000, 0+020 y 0+040 (antes solo en
    // las dos primeras), para que el visor 3D tenga con qué dibujar un modelo.
    expect(screen.getAllByRole('button', { name: /cota/ })).toHaveLength(3)
  })

  it('avisa cuando el elemento no tiene lecturas', () => {
    render(<PerfilLongitudinal elementoClave="VER-D" idCampaniaReferencia="camp-1" />)
    expect(screen.getByText(/no tiene lecturas/i)).toBeInTheDocument()
  })
})

/**
 * Bombeo típico de +2.0 % hasta el borde de calzada (4.20 m), cota de
 * arranque igual a la del BM del ejemplo (3245.18) y sin pendiente
 * longitudinal: así la rasante del eje vale 3245.180 en toda la calle, y la
 * de BOR-D (offset 4.20) baja 84 mm — 4.20 × 2.0 % — a 3245.096, también
 * constante en toda la calle. La campaña de referencia mide en SUBRASANTE, y
 * BASE + CARPETA (0.25 m) van encima de esa capa: su cota teórica en BOR-D
 * queda en 3244.846 (3245.096 − 0.25), que es lo que dibuja el perfil. La
 * calle del ejemplo (c-1) llega hasta el borde de calzada por ambos lados,
 * así que EJE y BOR-D tienen rasante en toda su longitud.
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
    render(<PerfilLongitudinal elementoClave="EJE" idCampaniaReferencia="camp-1" />)

    expect(screen.getByLabelText(/rasante de proyecto/i)).toBeInTheDocument()
  })

  it('la rasante del perfil usa el elemento que se está mirando, no siempre el eje', () => {
    fijarRasanteDeEjemplo()
    render(<PerfilLongitudinal elementoClave="BOR-D" idCampaniaReferencia="camp-1" />)

    // En BOR-D la rasante va 84 mm por debajo de la del eje en toda la calle,
    // y la cota teórica de SUBRASANTE resta además los 0.25 m de BASE +
    // CARPETA: el nombre accesible del grupo lleva esa cota inicial, no un
    // rótulo aparte.
    expect(screen.getByLabelText(/rasante de proyecto, cota inicial 3244\.846 m/i)).toBeInTheDocument()
  })

  it('sin rasante definida el perfil se dibuja como hasta ahora', () => {
    render(<PerfilLongitudinal elementoClave="EJE" idCampaniaReferencia="camp-1" />)

    expect(screen.queryByLabelText(/rasante de proyecto/i)).toBeNull()
  })

  it('usa la campaña de referencia que le pasan, no la campaña activa del almacén', () => {
    fijarRasanteDeEjemplo()
    // La campaña activa del almacén (camp-1) tiene rasante definida, pero no
    // se le pasa como referencia: el perfil no puede caer solo en ella, o el
    // día que otra vista lo monte con una referencia distinta de la activa
    // dibujaría la rasante equivocada sin que ninguna prueba lo note.
    render(<PerfilLongitudinal elementoClave="EJE" idCampaniaReferencia={null} />)

    expect(screen.queryByLabelText(/rasante de proyecto/i)).toBeNull()
  })
})
