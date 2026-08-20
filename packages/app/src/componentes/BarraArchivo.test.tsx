import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAlmacen } from '../estado/almacen'
import { proyectoEjemplo } from '../estado/ejemplo'
import BarraArchivo from './BarraArchivo'

describe('BarraArchivo', () => {
  beforeEach(() => {
    useAlmacen.getState().cargarProyecto(proyectoEjemplo())
  })

  it('«Nuevo» pide confirmación y no cambia el proyecto al primer clic', async () => {
    const usuario = userEvent.setup()
    render(<BarraArchivo />)

    const nombreOriginal = useAlmacen.getState().proyecto.meta.nombre

    await usuario.click(screen.getByRole('button', { name: 'Nuevo' }))

    expect(useAlmacen.getState().proyecto.meta.nombre).toBe(nombreOriginal)
    expect(screen.getByText('¿Seguro? Se pierde lo no guardado')).toBeInTheDocument()
  })

  it('«Nuevo» sí cambia el proyecto al segundo clic', async () => {
    const usuario = userEvent.setup()
    render(<BarraArchivo />)

    const boton = screen.getByRole('button', { name: 'Nuevo' })
    await usuario.click(boton)
    await usuario.click(screen.getByRole('button', { name: '¿Seguro? Se pierde lo no guardado' }))

    expect(useAlmacen.getState().proyecto.meta.nombre).toBe('Proyecto nuevo')
  })

  it('«Abrir» pide confirmación antes de abrir el selector de archivo', async () => {
    const usuario = userEvent.setup()
    render(<BarraArchivo />)

    await usuario.click(screen.getByRole('button', { name: 'Abrir' }))

    expect(screen.getByText('¿Seguro? Se pierde lo no guardado')).toBeInTheDocument()
  })
})
