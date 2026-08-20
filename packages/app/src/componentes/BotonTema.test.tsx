import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import BotonTema from './BotonTema'

describe('BotonTema', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('arranca siguiendo al sistema', () => {
    render(<BotonTema />)
    expect(screen.getByRole('button', { name: /tema/i })).toHaveTextContent('Sistema')
  })

  it('pasa a oscuro y aplica la clase al documento', async () => {
    const usuario = userEvent.setup()
    render(<BotonTema />)
    await usuario.click(screen.getByRole('button', { name: /tema/i }))
    expect(document.documentElement).toHaveClass('dark')
    expect(localStorage.getItem('topo:tema')).toBe('oscuro')
  })

  it('vuelve a claro en el tercer clic', async () => {
    const usuario = userEvent.setup()
    render(<BotonTema />)
    const boton = screen.getByRole('button', { name: /tema/i })
    await usuario.click(boton)
    await usuario.click(boton)
    expect(document.documentElement).not.toHaveClass('dark')
    expect(localStorage.getItem('topo:tema')).toBe('claro')
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

    render(<BotonTema />)

    oscuroDelSistema = true
    for (const avisar of oyentes) {
      act(() => avisar())
    }
    expect(document.documentElement).toHaveClass('dark')

    // Al elegir un tema explícito, el equipo deja de mandar.
    await usuario.click(screen.getByRole('button', { name: /tema/i })) // Sistema -> Oscuro
    await usuario.click(screen.getByRole('button', { name: /tema/i })) // Oscuro -> Claro

    expect(oyentes).toHaveLength(0)

    oscuroDelSistema = true
    for (const avisar of oyentes) {
      act(() => avisar())
    }
    expect(document.documentElement).not.toHaveClass('dark')
  })

  it('ignora un valor guardado que no sea un tema conocido', () => {
    localStorage.setItem('topo:tema', 'lo-que-sea')
    render(<BotonTema />)

    expect(screen.getByRole('button', { name: /tema/i })).toHaveTextContent('Sistema')
  })
})
