import { calcularCampania, compararCapas, parsearProgresiva, volumenesPorAreasMedias, type Proyecto } from '@topo/core'
import { describe, expect, it } from 'vitest'
import { proyectoDePrueba } from './proyectoDePrueba'
import {
  bombeosPorProgresiva,
  espesorDeDisenio,
  porQueSinEspesorDeDisenio,
  evaluarEspesores,
  leerListaDeProgresivas,
  perfilDeProyecto,
  perfilMedido,
  progresivasDeTomas,
  seccionesEntreSuperficies,
  superficieDeProyecto,
  superficieMedida,
} from './superficies'

function calcular(proyecto: Proyecto, indiceNivelacion: number) {
  const calle = proyecto.calles[0]!
  const toma = calle.nivelaciones[indiceNivelacion]!.tomas[0]!
  return { calle, toma, resultado: calcularCampania({ campania: toma, calle, bms: proyecto.bms }) }
}

describe('seccionesEntreSuperficies', () => {
  it('saca el área entre lo medido y el proyecto con los offsets de la sección', () => {
    const proyecto = proyectoDePrueba()
    const { calle, toma, resultado } = calcular(proyecto, 0)
    expect(resultado.cierre.pasa).toBe(true)

    const secciones = seccionesEntreSuperficies(
      calle,
      progresivasDeTomas([toma]),
      superficieMedida(resultado),
      superficieDeProyecto(calle.rasante!, proyecto.capas, 'cap-sub'),
    )

    // Compensada, la subrasante queda 3, 3 y 6 mm sobre el proyecto en los 6 m de ancho.
    expect(secciones.map((s) => s.progresiva)).toEqual([0, 10, 20])
    expect(secciones[0]).toMatchObject({ corte: 0.018, relleno: 0, descartados: 0 })
    expect(secciones[2]).toMatchObject({ corte: 0.036, relleno: 0, descartados: 0 })
    expect(volumenesPorAreasMedias(secciones).totalCorte).toBe(0.45)
  })

  it('cuenta como descartado el punto sin cota y deja sin área la sección que no tiene dos puntos', () => {
    const proyecto = proyectoDePrueba()
    const { calle, resultado } = calcular(proyecto, 0)
    const sinBordeEn10 = superficieMedida(resultado)
    const arriba = (c: Parameters<typeof sinBordeEn10>[0]) =>
      c.progresiva === 10 && c.elementoClave === 'p-bi' ? null : c.progresiva === 20 && c.elementoClave !== 'p-eje' ? null : sinBordeEn10(c)

    const secciones = seccionesEntreSuperficies(calle, [0, 10, 20], arriba, superficieMedida(resultado))

    expect(secciones[1]!.descartados).toBe(1)
    expect(secciones[2]!.corte).toBeNaN()
    const volumenes = volumenesPorAreasMedias(secciones)
    expect(volumenes.descartadas.map((d) => d.progresiva)).toEqual([20])
    expect(volumenes.seccionesIncompletas).toEqual([10])
  })
})

describe('perfiles para el drenaje', () => {
  it('arma el perfil medido de un punto y el del proyecto en las mismas progresivas', () => {
    const proyecto = proyectoDePrueba()
    const { calle, resultado } = calcular(proyecto, 1)
    const medido = perfilMedido(resultado, 'p-eje')
    expect(medido).toEqual([
      { progresiva: 0, cota: 100.2 },
      { progresiva: 10, cota: 100.17 },
      { progresiva: 20, cota: 100.05 },
    ])
    const deProyecto = perfilDeProyecto(calle.rasante!, proyecto.capas, 'cap-base', [0, 10, 20], 0)
    expect(deProyecto.map((p) => p.cota)).toEqual([100.2, 100.17, 100.14])
  })
})

describe('bombeosPorProgresiva', () => {
  it('compara el bombeo de cada lado con el de la rasante', () => {
    const proyecto = proyectoDePrueba()
    const { calle, resultado } = calcular(proyecto, 1)
    const filas = bombeosPorProgresiva(calle, resultado, [0, 20], {
      rasante: calle.rasante!,
      capas: proyecto.capas,
      capaId: 'cap-base',
    })

    expect(filas).toHaveLength(4)
    expect(filas[0]).toMatchObject({ progresiva: 0, lado: 'izquierda', medido: 2, proyecto: 2 })
    expect(filas[0]!.comparacion!.estado).toBe('conforme')
    // En 0+020 el eje quedó 3 cm por debajo de los bordes: el agua va al eje.
    expect(filas[2]).toMatchObject({ progresiva: 20, lado: 'izquierda', medido: -1 })
    expect(filas[2]!.comparacion).toMatchObject({ aguaAlReves: true, estado: 'fuera' })
  })

  it('sin rasante deja el proyecto vacío y no compara', () => {
    const proyecto = proyectoDePrueba()
    const { calle, resultado } = calcular(proyecto, 1)
    const filas = bombeosPorProgresiva(calle, resultado, [0], null)
    expect(filas[0]).toMatchObject({ medido: 2, proyecto: null, comparacion: null })
  })
})

describe('espesores', () => {
  it('el diseño entre dos capas es la suma de lo que va encima de la de abajo hasta la de arriba', () => {
    const { capas } = proyectoDePrueba()
    expect(espesorDeDisenio(capas, 'cap-sub', 'cap-base')).toBe(0.2)
    expect(espesorDeDisenio(capas, 'cap-terreno', 'cap-sub')).toBeNull()
  })

  it('dice por qué no hay espesor de diseño: misma capa, al revés o sin espesor', () => {
    const capas = proyectoDePrueba().capas
    expect(porQueSinEspesorDeDisenio(capas, 'cap-sub', 'cap-sub')).toBe('mismaCapa')
    expect(porQueSinEspesorDeDisenio(capas, 'cap-base', 'cap-sub')).toBe('alReves')
    expect(porQueSinEspesorDeDisenio(capas, 'cap-terreno', 'cap-sub')).toBe('sinEspesor')
  })

  it('marca delgada la celda que pasa la tolerancia por debajo del diseño', () => {
    const proyecto = proyectoDePrueba()
    const sub = calcular(proyecto, 0).resultado
    const base = calcular(proyecto, 1).resultado
    const evaluados = evaluarEspesores(compararCapas(sub, base), 0.2, 10)

    expect(evaluados.get('0|p-eje')).toMatchObject({ estado: 'conforme', diferenciaMm: -3, delgada: false })
    expect(evaluados.get('20|p-eje')).toMatchObject({ estado: 'fuera', diferenciaMm: -96, delgada: true })
    expect([...evaluados.values()].filter((e) => e.delgada)).toHaveLength(1)
  })

  it('sin diseño no hay semáforo', () => {
    const proyecto = proyectoDePrueba()
    const evaluados = evaluarEspesores(compararCapas(calcular(proyecto, 0).resultado, calcular(proyecto, 1).resultado), null, 10)
    expect(evaluados.get('0|p-eje')).toMatchObject({ estado: null, delgada: false })
  })
})

describe('leerListaDeProgresivas', () => {
  it('entiende 0+040, metros sueltos y la coma decimal; aparta lo que no entiende', () => {
    expect(leerListaDeProgresivas('0+040, 80; 40,5 xx', parsearProgresiva)).toEqual({
      progresivas: [40, 80, 40.5],
      noEntendidas: ['xx'],
    })
  })
})
