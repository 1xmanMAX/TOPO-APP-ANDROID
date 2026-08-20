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

  it('rechaza un archivo sin número de versión', () => {
    const proyecto = { ...proyectoEjemplo(), version: undefined } as never
    expect(() => desempaquetarProyecto(empaquetarProyecto(proyecto))).toThrow(
      'los datos del proyecto no se entienden',
    )
  })

  // El campo `orden` de las capas es nuevo en la 2A: un .topo de la Entrega 1
  // trae capas sin él, y desempaquetarProyecto tiene que dejarlas usables.
  it('un proyecto de la Entrega 1 sin el campo orden en las capas sale con orden 0, 1, 2… por posición', () => {
    const original = proyectoEjemplo()
    const sinOrden = {
      ...original,
      capas: original.capas.map(({ orden: _orden, ...resto }) => resto),
    } as never

    const recuperado = desempaquetarProyecto(empaquetarProyecto(sinOrden))

    expect(recuperado.capas.map((capa) => capa.orden)).toEqual(
      original.capas.map((_, indice) => indice),
    )
    // El resto de cada capa (id, nombre) se conserva tal cual venía.
    expect(recuperado.capas.map((capa) => capa.id)).toEqual(original.capas.map((capa) => capa.id))
  })

  // Un archivo a medio migrar —unas capas con el campo y otras sin él— es el
  // caso que de verdad exige asignar el orden POR POSICIÓN del array. Aquí las
  // capas vienen deliberadamente en un orden que no coincide con el campo que
  // sí traen: la de en medio dice 'orden 7' y tiene que acabar en la 1, porque
  // manda la posición en el archivo, que es como se guardaba el paquete.
  it('un proyecto a medio migrar se renumera por posición, no por el campo que traen algunas capas', () => {
    const aMedias = {
      ...proyectoEjemplo(),
      capas: [
        { id: 'cap-terreno', nombre: 'TERRENO EXISTENTE' },
        { id: 'cap-sub', nombre: 'SUBRASANTE', orden: 7 },
        { id: 'cap-base', nombre: 'BASE' },
      ],
    } as never

    const recuperado = desempaquetarProyecto(empaquetarProyecto(aMedias))

    expect(recuperado.capas.map((capa) => [capa.id, capa.orden])).toEqual([
      ['cap-terreno', 0],
      ['cap-sub', 1],
      ['cap-base', 2],
    ])
  })

  it('un proyecto que ya trae el campo orden en sus capas no se toca', () => {
    const original = proyectoEjemplo()
    const recuperado = desempaquetarProyecto(empaquetarProyecto(original))

    expect(recuperado.capas).toEqual(original.capas)
  })
})
