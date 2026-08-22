import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAlmacen } from '../estado/almacen'
import ControlesVista3D from './ControlesVista3D'

describe('ControlesVista3D', () => {
  beforeEach(() => {
    useAlmacen.getState().fijarCamara({ giro: 45, inclinacion: 35.264, exageracion: 25 })
  })

  it('las tres vistas guardadas colocan la cámara donde dicen', async () => {
    render(<ControlesVista3D />)

    await userEvent.click(screen.getByRole('button', { name: 'Planta' }))
    expect(useAlmacen.getState().camara.inclinacion).toBe(90)

    await userEvent.click(screen.getByRole('button', { name: 'Alzado' }))
    expect(useAlmacen.getState().camara.inclinacion).toBe(0)

    await userEvent.click(screen.getByRole('button', { name: 'Isométrico' }))
    expect(useAlmacen.getState().camara.giro).toBe(45)
  })

  it('las vistas guardadas conservan la exageración que hubiera puesta', async () => {
    useAlmacen.getState().fijarExageracion(10)
    render(<ControlesVista3D />)

    await userEvent.click(screen.getByRole('button', { name: 'Planta' }))

    expect(useAlmacen.getState().camara.exageracion).toBe(10)
  })

  it('el deslizador de exageración cambia la cámara y se ve su valor', async () => {
    render(<ControlesVista3D />)

    fireEvent.change(screen.getByLabelText(/exageración/i), { target: { value: '10' } })

    expect(useAlmacen.getState().camara.exageracion).toBe(10)
    expect(screen.getByText(/10×/)).toBeInTheDocument()
  })

  it('se puede girar con el teclado, sin ratón', async () => {
    render(<ControlesVista3D />)
    const giro = useAlmacen.getState().camara.giro

    await userEvent.click(screen.getByRole('button', { name: /girar a la derecha/i }))

    expect(useAlmacen.getState().camara.giro).not.toBe(giro)
  })

  it('la inclinación se ajusta de forma continua, no solo con las vistas guardadas', () => {
    render(<ControlesVista3D />)

    fireEvent.change(screen.getByLabelText(/inclinación/i), { target: { value: '60' } })

    expect(useAlmacen.getState().camara.inclinacion).toBe(60)
  })

  it('la inclinación llega a los dos extremos sin resistirse', () => {
    render(<ControlesVista3D />)
    const control = screen.getByLabelText(/inclinación/i)

    fireEvent.change(control, { target: { value: '90' } })
    expect(useAlmacen.getState().camara.inclinacion).toBe(90)

    fireEvent.change(control, { target: { value: '0' } })
    expect(useAlmacen.getState().camara.inclinacion).toBe(0)
  })
})
