import { fireEvent, render, screen } from '@testing-library/react'
import type { NivelesEnPlano, Proyecto } from '@topo/core'
import { describe, expect, it, vi } from 'vitest'
import { proyectoVacio } from '../../estado/ejemplo'
import { analizarPlano } from '../../niveles/enPlano'
import { modeloDelAgua } from '../../niveles/modelo3d'
import ModeloAgua3D from './ModeloAgua3D'

const P: Proyecto = { ...proyectoVacio(), puestas: [{ id: 'r1', nombre: 'Puesta 1', cotaBM: 100, lecturaAtras: 1.5 }] }
const CAL = { metrosPorUnidad: 1, ejeY: 'arriba' as const }

function modelo(salida: boolean) {
  const p = (nombre: string, x: number, y: number, lectura: number, esSalida = false, nota?: string) =>
    ({ id: `p${nombre}`, nombre, x, y, puestaId: 'r1', lectura, salida: esSalida, ...(nota ? { nota } : {}) })
  const n: NivelesEnPlano = {
    puntos: [p('1', 0, 0, 1.2, false, 'Esquina Lima'), p('2', 20, 0, 1.25), p('3', 0, 20, 1.3), p('4', 20, 20, 1.35), p('5', 10, 10, 1.4, salida, 'buzón')],
    pendienteMinimaPct: 0.5,
  }
  return modeloDelAgua(n, analizarPlano(n, CAL, P), CAL)!
}

describe('modelo 3D del agua', () => {
  it('dibuja las caras, el camino del agua y las etiquetas; dice dónde se empoza', () => {
    const { container } = render(<ModeloAgua3D modelo={modelo(false)} elegidoId={null} alElegir={() => {}} />)
    const svg = screen.getByRole('img', { name: /Modelo 3D de 5 puntos: el agua de 0 llega a una salida, de 0 al borde, de 5 se empoza/ })
    expect(svg.querySelectorAll('polygon[data-cara]')).toHaveLength(4)
    expect(container.querySelectorAll('polyline.camino-agua')).toHaveLength(4)
    expect(screen.getByText(/1 · Esquina Lima/)).toBeInTheDocument()
    expect(screen.getByText(/✗ 5 · buzón/)).toBeInTheDocument()
    expect(screen.getByText(/20.0 cm/)).toBeInTheDocument()
  })

  it('con el centro como salida, el agua llega; tocar un punto lo elige; se gira y se exagera', () => {
    const alElegir = vi.fn()
    render(<ModeloAgua3D modelo={modelo(true)} elegidoId={null} alElegir={alElegir} />)
    const svg = screen.getByRole('img', { name: /el agua de 5 llega a una salida/ })
    fireEvent.click(screen.getByText(/1 · Esquina Lima/).closest('g')!)
    expect(alElegir).toHaveBeenCalledWith('p1')
    const antes = svg.querySelector('polygon[data-cara]')!.getAttribute('points')
    fireEvent.pointerDown(svg, { clientX: 0, clientY: 0, pointerId: 1 })
    fireEvent.pointerMove(svg, { clientX: 60, clientY: 10, pointerId: 1 })
    fireEvent.pointerUp(svg, { pointerId: 1 })
    expect(svg.querySelector('polygon[data-cara]')!.getAttribute('points')).not.toBe(antes)
    fireEvent.change(screen.getByLabelText('Exageración de la altura'), { target: { value: '5' } })
    expect(screen.getByText('×5')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Animar el agua' }))
    expect(svg.querySelectorAll('polyline.camino-agua')).toHaveLength(0)
  })
})
