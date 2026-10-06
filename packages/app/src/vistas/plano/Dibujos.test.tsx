import { render } from '@testing-library/react'
import { seccionDeFabrica, type PistaCalibrada } from '@topo/core'
import { describe, expect, it } from 'vitest'
import { datosDePista, rasanteDeCroquis } from './datosPista'
import { DibujoPista } from './Dibujos'

/**
 * Las estacas van a un costado de la pista y las pendientes y el nombre al
 * otro, para que no se pisen. Con una pista recta hacia +X (Y del plano
 * hacia arriba, la del SVG hacia abajo), la línea queda en y = 0 del SVG: lo
 * que va a la derecha del avance cae debajo (y > 0) y lo de la izquierda,
 * encima (y < 0).
 */
const pista: PistaCalibrada = {
  id: 'p',
  nombre: 'PSJE. RECTO',
  polilinea: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
  calibracion: { metrosPorUnidad: 1, ejeY: 'arriba' },
  progresivaInicio: 0,
}

function dibujar() {
  const calle = { id: 'c', nombre: 'Recta', seccion: seccionDeFabrica(), nivelaciones: [], rasante: rasanteDeCroquis(3000, -2, null) }
  const datos = datosDePista(pista, [], calle)
  const { container } = render(
    <svg>
      <DibujoPista id="p" nombre={pista.nombre} polilinea={pista.polilinea} datos={datos} elegida upp={1} />
    </svg>,
  )
  const textos = [...container.querySelectorAll('text')]
  const y = (contenido: string | RegExp) => {
    const t = textos.find((e) => (typeof contenido === 'string' ? e.textContent === contenido : contenido.test(e.textContent ?? '')))
    expect(t, `no se dibujó «${contenido}»`).toBeTruthy()
    return Number(t!.getAttribute('y'))
  }
  return { y }
}

describe('rótulos de la pista a costados opuestos', () => {
  it('las estacas van a la derecha del avance (debajo de la línea)', () => {
    const { y } = dibujar()
    for (const estaca of ['0+000', '0+020', '0+040', '0+060', '0+080', '0+100']) expect(y(estaca)).toBeGreaterThan(0)
  })

  it('la pendiente y el nombre van a la izquierda (encima de la línea)', () => {
    const { y } = dibujar()
    expect(y('-2.00 %')).toBeLessThan(0)
    expect(y('PSJE. RECTO')).toBeLessThan(0)
  })
})
