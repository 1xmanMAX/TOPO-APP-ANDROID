import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAlmacen } from '../estado/almacen'
import { proyectoEjemplo } from '../estado/ejemplo'
import VistaLibreta from './VistaLibreta'

describe('VistaLibreta', () => {
  beforeEach(() => {
    useAlmacen.getState().cargarProyecto(proyectoEjemplo())
  })

  it('abre en la última estación, que es donde se sigue trabajando', () => {
    render(<VistaLibreta />)

    expect(screen.getByText('3247.085')).toBeInTheDocument()
    expect(screen.queryByText(/que no es la última/)).not.toBeInTheDocument()
  })

  it('muestra la cota instrumento de la estación que se elija', async () => {
    const usuario = userEvent.setup()
    render(<VistaLibreta />)

    await usuario.click(screen.getByRole('button', { name: '1' }))

    expect(screen.getByText('3246.605')).toBeInTheDocument()
    expect(screen.getByText(/Estás escribiendo en la estación 1 de 2, que no es la última/)).toBeInTheDocument()
  })

  it('muestra el veredicto del cierre en verde cuando pasa', () => {
    render(<VistaLibreta />)
    expect(screen.getByText(/PASA/)).toBeInTheDocument()
    expect(screen.getByText(/−5.0 mm|-5.0 mm/)).toBeInTheDocument()
    expect(screen.getByText(/±7.2 mm/)).toBeInTheDocument()
  })

  it('registra una lectura y salta a la siguiente celda pendiente', async () => {
    const usuario = userEvent.setup()
    render(<VistaLibreta />)

    const campo = screen.getByLabelText(/lectura de mira/i)
    await usuario.type(campo, '2.100{Enter}')

    const resultado = useAlmacen.getState().calcular()!
    expect(resultado.celdasLlenas).toBe(4)
    expect(screen.getByText(/celda activa/i).textContent).not.toContain('0+000 VER-I')
  })

  it('muestra cuántas celdas faltan', () => {
    render(<VistaLibreta />)
    expect(screen.getByText(/llenadas 3 de 70/i)).toBeInTheDocument()
  })

  it('con una calle de progresiva final menor que la inicial, se dibuja sin lanzar', () => {
    const proyecto = proyectoEjemplo()
    proyecto.calles[0]!.progresivaInicio = 200
    proyecto.calles[0]!.progresivaFin = 180
    useAlmacen.getState().cargarProyecto(proyecto)

    expect(() => render(<VistaLibreta />)).not.toThrow()
  })

  it('muestra el aviso de cierre fuera de tolerancia', async () => {
    const campaniaId = useAlmacen.getState().campaniaActivaId!
    const lecturaId = useAlmacen.getState().proyecto.campanias[0]!.estaciones[1]!.vistaAdelante!.id
    useAlmacen.getState().actualizarLectura(campaniaId, lecturaId, 1.887)

    render(<VistaLibreta />)
    expect(screen.getByText(/Cierre fuera de tolerancia/i)).toBeInTheDocument()
  })

  it('con una campaña sin estaciones, ofrece empezar la libreta en vez de no mostrar nada', async () => {
    const usuario = userEvent.setup()
    const proyecto = proyectoEjemplo()
    proyecto.campanias[0]!.estaciones = []
    useAlmacen.getState().cargarProyecto(proyecto)

    render(<VistaLibreta />)

    expect(
      screen.getByText(/esta libreta todavía no tiene ninguna estación/i),
    ).toBeInTheDocument()
    expect(screen.queryByText(/estación 1/i)).not.toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: /empezar la libreta/i }))

    expect(screen.getByRole('heading', { name: 'Estación 1' })).toBeInTheDocument()
    expect(useAlmacen.getState().proyecto.campanias[0]!.estaciones).toHaveLength(1)
  })
})
