import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('muestra el título de la herramienta', () => {
    render(<App />)
    expect(screen.getByText(/Nivelación por progresivas/i)).toBeInTheDocument()
  })
})
