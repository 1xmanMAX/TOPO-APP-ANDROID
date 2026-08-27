import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAlmacen } from '../estado/almacen'
import { proyectoEjemplo } from '../estado/ejemplo'
import { buscarToma } from '../estado/proyectoTomas'
import PanelEstacion from './PanelEstacion'

describe('PanelEstacion', () => {
  beforeEach(() => {
    useAlmacen.getState().cargarProyecto(proyectoEjemplo())
  })

  it('lista las lecturas intermedias de la estación con su cota', () => {
    render(<PanelEstacion estacionIndice={0} alCambiarEstacion={vi.fn()} />)
    expect(screen.getByLabelText('Lectura de 0+000 EJE')).toHaveValue('2.011')
    expect(screen.getByText('3244.597')).toBeInTheDocument()
  })

  it('corregir una lectura recalcula la cota al instante', async () => {
    const usuario = userEvent.setup()
    render(<PanelEstacion estacionIndice={0} alCambiarEstacion={vi.fn()} />)

    const campo = screen.getByLabelText('Lectura de 0+000 EJE')
    await usuario.clear(campo)
    await usuario.type(campo, '1.880')

    const resultado = useAlmacen.getState().calcular()!
    expect(resultado.cotasPorCelda.get('0|EJE')!.cotaCruda).toBeCloseTo(3244.725, 6)
  })

  it('borra una lectura', async () => {
    const usuario = userEvent.setup()
    render(<PanelEstacion estacionIndice={0} alCambiarEstacion={vi.fn()} />)
    await usuario.click(screen.getByLabelText('Borrar lectura de 0+000 EJE'))

    const resultado = useAlmacen.getState().calcular()!
    expect(resultado.cotasPorCelda.has('0|EJE')).toBe(false)
  })

  it('vaciar el campo de una lectura no guarda un cero', async () => {
    const usuario = userEvent.setup()
    render(<PanelEstacion estacionIndice={0} alCambiarEstacion={vi.fn()} />)

    const campo = screen.getByLabelText('Lectura de 0+000 EJE')
    await usuario.clear(campo)

    const lectura = buscarToma(useAlmacen.getState().proyecto, 'camp-1')!
      .toma.estaciones[0]!.intermedias.find(
        (i) => i.destino.tipo === 'celda' && i.destino.celda.progresiva === 0 && i.destino.celda.elementoClave === 'EJE',
      )!
    expect(lectura.valor).toBe(2.011)
  })

  it('traslada el instrumento creando punto de cambio y estación nueva', async () => {
    const usuario = userEvent.setup()
    const alCambiarEstacion = vi.fn()
    render(<PanelEstacion estacionIndice={1} alCambiarEstacion={alCambiarEstacion} />)

    // La estación 2 del ejemplo ya cerró contra BM-1. Para trasladarse desde ella
    // hay que soltar ese cierre primero: no se puede cerrar y trasladar a la vez.
    await usuario.click(screen.getByRole('button', { name: /quitar la vista adelante/i }))
    await usuario.click(screen.getByRole('button', { name: /trasladar el instrumento/i }))

    const campania = buscarToma(useAlmacen.getState().proyecto, 'camp-1')!.toma
    expect(campania.estaciones).toHaveLength(3)
    expect(campania.estaciones[2]!.vistaAtras.destino).toEqual({ tipo: 'cambio', nombre: 'PC-2' })
    expect(alCambiarEstacion).toHaveBeenCalledWith(2)
  })

  it('trasladar el instrumento no borra las cotas ya calculadas', async () => {
    const usuario = userEvent.setup()
    render(<PanelEstacion estacionIndice={1} alCambiarEstacion={vi.fn()} />)

    // La estación 2 del ejemplo ya cerró contra BM-1. Para trasladarse desde ella
    // hay que soltar ese cierre primero: no se puede cerrar y trasladar a la vez.
    await usuario.click(screen.getByRole('button', { name: /quitar la vista adelante/i }))
    await usuario.click(screen.getByRole('button', { name: /trasladar el instrumento/i }))

    const resultado = useAlmacen.getState().calcular()!
    expect(resultado.cotasPorCelda.has('0|EJE')).toBe(true)
  })

  it('no ofrece cerrar el circuito cuando la estación ya tiene vista adelante', () => {
    render(<PanelEstacion estacionIndice={1} alCambiarEstacion={vi.fn()} />)

    expect(screen.queryByRole('button', { name: /cerrar el circuito/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /trasladar el instrumento/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /quitar la vista adelante/i })).toBeInTheDocument()
  })

  it('quitar la vista adelante deja el cierre sin veredicto, no con uno falso', async () => {
    const usuario = userEvent.setup()
    render(<PanelEstacion estacionIndice={1} alCambiarEstacion={vi.fn()} />)

    await usuario.click(screen.getByRole('button', { name: /quitar la vista adelante/i }))

    const resultado = useAlmacen.getState().calcular()!
    expect(resultado.cierre.pasa).toBeNull()
    expect(buscarToma(useAlmacen.getState().proyecto, 'camp-1')!.toma.estaciones[1]!.vistaAdelante).toBeUndefined()
  })

  it('cierra el circuito contra el banco de nivel de la campaña', async () => {
    const usuario = userEvent.setup()
    render(<PanelEstacion estacionIndice={1} alCambiarEstacion={vi.fn()} />)

    await usuario.click(screen.getByRole('button', { name: /quitar la vista adelante/i }))
    await usuario.click(screen.getByRole('button', { name: /cerrar el circuito/i }))

    const estacion = buscarToma(useAlmacen.getState().proyecto, 'camp-1')!.toma.estaciones[1]!
    expect(estacion.vistaAdelante?.destino).toEqual({ tipo: 'bm', bmId: 'bm-1' })
  })

  it('nombra las visadas de enlace diciendo a qué punto se visa', async () => {
    const usuario = userEvent.setup()
    render(<PanelEstacion estacionIndice={0} alCambiarEstacion={vi.fn()} />)

    const atras = screen.getByLabelText(/Vista atrás a BM/)
    expect(atras).toHaveValue('1.425')

    await usuario.clear(atras)
    await usuario.type(atras, '1.500')

    const campania = buscarToma(useAlmacen.getState().proyecto, 'camp-1')!.toma
    expect(campania.estaciones[0]!.vistaAtras.valor).toBeCloseTo(1.5, 9)
  })

  it('nombra la vista adelante diciendo a qué punto se visa', () => {
    render(<PanelEstacion estacionIndice={0} alCambiarEstacion={vi.fn()} />)

    expect(screen.getByLabelText(/Vista adelante a PC-1/)).toHaveValue('1.150')
  })
})
