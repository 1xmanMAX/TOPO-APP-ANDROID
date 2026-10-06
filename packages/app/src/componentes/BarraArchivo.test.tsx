import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { empaquetarProyecto } from '../archivo/topo'
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

  it('abrir un .topo carga también los archivos de sus planos', async () => {
    const usuario = userEvent.setup()
    const bytes = new Uint8Array([37, 80, 68, 70, 45])
    const conPlano = {
      ...proyectoEjemplo(),
      meta: { ...proyectoEjemplo().meta, nombre: 'Obra con plano' },
      planos: [{ id: 'plano-1', nombre: 'Expediente', formato: 'pdf' as const, calibracion: null }],
    }
    render(<BarraArchivo />)

    await usuario.upload(
      screen.getByLabelText('Abrir archivo .topo'),
      new File([empaquetarProyecto(conPlano, { 'plano-1': bytes })], 'Obra.topo'),
    )

    await waitFor(() => expect(useAlmacen.getState().proyecto.meta.nombre).toBe('Obra con plano'))
    expect(useAlmacen.getState().archivosDePlano['plano-1']).toEqual(bytes)
  })

  it('un archivo que no es .topo se rechaza con ✗ y un aviso que se anuncia', async () => {
    const usuario = userEvent.setup()
    render(<BarraArchivo />)

    await usuario.upload(screen.getByLabelText('Abrir archivo .topo'), new File(['no soy un zip'], 'notas.topo'))

    const aviso = await screen.findByRole('alert')
    expect(aviso).toHaveTextContent('✗')
    expect(aviso).toHaveTextContent('No se pudo leer el archivo .topo')
  })

  it('el selector se vacía tras abrir: el mismo .topo se puede volver a abrir', async () => {
    // El navegador no avisa de un cambio si se elige el mismo archivo que ya
    // tenía el selector: volver a abrir la copia guardada no hacía nada.
    const usuario = userEvent.setup()
    render(<BarraArchivo />)
    const entrada = screen.getByLabelText<HTMLInputElement>('Abrir archivo .topo')

    await usuario.upload(entrada, new File([empaquetarProyecto(proyectoEjemplo())], 'Obra.topo'))

    await waitFor(() => expect(entrada.value).toBe(''))
  })

  it('«Abrir» pide confirmación antes de abrir el selector de archivo', async () => {
    const usuario = userEvent.setup()
    render(<BarraArchivo />)

    await usuario.click(screen.getByRole('button', { name: 'Abrir' }))

    expect(screen.getByText('¿Seguro? Se pierde lo no guardado')).toBeInTheDocument()
  })
})
