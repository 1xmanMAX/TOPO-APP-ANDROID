import { render, screen } from '@testing-library/react'
import type { Rasante } from '@topo/core'
import { describe, expect, it } from 'vitest'
import CorteTipo from './CorteTipo'

/**
 * Dos tramos por lado (calzada + sardinel), con offsets distintos a cada
 * lado para que ningún par de quiebres —de lados opuestos— quede a la misma
 * distancia del eje. Si compartieran offset, compartirían también el nombre
 * accesible (que no dice de qué lado es) y `getByLabelText` fallaría por
 * encontrar dos.
 */
function rasanteEjemplo(): Rasante {
  return {
    progresivaArranque: 0,
    cotaArranque: 100,
    pendienteLongitudinal: 0,
    simetrica: false,
    tramos: [
      { nombre: 'Calzada derecha', hastaOffset: 4.2, tipo: 'pendiente', valor: 2.0 },
      { nombre: 'Sardinel derecho', hastaOffset: 4.4, tipo: 'salto', valor: -0.15 },
    ],
    tramosIzquierda: [
      { nombre: 'Calzada izquierda', hastaOffset: 4.5, tipo: 'pendiente', valor: 2.0 },
      { nombre: 'Sardinel izquierdo', hastaOffset: 4.7, tipo: 'salto', valor: -0.15 },
    ],
  }
}

describe('CorteTipo', () => {
  it('dibuja un punto por cada quiebre de la sección, a los dos lados', () => {
    render(<CorteTipo rasante={rasanteEjemplo()} />)

    // eje + 3 quiebres por lado
    expect(screen.getAllByLabelText(/^Quiebre a /)).toHaveLength(7)
  })

  it('el nombre de cada quiebre dice a qué distancia y a qué cota queda', () => {
    render(<CorteTipo rasante={rasanteEjemplo()} />)

    expect(screen.getByLabelText('Quiebre a 4.40 m del eje: sube 0.066 m sobre el eje')).toBeInTheDocument()
    expect(screen.getByLabelText('Quiebre a 4.20 m del eje: baja 0.084 m bajo el eje')).toBeInTheDocument()
  })
})
