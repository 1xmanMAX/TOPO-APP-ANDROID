import { fireEvent, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { PlanoVectorial } from '../../planos/dxf'
import { leerDecimal, PanelCapas } from './Paneles'

describe('leerDecimal', () => {
  it('lee coma o punto decimal, el menos tipográfico y el % del final', () => {
    expect(leerDecimal('3244,5')).toBe(3244.5)
    expect(leerDecimal(' 3244.5 ')).toBe(3244.5)
    expect(leerDecimal('−6')).toBe(-6)
    expect(leerDecimal('5%')).toBe(5)
    expect(leerDecimal('-2.5 %')).toBe(-2.5)
    expect(leerDecimal('+3')).toBe(3)
  })

  it('vacío no es cero, y lo ilegible tampoco', () => {
    expect(leerDecimal('')).toBeNull()
    expect(leerDecimal('   ')).toBeNull()
    expect(leerDecimal('6,5,')).toBeNull()
    expect(leerDecimal('32a0')).toBeNull()
    expect(leerDecimal('%')).toBeNull()
  })
})

describe('PanelCapas', () => {
  const vectorial: PlanoVectorial = {
    capas: [
      { nombre: 'EJE_VIA', color: '#ff0000', visible: true },
      { nombre: 'SARDINEL', color: '#00ff00', visible: true },
      { nombre: 'CURVAS_NIVEL', color: '#c9a97a', visible: true },
    ],
    polilineas: [],
    textos: [],
    limites: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    ignoradas: {},
    ignoradasDetalle: [],
  }

  it('va plegado y su resumen dice cuántas capas se ven sin abrirlo', () => {
    render(createElement(PanelCapas, { vectorial, ocultas: new Set(['CURVAS_NIVEL']), alCambiar: () => {} }))
    const plegable = screen.getByText('Capas del plano', { selector: 'summary span' }).closest('details')!
    expect(plegable).not.toHaveAttribute('open')
    expect(plegable.querySelector('summary')).toHaveTextContent('Capas del plano2 visibles de 3')
  })

  it('cada casilla es una capa, con su nombre, y desmarcarla la oculta', () => {
    const alCambiar = vi.fn()
    render(createElement(PanelCapas, { vectorial, ocultas: new Set<string>(), alCambiar }))
    const grupo = screen.getByRole('group', { name: 'Capas del plano' })
    expect(grupo.querySelector('ul')).toHaveClass('grid-cols-2')
    fireEvent.click(screen.getByRole('checkbox', { name: 'SARDINEL' }))
    expect(alCambiar).toHaveBeenCalledWith('SARDINEL', false)
  })
})
