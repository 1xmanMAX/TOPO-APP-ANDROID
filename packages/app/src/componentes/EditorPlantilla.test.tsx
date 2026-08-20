import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAlmacen } from '../estado/almacen'
import { proyectoEjemplo } from '../estado/ejemplo'
import EditorPlantilla from './EditorPlantilla'

describe('EditorPlantilla', () => {
  beforeEach(() => {
    useAlmacen.getState().cargarProyecto(proyectoEjemplo())
  })

  it('muestra los elementos ordenados por offset, de izquierda a derecha', () => {
    render(<EditorPlantilla plantillaId="pl-1" />)
    const claves = screen.getAllByLabelText('Clave').map((campo) => (campo as HTMLInputElement).value)
    expect(claves).toEqual(['VER-I', 'SAR-I', 'BOR-I', 'EJE', 'BOR-D', 'SAR-D', 'VER-D'])
  })

  it('agrega un elemento', async () => {
    const usuario = userEvent.setup()
    render(<EditorPlantilla plantillaId="pl-1" />)
    await usuario.click(screen.getByRole('button', { name: /agregar elemento/i }))
    const plantilla = useAlmacen.getState().proyecto.plantillas[0]!
    expect(plantilla.elementos).toHaveLength(8)
  })

  it('quita un elemento', async () => {
    const usuario = userEvent.setup()
    render(<EditorPlantilla plantillaId="pl-1" />)
    await usuario.click(screen.getByLabelText('Quitar VER-I'))
    const plantilla = useAlmacen.getState().proyecto.plantillas[0]!
    expect(plantilla.elementos.map((e) => e.clave)).not.toContain('VER-I')
  })

  it('avisa si dos elementos tienen la misma clave', async () => {
    const usuario = userEvent.setup()
    render(<EditorPlantilla plantillaId="pl-1" />)
    const campoClave = screen.getAllByLabelText('Clave')[0]!
    await usuario.clear(campoClave)
    await usuario.type(campoClave, 'EJE')
    expect(screen.getByText(/La clave EJE está repetida/i)).toBeInTheDocument()
  })
})
