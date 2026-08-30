import { describe, expect, it } from 'vitest'
import { seccionDeFabrica } from '@topo/core'
import { hojaDetrasDelColegio } from '../pruebas/muestras'
import { agruparNoImportado } from './agrupar'
import { interpretarHoja } from './interpretar'

describe('agrupar lo no importado', () => {
  it('un valor que salió por dos caminos sale en un solo renglón, con los dos motivos', () => {
    const cosas = agruparNoImportado([
      { que: 'Su columna no lleva título.', contenido: ['0', '0'] },
      { que: 'Su fila no lleva progresiva.', contenido: ['0', '0'] },
    ])

    expect(cosas).toHaveLength(1)
    expect(cosas[0]!.motivos).toHaveLength(2)
  })

  it('las veces son las del camino que más lo vio, no la suma', () => {
    // Son las mismas ocho celdas contadas dos veces; sumarlas diría dieciséis.
    const cosas = agruparNoImportado([
      { que: 'A', contenido: ['0', '0', '0'] },
      { que: 'B', contenido: ['0', '0'] },
    ])

    expect(cosas[0]!.veces).toBe(3)
  })

  it('con el archivo real, los ceros arrastrados salen una vez y no ocho más ocho', () => {
    const leida = interpretarHoja(hojaDetrasDelColegio(), seccionDeFabrica())
    const cosas = agruparNoImportado(leida.noImportado)
    const cero = cosas.filter((cosa) => cosa.valor === '0')

    // Sin agrupar serían 22 renglones para 7 cosas distintas.
    expect(cosas).toHaveLength(7)
    expect(cero).toHaveLength(1)
    expect(cero[0]!.veces).toBe(8)
    expect(cero[0]!.motivos).toHaveLength(2)
  })

  it('sin nada que decir, no dice nada', () => {
    expect(agruparNoImportado([])).toEqual([])
  })
})
