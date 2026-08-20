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
})
