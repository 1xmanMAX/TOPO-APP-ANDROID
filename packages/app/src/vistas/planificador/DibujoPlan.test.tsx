import { planificarConControles } from '@topo/core'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import DibujoPlan, { alturaRotulo, anclaEje } from './DibujoPlan'
import type { Vertice } from './perfilDeLaCalle'
import { recorridoDelPlan } from './recorrido'

describe('rótulos del dibujo del plan', () => {
  it('una lectura corta (punto casi a la altura de la visual) se rotula encima, no sobre el PC', () => {
    // Visual en y = 100; el PC 8 px más abajo: el rótulo bajo la visual lo pisaría.
    expect(alturaRotulo(100, 108)).toBeLessThan(100)
  })

  it('una lectura larga se rotula bajo la visual, junto a su línea', () => {
    expect(alturaRotulo(100, 180)).toBeGreaterThan(100)
  })

  it('las progresivas de los extremos del eje no se salen del dibujo', () => {
    expect(anclaEje(60, 60, 706)).toBe('start')
    expect(anclaEje(706, 60, 706)).toBe('end')
    expect(anclaEje(380, 60, 706)).toBe('middle')
  })
})

// La pista empinada de la obra simulada (Psje. Las Lomas, +7.38 %).
const EMPINADA: Vertice[] = [
  { progresiva: 0, cota: 3244 },
  { progresiva: 120, cota: 3252.856 },
]

function dibujar(perfil: Vertice[]) {
  const plan = planificarConControles(perfil)
  const recorrido = recorridoDelPlan(plan)
  const { container } = render(<DibujoPlan perfil={perfil} plan={plan} recorrido={recorrido} />)
  return { svg: container.querySelector('svg')!, recorrido }
}

const num = (el: Element, atributo: string) => Number(el.getAttribute(atributo))

/**
 * Montado de verdad: si alguien vuelve a escribir y={hi + 15} o
 * textAnchor="middle" en el JSX, estas pruebas lo ven aunque las funciones
 * de arriba sigan bien.
 */
describe('DibujoPlan montado', () => {
  it('en una subida empinada, el rótulo de la lectura de adelante va sobre la visual cuando el PC queda cerca', () => {
    const { svg, recorrido } = dibujar(EMPINADA)
    const ida = recorrido.pasos.filter((p) => p.sentido === 'ida')
    // Cada estación es un <g> con su visual punteada.
    const estaciones = [...svg.querySelectorAll('g')].filter((g) => g.querySelector(':scope > line[stroke-dasharray]'))
    expect(estaciones).toHaveLength(ida.length)

    let cercanos = 0
    estaciones.forEach((g, i) => {
      const visual = g.querySelector(':scope > line[stroke-dasharray]')!
      const hi = num(visual, 'y1')
      // Las verticales de la mira, atrás y adelante: del suelo (y1) a la visual (y2).
      const miras = [...g.querySelectorAll(':scope > line:not([stroke-dasharray])')].filter(
        (l) => l.getAttribute('x1') === l.getAttribute('x2') && num(l, 'y2') === hi,
      )
      expect(miras).toHaveLength(2)
      const ySueloAdelante = num(miras[1]!, 'y1')
      const rotulo = [...g.querySelectorAll('text')].find((t) => t.getAttribute('text-anchor') === 'end')!
      expect(rotulo.textContent).toBe(ida[i]!.estacion.adelante.lectura.toFixed(2))
      if (ySueloAdelante - hi < 22) {
        cercanos++
        expect(num(rotulo, 'y')).toBeLessThan(hi)
      } else {
        expect(num(rotulo, 'y')).toBeGreaterThan(hi)
      }
    })
    // El caso tiene que traer PC pegados a la visual: si no, la prueba no prueba nada.
    expect(cercanos).toBeGreaterThan(0)
  })

  it('la última progresiva del eje se alinea a la derecha y la primera a la izquierda', () => {
    const { svg } = dibujar(EMPINADA)
    const eje = [...svg.querySelectorAll('text')]
      .filter((t) => /^\d+\+\d{3}/.test(t.textContent ?? ''))
      .sort((a, b) => num(a, 'x') - num(b, 'x'))
    expect(eje.length).toBeGreaterThan(2)
    expect(eje[0]!.textContent).toBe('0+000')
    expect(eje[0]!.getAttribute('text-anchor')).toBe('start')
    expect(eje.at(-1)!.textContent).toBe('0+120')
    expect(eje.at(-1)!.getAttribute('text-anchor')).toBe('end')
  })
})
