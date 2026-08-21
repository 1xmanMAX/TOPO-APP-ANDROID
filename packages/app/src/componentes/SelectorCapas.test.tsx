import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Proyecto } from '@topo/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAlmacen } from '../estado/almacen'
import { proyectoEjemplo } from '../estado/ejemplo'
import SelectorCapas from './SelectorCapas'

const CIERRE_ABIERTO = {
  tipo: 'abierto' as const,
  longitudK: 0,
  longitudKAuto: true,
  clase: 'tercerOrden' as const,
  coeficiente: 12,
}

/**
 * Dos calles: la activa (c-1, ya con camp-1 sobre la subrasante) recibe otra
 * campaña sobre el terreno, más vieja, para probar el orden. La otra calle
 * (c-2) tiene su propia campaña que nunca debe aparecer en el selector.
 */
function proyectoConDosCalles(): Proyecto {
  const proyecto = proyectoEjemplo()

  proyecto.campanias.push({
    id: 'camp-terreno',
    fecha: '2026-08-10',
    calleId: 'c-1',
    capaId: 'cap-terreno',
    bmInicialId: 'bm-1',
    estado: 'cerrada',
    cierre: CIERRE_ABIERTO,
    estaciones: [],
  })

  proyecto.calles.push({
    id: 'c-2',
    nombre: 'Jr. Otra',
    plantillaId: 'pl-1',
    progresivaInicio: 0,
    progresivaFin: 40,
    intervalo: 20,
    progresivasExtra: [],
    rasante: null,
  })
  proyecto.campanias.push({
    id: 'camp-otra-calle',
    fecha: '2026-08-19',
    calleId: 'c-2',
    capaId: 'cap-terreno',
    bmInicialId: 'bm-1',
    estado: 'abierta',
    cierre: CIERRE_ABIERTO,
    estaciones: [],
  })

  return proyecto
}

describe('SelectorCapas', () => {
  beforeEach(() => {
    useAlmacen.getState().cargarProyecto(proyectoConDosCalles())
    useAlmacen.getState().activarCampania('camp-1')
  })

  it('lista solo las campañas de la calle activa', () => {
    render(<SelectorCapas />)

    const casillas = screen.getAllByRole('checkbox')
    expect(casillas).toHaveLength(2)
    expect(casillas.map((c) => c.getAttribute('aria-label'))).toEqual([
      expect.stringMatching(/TERRENO EXISTENTE/),
      expect.stringMatching(/SUBRASANTE/),
    ])
  })

  it('ordena las campañas por el orden de su capa y no por fecha', () => {
    render(<SelectorCapas />)

    const casillas = screen.getAllByRole('checkbox')
    // TERRENO EXISTENTE es orden 0 y va primero aunque su fecha (2026-08-10)
    // sea anterior a la de SUBRASANTE (2026-08-19), que es orden 1.
    expect(casillas[0]).toHaveAccessibleName(/TERRENO EXISTENTE/)
    expect(casillas[1]).toHaveAccessibleName(/SUBRASANTE/)
  })

  it('marcar y desmarcar una capa cambia capasVisibles', async () => {
    const usuario = userEvent.setup()
    render(<SelectorCapas />)

    const casilla = screen.getByRole('checkbox', { name: /SUBRASANTE/ })
    await usuario.click(casilla)
    expect(useAlmacen.getState().capasVisibles).toEqual(['camp-1'])

    await usuario.click(casilla)
    expect(useAlmacen.getState().capasVisibles).toEqual([])
  })

  it('elegir inferior y superior fija la comparación', async () => {
    const usuario = userEvent.setup()
    render(<SelectorCapas />)

    await usuario.selectOptions(screen.getByLabelText(/capa de abajo/i), 'camp-terreno')
    await usuario.selectOptions(screen.getByLabelText(/capa de arriba/i), 'camp-1')

    expect(useAlmacen.getState().comparacion).toEqual({
      inferior: 'camp-terreno',
      superior: 'camp-1',
    })
  })

  it('no deja comparar una campaña consigo misma', async () => {
    const usuario = userEvent.setup()
    render(<SelectorCapas />)

    const selectorAbajo = screen.getByLabelText(/capa de abajo/i)
    const selectorArriba = screen.getByLabelText(/capa de arriba/i)

    await usuario.selectOptions(selectorAbajo, 'camp-terreno')
    await usuario.selectOptions(selectorArriba, 'camp-terreno')

    expect(screen.getByText('Una capa no se compara consigo misma')).toBeInTheDocument()
    expect(useAlmacen.getState().comparacion).toEqual({ inferior: 'camp-terreno', superior: null })
    expect(selectorArriba).toHaveValue('')
  })

  it('al cambiar de calle activa se limpia lo que ya no aplica', async () => {
    const usuario = userEvent.setup()
    render(<SelectorCapas />)

    await usuario.click(screen.getByRole('checkbox', { name: /SUBRASANTE/ }))
    await usuario.selectOptions(screen.getByLabelText(/capa de abajo/i), 'camp-terreno')

    act(() => {
      useAlmacen.getState().activarCampania('camp-otra-calle')
    })

    expect(useAlmacen.getState().capasVisibles).toEqual([])
    expect(useAlmacen.getState().comparacion).toEqual({ inferior: null, superior: null })
  })

  it('sin campaña activa no hay nada que listar', () => {
    useAlmacen.getState().nuevoProyecto()

    render(<SelectorCapas />)

    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
    expect(screen.getByText(/todavía no hay campañas/i)).toBeInTheDocument()
  })
})
