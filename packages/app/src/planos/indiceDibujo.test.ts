import { describe, expect, it } from 'vitest'
import type { PlanoVectorial, PolilineaPlano } from './dxf'
import { comoSeVe, prepararDibujo, seLeeTexto, teselasALaVista } from './indiceDibujo'

/** Una cuadrícula de n × n cuadraditos de 1 m en coordenadas UTM, más un eje largo. */
function planoGrande(n: number): PlanoVectorial {
  const polilineas: PolilineaPlano[] = []
  const X = 300000
  const Y = 8600000
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      polilineas.push({
        capa: (i + j) % 2 ? 'LOTES' : 'MANZANAS',
        cerrada: true,
        puntos: [
          { x: X + i * 10, y: Y + j * 10 },
          { x: X + i * 10 + 1, y: Y + j * 10 },
          { x: X + i * 10 + 1, y: Y + j * 10 + 1 },
        ],
      })
  polilineas.push({ capa: 'EJE', cerrada: false, color: '#ff0000', puntos: [{ x: X, y: Y }, { x: X + n * 10, y: Y + n * 10 }] })
  return {
    capas: [
      { nombre: 'LOTES', color: '#00ff00', visible: true },
      { nombre: 'MANZANAS', color: '#0000ff', visible: true },
      { nombre: 'EJE', color: '#ffffff', visible: true },
    ],
    polilineas,
    textos: [{ capa: 'EJE', texto: 'NTN 3244', x: X + 5, y: Y + 5, altura: 2, valor: 3244 }],
    limites: { minX: X, minY: Y, maxX: X + n * 10, maxY: Y + n * 10 },
    ignoradas: {},
    ignoradasDetalle: [],
  }
}

describe('dibujo preparado', () => {
  it('no se pierde ninguna línea ni ningún punto al partir en teselas', () => {
    const plano = planoGrande(100)
    const d = prepararDibujo(plano)
    expect(d.teselas.length).toBeGreaterThan(4)
    const lineas = d.teselas.flatMap((t) => t.lotes).reduce((s, l) => s + l.cerradas.length, 0)
    expect(lineas).toBe(plano.polilineas.length)
    expect(d.puntos).toBe(100 * 100 * 3 + 2)
    expect(d.teselas.flatMap((t) => t.textos)).toEqual([0])
  })

  it('las coordenadas quedan chicas (relativas a la tesela), aunque el plano esté en UTM', () => {
    const d = prepararDibujo(planoGrande(100))
    for (const t of d.teselas)
      for (const l of t.lotes) for (const c of l.coords) expect(Math.abs(c)).toBeLessThan(2000)
  })

  it('el color: el propio de la línea, si no el de su capa', () => {
    const d = prepararDibujo(planoGrande(4))
    const lotes = d.teselas.flatMap((t) => t.lotes)
    expect(lotes.find((l) => l.capa === 'EJE')!.color).toBe('#ff0000')
    expect(lotes.find((l) => l.capa === 'LOTES')!.color).toBe('#00ff00')
  })

  it('solo se recorren las teselas a la vista, y lo chico espera a que se acerque', () => {
    const d = prepararDibujo(planoGrande(100))
    const rincon = teselasALaVista(d, { minX: 300000, minY: 8600000, maxX: 300050, maxY: 8600050, escala: 10 })
    expect(rincon.length).toBeLessThan(d.teselas.length / 4)
    // El eje cruza todo: su tesela siempre está a la vista.
    expect(rincon.some((t) => t.lotes.some((l) => l.capa === 'EJE'))).toBe(true)

    const cuadradito = d.teselas.flatMap((t) => t.lotes).find((l) => l.capa === 'LOTES')!
    const eje = d.teselas.flatMap((t) => t.lotes).find((l) => l.capa === 'EJE')!
    // Un cuadradito de 1 m: a 10 px por metro entero, a 1 px tenue, a 0.1 px nada. El eje de 1 km siempre.
    expect(comoSeVe(cuadradito, 10)).toBe('entero')
    expect(comoSeVe(cuadradito, 1)).toBe('tenue')
    expect(comoSeVe(cuadradito, 0.1)).toBe('nada')
    expect(comoSeVe(eje, 0.1)).toBe('entero')
  })

  it('un texto de 2 m se lee de cerca y no de lejos', () => {
    const t = planoGrande(1).textos[0]!
    expect(seLeeTexto(t, 0.5)).toBe(false)
    expect(seLeeTexto(t, 5)).toBe(true)
  })
})
