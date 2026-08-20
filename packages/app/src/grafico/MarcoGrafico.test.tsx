import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import MarcoGrafico from './MarcoGrafico'

describe('MarcoGrafico', () => {
  it('dibuja los ejes y entrega escalas utilizables a las series', () => {
    render(
      <MarcoGrafico
        valoresX={[0, 10]}
        valoresY={[3244.5, 3245.1]}
        rotuloX="distancia al eje (m)"
        formatearX={(v) => v.toFixed(1)}
        etiqueta="Gráfico de prueba"
      >
        {({ x, y }) => <circle data-testid="punto" cx={x(5)} cy={y(3244.8)} r={3} />}
      </MarcoGrafico>,
    )

    expect(screen.getByRole('img', { name: 'Gráfico de prueba' })).toBeInTheDocument()
    expect(screen.getByText('distancia al eje (m)')).toBeInTheDocument()

    const punto = screen.getByTestId('punto')
    expect(Number(punto.getAttribute('cx'))).toBeGreaterThan(0)
    expect(Number(punto.getAttribute('cy'))).toBeGreaterThan(0)
  })

  it('rotula el eje vertical con cotas de tres decimales', () => {
    render(
      <MarcoGrafico
        valoresX={[0, 10]}
        valoresY={[3244.5, 3245.1]}
        rotuloX="x"
        formatearX={(v) => String(v)}
        etiqueta="Gráfico"
      >
        {() => null}
      </MarcoGrafico>,
    )

    // El dominio de prueba con el margen y la cantidad de marcas reales de hoy
    // produce más de una marca que empieza por "3244." (p. ej. 3244.500 y
    // 3244.750): getByText exigiría unicidad y fallaría por eso, no por un
    // defecto del marco. getAllByText confirma que el formato de 3 decimales
    // aparece sin forzar esa unicidad.
    expect(screen.getAllByText(/^3244\.\d{3}$/).length).toBeGreaterThan(0)
  })
})
