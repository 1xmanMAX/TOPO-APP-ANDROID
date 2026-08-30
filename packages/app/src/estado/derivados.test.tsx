import type { Rasante } from '@topo/core'
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAlmacen } from './almacen'
import { proyectoEjemplo } from './ejemplo'
import { useEvaluacionRasante, useResultadoDe, useResultadosDe } from './derivados'

describe('useResultadoDe', () => {
  beforeEach(() => {
    useAlmacen.getState().cargarProyecto(proyectoEjemplo())
  })

  it('calcula la campaña que se le pida, sea la activa o no', () => {
    const { result } = renderHook(() => useResultadoDe('camp-1'))

    expect(result.current?.cotasPorCelda.get('0|p-eje')?.cota).toBeCloseTo(3244.5965, 6)
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
    // La campaña de SUBRASANTE del ejemplo mide una grilla completa de 25
    // celdas desde la Entrega 3 (cinco progresivas por cinco puntos).
    expect(result.current.get('camp-1')?.celdasLlenas).toBe(25)
    expect(result.current.get(otra)?.celdasLlenas).toBe(0)
  })

  it('omite las campañas que no existen en vez de reventar', () => {
    const { result } = renderHook(() => useResultadosDe(['camp-1', 'camp-inventada']))

    expect(result.current.size).toBe(1)
  })
})

/**
 * Rasante de prueba para 'c-1': arranca en el eje con la misma cota que el
 * BM del proyecto de ejemplo (3245.18) y baja 1.25% por progresiva. Los
 * tramos cubren hasta 5.6 m de offset, el ancho completo de la plantilla del
 * ejemplo, para que ningún elemento quede fuera de sección sin querer.
 */
function rasanteDeEjemplo(): Rasante {
  return {
    progresivaArranque: 0,
    cotaArranque: 3245.18,
    pendienteLongitudinal: -1.25,
    tramos: [
      { nombre: 'Calzada', hastaOffset: 4.2, tipo: 'pendiente', valor: 2 },
      { nombre: 'Sardinel', hastaOffset: 4.4, tipo: 'salto', valor: 0.15 },
      { nombre: 'Vereda', hastaOffset: 5.6, tipo: 'pendiente', valor: -2 },
    ],
    simetrica: true,
    tramosIzquierda: null,
  }
}

function fijarRasanteDeEjemplo(): void {
  useAlmacen.getState().fijarRasante('c-1', rasanteDeEjemplo())
}

describe('useEvaluacionRasante', () => {
  beforeEach(() => {
    useAlmacen.getState().cargarProyecto(proyectoEjemplo())
  })

  it('sin rasante en la calle no hay evaluación, y eso no es un fallo', () => {
    useAlmacen.getState().fijarRasante('c-1', null)
    const { result } = renderHook(() => useEvaluacionRasante())

    expect(result.current).toBeNull()
  })

  it('con rasante definida, evalúa la campaña activa contra su capa', () => {
    fijarRasanteDeEjemplo()

    const { result } = renderHook(() => useEvaluacionRasante())

    // El paquete de capas del ejemplo lleva BASE (0.20 m) y CARPETA (0.05 m)
    // por encima de SUBRASANTE, así que su cota teórica resta ese espesor a
    // la rasante: 3245.18 − 0.25 = 3244.93 en 0+000 EJE. Lo medido ahí es
    // 3244.5965 (ver 'useResultadoDe' arriba), 333.5 mm por debajo, que
    // redondeado a milímetros enteros da -334 (no -333: la resta exacta usa
    // la cota real sin redondear a milímetros, 3244.5965, no la cifra ya
    // redondeada a tres decimales que se muestra en pantalla).
    const celda = result.current!.celdas.get('0|p-eje')!
    expect(celda.cotaTeorica).toBe(3244.93)
    expect(celda.diferenciaMm).toBe(-334)
    expect(celda.estado).toBe('fuera')
  })

  // NOTA (tarea C3): existía aquí una prueba «deja pasar el error de una
  // calle mal configurada, sin tragárselo», que usaba
  // `actualizarCalle('c-1', { progresivaInicio: 180, progresivaFin: 0 })`
  // para forzar el error de `construirGrilla`. `Calle` ya no tiene esos
  // campos: no hay forma de dejarla «mal configurada» en ese sentido. Misma
  // causa que las pruebas equivalentes retiradas en `evaluar.test.ts`,
  // `calcularCampania.test.ts` y `VistaLibreta.test.tsx`; se anota una sola
  // vez en el informe de la tarea.

  it('evalúa cualquier campaña que se le pida, sea la activa o no', () => {
    fijarRasanteDeEjemplo()
    const otra = useAlmacen.getState().agregarCampania({
      fecha: '2026-08-20',
      calleId: 'c-1',
      capaId: 'cap-terreno',
      bmInicialId: 'bm-1',
      cierre: {
        tipo: 'cerrado',
        bmFinalId: 'bm-1',
        longitudK: 0,
        longitudKAuto: true,
        clase: 'tercerOrden',
        coeficiente: 12,
      },
    })

    const { result } = renderHook(() => useEvaluacionRasante('camp-1'))

    expect(result.current).not.toBeNull()
    expect(otra).not.toBe('camp-1')
  })
})
