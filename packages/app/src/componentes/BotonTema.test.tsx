import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import BotonTema from './BotonTema'

describe('BotonTema', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')
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
})
