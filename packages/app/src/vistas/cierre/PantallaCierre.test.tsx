import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAlmacen } from '../../estado/almacen'
import { buscarToma } from '../../estado/proyectoTomas'
import { proyectoDePrueba, proyectoSinCerrar } from '../analisis/proyectoDePrueba'
import PantallaCierre from './PantallaCierre'

function tomaActiva() {
  const s = useAlmacen.getState()
  return buscarToma(s.proyecto, s.campaniaActivaId)!.toma
}

describe('PantallaCierre', () => {
  beforeEach(() => {
    useAlmacen.getState().cargarProyecto(proyectoDePrueba())
  })

  it('dibuja el recorrido de la toma activa: BM, estaciones, punto de cambio y vuelta al BM', () => {
    render(<PantallaCierre />)

    expect(screen.getByRole('heading', { name: 'Cierre' })).toBeInTheDocument()
    const pasos = within(screen.getByRole('list', { name: 'Recorrido de la nivelación' })).getAllByRole('listitem')
    expect(pasos.map((p) => p.textContent)).toEqual([
      'BM-1',
      expect.stringMatching(/E1.*AI 101\.500/),
      expect.stringMatching(/PC1/),
      expect.stringMatching(/E2.*AI 101\.700/),
      expect.stringMatching(/BM-1/),
    ])
  })

  it('con k = 12 cierra, enseña la corrección por estación y que ya está aplicada', () => {
    render(<PantallaCierre />)

    expect(screen.getByText('Cierra')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Error −6\.0 mm contra una tolerancia de ±12\.0 mm/ })).toBeInTheDocument()
    const filas = within(screen.getByRole('table', { name: 'Corrección por estación' })).getAllByRole('row')
    expect(filas[1]).toHaveTextContent('E1')
    expect(filas[1]).toHaveTextContent('+3.0 mm')
    expect(filas[2]).toHaveTextContent('+6.0 mm')
    expect(screen.getByText(/Compensación aplicada/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Aplicar compensación' })).not.toBeInTheDocument()
  })

  it('con k = 4 no cierra: no se compensa y dice qué revisar', async () => {
    const usuario = userEvent.setup()
    render(<PantallaCierre />)

    await usuario.click(screen.getByRole('button', { name: 'k = 4' }))

    expect(screen.getByRole('button', { name: 'k = 4' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('No cierra')).toBeInTheDocument()
    expect(screen.getByText(/No se compensa/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Qué revisar' })).toBeInTheDocument()
    expect(screen.getByText(/puntos de cambio/)).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Corrección por estación' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Aplicar compensación' })).not.toBeInTheDocument()
    // Lo guardado no se tocó: la toma sigue compensada con su k.
    expect(screen.getByText(/sigue guardado k = 12/)).toBeInTheDocument()
    expect(tomaActiva().cierre.coeficiente).toBe(12)

    await usuario.click(screen.getByRole('button', { name: 'Revisar la libreta' }))
    expect(useAlmacen.getState().modoCalle).toBe('medir')
    expect(useAlmacen.getState().pantallaCalle).toBeNull()
  })

  it('aplicar la compensación guarda k y K en la toma con las acciones de siempre', async () => {
    const usuario = userEvent.setup()
    const proyecto = proyectoDePrueba()
    const toma = proyecto.calles[0]!.nivelaciones[0]!.tomas[0]!
    toma.cierre = { ...toma.cierre, coeficiente: 4, clase: 'personalizada' }
    useAlmacen.getState().cargarProyecto(proyecto)
    render(<PantallaCierre />)

    expect(screen.getByText('No cierra')).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'k = 12' }))
    expect(screen.getByText('Cierra')).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Aplicar compensación' }))

    expect(tomaActiva().cierre).toMatchObject({ coeficiente: 12, clase: 'tercerOrden', longitudK: 1, longitudKAuto: false })
    expect(screen.getByText(/Compensación aplicada/)).toBeInTheDocument()
  })

  it('cambiar K cambia la tolerancia', async () => {
    const usuario = userEvent.setup()
    render(<PantallaCierre />)

    const campo = screen.getByLabelText('Longitud K')
    await usuario.clear(campo)
    await usuario.type(campo, '0.1')

    // 12·√0.1 = 3.8 mm: el error de −6 mm ya no pasa.
    expect(screen.getByText('No cierra')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /tolerancia de ±3\.8 mm/ })).toBeInTheDocument()
  })

  it('una toma configurada como circuito abierto sí se llama «Circuito abierto»', () => {
    const proyecto = proyectoSinCerrar()
    const toma = proyecto.calles[0]!.nivelaciones[0]!.tomas[0]!
    toma.cierre = { ...toma.cierre, tipo: 'abierto' }
    useAlmacen.getState().cargarProyecto(proyecto)
    render(<PantallaCierre />)

    expect(screen.getByText(/Circuito abierto: lo medido queda NO COMPROBADO/)).toHaveTextContent(/^△ Circuito abierto/)
    expect(screen.queryByText(/Falta cerrar/)).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Lectura de cierre' })).not.toBeInTheDocument()
  })

  it('circuito cerrado sin BM de cierre elegido: le falta cerrar, no es «abierto»', () => {
    const proyecto = proyectoSinCerrar()
    const toma = proyecto.calles[0]!.nivelaciones[0]!.tomas[0]!
    delete toma.cierre.bmFinalId
    useAlmacen.getState().cargarProyecto(proyecto)
    render(<PantallaCierre />)

    expect(screen.getByText(/Falta cerrar la nivelación: lo medido queda NO COMPROBADO/)).toHaveTextContent(/^△ Falta cerrar/)
    expect(screen.getByText('Falta elegir el BM de cierre.')).toBeInTheDocument()
    expect(screen.queryByText(/Circuito abierto/)).not.toBeInTheDocument()
  })

  it('circuito cerrado cuyo BM de cierre se borró de la obra: tampoco es «abierto»', () => {
    const proyecto = proyectoSinCerrar()
    proyecto.calles[0]!.nivelaciones[0]!.tomas[0]!.cierre.bmFinalId = 'bm-borrado'
    useAlmacen.getState().cargarProyecto(proyecto)
    render(<PantallaCierre />)

    expect(screen.getByText(/Falta cerrar la nivelación/)).toBeInTheDocument()
    expect(screen.getByText('El BM de cierre ya no existe en la obra.')).toBeInTheDocument()
    expect(screen.queryByText(/Circuito abierto/)).not.toBeInTheDocument()
  })

  it('sin visar el BM: dice que falta cerrar, simula la lectura y la anota en la libreta', async () => {
    const usuario = userEvent.setup()
    useAlmacen.getState().cargarProyecto(proyectoSinCerrar())
    render(<PantallaCierre />)

    // La toma es de circuito cerrado: no está «abierta», le falta cerrar. El símbolo va en la misma línea.
    expect(screen.getByText(/Falta cerrar en BM-1: lo medido queda NO COMPROBADO/)).toHaveTextContent(/^△ Falta cerrar/)
    expect(screen.queryByText(/Circuito abierto/)).not.toBeInTheDocument()
    expect(screen.getByText(/Falta visar el BM de cierre \(BM-1\)/)).toBeInTheDocument()
    expect(screen.getByText('BM-1 (falta visar)')).toBeInTheDocument()

    const seccion = screen.getByRole('region', { name: 'Lectura de cierre' })
    // AI de E2 101.700 − BM 100.000.
    expect(within(seccion).getByText('1.700')).toBeInTheDocument()

    await usuario.type(screen.getByLabelText('Lectura en el BM de cierre'), '1.703')
    expect(screen.getByText(/Con 1\.703: cierra, error −3\.0 mm de ±12\.0 mm/)).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Anotar en la libreta' }))

    const ultima = tomaActiva().estaciones[1]!
    expect(ultima.vistaAdelante).toMatchObject({ destino: { tipo: 'bm', bmId: 'bm-1' }, valor: 1.703 })
    expect(screen.getByText('Cierra')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Anotar en la libreta' })).not.toBeInTheDocument()
  })

  it('una lectura que no cabe en la mira se dice, no se simula', async () => {
    const usuario = userEvent.setup()
    useAlmacen.getState().cargarProyecto(proyectoSinCerrar())
    render(<PantallaCierre />)

    await usuario.type(screen.getByLabelText('Lectura en el BM de cierre'), '9')

    expect(screen.getByText(/tiene que estar entre 0 y 5 m/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Anotar en la libreta' })).not.toBeInTheDocument()
  })

  it('una calle sin nivelaciones no tiene nada que cerrar', () => {
    const proyecto = proyectoDePrueba()
    proyecto.calles[0]!.nivelaciones = []
    useAlmacen.getState().cargarProyecto(proyecto)
    useAlmacen.getState().activarCalle('c-1')
    render(<PantallaCierre />)

    expect(screen.getByText(/no hay nada que cerrar/)).toBeInTheDocument()
  })
})
