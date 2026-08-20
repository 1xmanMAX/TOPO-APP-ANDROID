import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('muestra la navegación principal', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: 'Libreta' })).toBeInTheDocument()
  })
})
