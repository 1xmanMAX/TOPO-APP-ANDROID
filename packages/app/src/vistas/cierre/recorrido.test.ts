import { describe, expect, it } from 'vitest'
import { proyectoDePrueba, proyectoSinCerrar } from '../analisis/proyectoDePrueba'
import { armarRecorrido } from './recorrido'

function tomaSub(proyecto = proyectoDePrueba()) {
  return { proyecto, toma: proyecto.calles[0]!.nivelaciones[0]!.tomas[0]! }
}

describe('armarRecorrido', () => {
  it('va del BM por las estaciones y el punto de cambio de vuelta al BM', () => {
    const { proyecto, toma } = tomaSub()
    expect(armarRecorrido(toma, proyecto.bms).map((p) => `${p.tipo}:${p.nombre}`)).toEqual([
      'bm:BM-1',
      'estacion:E1',
      'cambio:PC1',
      'estacion:E2',
      'bm:BM-1',
    ])
  })

  it('termina en «falta» con el BM esperado si todavía no se visó', () => {
    const { proyecto, toma } = tomaSub(proyectoSinCerrar())
    const pasos = armarRecorrido(toma, proyecto.bms)
    expect(pasos[pasos.length - 1]).toEqual({ tipo: 'falta', nombre: 'BM-1' })
  })

  it('un circuito abierto no espera BM de cierre', () => {
    const { proyecto, toma } = tomaSub(proyectoSinCerrar())
    toma.cierre = { ...toma.cierre, tipo: 'abierto', bmFinalId: undefined }
    expect(armarRecorrido(toma, proyecto.bms).some((p) => p.tipo === 'falta')).toBe(false)
  })

  it('una estación que vuelve a arrancar en un BM lo dibuja aunque la anterior llegara a otro punto', () => {
    const { proyecto, toma } = tomaSub()
    toma.estaciones[1]!.vistaAtras = { id: 'x', destino: { tipo: 'bm', bmId: 'bm-1' }, valor: 1.4 }
    expect(armarRecorrido(toma, proyecto.bms).map((p) => p.nombre)).toEqual(['BM-1', 'E1', 'PC1', 'BM-1', 'E2', 'BM-1'])
  })
})
