import { render, screen } from '@testing-library/react'
import type { PuntoSeccion } from '@topo/core'
import { describe, expect, it } from 'vitest'
import DibujoSeccion from './DibujoSeccion'

/** Ancho del lienzo y aire lateral, los mismos que usa el dibujo. */
const ANCHO = 720
const MARGEN = 48
const BARRA_MAXIMA = 140

function punto(id: string, nombre: string, distancia: number, palabras: string[] = []): PuntoSeccion {
  return { id, nombre, rol: 'otro', distancia, distanciaDeFabrica: false, palabras }
}

/** Como llegan del almacén: ya ordenados de izquierda a derecha. */
function seccionDe(...distancias: number[]): PuntoSeccion[] {
  return distancias.map((d, i) => punto(`p-${i}`, `Punto ${i}`, d, [`P${i}`]))
}

function circulos(contenedor: HTMLElement): SVGCircleElement[] {
  return [...contenedor.querySelectorAll('circle')]
}

function equis(circulo: SVGCircleElement): number {
  return Number(circulo.getAttribute('cx'))
}

/**
 * La línea horizontal de la barra de escala: la única tumbada al pie del
 * lienzo (la de la calzada va a media altura y los topes son verticales).
 */
function barraDeEscala(contenedor: HTMLElement): SVGLineElement {
  const lineas = [...contenedor.querySelectorAll('line')]
  const barra = lineas.find(
    (l) => l.getAttribute('y1') === l.getAttribute('y2') && Number(l.getAttribute('y1')) > 160,
  )
  if (!barra) throw new Error('El dibujo no trae barra de escala')
  return barra
}

function largoDeBarra(contenedor: HTMLElement): number {
  const barra = barraDeEscala(contenedor)
  return Number(barra.getAttribute('x2')) - Number(barra.getAttribute('x1'))
}

describe('DibujoSeccion', () => {
  it('pone el eje en el centro y el punto más lejano justo en el margen', () => {
    const { container } = render(<DibujoSeccion puntos={seccionDe(-5.15, 0, 5.15)} />)

    const [izquierda, eje, derecha] = circulos(container)
    expect(equis(izquierda!)).toBe(MARGEN)
    expect(equis(eje!)).toBe(ANCHO / 2)
    expect(equis(derecha!)).toBe(ANCHO - MARGEN)
  })

  it('la escala se estira a la sección que haya, ancha o estrecha', () => {
    // Una calle de 80 m y otra de 2 m ocupan el mismo lienzo: lo que cambia
    // es cuántos metros vale cada píxel, no dónde caen los extremos.
    const ancha = render(<DibujoSeccion puntos={seccionDe(-40, 0, 40)} />)
    expect(equis(circulos(ancha.container)[0]!)).toBe(MARGEN)
    expect(equis(circulos(ancha.container)[2]!)).toBe(ANCHO - MARGEN)

    const estrecha = render(<DibujoSeccion puntos={seccionDe(-1.2, 0, 1.2)} />)
    expect(equis(circulos(estrecha.container)[0]!)).toBe(MARGEN)
    expect(equis(circulos(estrecha.container)[2]!)).toBe(ANCHO - MARGEN)
  })

  it('un punto a media distancia cae a media distancia', () => {
    const { container } = render(<DibujoSeccion puntos={seccionDe(-4, -2, 0, 4)} />)

    const [lejos, cerca, eje] = circulos(container)
    // La mitad de lejos del eje, la mitad de píxeles.
    expect(ANCHO / 2 - equis(cerca!)).toBeCloseTo((ANCHO / 2 - equis(lejos!)) / 2, 6)
    expect(equis(eje!)).toBe(ANCHO / 2)
  })

  it('la barra de escala nunca se sale de su máximo, ni en la sección más estrecha', () => {
    // La sección de un solo punto es la más estrecha que el dibujo admite, y
    // es la que apura la barra: con un paso demasiado grande se saldría del
    // hueco que tiene reservado.
    for (const puntos of [seccionDe(0), seccionDe(-1, 1), seccionDe(-1.05, 1.05), seccionDe(-5.15, 5.15), seccionDe(-40, 40)]) {
      const { container, unmount } = render(<DibujoSeccion puntos={puntos} />)
      expect(largoDeBarra(container)).toBeLessThanOrEqual(BARRA_MAXIMA)
      expect(largoDeBarra(container)).toBeGreaterThan(0)
      unmount()
    }
  })

  it('la barra dice cuántos metros mide', () => {
    const { unmount } = render(<DibujoSeccion puntos={seccionDe(-5.15, 5.15)} />)
    expect(screen.getByText('2 m')).toBeInTheDocument()
    unmount()

    render(<DibujoSeccion puntos={seccionDe(-40, 40)} />)
    expect(screen.getByText('10 m')).toBeInTheDocument()
  })

  it('los rótulos van a dos alturas alternas para que dos puntos juntos no se pisen', () => {
    // Un sardinel y su borde están a 0.15 m: a esta escala son nueve píxeles,
    // y con los rótulos a la misma altura uno taparía al otro.
    const { container } = render(<DibujoSeccion puntos={seccionDe(-3.65, -3.5, 0, 3.5, 3.65)} />)

    const alturas = [...container.querySelectorAll('text')]
      .filter((t) => /^P\d$/.test(t.textContent ?? ''))
      .map((t) => Number(t.getAttribute('y')))

    expect(alturas).toHaveLength(5)
    expect(alturas[0]).not.toBe(alturas[1])
    expect(alturas[1]).not.toBe(alturas[2])
  })

  it('el rótulo es la palabra con la que se escribe en la hoja', () => {
    render(<DibujoSeccion puntos={[punto('p-eje', 'Eje', 0, ['EJE', 'CL'])]} />)

    expect(screen.getByText('EJE')).toBeInTheDocument()
    expect(screen.queryByText('Eje')).not.toBeInTheDocument()
  })

  it('un punto sin ninguna palabra se rotula con su nombre, no con un hueco', () => {
    render(<DibujoSeccion puntos={[punto('p-1', 'Cuneta izquierda', -4.9)]} />)

    expect(screen.getByText('Cuneta izquierda')).toBeInTheDocument()
  })

  it('el nombre accesible dice cuántos puntos hay y hasta dónde llegan', () => {
    render(<DibujoSeccion puntos={seccionDe(-5.15, 0, 5.15)} />)

    expect(
      screen.getByRole('img', {
        name: 'Sección de la calle: 3 puntos, desde 5.15 m a la izquierda hasta 5.15 m a la derecha',
      }),
    ).toBeInTheDocument()
  })

  it('un punto solo se cuenta en singular', () => {
    render(<DibujoSeccion puntos={[punto('p-eje', 'Eje', 0, ['EJE'])]} />)

    expect(screen.getByRole('img', { name: /^Sección de la calle: 1 punto, desde en el eje/ })).toBeInTheDocument()
  })

  it('una sección sin puntos se dice, y no revienta', () => {
    const { container } = render(<DibujoSeccion puntos={[]} />)

    expect(screen.getByRole('img', { name: /todavía sin puntos/ })).toBeInTheDocument()
    expect(circulos(container)).toHaveLength(0)
    expect(largoDeBarra(container)).toBeLessThanOrEqual(BARRA_MAXIMA)
  })
})
