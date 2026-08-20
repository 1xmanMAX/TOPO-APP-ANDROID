import { render, screen } from '@testing-library/react'
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
