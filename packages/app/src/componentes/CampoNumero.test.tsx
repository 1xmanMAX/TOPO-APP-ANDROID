import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import CampoNumero from './CampoNumero'

/**
 * Envoltorio de control real: como lo usan BarraCierre, EditorRasante,
 * PanelEstacion y VistaProyecto, donde `valor` vive en el padre y solo
 * cambia cuando `alCambiar` lo actualiza. Sin esto, un campo con `valor`
 * fijo no puede demostrar que un valor válido de verdad se propaga.
 */
function CampoControlado({ inicial, decimales }: { inicial: number; decimales?: number }) {
  const [valor, setValor] = useState(inicial)
  return (
    <CampoNumero ariaLabel="campo de prueba" valor={valor} decimales={decimales} alCambiar={setValor} />
  )
}

describe('CampoNumero', () => {
  it('muestra el valor inicial formateado con los decimales pedidos', () => {
    render(<CampoNumero ariaLabel="cota" valor={10.5} decimales={2} alCambiar={() => {}} />)
    expect(screen.getByLabelText('cota')).toHaveValue('10.50')
  })

  it('al vaciar el campo y salir, restaura el valor guardado en vez de dejarlo en blanco', async () => {
    const usuario = userEvent.setup()
    const alCambiar = vi.fn()
    render(<CampoNumero ariaLabel="cota" valor={12.345} alCambiar={alCambiar} />)

    const campo = screen.getByLabelText('cota')
    await usuario.clear(campo)
    expect(campo).toHaveValue('')
    await usuario.tab() // dispara blur

    expect(campo).toHaveValue('12.345')
    // Vaciar no es un valor válido: nunca debió llegar al modelo.
    expect(alCambiar).not.toHaveBeenCalled()
  })

  it('escribir un valor válido y salir lo propaga y lo conserva formateado', async () => {
    const usuario = userEvent.setup()
    render(<CampoControlado inicial={12.345} />)

    const campo = screen.getByLabelText('campo de prueba')
    await usuario.clear(campo)
    await usuario.type(campo, '9.5')
    await usuario.tab()

    expect(campo).toHaveValue('9.500')
  })

  it('acepta la coma como separador decimal', async () => {
    const usuario = userEvent.setup()
    const alCambiar = vi.fn()
    render(<CampoNumero ariaLabel="cota" valor={0} alCambiar={alCambiar} />)

    await usuario.clear(screen.getByLabelText('cota'))
    await usuario.type(screen.getByLabelText('cota'), '3,25')

    expect(alCambiar).toHaveBeenCalledWith(3.25)
  })

  it('mientras se escribe texto no numérico, no llama a alCambiar y no revienta', async () => {
    const usuario = userEvent.setup()
    const alCambiar = vi.fn()
    render(<CampoNumero ariaLabel="cota" valor={1.5} alCambiar={alCambiar} />)

    const campo = screen.getByLabelText('cota')
    await usuario.clear(campo)
    await usuario.type(campo, 'abc')

    expect(alCambiar).not.toHaveBeenCalled()
    // Al salir, como nunca hubo un número válido, vuelve el valor guardado.
    await usuario.tab()
    expect(campo).toHaveValue('1.500')
  })

  it('un signo negativo a medio escribir no llama a alCambiar hasta completar un número', async () => {
    const usuario = userEvent.setup()
    const alCambiar = vi.fn()
    render(<CampoNumero ariaLabel="cota" valor={0} alCambiar={alCambiar} />)

    const campo = screen.getByLabelText('cota')
    await usuario.clear(campo)
    await usuario.type(campo, '-')
    expect(alCambiar).not.toHaveBeenCalled()

    await usuario.type(campo, '5.2')
    expect(alCambiar).toHaveBeenCalledWith(-5.2)
  })

  it('en modo solo lectura, no deja escribir ni llama a alCambiar', () => {
    const alCambiar = vi.fn()
    render(<CampoNumero ariaLabel="cota" valor={2.5} alCambiar={alCambiar} soloLectura />)

    const campo = screen.getByLabelText('cota')
    expect(campo).toHaveAttribute('readOnly')
    expect(campo).toHaveValue('2.500')
  })

  it('muestra el sufijo junto al campo', () => {
    render(<CampoNumero ariaLabel="cota" valor={1} alCambiar={() => {}} sufijo="m" />)
    expect(screen.getByText('m')).toBeInTheDocument()
  })

  it('dispara alPresionarEnter al presionar Enter', async () => {
    const usuario = userEvent.setup()
    const alPresionarEnter = vi.fn()
    render(
      <CampoNumero
        ariaLabel="cota"
        valor={1}
        alCambiar={() => {}}
        alPresionarEnter={alPresionarEnter}
      />,
    )

    await usuario.type(screen.getByLabelText('cota'), '{Enter}')
    expect(alPresionarEnter).toHaveBeenCalled()
  })

  it('usa la etiqueta como texto accesible si no se da un ariaLabel explícito', () => {
    render(<CampoNumero etiqueta="Cota" valor={1} alCambiar={() => {}} />)
    expect(screen.getByLabelText('Cota')).toBeInTheDocument()
  })
})
