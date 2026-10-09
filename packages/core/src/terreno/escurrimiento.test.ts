import { describe, expect, it } from 'vitest'
import { analizarEscurrimiento, type PuntoEscurrimiento } from './escurrimiento'

/** Una cuadrícula de 3 × 3 cada 10 m con la cota que se pida; se nombran 1 a 9 por filas. */
function cuadricula(cota: (x: number, y: number) => number, salidas: string[] = []): PuntoEscurrimiento[] {
  const puntos: PuntoEscurrimiento[] = []
  let n = 0
  for (const y of [0, 10, 20])
    for (const x of [0, 10, 20]) {
      n += 1
      puntos.push({ id: String(n), nombre: String(n), x, y, z: cota(x, y), salida: salidas.includes(String(n)) })
    }
  return puntos
}

describe('por dónde se va el agua', () => {
  it('en un plano inclinado al este, todo baja al este al 2 % y se va por el borde', () => {
    const r = analizarEscurrimiento(cuadricula((x) => 100 - 0.02 * x))
    if (!r.ok) throw new Error(r.error)
    for (const t of r.triangulos) {
      expect(t.pendientePct).toBeCloseTo(2, 9)
      expect(t.direccion!.x).toBeCloseTo(1, 9)
      expect(t.direccion!.y).toBeCloseTo(0, 9)
      expect(t.plano).toBe(false)
    }
    // Del 1 (oeste) al 3 (este), pasando por el 2.
    expect(r.caminos.get('1')).toEqual({ camino: ['1', '2', '3'], fin: 'borde', hasta: '3' })
    expect(r.empozan).toEqual([])
    expect(r.salePorBorde.sort()).toEqual(['3', '6', '9'])
    const arista = r.aristas.find((a) => a.alto === '1' && a.bajo === '2')!
    expect(arista.pendientePct).toBeCloseTo(2, 9)
    expect(arista.desnivel).toBeCloseTo(0.2, 9)
  })

  it('en una hondonada el agua se empoza en el centro, salvo que ahí haya un sumidero', () => {
    const hondo = (x: number, y: number) => (x === 10 && y === 10 ? 99.8 : 100)
    const r = analizarEscurrimiento(cuadricula(hondo))
    if (!r.ok) throw new Error(r.error)
    expect(r.empozan).toEqual(['5'])
    expect(r.caminos.get('1')).toEqual({ camino: ['1', '5'], fin: 'empoza', hasta: '5' })

    const conSumidero = analizarEscurrimiento(cuadricula(hondo, ['5']))
    if (!conSumidero.ok) throw new Error(conSumidero.error)
    expect(conSumidero.empozan).toEqual([])
    expect(conSumidero.caminos.get('8')).toEqual({ camino: ['8', '5'], fin: 'salida', hasta: '5' })
  })

  it('un triángulo más plano que la mínima se marca: el agua puede quedarse', () => {
    const r = analizarEscurrimiento(cuadricula((x) => 100 - 0.002 * x), { pendienteMinimaPct: 0.5 })
    if (!r.ok) throw new Error(r.error)
    expect(r.triangulos.every((t) => t.plano)).toBe(true)
    expect(r.triangulos[0]!.pendientePct).toBeCloseTo(0.2, 9)
  })

  it('el agua sigue la mayor pendiente, no el primer vecino más bajo', () => {
    // Desde el centro, el 6 baja 5 cm y el 8 baja 30 cm: va al 8.
    const r = analizarEscurrimiento(
      cuadricula((x, y) => (x === 20 && y === 10 ? 99.95 : x === 10 && y === 20 ? 99.7 : x === 10 && y === 10 ? 100 : 100.5)),
    )
    if (!r.ok) throw new Error(r.error)
    expect(r.caminos.get('5')?.camino).toEqual(['5', '8'])
  })

  it('con menos de tres puntos, o todos en una línea, no hay superficie', () => {
    expect(analizarEscurrimiento(cuadricula(() => 100).slice(0, 2)).ok).toBe(false)
    const enLinea = [0, 10, 20].map((x) => ({ id: String(x), nombre: String(x), x, y: 0, z: 100 - x / 100, salida: false }))
    const r = analizarEscurrimiento(enLinea)
    expect(r.ok).toBe(false)
  })
})
