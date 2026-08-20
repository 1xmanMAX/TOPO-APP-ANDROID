import { describe, expect, it } from 'vitest'
import { proyectoEjemplo } from '../estado/ejemplo'
import { desempaquetarProyecto, empaquetarProyecto } from './topo'

describe('archivo .topo', () => {
  it('empaqueta y desempaqueta sin perder datos', () => {
    const original = proyectoEjemplo()
    const recuperado = desempaquetarProyecto(empaquetarProyecto(original))
    expect(recuperado).toEqual(original)
  })

  it('conserva las lecturas crudas exactas', () => {
    const recuperado = desempaquetarProyecto(empaquetarProyecto(proyectoEjemplo()))
    expect(recuperado.campanias[0]!.estaciones[0]!.intermedias[0]!.valor).toBe(1.98)
  })

  it('avisa en cristiano si el archivo está dañado', () => {
    expect(() => desempaquetarProyecto(new Uint8Array([1, 2, 3]))).toThrow(
      'No se pudo leer el archivo .topo: parece estar dañado o no ser un archivo de la app.',
    )
  })

  it('avisa si el archivo trae una versión que no conoce', () => {
    const proyecto = { ...proyectoEjemplo(), version: 99 } as never
    const datos = empaquetarProyecto(proyecto)
    expect(() => desempaquetarProyecto(datos)).toThrow(
      'Este archivo fue creado con una versión más nueva de la app.',
    )
  })
})
