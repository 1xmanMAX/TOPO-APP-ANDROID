import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

  it('se puede escribir una longitud con decimales y queda guardada', async () => {
    const usuario = userEvent.setup()
    const proyecto = proyectoEjemplo()
    proyecto.campanias[0]!.cierre = { ...proyecto.campanias[0]!.cierre, longitudKAuto: false }
    useAlmacen.getState().cargarProyecto(proyecto)

    render(<BarraCierre />)

    const campo = screen.getByLabelText('Longitud K')
    await usuario.clear(campo)
    await usuario.type(campo, '0.5')

    expect(campo).toHaveValue('0.5')

    const campaniaId = useAlmacen.getState().campaniaActivaId!
    const campania = useAlmacen.getState().proyecto.campanias.find((c) => c.id === campaniaId)!
    expect(campania.cierre.longitudK).toBe(0.5)
  })

  it('al desmarcar «calcular sola», la longitud no cae a cero', async () => {
    const usuario = userEvent.setup()
    render(<BarraCierre />)

    const casilla = screen.getByRole('checkbox', { name: /calcular sola/i })
    await usuario.click(casilla)

    const campaniaId = useAlmacen.getState().campaniaActivaId!
    const campania = useAlmacen.getState().proyecto.campanias.find((c) => c.id === campaniaId)!
    expect(campania.cierre.longitudK).not.toBe(0)
    expect(campania.cierre.longitudK).toBeCloseTo(0.36, 9)
  })

  it('dice que no cierra contra el banco configurado cuando la última estación remata en otro banco existente', () => {
    const proyecto = proyectoEjemplo()
    proyecto.bms.push({
      id: 'bm-2',
      nombre: 'BM-2',
      cota: 3245.2,
      tipo: 'oficial',
      descripcion: 'otro banco de nivel del proyecto',
    })
    proyecto.campanias[0]!.estaciones[1]!.vistaAdelante = {
      id: 'l-7',
      destino: { tipo: 'bm', bmId: 'bm-2' },
      valor: 1.91,
    }
    useAlmacen.getState().cargarProyecto(proyecto)

    render(<BarraCierre />)

    expect(
      screen.getByText(/la última estación no cierra contra el banco de nivel configurado/),
    ).toBeInTheDocument()
    expect(screen.queryByText(/ya no está en el proyecto/)).not.toBeInTheDocument()
    expect(screen.queryByText(/✓ PASA/)).not.toBeInTheDocument()
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
