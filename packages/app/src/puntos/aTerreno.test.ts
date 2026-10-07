import { describe, expect, it } from 'vitest'
import type { Amarre } from '@topo/core'
import { paresPorNombre, puntosATerreno } from './aTerreno'
import { esSolucionFija, type PuntoLeido } from './lectores'

function leido(id: string, x: number, y: number, z: number | null, extra: Partial<PuntoLeido> = {}): PuntoLeido {
  return { id, x, y, z, codigo: null, linea: 1, estacion: false, solucion: null, ...extra }
}

describe('puntosATerreno', () => {
  it('pasa este, norte, cota y código; el comprobado lo declara quien midió', () => {
    const r = puntosATerreno([leido('1', 10, 20, 3250.1, { codigo: 'BORDE' })], { origen: 'estacion', comprobado: true })
    expect(r.puntos).toEqual([{ id: '1', x: 10, y: 20, z: 3250.1, origen: 'estacion', comprobado: true, codigo: 'BORDE' }])
    expect(r.avisos).toEqual([])
  })

  it('el punto sin cota no entra y se dice con su línea', () => {
    const r = puntosATerreno([leido('7', 0, 0, null, { linea: 9 })], { origen: 'estacion', comprobado: true })
    expect(r.puntos).toEqual([])
    expect(r.avisos).toEqual(['Un punto no tiene cota y no entra a la superficie: 7 (línea 9).'])
  })

  it('un GNSS es comprobado solo con solución fija; sin solución anotada tampoco', () => {
    const r = puntosATerreno(
      [
        leido('G1', 0, 0, 1, { solucion: 'FIJA' }),
        leido('G2', 1, 0, 1, { solucion: 'FLOTANTE' }),
        leido('G3', 2, 0, 1),
      ],
      { origen: 'gnss', comprobado: true },
    )
    expect(r.puntos.map((p) => p.comprobado)).toEqual([true, false, false])
    expect(r.avisos).toEqual([
      'Sin solución fija, entran como no comprobados: G2 (FLOTANTE).',
      'El archivo no dice la solución del GNSS de 1 punto: entran como no comprobados.',
    ])
  })

  it('aplica el amarre a este y norte, el desplazamiento a la cota y el prefijo al nombre', () => {
    // giro de 90° antihorario y traslación (100, 200)
    const amarre: Amarre = { a: 0, b: 1, tx: 100, ty: 200, escala: 1, rotacionGrados: 90 }
    const r = puntosATerreno([leido('E1', 3, 4, 10)], {
      origen: 'estacion',
      comprobado: false,
      amarre,
      desplazamientoCota: -0.5,
      prefijoId: 'L-',
    })
    expect(r.puntos[0]).toMatchObject({ id: 'L-E1', x: 96, y: 203, z: 9.5 })
    expect(r.avisos).toContain('A todas las cotas se les sumó -0.500 m.')
    expect(() => puntosATerreno([], { origen: 'nivel', comprobado: true, desplazamientoCota: Number.NaN })).toThrow(
      /desplazamiento de cota/,
    )
  })
})

describe('paresPorNombre', () => {
  it('junta los nombres comunes y deja fuera los repetidos en un archivo', () => {
    const origen = [leido('E1', 0, 0, 0), leido('BM', 1, 1, 0), leido('BM', 1.01, 1, 0), leido('X', 5, 5, 0)]
    const destino = [leido('E1', 100, 100, 0), leido('BM', 101, 101, 0)]
    expect(paresPorNombre(origen, destino)).toEqual([{ id: 'E1', origen: { x: 0, y: 0 }, destino: { x: 100, y: 100 } }])
  })
})

describe('esSolucionFija', () => {
  it('reconoce las formas usuales', () => {
    expect(['FIJA', 'Fixed', 'RTK FIJO', ' fija '].map(esSolucionFija)).toEqual([true, true, true, true])
    expect(['FLOTANTE', 'AUTONOMA', 'DGPS'].map(esSolucionFija)).toEqual([false, false, false])
  })
})
