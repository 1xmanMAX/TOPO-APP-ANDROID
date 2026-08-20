import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAlmacen } from '../estado/almacen'
import { proyectoEjemplo } from '../estado/ejemplo'
import CorteTransversal from './CorteTransversal'

describe('CorteTransversal', () => {
  beforeEach(() => {
    useAlmacen.getState().cargarProyecto(proyectoEjemplo())
  })

  it('dibuja un punto por cada celda medida de la progresiva', () => {
    render(<CorteTransversal progresiva={0} />)
    expect(screen.getAllByRole('button', { name: /^0\+000 / })).toHaveLength(2)
  })

  it('avisa cuando la progresiva no tiene lecturas', () => {
    render(<CorteTransversal progresiva={60} />)
    expect(screen.getByText(/todavía no tiene lecturas/i)).toBeInTheDocument()
  })

  it('selecciona la celda al hacer clic en un punto', async () => {
    const usuario = userEvent.setup()
    render(<CorteTransversal progresiva={0} />)
    await usuario.click(screen.getByRole('button', { name: /0\+000 EJE/ }))
    expect(useAlmacen.getState().seleccion.clave).toBe('0|EJE')
  })

  it('marca el punto seleccionado', () => {
    useAlmacen.getState().seleccionar('0|EJE')
    render(<CorteTransversal progresiva={0} />)
    expect(screen.getByRole('button', { name: /0\+000 EJE/ })).toHaveAttribute('data-activo', 'true')
  })
})
