import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import RedDeSeguridad from './RedDeSeguridad'

function Revienta(): never {
  throw new Error('fallo de prueba')
}

describe('RedDeSeguridad', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('si algo revienta, lo dice con ✗ y deja guardar el proyecto antes de recargar', () => {
    // React y la propia red escriben el fallo en la consola: aquí se espera.
    vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <RedDeSeguridad>
        <Revienta />
      </RedDeSeguridad>,
    )

    expect(screen.getByRole('heading', { name: /La aplicación se detuvo/ })).toHaveTextContent('✗')
    expect(screen.getByText('fallo de prueba')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar el proyecto en un archivo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Recargar' })).toBeInTheDocument()
  })
})
