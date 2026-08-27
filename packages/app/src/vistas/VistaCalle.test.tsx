import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAlmacen } from '../estado/almacen'
import { proyectoEjemplo, proyectoVacio } from '../estado/ejemplo'
import VistaCalle from './VistaCalle'

/**
 * La plantilla transversal y el rango de progresivas desaparecieron de esta
 * pantalla en la tarea C3 (los puntos de la calle entran por el archivo
 * importado, no se escriben aquí a mano — decisión de Max, ya recogida en el
 * spec). Lo que queda es lo que no cambió: el nombre de la calle y su
 * rasante de proyecto, que ya tiene su propia batería de pruebas en
 * `EditorRasante.test.tsx`.
 */
describe('VistaCalle', () => {
  beforeEach(() => {
    useAlmacen.getState().cargarProyecto(proyectoEjemplo())
  })

  it('muestra el nombre de la calle activa', () => {
    render(<VistaCalle />)
    expect(screen.getByDisplayValue('Av. Sol')).toBeInTheDocument()
  })

  it('editar el nombre lo guarda en el almacén', async () => {
    const usuario = userEvent.setup()
    render(<VistaCalle />)

    const campo = screen.getByDisplayValue('Av. Sol')
    await usuario.clear(campo)
    await usuario.type(campo, 'Av. Nueva')

    expect(useAlmacen.getState().proyecto.calles[0]!.nombre).toBe('Av. Nueva')
  })

  it('muestra el editor de rasante de la calle', () => {
    render(<VistaCalle />)
    expect(screen.getByText('Rasante de proyecto')).toBeInTheDocument()
  })

  it('sin campaña activa, pide crear una calle y una campaña', () => {
    useAlmacen.getState().cargarProyecto(proyectoVacio())
    render(<VistaCalle />)
    expect(screen.getByText(/crea una calle y una campaña/i)).toBeInTheDocument()
  })
})
