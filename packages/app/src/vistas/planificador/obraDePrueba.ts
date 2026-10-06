import type { Proyecto } from '@topo/core'
import { proyectoEjemplo } from '../../estado/ejemplo'

/**
 * Para las pruebas del planificador: una calle empinada (12 %) de 0+000 a
 * 0+100, sin tomas, así el plan sale de su rasante.
 */
export function obraEmpinada(): Proyecto {
  const proyecto = proyectoEjemplo()
  const calle = proyecto.calles[0]!
  return {
    ...proyecto,
    calles: [
      {
        ...calle,
        id: 'c-empinada',
        nombre: 'Pasaje Empinado',
        nivelaciones: [],
        rasante: {
          ...calle.rasante!,
          progresivaArranque: 0,
          cotaArranque: 3200,
          pendienteLongitudinal: 12,
        },
      },
    ],
  }
}
