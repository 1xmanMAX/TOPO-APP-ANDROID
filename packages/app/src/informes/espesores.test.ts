import { describe, expect, it } from 'vitest'
import { baseDePrueba } from './datosDePrueba'
import { espesores } from './espesores'
import { AVISO_SIN_COMPROBAR } from './maquetacion'
import { celdasDesde, enUnaLinea, textoDelPdf } from './textoDelPdf'
import type { DatosEspesores } from './tipos'

const datos = (comprobado: boolean): DatosEspesores => ({
  ...baseDePrueba(comprobado),
  capaAbajo: 'Subrasante',
  capaArriba: 'Base granular',
  filas: [
    // 100.200 − 100.000 = 0.200 m; 0.200 − 0.200 = 0 mm CONFORME
    { progresiva: 0, punto: 'Eje', cotaAbajo: 100, cotaArriba: 100.2, espesorProyecto: 0.2 },
    // 100.185 − 100.000 = 0.185; 0.185 − 0.200 = −15 mm AL LÍMITE (tol 10)
    { progresiva: 20, punto: 'Eje', cotaAbajo: 100, cotaArriba: 100.185, espesorProyecto: 0.2 },
    // 100.170 − 100.000 = 0.170; 0.170 − 0.200 = −30 mm FUERA
    { progresiva: 40, punto: 'Eje', cotaAbajo: 100, cotaArriba: 100.17, espesorProyecto: 0.2 },
    { progresiva: 60, punto: 'Eje', cotaAbajo: 100, cotaArriba: null, espesorProyecto: 0.2 },
  ],
})

describe('espesores', () => {
  it('capa de abajo, de arriba, espesor contra proyecto y estado', () => {
    const { todo } = textoDelPdf(espesores(datos(true)))
    const linea = enUnaLinea(todo)
    expect(todo).toContain('CONTROL DE ESPESORES')
    expect(linea).toContain('Base granular sobre Subrasante')
    for (const t of ['Cota abajo', 'Cota arriba', 'Espesor (m)', 'Proyecto (m)', 'Dif. (mm)', 'Estado'])
      expect(todo).toContain(t)
    expect(todo).toContain('0.185')
    expect(todo).toContain('-15')
    expect(todo).toContain('-30')
    expect(todo).toContain('CONFORME')
    expect(todo).toContain('AL LÍMITE')
    expect(todo).toContain('FUERA')
    expect(todo).toContain('sin medir')
    expect(todo).not.toContain(AVISO_SIN_COMPROBAR)
  })

  it('sin segunda capa: un texto que lo explica, no una tabla vacía', () => {
    const d = { ...datos(true), capaArriba: null }
    const linea = enUnaLinea(textoDelPdf(espesores(d)).todo)
    expect(linea).toContain(
      'Todavía no hay una capa medida sobre Subrasante: el espesor es la diferencia entre dos capas y sale cuando se nivele la de arriba.',
    )
    expect(linea).not.toContain('Cota arriba')
  })

  it('sin comprobar lleva la franja', () => {
    expect(enUnaLinea(textoDelPdf(espesores(datos(false))).todo)).toContain(AVISO_SIN_COMPROBAR)
  })
})

describe('espesores con datos que no son número', () => {
  it('NaN es dato inválido (nunca FUERA) y undefined es sin medir', () => {
    const rotas = [
      { progresiva: 0, punto: 'A', cotaAbajo: Number.NaN, cotaArriba: 100.2, espesorProyecto: 0.2 },
      { progresiva: 20, punto: 'B', cotaAbajo: 100, cotaArriba: undefined, espesorProyecto: 0.2 },
      { progresiva: 40, punto: 'C', cotaAbajo: 100, cotaArriba: 100.2, espesorProyecto: Number.NaN },
    ] as unknown as DatosEspesores['filas']
    const { todo } = textoDelPdf(espesores({ ...datos(true), filas: rotas }))
    expect(todo).not.toContain('NaN')
    expect(todo.split('\n')).not.toContain('FUERA')
    expect(celdasDesde(todo, '0+000', 8)).toEqual(['0+000', 'A', 'dato inválido', '100.200', '-', '0.200', '-', 'dato inválido'])
    expect(celdasDesde(todo, '0+020', 8)).toEqual(['0+020', 'B', '100.000', '-', '-', '0.200', '-', 'sin medir'])
    // espesor 100.200 − 100.000 = 0.200, pero el de proyecto no es número: no se juzga
    expect(celdasDesde(todo, '0+040', 8)).toEqual(['0+040', 'C', '100.000', '100.200', '0.200', 'dato inválido', '-', 'dato inválido'])
  })
})
