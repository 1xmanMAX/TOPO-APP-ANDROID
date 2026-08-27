import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAlmacen } from '../estado/almacen'
import { proyectoEjemplo } from '../estado/ejemplo'
import { buscarToma } from '../estado/proyectoTomas'
import BarraCierre from './BarraCierre'

/** La toma que antes era «campanias[0]»: la primera de la primera nivelación de la primera calle. */
function primeraToma(proyecto: ReturnType<typeof proyectoEjemplo>) {
  return proyecto.calles[0]!.nivelaciones[0]!.tomas[0]!
}

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
    const toma = buscarToma(useAlmacen.getState().proyecto, campaniaId)!.toma
    const lecturaId = toma.estaciones[1]!.vistaAdelante!.id
    useAlmacen.getState().actualizarLectura(campaniaId, lecturaId, 1.887)

    render(<BarraCierre />)

    expect(screen.getByText(/✗ FUERA DE TOLERANCIA/)).toHaveTextContent('+18.0 mm')
    expect(screen.queryByText(/✓ PASA/)).not.toBeInTheDocument()
  })

  it('no da ningún veredicto cuando el circuito quedó abierto', () => {
    const proyecto = proyectoEjemplo()
    const toma = primeraToma(proyecto)
    toma.cierre = {
      ...toma.cierre,
      tipo: 'abierto',
      bmFinalId: undefined,
    }
    delete toma.estaciones[1]!.vistaAdelante
    useAlmacen.getState().cargarProyecto(proyecto)

    render(<BarraCierre />)

    expect(screen.getByText(/circuito abierto — sin verificación/)).toBeInTheDocument()
    expect(screen.queryByText(/✓ PASA/)).not.toBeInTheDocument()
    expect(screen.queryByText(/✗ FUERA DE TOLERANCIA/)).not.toBeInTheDocument()
  })

  it('dice que falta cerrar cuando la libreta todavía no llega a un banco de nivel', () => {
    const proyecto = proyectoEjemplo()
    delete primeraToma(proyecto).estaciones[1]!.vistaAdelante
    useAlmacen.getState().cargarProyecto(proyecto)

    render(<BarraCierre />)

    expect(screen.getByText(/falta cerrar contra un banco de nivel/)).toBeInTheDocument()
  })

  it('se puede escribir una longitud con decimales y queda guardada', async () => {
    const usuario = userEvent.setup()
    const proyecto = proyectoEjemplo()
    const tomaInicial = primeraToma(proyecto)
    tomaInicial.cierre = { ...tomaInicial.cierre, longitudKAuto: false }
    useAlmacen.getState().cargarProyecto(proyecto)

    render(<BarraCierre />)

    const campo = screen.getByLabelText('Longitud K')
    await usuario.clear(campo)
    await usuario.type(campo, '0.5')

    expect(campo).toHaveValue('0.5')

    const campaniaId = useAlmacen.getState().campaniaActivaId!
    const toma = buscarToma(useAlmacen.getState().proyecto, campaniaId)!.toma
    expect(toma.cierre.longitudK).toBe(0.5)
  })

  it('al desmarcar «calcular sola», la longitud no cae a cero', async () => {
    const usuario = userEvent.setup()
    render(<BarraCierre />)

    const casilla = screen.getByRole('checkbox', { name: /calcular sola/i })
    await usuario.click(casilla)

    const campaniaId = useAlmacen.getState().campaniaActivaId!
    const toma = buscarToma(useAlmacen.getState().proyecto, campaniaId)!.toma
    expect(toma.cierre.longitudK).not.toBe(0)
    expect(toma.cierre.longitudK).toBeCloseTo(0.36, 9)
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
    primeraToma(proyecto).estaciones[1]!.vistaAdelante = {
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
    const toma = primeraToma(proyecto)
    toma.cierre = {
      ...toma.cierre,
      bmFinalId: 'bm-borrado',
    }
    useAlmacen.getState().cargarProyecto(proyecto)

    render(<BarraCierre />)

    expect(screen.getByText(/ya no está en el proyecto/)).toBeInTheDocument()
    expect(screen.queryByText(/✓ PASA/)).not.toBeInTheDocument()
  })
})
