import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAlmacen } from './almacen'
import { proyectoEjemplo } from './ejemplo'
import { useResultadoDe, useResultadosDe } from './derivados'

describe('useResultadoDe', () => {
  beforeEach(() => {
    useAlmacen.getState().cargarProyecto(proyectoEjemplo())
  })

  it('calcula la campaña que se le pida, sea la activa o no', () => {
    const { result } = renderHook(() => useResultadoDe('camp-1'))

    expect(result.current?.cotasPorCelda.get('0|EJE')?.cota).toBeCloseTo(3244.6275, 6)
  })

  it('devuelve null si esa campaña no existe', () => {
    const { result } = renderHook(() => useResultadoDe('camp-inventada'))

    expect(result.current).toBeNull()
  })

  it('devuelve null si no se le pide ninguna', () => {
    const { result } = renderHook(() => useResultadoDe(null))

    expect(result.current).toBeNull()
  })
})

describe('useResultadosDe', () => {
  beforeEach(() => {
    useAlmacen.getState().cargarProyecto(proyectoEjemplo())
  })

  it('calcula varias campañas de una vez', () => {
    const otra = useAlmacen.getState().agregarCampania({
      fecha: '2026-08-20',
      calleId: 'c-1',
      capaId: 'cap-terreno',
      bmInicialId: 'bm-1',
      estado: 'abierta',
      cierre: {
        tipo: 'cerrado',
        bmFinalId: 'bm-1',
        longitudK: 0,
        longitudKAuto: true,
        clase: 'tercerOrden',
        coeficiente: 12,
      },
    })

    const { result } = renderHook(() => useResultadosDe(['camp-1', otra]))

    expect(result.current.size).toBe(2)
    expect(result.current.get('camp-1')?.celdasLlenas).toBe(3)
    expect(result.current.get(otra)?.celdasLlenas).toBe(0)
  })

  it('omite las campañas que no existen en vez de reventar', () => {
    const { result } = renderHook(() => useResultadosDe(['camp-1', 'camp-inventada']))

    expect(result.current.size).toBe(1)
  })
})
