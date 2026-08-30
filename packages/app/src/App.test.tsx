import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('muestra la navegación principal', async () => {
    render(<App />)

    expect(await screen.findByRole('button', { name: 'Libreta' })).toBeInTheDocument()
  })

  it('se llega a subir datos desde la barra', async () => {
    render(<App />)

    await userEvent.click(await screen.findByRole('button', { name: 'Subir datos' }))

    expect(screen.getByLabelText(/archivo de la hoja/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/pegar/i)).toBeInTheDocument()
  })

  it('se llega a la sección de la calle desde la barra', async () => {
    // Sin esta pestaña la pantalla existe y nadie puede abrirla, y es donde se
    // declaran las palabras con las que se lee la hoja.
    render(<App />)

    await userEvent.click(await screen.findByRole('button', { name: 'Sección' }))

    expect(screen.getByRole('heading', { name: /sección de la calle/i })).toBeInTheDocument()
  })
})
