import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import * as autoguardado from './archivo/autoguardado'
import { useAlmacen } from './estado/almacen'
import { proyectoEjemplo } from './estado/ejemplo'

/** Un borrador viejo guardado en el navegador, con otro nombre que el proyecto abierto. */
function borradorViejo(): autoguardado.Borrador {
  const proyecto = proyectoEjemplo()
  proyecto.meta = { ...proyecto.meta, nombre: 'Borrador viejo' }
  return { proyecto, archivosDePlano: {}, guardado: new Date(Date.now() - 3_600_000).toISOString() }
}

beforeEach(() => {
  useAlmacen.getState().cargarProyecto(proyectoEjemplo())
  useAlmacen.setState({ espacio: 'obra', subObra: 'calles', pantallaCalle: null, calculadoraAbierta: false })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('App: el aviso de recuperar el trabajo', () => {
  it('si se abre otro proyecto con el aviso a la vista, el aviso se va y el autoguardado se enciende', async () => {
    vi.spyOn(autoguardado, 'leerBorrador').mockResolvedValue(borradorViejo())
    const guardar = vi.spyOn(autoguardado, 'guardarBorrador').mockResolvedValue()
    render(<App />)

    await screen.findByText(/Recuperé tu trabajo/)
    // Con el aviso a la vista no se guarda nada: pisaría el borrador.
    await new Promise((r) => setTimeout(r, 1300))
    expect(guardar).not.toHaveBeenCalled()

    // Max abre otro .topo (cargarProyecto) sin tocar Recuperar ni Descartar.
    const otro = proyectoEjemplo()
    otro.meta = { ...otro.meta, nombre: 'Obra abierta' }
    act(() => useAlmacen.getState().cargarProyecto(otro))

    await waitFor(() => expect(screen.queryByText(/Recuperé tu trabajo/)).not.toBeInTheDocument())
    await waitFor(() => expect(guardar).toHaveBeenCalled(), { timeout: 3000 })
    expect(guardar.mock.calls.at(-1)?.[0].meta.nombre).toBe('Obra abierta')
  })

  it('Nuevo también quita el aviso', async () => {
    vi.spyOn(autoguardado, 'leerBorrador').mockResolvedValue(borradorViejo())
    vi.spyOn(autoguardado, 'guardarBorrador').mockResolvedValue()
    render(<App />)

    await screen.findByText(/Recuperé tu trabajo/)
    act(() => useAlmacen.getState().nuevoProyecto())
    await waitFor(() => expect(screen.queryByText(/Recuperé tu trabajo/)).not.toBeInTheDocument())
  })

  it('mientras se decide, el proyecto de debajo no se puede editar', async () => {
    vi.spyOn(autoguardado, 'leerBorrador').mockResolvedValue(borradorViejo())
    vi.spyOn(autoguardado, 'guardarBorrador').mockResolvedValue()
    render(<App />)

    await screen.findByText(/Recuperé tu trabajo/)
    expect(screen.getByRole('main', { hidden: true }).closest('[inert]')).not.toBeNull()
    // La barra de arriba sí se usa: desde ella se abre otro archivo.
    expect(screen.getByRole('button', { name: 'Archivo' }).closest('[inert]')).toBeNull()
  })

  it('Recuperar carga el borrador y deja la pantalla editable', async () => {
    vi.spyOn(autoguardado, 'leerBorrador').mockResolvedValue(borradorViejo())
    vi.spyOn(autoguardado, 'guardarBorrador').mockResolvedValue()
    render(<App />)

    const boton = await screen.findByRole('button', { name: 'Recuperar' })
    act(() => boton.click())
    await waitFor(() => expect(screen.queryByText(/Recuperé tu trabajo/)).not.toBeInTheDocument())
    expect(useAlmacen.getState().proyecto.meta.nombre).toBe('Borrador viejo')
    expect(screen.getByRole('main').closest('[inert]')).toBeNull()
  })
})
