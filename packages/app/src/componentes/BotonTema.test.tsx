import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BotonTema, { InterruptorSol } from './BotonTema'
import { useTema } from './tema'

/** El tema vive en un almacén: cada prueba lo vuelve a leer de lo guardado. */
function recargar() {
  act(() => useTema.getState().cargar())
}

describe('BotonTema', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark', 'sol')
    recargar()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
    recargar()
  })

  it('arranca siguiendo al sistema', () => {
    render(<BotonTema />)
    expect(screen.getByRole('button', { name: 'Cambiar tema' })).toHaveTextContent('Tema: Sistema')
  })

  it('pasa a oscuro y aplica la clase al documento', async () => {
    const usuario = userEvent.setup()
    render(<BotonTema />)
    await usuario.click(screen.getByRole('button', { name: 'Cambiar tema' }))
    expect(document.documentElement).toHaveClass('dark')
    expect(localStorage.getItem('topo:tema')).toBe('oscuro')
  })

  it('vuelve a claro en el segundo clic y a sistema en el tercero', async () => {
    const usuario = userEvent.setup()
    render(<BotonTema />)
    const boton = screen.getByRole('button', { name: 'Cambiar tema' })
    await usuario.click(boton)
    await usuario.click(boton)
    expect(document.documentElement).not.toHaveClass('dark')
    expect(localStorage.getItem('topo:tema')).toBe('claro')
    await usuario.click(boton)
    expect(boton).toHaveTextContent('Sistema')
    expect(localStorage.getItem('topo:tema')).toBeNull()
  })

  it('en modo Sistema sigue el cambio de tema del equipo, y deja de seguirlo al elegir uno', async () => {
    const usuario = userEvent.setup()
    let oyentes: Array<() => void> = []
    let oscuroDelSistema = false

    vi.stubGlobal('matchMedia', () => ({
      get matches() {
        return oscuroDelSistema
      },
      addEventListener: (_evento: string, oyente: () => void) => oyentes.push(oyente),
      removeEventListener: (_evento: string, oyente: () => void) => {
        oyentes = oyentes.filter((registrado) => registrado !== oyente)
      },
    }))
    recargar()

    render(<BotonTema />)

    oscuroDelSistema = true
    for (const avisar of oyentes) {
      act(() => avisar())
    }
    expect(document.documentElement).toHaveClass('dark')

    // Al elegir un tema explícito, el equipo deja de mandar.
    await usuario.click(screen.getByRole('button', { name: 'Cambiar tema' })) // Sistema -> Oscuro
    await usuario.click(screen.getByRole('button', { name: 'Cambiar tema' })) // Oscuro -> Claro

    expect(oyentes).toHaveLength(0)
    expect(document.documentElement).not.toHaveClass('dark')
  })

  it('ignora un valor guardado que no sea un tema conocido', () => {
    localStorage.setItem('topo:tema', 'lo-que-sea')
    recargar()
    render(<BotonTema />)

    expect(screen.getByRole('button', { name: 'Cambiar tema' })).toHaveTextContent('Sistema')
  })

  it('mide al menos 44 px, para el dedo con guante', () => {
    render(<BotonTema />)
    expect(screen.getByRole('button', { name: 'Cambiar tema' })).toHaveClass('min-h-11', 'min-w-11')
  })
})

describe('InterruptorSol', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark', 'sol')
    recargar()
  })

  afterEach(() => {
    localStorage.clear()
    recargar()
  })

  it('un toque enciende el sol: alto contraste sobre el oscuro, y se recuerda', async () => {
    const usuario = userEvent.setup()
    render(<InterruptorSol />)
    const sol = screen.getByRole('button', { name: 'Modo sol' })
    expect(sol).toHaveAttribute('aria-pressed', 'false')

    await usuario.click(sol)

    expect(sol).toHaveAttribute('aria-pressed', 'true')
    expect(document.documentElement).toHaveClass('dark')
    expect(document.documentElement).toHaveClass('sol')
    expect(localStorage.getItem('topo:tema')).toBe('sol')
  })

  it('al apagarlo vuelve al tema de antes, no a Sistema', async () => {
    const usuario = userEvent.setup()
    render(
      <>
        <BotonTema />
        <InterruptorSol />
      </>,
    )
    await usuario.click(screen.getByRole('button', { name: 'Cambiar tema' })) // Oscuro
    await usuario.click(screen.getByRole('button', { name: 'Cambiar tema' })) // Claro
    await usuario.click(screen.getByRole('button', { name: 'Modo sol' }))
    expect(document.documentElement).toHaveClass('sol')

    await usuario.click(screen.getByRole('button', { name: 'Modo sol' }))
    expect(document.documentElement).not.toHaveClass('sol')
    expect(document.documentElement).not.toHaveClass('dark')
    expect(localStorage.getItem('topo:tema')).toBe('claro')
  })

  it('el sol guardado se aplica al arrancar y la base se recuerda aparte', () => {
    localStorage.setItem('topo:tema', 'sol')
    localStorage.setItem('topo:tema-base', 'oscuro')
    recargar()
    render(
      <>
        <BotonTema />
        <InterruptorSol />
      </>,
    )
    expect(document.documentElement).toHaveClass('sol')
    expect(screen.getByRole('button', { name: 'Modo sol' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Cambiar tema' })).toHaveTextContent('Oscuro')
  })

  it('cambiar el tema de base apaga el sol', async () => {
    localStorage.setItem('topo:tema', 'sol')
    recargar()
    const usuario = userEvent.setup()
    render(
      <>
        <BotonTema />
        <InterruptorSol />
      </>,
    )
    await usuario.click(screen.getByRole('button', { name: 'Cambiar tema' }))
    expect(document.documentElement).not.toHaveClass('sol')
    expect(screen.getByRole('button', { name: 'Modo sol' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('mide al menos 44 px', () => {
    render(<InterruptorSol />)
    expect(screen.getByRole('button', { name: 'Modo sol' })).toHaveClass('h-11', 'min-w-11')
  })
})
