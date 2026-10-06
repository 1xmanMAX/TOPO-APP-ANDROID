import type { Proyecto } from '@topo/core'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAlmacen } from '../../estado/almacen'
import { proyectoEjemplo } from '../../estado/ejemplo'
import { reducirFoto } from './fotos'
import NotasDeCalle from './NotasDeCalle'

// jsdom no dibuja imágenes: la reducción de la foto se prueba aparte (fotos.test).
vi.mock('./fotos', () => ({
  reducirFoto: vi.fn(async () => 'data:image/jpeg;base64,REDUCIDA'),
}))

/** El ejemplo con dos notas ya puestas, desordenadas a propósito. */
function obraConNotas(): Proyecto {
  const proyecto = proyectoEjemplo()
  proyecto.calles[0]!.notas = [
    { id: 'n-2', progresiva: 40, texto: 'Agua empozada', fecha: '2026-10-05T10:00:00.000Z' },
    { id: 'n-1', progresiva: 20, texto: 'Buzón', fecha: '2026-10-05T09:00:00.000Z' },
  ]
  return proyecto
}

const calleId = () => useAlmacen.getState().proyecto.calles[0]!.id
const notas = () => useAlmacen.getState().proyecto.calles[0]!.notas ?? []

describe('NotasDeCalle', () => {
  beforeEach(() => {
    useAlmacen.getState().cargarProyecto(obraConNotas())
    useAlmacen.setState({ seleccion: { clave: null, progresiva: null } })
  })

  it('lista las notas por progresiva, de menor a mayor', () => {
    render(<NotasDeCalle calleId={calleId()} />)
    const lista = screen.getByRole('list', { name: 'Notas por progresiva' })
    const titulos = within(lista).getAllByRole('heading').map((h) => h.textContent)
    expect(titulos).toEqual(['0+020', '0+040'])
    expect(within(screen.getByRole('list', { name: 'Notas en 0+020' })).getByText('Buzón')).toBeInTheDocument()
  })

  it('con una frase rápida y la progresiva, guarda la nota en dos toques', async () => {
    const usuario = userEvent.setup()
    render(<NotasDeCalle calleId={calleId()} />)
    expect(screen.getByRole('button', { name: 'Guardar nota' })).toBeDisabled()

    await usuario.type(screen.getByLabelText('Progresiva'), '0+060')
    const frases = screen.getByRole('group', { name: 'Frases rápidas' })
    await usuario.click(within(frases).getByRole('button', { name: 'Sardinel vaciado' }))
    await usuario.click(within(frases).getByRole('button', { name: 'Material acopiado' }))
    // Tocar dos veces la misma frase no la repite.
    await usuario.click(within(frases).getByRole('button', { name: 'Material acopiado' }))
    expect(screen.getByLabelText('Texto de la nota')).toHaveValue('Sardinel vaciado, Material acopiado')

    await usuario.click(screen.getByRole('button', { name: 'Guardar nota' }))
    const nueva = notas().find((n) => n.progresiva === 60)
    expect(nueva?.texto).toBe('Sardinel vaciado, Material acopiado')
    expect(nueva?.fecha).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(screen.getByText('Nota guardada en 0+060.')).toBeInTheDocument()
    expect(screen.getByLabelText('Texto de la nota')).toHaveValue('')
    expect(screen.getByRole('list', { name: 'Notas en 0+060' })).toBeInTheDocument()
  })

  it('las cinco frases rápidas están', () => {
    render(<NotasDeCalle calleId={calleId()} />)
    const frases = within(screen.getByRole('group', { name: 'Frases rápidas' })).getAllByRole('button')
    expect(frases.map((b) => b.textContent)).toEqual([
      'Buzón',
      'Sardinel vaciado',
      'Material acopiado',
      'Interferencia',
      'Agua empozada',
    ])
  })

  it('la progresiva llega llena con la fila seleccionada en la calle activa', () => {
    useAlmacen.setState({ calleActivaId: calleId(), seleccion: { clave: '80|p-eje', progresiva: 80 } })
    render(<NotasDeCalle calleId={calleId()} />)
    expect(screen.getByLabelText('Progresiva')).toHaveValue('0+080')
  })

  it('no guarda con una progresiva que no se entiende', async () => {
    const usuario = userEvent.setup()
    render(<NotasDeCalle calleId={calleId()} />)
    await usuario.type(screen.getByLabelText('Progresiva'), 'abc')
    await usuario.type(screen.getByLabelText('Texto de la nota'), 'Algo')
    expect(screen.getByLabelText('Progresiva')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('button', { name: 'Guardar nota' })).toBeDisabled()
  })

  it('toma la foto con la cámara trasera y la guarda reducida, aunque no haya texto', async () => {
    const usuario = userEvent.setup()
    render(<NotasDeCalle calleId={calleId()} />)
    const entrada = screen.getByLabelText('Tomar foto de la nota')
    expect(entrada).toHaveAttribute('accept', 'image/*')
    expect(entrada).toHaveAttribute('capture', 'environment')

    await usuario.type(screen.getByLabelText('Progresiva'), '20')
    await usuario.upload(entrada, new File(['x'], 'buzon.jpg', { type: 'image/jpeg' }))
    expect(await screen.findByAltText('Foto por guardar')).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Guardar nota' }))
    const conFoto = notas().find((n) => n.foto)
    expect(conFoto).toMatchObject({ progresiva: 20, texto: '', foto: 'data:image/jpeg;base64,REDUCIDA' })
    expect(screen.getByAltText('Foto de la nota en 0+020')).toBeInTheDocument()
  })

  it('quitar la foto antes de guardar', async () => {
    const usuario = userEvent.setup()
    render(<NotasDeCalle calleId={calleId()} />)
    await usuario.upload(screen.getByLabelText('Tomar foto de la nota'), new File(['x'], 'a.jpg', { type: 'image/jpeg' }))
    await usuario.click(await screen.findByRole('button', { name: 'Quitar foto' }))
    expect(screen.queryByAltText('Foto por guardar')).not.toBeInTheDocument()
  })

  it('borrar pide confirmación', async () => {
    const usuario = userEvent.setup()
    render(<NotasDeCalle calleId={calleId()} />)
    await usuario.click(screen.getByRole('button', { name: 'Borrar la nota «Buzón» en 0+020' }))
    await usuario.click(screen.getByRole('button', { name: 'No' }))
    expect(notas()).toHaveLength(2)

    await usuario.click(screen.getByRole('button', { name: 'Borrar la nota «Buzón» en 0+020' }))
    await usuario.click(screen.getByRole('button', { name: 'Sí, borrar' }))
    expect(notas().map((n) => n.id)).toEqual(['n-2'])
    expect(screen.queryByRole('list', { name: 'Notas en 0+020' })).not.toBeInTheDocument()
  })

  it('sin notas lo dice', () => {
    act(() => useAlmacen.getState().cargarProyecto(proyectoEjemplo()))
    render(<NotasDeCalle calleId={calleId()} />)
    expect(screen.getByText('Todavía no hay notas en esta calle.')).toBeInTheDocument()
  })

  it('después de guardar, la progresiva vuelve a seguir la fila seleccionada', async () => {
    const usuario = userEvent.setup()
    useAlmacen.setState({ calleActivaId: calleId(), seleccion: { clave: '20|p-eje', progresiva: 20 } })
    render(<NotasDeCalle calleId={calleId()} />)
    const progresiva = screen.getByLabelText('Progresiva')
    await usuario.clear(progresiva)
    await usuario.type(progresiva, '0+030')
    await usuario.click(screen.getByRole('button', { name: 'Buzón' }))
    await usuario.click(screen.getByRole('button', { name: 'Guardar nota' }))
    expect(notas().some((n) => n.progresiva === 30)).toBe(true)
    expect(progresiva).toHaveValue('0+020')
  })

  it('al seleccionar otra fila, la progresiva escrita a mano se deja y sigue la nueva', async () => {
    const usuario = userEvent.setup()
    useAlmacen.setState({ calleActivaId: calleId(), seleccion: { clave: '20|p-eje', progresiva: 20 } })
    render(<NotasDeCalle calleId={calleId()} />)
    const progresiva = screen.getByLabelText('Progresiva')
    await usuario.clear(progresiva)
    await usuario.type(progresiva, '0+030')
    act(() => useAlmacen.setState({ seleccion: { clave: '60|p-eje', progresiva: 60 } }))
    expect(progresiva).toHaveValue('0+060')
  })

  it('al cambiar de calle, el borrador de la otra calle no pasa', async () => {
    const usuario = userEvent.setup()
    const proyecto = obraConNotas()
    proyecto.calles.push({ ...proyecto.calles[0]!, id: 'calle-otra', nombre: 'Otra', notas: [], nivelaciones: [] })
    act(() => useAlmacen.getState().cargarProyecto(proyecto))
    const { rerender } = render(<NotasDeCalle calleId={calleId()} />)
    await usuario.type(screen.getByLabelText('Progresiva'), '0+010')
    await usuario.type(screen.getByLabelText('Texto de la nota'), 'De la primera')
    rerender(<NotasDeCalle calleId="calle-otra" />)
    expect(screen.getByLabelText('Texto de la nota')).toHaveValue('')
    expect(screen.getByLabelText('Progresiva')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Guardar nota' })).toBeDisabled()
  })

  it('si la foto no se puede leer, lo dice', async () => {
    const usuario = userEvent.setup()
    vi.mocked(reducirFoto).mockRejectedValueOnce(new Error('dañada'))
    render(<NotasDeCalle calleId={calleId()} />)
    await usuario.upload(screen.getByLabelText('Tomar foto de la nota'), new File(['x'], 'a.jpg', { type: 'image/jpeg' }))
    expect(await screen.findByText('No se pudo leer la foto. Pruebe tomarla otra vez.')).toBeInTheDocument()
    expect(screen.queryByAltText('Foto por guardar')).not.toBeInTheDocument()
  })

  it('con dos fotos seguidas gana la última elegida, aunque la primera tarde más en reducirse', async () => {
    const usuario = userEvent.setup()
    let soltarPrimera: (valor: string) => void = () => {}
    vi.mocked(reducirFoto)
      .mockImplementationOnce(() => new Promise<string>((resolver) => (soltarPrimera = resolver)))
      .mockResolvedValueOnce('data:image/jpeg;base64,SEGUNDA')
    render(<NotasDeCalle calleId={calleId()} />)
    const entrada = screen.getByLabelText('Tomar foto de la nota')
    await usuario.upload(entrada, new File(['1'], 'primera.jpg', { type: 'image/jpeg' }))
    await usuario.upload(entrada, new File(['2'], 'segunda.jpg', { type: 'image/jpeg' }))
    expect(await screen.findByAltText('Foto por guardar')).toHaveAttribute('src', 'data:image/jpeg;base64,SEGUNDA')
    await act(async () => soltarPrimera('data:image/jpeg;base64,PRIMERA'))
    expect(screen.getByAltText('Foto por guardar')).toHaveAttribute('src', 'data:image/jpeg;base64,SEGUNDA')
  })

  it('el campo de la foto se nombra con lo que se ve escrito', async () => {
    const usuario = userEvent.setup()
    render(<NotasDeCalle calleId={calleId()} />)
    expect(screen.getByText('Tomar foto')).toBeInTheDocument()
    await usuario.upload(screen.getByLabelText('Tomar foto de la nota'), new File(['x'], 'a.jpg', { type: 'image/jpeg' }))
    expect(await screen.findByLabelText('Cambiar foto de la nota')).toBeInTheDocument()
  })
})
