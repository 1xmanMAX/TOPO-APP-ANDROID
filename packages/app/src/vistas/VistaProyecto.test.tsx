import { render, screen } from '@testing-library/react'
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
})
