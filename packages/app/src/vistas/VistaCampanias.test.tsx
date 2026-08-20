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

    const fila = screen.getByRole('button', { name: 'Abrir campaña del 2026-08-19' })
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
    await usuario.selectOptions(screen.getByLabelText(/capa de la campaña/i), 'cap-terreno')
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
    render(<VistaCampanias />)

    await usuario.selectOptions(
      screen.getByLabelText('Calle de la campaña del 2026-08-19'),
      'c-1',
    )
    expect(useAlmacen.getState().proyecto.campanias[0]!.calleId).toBe('c-1')
  })
})
