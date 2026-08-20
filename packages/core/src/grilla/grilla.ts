import type { Calle, Plantilla } from '../modelo/tipos'
import { redondear3 } from '../numero'
import { generarProgresivas } from './progresivas'

export interface CeldaGrilla {
  progresiva: number
  elementoClave: string
  etiqueta: string
  offset: number
  clave: string
}

export function claveCelda(progresiva: number, elementoClave: string): string {
  return `${redondear3(progresiva)}|${elementoClave}`
}

export function construirGrilla(calle: Calle, plantilla: Plantilla): CeldaGrilla[] {
  const progresivas = generarProgresivas(
    calle.progresivaInicio,
    calle.progresivaFin,
    calle.intervalo,
    calle.progresivasExtra,
  )

  const celdas: CeldaGrilla[] = []
  for (const progresiva of progresivas) {
    for (const elemento of plantilla.elementos) {
      celdas.push({
        progresiva,
        elementoClave: elemento.clave,
        etiqueta: elemento.etiqueta,
        offset: elemento.offset,
        clave: claveCelda(progresiva, elemento.clave),
      })
    }
  }
  return celdas
}
