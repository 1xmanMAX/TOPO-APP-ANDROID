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

  it('muestra la cota instrumento de la estación', () => {
    render(<VistaLibreta />)
    expect(screen.getByText('3246.605')).toBeInTheDocument()
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

  it('muestra el aviso de cierre fuera de tolerancia', async () => {
    const campaniaId = useAlmacen.getState().campaniaActivaId!
    const lecturaId = useAlmacen.getState().proyecto.campanias[0]!.estaciones[1]!.vistaAdelante!.id
    useAlmacen.getState().actualizarLectura(campaniaId, lecturaId, 1.887)

    render(<VistaLibreta />)
    expect(screen.getByText(/Cierre fuera de tolerancia/i)).toBeInTheDocument()
  })
})
