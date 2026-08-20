import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAlmacen } from '../estado/almacen'
import { proyectoEjemplo } from '../estado/ejemplo'
import BarraCierre from './BarraCierre'

describe('BarraCierre', () => {
  beforeEach(() => {
    useAlmacen.getState().cargarProyecto(proyectoEjemplo())
  })

  it('da el veredicto de aprobado cuando el cierre pasa', () => {
    render(<BarraCierre />)

    expect(screen.getByText(/✓ PASA/)).toHaveTextContent('−5.0 mm')
    expect(screen.getByText(/±7.2 mm/)).toBeInTheDocument()
  })

  it('da el veredicto de fuera de tolerancia cuando el cierre no pasa', () => {
    const campaniaId = useAlmacen.getState().campaniaActivaId!
    const lecturaId = useAlmacen.getState().proyecto.campanias[0]!.estaciones[1]!.vistaAdelante!.id
    useAlmacen.getState().actualizarLectura(campaniaId, lecturaId, 1.887)

    render(<BarraCierre />)

    expect(screen.getByText(/✗ FUERA DE TOLERANCIA/)).toHaveTextContent('+18.0 mm')
    expect(screen.queryByText(/✓ PASA/)).not.toBeInTheDocument()
  })

  it('no da ningún veredicto cuando el circuito quedó abierto', () => {
    const proyecto = proyectoEjemplo()
    proyecto.campanias[0]!.cierre = {
      ...proyecto.campanias[0]!.cierre,
      tipo: 'abierto',
      bmFinalId: undefined,
    }
    delete proyecto.campanias[0]!.estaciones[1]!.vistaAdelante
    useAlmacen.getState().cargarProyecto(proyecto)

    render(<BarraCierre />)

    expect(screen.getByText(/circuito abierto — sin verificación/)).toBeInTheDocument()
    expect(screen.queryByText(/✓ PASA/)).not.toBeInTheDocument()
    expect(screen.queryByText(/✗ FUERA DE TOLERANCIA/)).not.toBeInTheDocument()
  })

  it('dice que falta cerrar cuando la libreta todavía no llega a un banco de nivel', () => {
    const proyecto = proyectoEjemplo()
    delete proyecto.campanias[0]!.estaciones[1]!.vistaAdelante
    useAlmacen.getState().cargarProyecto(proyecto)

    render(<BarraCierre />)

    expect(screen.getByText(/falta cerrar contra un banco de nivel/)).toBeInTheDocument()
  })

  it('dice cuando el banco de nivel de cierre ya no está en el proyecto', () => {
    const proyecto = proyectoEjemplo()
    proyecto.campanias[0]!.cierre = {
      ...proyecto.campanias[0]!.cierre,
      bmFinalId: 'bm-borrado',
    }
    useAlmacen.getState().cargarProyecto(proyecto)

    render(<BarraCierre />)

    expect(screen.getByText(/ya no está en el proyecto/)).toBeInTheDocument()
    expect(screen.queryByText(/✓ PASA/)).not.toBeInTheDocument()
  })
})
