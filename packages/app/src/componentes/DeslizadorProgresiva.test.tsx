import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DeslizadorProgresiva from './DeslizadorProgresiva'

const PROGRESIVAS = [0, 20, 40]

afterEach(() => {
  vi.useRealTimers()
})

describe('DeslizadorProgresiva', () => {
  it('avanza a la progresiva siguiente mientras reproduce', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const alCambiar = vi.fn()
    render(<DeslizadorProgresiva progresivas={PROGRESIVAS} valor={0} alCambiar={alCambiar} />)

    await usuario.click(screen.getByRole('button', { name: /reproducir recorrido/i }))
    act(() => {
      vi.advanceTimersByTime(700)
    })

    expect(alCambiar).toHaveBeenCalledWith(20)
  })

  it('da la vuelta al llegar al final', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const alCambiar = vi.fn()
    render(<DeslizadorProgresiva progresivas={PROGRESIVAS} valor={40} alCambiar={alCambiar} />)

    await usuario.click(screen.getByRole('button', { name: /reproducir recorrido/i }))
    act(() => {
      vi.advanceTimersByTime(700)
    })

    expect(alCambiar).toHaveBeenCalledWith(0)
  })

  it('deja de avanzar al detener', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const alCambiar = vi.fn()
    render(<DeslizadorProgresiva progresivas={PROGRESIVAS} valor={0} alCambiar={alCambiar} />)

    await usuario.click(screen.getByRole('button', { name: /reproducir recorrido/i }))
    await usuario.click(screen.getByRole('button', { name: /detener recorrido/i }))
    alCambiar.mockClear()
    act(() => {
      vi.advanceTimersByTime(2100)
    })

    expect(alCambiar).not.toHaveBeenCalled()
  })

  it('no sigue avanzando después de desaparecer de la pantalla', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const alCambiar = vi.fn()
    const { unmount } = render(
      <DeslizadorProgresiva progresivas={PROGRESIVAS} valor={0} alCambiar={alCambiar} />,
    )

    await usuario.click(screen.getByRole('button', { name: /reproducir recorrido/i }))
    unmount()
    alCambiar.mockClear()
    act(() => {
      vi.advanceTimersByTime(2100)
    })

    expect(alCambiar).not.toHaveBeenCalled()
  })

  it('mueve la progresiva al arrastrar el control', () => {
    const alCambiar = vi.fn()
    render(<DeslizadorProgresiva progresivas={PROGRESIVAS} valor={0} alCambiar={alCambiar} />)

    const control = screen.getByLabelText('Progresiva')
    fireEvent.change(control, { target: { value: '1' } })

    expect(alCambiar).toHaveBeenCalledWith(20)
  })
})
