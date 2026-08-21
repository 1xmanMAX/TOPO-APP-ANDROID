import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAlmacen } from '../estado/almacen'
import { proyectoEjemplo } from '../estado/ejemplo'
import VistaCampanias from './VistaCampanias'

describe('VistaCampanias', () => {
  beforeEach(() => {
    useAlmacen.getState().cargarProyecto(proyectoEjemplo())
  })

  it('lista las campañas con su fecha, calle y capa', () => {
    render(<VistaCampanias />)

    const fila = screen.getByRole('button', { name: /abrir campaña del 2026-08-19/i })
    expect(fila).toHaveTextContent('2026-08-19')
    expect(fila).toHaveTextContent('Av. Sol')
    expect(fila).toHaveTextContent('SUBRASANTE')
  })

  it('marca cuál es la campaña activa', () => {
    render(<VistaCampanias />)
    expect(screen.getByRole('button', { name: /abrir campaña del 2026-08-19/i })).toHaveAttribute(
      'data-activa',
      'true',
    )
  })

  it('crea una campaña nueva y la deja activa', async () => {
    const usuario = userEvent.setup()
    render(<VistaCampanias />)
    await usuario.click(screen.getByRole('button', { name: /nueva campaña/i }))

    const { proyecto, campaniaActivaId } = useAlmacen.getState()
    expect(proyecto.campanias).toHaveLength(2)
    expect(campaniaActivaId).toBe(proyecto.campanias[1]!.id)
  })

  it('la campaña nueva arranca vacía, sin pisar la anterior', async () => {
    const usuario = userEvent.setup()
    render(<VistaCampanias />)
    await usuario.click(screen.getByRole('button', { name: /nueva campaña/i }))

    const resultado = useAlmacen.getState().calcular()!
    expect(resultado.celdasLlenas).toBe(0)
    expect(useAlmacen.getState().proyecto.campanias[0]!.estaciones).toHaveLength(2)
  })

  it('cambia la capa de una campaña', async () => {
    const usuario = userEvent.setup()
    render(<VistaCampanias />)
    await usuario.selectOptions(screen.getByLabelText(/capa de la campaña del 2026-08-19/i), 'cap-terreno')
    expect(useAlmacen.getState().proyecto.campanias[0]!.capaId).toBe('cap-terreno')
  })

  it('vuelve a activar una campaña anterior', async () => {
    const usuario = userEvent.setup()
    render(<VistaCampanias />)
    await usuario.click(screen.getByRole('button', { name: /nueva campaña/i }))
    await usuario.click(screen.getByRole('button', { name: /abrir campaña del 2026-08-19/i }))
    expect(useAlmacen.getState().campaniaActivaId).toBe('camp-1')
  })

  it('cambia la calle de una campaña', async () => {
    const usuario = userEvent.setup()
    useAlmacen.getState().agregarCalle({
      nombre: 'Jr. Lima',
      plantillaId: 'pl-1',
      progresivaInicio: 0,
      progresivaFin: 240,
      intervalo: 20,
      progresivasExtra: [],
      rasante: null,
    })
    render(<VistaCampanias />)

    const otraCalle = useAlmacen.getState().proyecto.calles[1]!
    await usuario.selectOptions(
      screen.getByLabelText(/Calle de la campaña del 2026-08-19/i),
      otraCalle.id,
    )

    expect(useAlmacen.getState().proyecto.campanias[0]!.calleId).toBe(otraCalle.id)
    expect(otraCalle.nombre).toBe('Jr. Lima')
  })

  it('distingue dos campañas de la misma fecha en calles distintas', async () => {
    const usuario = userEvent.setup()
    const idOtraCalle = useAlmacen.getState().agregarCalle({
      nombre: 'Jr. Lima',
      plantillaId: 'pl-1',
      progresivaInicio: 0,
      progresivaFin: 240,
      intervalo: 20,
      progresivasExtra: [],
      rasante: null,
    })
    useAlmacen.getState().agregarCampania({
      fecha: '2026-08-19',
      calleId: idOtraCalle,
      capaId: 'cap-subrasante',
      bmInicialId: 'bm-1',
      estado: 'abierta',
      cierre: {
        tipo: 'cerrado',
        bmFinalId: 'bm-1',
        longitudK: 0,
        longitudKAuto: true,
        clase: 'tercerOrden',
        coeficiente: 12,
      },
    })
    render(<VistaCampanias />)

    await usuario.click(screen.getByRole('button', { name: /Abrir campaña del 2026-08-19 en Jr\. Lima/i }))

    const activa = useAlmacen.getState().proyecto.campanias.find(
      (c) => c.id === useAlmacen.getState().campaniaActivaId,
    )!
    expect(activa.calleId).toBe(idOtraCalle)
  })

  it('explica por qué no se puede crear una campaña cuando falta algo', () => {
    useAlmacen.getState().nuevoProyecto()
    render(<VistaCampanias />)

    expect(screen.getByRole('button', { name: /nueva campaña/i })).toBeDisabled()
    expect(screen.getByText(/hace falta al menos una calle, un banco de nivel y una capa/i)).toBeInTheDocument()
  })
})
