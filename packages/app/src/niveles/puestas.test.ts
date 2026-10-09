import type { Proyecto } from '@topo/core'
import { describe, expect, it } from 'vitest'
import { proyectoVacio } from '../estado/ejemplo'
import { proyectoDePrueba } from '../vistas/analisis/proyectoDePrueba'
import { alturaDe, origenDePuesta, puestaParaMotor, unirPuestas } from './puestas'

describe('puestas del proyecto', () => {
  it('desde un BM oficial la AI está comprobada; desde una cota escrita, no', () => {
    const proyecto: Proyecto = {
      ...proyectoVacio(),
      bms: [{ id: 'bm', nombre: 'BM-1', cota: 100, tipo: 'oficial', descripcion: '' }],
    }
    const deBM = { id: 'a', nombre: 'A', cotaBM: 0, lecturaAtras: 1.5, bmId: 'bm' }
    expect(alturaDe(deBM, proyecto)).toBeCloseTo(101.5, 9)
    expect(puestaParaMotor(deBM, proyecto)).toMatchObject({ tipo: 'libreta', comprobado: true })
    expect(origenDePuesta(deBM, proyecto)).toBe('BM-1 + 1.500')
    const escrita = { id: 'b', nombre: 'B', cotaBM: 200, lecturaAtras: 1 }
    expect(alturaDe(escrita, proyecto)).toBeCloseTo(201, 9)
    expect(puestaParaMotor(escrita, proyecto).tipo).toBe('rapida')
  })

  it('desde la libreta, la AI es la de esa estación (compensada si cerró)', () => {
    const proyecto = proyectoDePrueba()
    // La subrasante cerró con −6 mm: la E2 (101.700) se compensa +6 mm.
    expect(alturaDe({ id: 'l', nombre: 'L', cotaBM: 0, lecturaAtras: 0, libreta: { tomaId: 'toma-sub', indiceEstacion: 1 } }, proyecto)).toBeCloseTo(101.706, 6)
  })

  it('las puestas de las hojas y planos de antes pasan al proyecto, sin repetir', () => {
    const viejo: Proyecto = {
      ...proyectoVacio(),
      calles: [
        {
          id: 'c',
          nombre: 'C',
          seccion: proyectoDePrueba().calles[0]!.seccion,
          nivelaciones: [],
          rasante: null,
          niveles: { puestas: [{ id: 'p1', nombre: 'P1', cotaBM: 1, lecturaAtras: 1 }], conjuntos: [], unidad: 'm', mira: 'normal', minimoCm: 5 },
        },
      ],
      planos: [
        {
          id: 'pl',
          nombre: 'Plano',
          formato: 'dxf',
          calibracion: null,
          nivelesEnPlano: { puestas: [{ id: 'p1', nombre: 'P1', cotaBM: 1, lecturaAtras: 1 }, { id: 'p2', nombre: 'P2', cotaBM: 2, lecturaAtras: 1 }], puntos: [], pendienteMinimaPct: 0.5 },
        },
      ],
    }
    const nuevo = unirPuestas(viejo)
    expect(nuevo.puestas!.map((p) => p.id)).toEqual(['p1', 'p2'])
    expect(nuevo.calles[0]!.niveles!.puestas).toBeUndefined()
    expect(nuevo.planos![0]!.nivelesEnPlano!.puestas).toBeUndefined()
    expect(unirPuestas(nuevo)).toBe(nuevo)
  })
})
