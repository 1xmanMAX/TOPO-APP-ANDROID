import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('muestra la navegación principal', async () => {
    render(<App />)

    expect(await screen.findByRole('button', { name: 'Libreta' })).toBeInTheDocument()
  })
})
