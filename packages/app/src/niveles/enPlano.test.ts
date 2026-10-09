import { describe, expect, it } from 'vitest'
import { analizarPlano, cotaDelPunto, nivelesEnPlanoUsables, nivelesVacios, siguienteNombre } from './enPlano'
import type { NivelesEnPlano, PuntoNivelPlano } from '@topo/core'

function punto(nombre: string, x: number, y: number, lectura: number | null, salida = false): PuntoNivelPlano {
  return { id: `p${nombre}`, nombre, x, y, puestaId: 'r1', lectura, salida }
}

/** Puesta BM 100 + 1.5 → AI 101.500. Cuatro esquinas y un centro más bajo, cada 10 unidades. */
function niveles(salidaEnElCentro = false): NivelesEnPlano {
  return {
    puestas: [{ id: 'r1', nombre: 'Puesta 1', cotaBM: 100, lecturaAtras: 1.5 }],
    puntos: [
      punto('1', 0, 0, 1.2),
      punto('2', 20, 0, 1.25),
      punto('3', 0, 20, 1.3),
      punto('4', 20, 20, 1.35),
      punto('5', 10, 10, 1.4, salidaEnElCentro),
    ],
    pendienteMinimaPct: 0.5,
  }
}

describe('niveles sobre el plano', () => {
  it('el punto siguiente es uno más que el mayor número', () => {
    expect(siguienteNombre([])).toBe('1')
    expect(siguienteNombre([punto('3', 0, 0, null), punto('A', 0, 0, null), punto('7', 0, 0, null)])).toBe('8')
  })

  it('una hoja nueva parte del primer BM', () => {
    expect(nivelesVacios([{ id: 'b', nombre: 'BM', cota: 3245.18, tipo: 'oficial', descripcion: '' }]).puestas[0]!.cotaBM).toBe(3245.18)
  })

  it('lo que viene roto del archivo se arregla, y dos veces da lo mismo', () => {
    expect(nivelesEnPlanoUsables(7)).toBeNull()
    const n = nivelesEnPlanoUsables({ puntos: [{ id: 'a', x: 1, y: 2, lectura: 'x' }, { id: 'b' }], pendienteMinimaPct: -1 })!
    expect(n.puntos).toEqual([{ id: 'a', nombre: '?', x: 1, y: 2, puestaId: null, lectura: null, salida: false }])
    expect(n.pendienteMinimaPct).toBe(0.5)
    expect(nivelesEnPlanoUsables(n)).toEqual(n)
  })

  it('la cota es AI − lectura; sin lectura no hay cota', () => {
    const n = niveles()
    expect(cotaDelPunto(n, n.puntos[0]!)).toBeCloseTo(100.3, 9)
    expect(cotaDelPunto(n, { ...n.puntos[0]!, lectura: null })).toBeNull()
  })

  it('con escala: el centro más bajo empoza; si es sumidero, todo llega a él', () => {
    const conEscala = analizarPlano(niveles(), { metrosPorUnidad: 1 })
    expect(conEscala.sinEscala).toBe(false)
    expect(conEscala.resultado?.ok && conEscala.resultado.empozan).toEqual(['p5'])

    const conSumidero = analizarPlano(niveles(true), { metrosPorUnidad: 1 })
    const r = conSumidero.resultado!
    if (!r.ok) throw new Error(r.error)
    expect(r.empozan).toEqual([])
    expect(r.caminos.get('p1')).toEqual({ camino: ['p1', 'p5'], fin: 'salida', hasta: 'p5' })
  })

  it('sin escala se analiza igual y se dice', () => {
    const a = analizarPlano(niveles(), null)
    expect(a.sinEscala).toBe(true)
    expect(a.resultado?.ok && a.resultado.empozan).toEqual(['p5'])
  })

  it('con menos de tres puntos leídos no hay análisis', () => {
    const n = niveles()
    n.puntos = n.puntos.slice(0, 2)
    expect(analizarPlano(n, { metrosPorUnidad: 1 }).resultado).toBeNull()
  })
})
