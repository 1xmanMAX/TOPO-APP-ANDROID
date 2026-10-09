import type { NivelesEnPlano, Proyecto, PuntoNivelPlano } from '@topo/core'
import { describe, expect, it } from 'vitest'
import { proyectoVacio } from '../estado/ejemplo'
import { analizarPlano, nivelesEnPlanoUsables } from './enPlano'
import { cotaEnTriangulo, exageracionSugerida, modeloDelAgua } from './modelo3d'

const P: Proyecto = { ...proyectoVacio(), puestas: [{ id: 'r1', nombre: 'Puesta 1', cotaBM: 100, lecturaAtras: 1.5 }] }

function punto(nombre: string, x: number, y: number, lectura: number | null, salida = false, nota?: string): PuntoNivelPlano {
  return { id: `p${nombre}`, nombre, x, y, puestaId: 'r1', lectura, salida, ...(nota ? { nota } : {}) }
}

/** Cuatro esquinas y un centro más bajo (AI 101.500), en un plano de 1 unidad = 0.5 m. */
function niveles(salidaEnElCentro = false): NivelesEnPlano {
  return {
    puntos: [
      punto('1', 0, 0, 1.2, false, 'Esquina Lima / Sol'),
      punto('2', 20, 0, 1.25),
      punto('3', 0, 20, 1.3),
      punto('4', 20, 20, 1.35),
      punto('5', 10, 10, 1.4, salidaEnElCentro, 'buzón'),
      punto('6', 30, 30, null),
    ],
    pendienteMinimaPct: 0.5,
  }
}
const CAL = { metrosPorUnidad: 0.5, ejeY: 'arriba' as const }

describe('modelo 3D del agua', () => {
  it('levanta solo los puntos leídos, en metros y centrado, con su etiqueta', () => {
    const n = niveles()
    const m = modeloDelAgua(n, analizarPlano(n, CAL, P), CAL)!
    expect(m.vertices.size).toBe(5)
    expect(m.vertices.has('p6')).toBe(false)
    const uno = m.vertices.get('p1')!
    // Centro en (10, 10) unidades = (5, 5) m: la esquina 1 queda en (−5, −5).
    expect(uno.x).toBeCloseTo(-5, 9)
    expect(uno.y).toBeCloseTo(-5, 9)
    expect(uno.nota).toBe('Esquina Lima / Sol')
    // La más baja (el centro, 100.100) en z = 0; la 1 (100.300) 20 cm arriba.
    expect(m.vertices.get('p5')!.z).toBeCloseTo(0, 9)
    expect(uno.z).toBeCloseTo(0.2, 9)
    expect(uno.cota).toBeCloseTo(100.3, 9)
    expect(m.ancho).toBeCloseTo(10, 9)
    expect(m.desnivel).toBeCloseTo(0.2, 9)
    expect(m.triangulos).toHaveLength(4)
  })

  it('el agua de cada esquina va al centro y ahí se empoza; con salida, llega', () => {
    const n = niveles()
    const m = modeloDelAgua(n, analizarPlano(n, CAL, P), CAL)!
    expect(m.vertices.get('p5')!.fin).toBe('empoza')
    expect(m.caminos.find((c) => c.desde === 'p1')!.ids).toEqual(['p1', 'p5'])

    const conSalida = niveles(true)
    const m2 = modeloDelAgua(conSalida, analizarPlano(conSalida, CAL, P), CAL)!
    expect(m2.caminos.every((c) => c.fin === 'salida')).toBe(true)
  })

  it('sin tres puntos leídos no hay modelo', () => {
    const n: NivelesEnPlano = { puntos: [punto('1', 0, 0, 1.2), punto('2', 5, 0, 1.3)], pendienteMinimaPct: 0.5 }
    expect(modeloDelAgua(n, analizarPlano(n, CAL, P), CAL)).toBeNull()
  })

  it('exagera las cotas para que el desnivel ocupe un cuarto del ancho', () => {
    expect(exageracionSugerida({ ancho: 40, desnivel: 0.3 })).toBe(33)
    expect(exageracionSugerida({ ancho: 10, desnivel: 50 })).toBe(1)
    expect(exageracionSugerida({ ancho: 1000, desnivel: 0.01 })).toBe(200)
    expect(exageracionSugerida({ ancho: 10, desnivel: 0 })).toBe(1)
  })

  it('la cota dentro de un triángulo sale de su plano', () => {
    const v = (x: number, y: number, z: number) => ({ id: '', nombre: '', x, y, z, cota: z, salida: false, medido: false, fin: null })
    expect(cotaEnTriangulo(v(0, 0, 0), v(10, 0, 1), v(0, 10, 2), 5, 5)).toBeCloseTo(1.5, 9)
  })

  it('la etiqueta se guarda en el .topo; vacía no se guarda', () => {
    const n = nivelesEnPlanoUsables({ puntos: [{ id: 'a', x: 1, y: 2, nota: 'buzón' }, { id: 'b', x: 1, y: 2, nota: '  ' }] })!
    expect(n.puntos[0]!.nota).toBe('buzón')
    expect('nota' in n.puntos[1]!).toBe(false)
  })
})
