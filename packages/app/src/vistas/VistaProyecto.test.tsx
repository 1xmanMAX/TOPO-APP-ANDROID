import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAlmacen } from '../estado/almacen'
import { proyectoEjemplo } from '../estado/ejemplo'
import VistaProyecto from './VistaProyecto'

describe('VistaProyecto', () => {
  beforeEach(() => {
    useAlmacen.getState().cargarProyecto(proyectoEjemplo())
  })

  it('lista los bancos de nivel del proyecto', () => {
    render(<VistaProyecto />)
    expect(screen.getByDisplayValue('BM-1')).toBeInTheDocument()
    expect(screen.getByDisplayValue('3245.180')).toBeInTheDocument()
  })

  it('agrega un banco de nivel', async () => {
    const usuario = userEvent.setup()
    render(<VistaProyecto />)
    await usuario.click(screen.getByRole('button', { name: /agregar banco de nivel/i }))
    expect(useAlmacen.getState().proyecto.bms).toHaveLength(2)
  })

  it('corrige la cota de un banco de nivel', async () => {
    const usuario = userEvent.setup()
    render(<VistaProyecto />)
    const campo = screen.getByDisplayValue('3245.180')
    await usuario.clear(campo)
    await usuario.type(campo, '3245.280')
    expect(useAlmacen.getState().proyecto.bms[0]!.cota).toBeCloseTo(3245.28, 6)
  })

  it('acepta la coma como separador decimal', async () => {
    const usuario = userEvent.setup()
    render(<VistaProyecto />)
    const campo = screen.getByDisplayValue('3245.180')
    await usuario.clear(campo)
    await usuario.type(campo, '3245,5')
    expect(useAlmacen.getState().proyecto.bms[0]!.cota).toBeCloseTo(3245.5, 6)
  })

  it('lista las capas del proyecto', () => {
    render(<VistaProyecto />)
    expect(screen.getByText('SUBRASANTE')).toBeInTheDocument()
  })

  it('pide confirmación antes de eliminar un banco de nivel', async () => {
    const usuario = userEvent.setup()
    render(<VistaProyecto />)

    await usuario.click(screen.getByRole('button', { name: 'Eliminar BM-1' }))
    expect(useAlmacen.getState().proyecto.bms).toHaveLength(1)

    await usuario.click(screen.getByRole('button', { name: 'Confirmar eliminación de BM-1' }))
    expect(useAlmacen.getState().proyecto.bms).toHaveLength(0)
  })

  it('advierte que el banco de nivel está en uso por una campaña', async () => {
    const usuario = userEvent.setup()
    render(<VistaProyecto />)

    await usuario.click(screen.getByRole('button', { name: 'Eliminar BM-1' }))
    expect(screen.getByRole('button', { name: 'Confirmar eliminación de BM-1' })).toHaveTextContent(
      'Hay campañas que lo usan',
    )
  })

  it('pide confirmación antes de eliminar una capa', async () => {
    const usuario = userEvent.setup()
    render(<VistaProyecto />)

    await usuario.click(screen.getByRole('button', { name: 'Eliminar capa TERRENO EXISTENTE' }))
    expect(useAlmacen.getState().proyecto.capas).toHaveLength(2)

    await usuario.click(
      screen.getByRole('button', { name: 'Confirmar eliminación de la capa TERRENO EXISTENTE' }),
    )
    expect(useAlmacen.getState().proyecto.capas).toHaveLength(1)
  })

  it('no deja borrar una capa que alguna campaña está usando', async () => {
    const usuario = userEvent.setup()
    render(<VistaProyecto />)

    await usuario.click(screen.getByRole('button', { name: 'Eliminar capa SUBRASANTE' }))

    expect(screen.getByText(/la usa una campaña/i)).toBeInTheDocument()
    expect(useAlmacen.getState().proyecto.capas).toHaveLength(2)
  })

  it('sube una capa y cambia su posición en la lista dibujada', async () => {
    const usuario = userEvent.setup()
    render(<VistaProyecto />)

    // Orden inicial: TERRENO EXISTENTE, SUBRASANTE.
    let nombres = screen.getAllByRole('listitem').map((li) => li.textContent)
    expect(nombres[0]).toMatch(/TERRENO EXISTENTE/)
    expect(nombres[1]).toMatch(/SUBRASANTE/)

    await usuario.click(screen.getByRole('button', { name: 'Subir la capa SUBRASANTE' }))

    nombres = screen.getAllByRole('listitem').map((li) => li.textContent)
    expect(nombres[0]).toMatch(/SUBRASANTE/)
    expect(nombres[1]).toMatch(/TERRENO EXISTENTE/)
    expect(useAlmacen.getState().proyecto.capas.map((c) => c.orden)).toEqual([0, 1])
  })

  it('se puede escribir el espesor de una capa y queda guardado', async () => {
    render(<VistaProyecto />)

    const campo = screen.getByLabelText('Espesor de SUBRASANTE')
    await userEvent.clear(campo)
    await userEvent.type(campo, '0.25')
    fireEvent.blur(campo)

    const capa = useAlmacen.getState().proyecto.capas.find((c) => c.nombre === 'SUBRASANTE')
    expect(capa!.espesor).toBe(0.25)
  })

  it('avisa de las capas que todavía no tienen espesor, diciendo cuáles', () => {
    render(<VistaProyecto />)

    // El nombre de la capa aparece dos veces en la pantalla —en la lista de
    // capas y en el aviso—, así que se comprueba que el propio aviso la
    // nombra, no que el nombre exista en algún sitio de la página.
    const aviso = screen.getByText(/sin espesor definido/i)
    expect(aviso).toBeInTheDocument()
    expect(aviso).toHaveTextContent('SUBRASANTE')
  })

  it('cuando todas las capas tienen espesor, no queda ningún aviso', () => {
    const proyecto = useAlmacen.getState().proyecto
    useAlmacen.getState().cargarProyecto({
      ...proyecto,
      capas: proyecto.capas.map((capa) => ({ ...capa, espesor: capa.orden === 0 ? 0 : 0.2 })),
    })

    render(<VistaProyecto />)

    expect(screen.queryByText(/sin espesor definido/i)).toBeNull()
  })
})
