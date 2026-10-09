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

describe('App: el trabajo guardado se abre solo', () => {
  it('al volver a la app se abre lo guardado, sin bloquear la pantalla, y se sigue guardando', async () => {
    vi.spyOn(autoguardado, 'leerBorrador').mockResolvedValue(borradorViejo())
    const guardar = vi.spyOn(autoguardado, 'guardarBorrador').mockResolvedValue()
    render(<App />)

    await screen.findByText(/Abrí tu trabajo guardado/)
    expect(useAlmacen.getState().proyecto.meta.nombre).toBe('Borrador viejo')
    expect(screen.getByRole('main').closest('[inert]')).toBeNull()
    act(() => useAlmacen.getState().actualizarMeta({ nombre: 'Borrador viejo, seguido' }))
    await waitFor(() => expect(guardar).toHaveBeenCalled(), { timeout: 3000 })
  })

  it('«Empezar uno nuevo» pide confirmación y deja un proyecto vacío', async () => {
    vi.spyOn(autoguardado, 'leerBorrador').mockResolvedValue(borradorViejo())
    vi.spyOn(autoguardado, 'guardarBorrador').mockResolvedValue()
    render(<App />)

    const empezar = await screen.findByRole('button', { name: 'Empezar uno nuevo' })
    act(() => empezar.click())
    expect(useAlmacen.getState().proyecto.meta.nombre).toBe('Borrador viejo')
    act(() => screen.getByRole('button', { name: 'Sí, empezar de cero' }).click())
    expect(useAlmacen.getState().proyecto.meta.nombre).not.toBe('Borrador viejo')
    await waitFor(() => expect(screen.queryByText(/Abrí tu trabajo guardado/)).not.toBeInTheDocument())
  })

  it('si ya se abrió otro archivo mientras se leía lo guardado, se respeta lo abierto', async () => {
    let soltar: (b: autoguardado.Borrador) => void = () => {}
    vi.spyOn(autoguardado, 'leerBorrador').mockReturnValue(new Promise((r) => (soltar = r)))
    vi.spyOn(autoguardado, 'guardarBorrador').mockResolvedValue()
    render(<App />)
    const otro = proyectoEjemplo()
    otro.meta = { ...otro.meta, nombre: 'Obra abierta' }
    act(() => useAlmacen.getState().cargarProyecto(otro))
    await act(async () => soltar(borradorViejo()))
    expect(useAlmacen.getState().proyecto.meta.nombre).toBe('Obra abierta')
    expect(screen.queryByText(/Abrí tu trabajo guardado/)).not.toBeInTheDocument()
  })

  it('al pasar la app a segundo plano se guarda en el acto', async () => {
    vi.spyOn(autoguardado, 'leerBorrador').mockResolvedValue(null)
    const guardar = vi.spyOn(autoguardado, 'guardarBorrador').mockResolvedValue()
    render(<App />)
    await waitFor(() => expect(guardar).toHaveBeenCalled(), { timeout: 3000 })
    guardar.mockClear()
    act(() => {
      window.dispatchEvent(new Event('pagehide'))
    })
    expect(guardar).toHaveBeenCalledTimes(1)
  })
})
