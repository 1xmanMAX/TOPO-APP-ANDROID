import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAlmacen } from '../estado/almacen'
import { proyectoEjemplo } from '../estado/ejemplo'
import VistaCalle from './VistaCalle'

describe('VistaCalle', () => {
  beforeEach(() => {
    useAlmacen.getState().cargarProyecto(proyectoEjemplo())
  })

  it('muestra el conteo de celdas de la grilla', () => {
    render(<VistaCalle />)
    expect(screen.getByText(/70 celdas/)).toBeInTheDocument()
  })

  it('lista las progresivas generadas', () => {
    render(<VistaCalle />)
    expect(screen.getByText('0+000')).toBeInTheDocument()
    expect(screen.getByText('0+180')).toBeInTheDocument()
  })

  it('recalcula la grilla al cambiar el intervalo', async () => {
    const usuario = userEvent.setup()
    render(<VistaCalle />)
    const campo = screen.getByLabelText('Intervalo')
    await usuario.clear(campo)
    await usuario.type(campo, '10')
    expect(screen.getByText(/133 celdas/)).toBeInTheDocument()
  })

  it('agrega una progresiva extra', async () => {
    const usuario = userEvent.setup()
    render(<VistaCalle />)
    await usuario.type(screen.getByLabelText('Progresiva extra'), '0+047')
    await usuario.click(screen.getByRole('button', { name: /agregar progresiva/i }))
    expect(screen.getByText('0+047')).toBeInTheDocument()
  })

  it('no revienta cuando la progresiva inicial supera a la final', async () => {
    const usuario = userEvent.setup()
    render(<VistaCalle />)

    const inicial = screen.getByLabelText('Progresiva inicial')
    await usuario.clear(inicial)
    await usuario.type(inicial, '200')

    expect(screen.getByText(/no puede ser menor que la inicial/i)).toBeInTheDocument()
  })

  it('el campo de intervalo vuelve a mostrar lo guardado al salir', async () => {
    const usuario = userEvent.setup()
    render(<VistaCalle />)

    const campo = screen.getByLabelText('Intervalo')
    await usuario.clear(campo)
    await usuario.tab()

    expect(campo).toHaveValue('20')
  })

  it('avisa cuando la progresiva extra queda fuera del tramo', async () => {
    const usuario = userEvent.setup()
    render(<VistaCalle />)

    await usuario.type(screen.getByLabelText('Progresiva extra'), '0+500')
    await usuario.click(screen.getByRole('button', { name: /agregar progresiva/i }))

    expect(screen.getByText(/queda fuera del tramo/i)).toBeInTheDocument()
    expect(useAlmacen.getState().proyecto.calles[0]!.progresivasExtra).toHaveLength(0)
  })

  it('avisa cuando la progresiva extra ya está en la lista', async () => {
    const usuario = userEvent.setup()
    render(<VistaCalle />)

    const campo = screen.getByLabelText('Progresiva extra')
    await usuario.type(campo, '0+047')
    await usuario.click(screen.getByRole('button', { name: /agregar progresiva/i }))
    await usuario.type(campo, '0+047')
    await usuario.click(screen.getByRole('button', { name: /agregar progresiva/i }))

    expect(screen.getByText(/ya está en la lista/i)).toBeInTheDocument()
    expect(useAlmacen.getState().proyecto.calles[0]!.progresivasExtra).toHaveLength(1)
  })

  it('avisa cuando no entiende la progresiva extra', async () => {
    const usuario = userEvent.setup()
    render(<VistaCalle />)

    await usuario.type(screen.getByLabelText('Progresiva extra'), 'abc')
    await usuario.click(screen.getByRole('button', { name: /agregar progresiva/i }))

    expect(screen.getByText(/No entiendo esa progresiva/i)).toBeInTheDocument()
  })
})
