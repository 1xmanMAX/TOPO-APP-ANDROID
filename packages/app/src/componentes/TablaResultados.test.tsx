import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAlmacen } from '../estado/almacen'
import { proyectoEjemplo } from '../estado/ejemplo'
import TablaResultados from './TablaResultados'

describe('TablaResultados', () => {
  beforeEach(() => {
    useAlmacen.getState().cargarProyecto(proyectoEjemplo())
  })

  it('muestra las cotas compensadas con tres decimales', () => {
    render(<TablaResultados />)
    expect(screen.getByText('3244.628')).toBeInTheDocument()
    expect(screen.getByText('3244.620')).toBeInTheDocument()
  })

  it('deja vacías las celdas sin medir', () => {
    render(<TablaResultados />)
    expect(screen.getByLabelText('0+040 EJE').textContent).toBe('—')
  })

  it('selecciona la celda al hacer clic', async () => {
    const usuario = userEvent.setup()
    render(<TablaResultados />)
    await usuario.click(screen.getByLabelText('0+020 EJE'))
    expect(useAlmacen.getState().seleccion.clave).toBe('20|EJE')
    expect(useAlmacen.getState().seleccion.progresiva).toBe(20)
  })
})
