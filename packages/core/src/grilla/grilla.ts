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

/**
 * Deshace `claveCelda`. Está aquí, junto a quien la compone, para que el día
 * que la clave cambie de forma no haya que perseguirla por media aplicación.
 */
export function partirClaveCelda(
  clave: string,
): { progresiva: number; elementoClave: string } | null {
  const separador = clave.indexOf('|')
  if (separador <= 0) return null

  const progresiva = Number(clave.slice(0, separador))
  if (!Number.isFinite(progresiva)) return null

  const elementoClave = clave.slice(separador + 1)
  if (elementoClave === '') return null

  return { progresiva, elementoClave }
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
