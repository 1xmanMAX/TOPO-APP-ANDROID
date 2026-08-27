import type { Calle, Estacion } from '../modelo/tipos'
import { redondear3 } from '../numero'

export interface CeldaGrilla {
  progresiva: number
  elementoClave: string
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

/**
 * La grilla sale de las progresivas medidas, no de un intervalo inventado:
 * quien llama las pasa **ya ordenadas y sin repetir** — esta función no las
 * limpia, para que quien la use sepa qué va a salir. Los puntos de la calle sí
 * se ordenan aquí, por distancia al eje, para que las columnas salgan siempre
 * en el mismo orden sin importar cómo se escribieron.
 */
export function construirGrilla(calle: Calle, progresivas: number[]): CeldaGrilla[] {
  const puntosOrdenados = [...calle.puntos].sort((a, b) => a.distancia - b.distancia)

  const celdas: CeldaGrilla[] = []
  for (const progresiva of progresivas) {
    for (const punto of puntosOrdenados) {
      celdas.push({
        progresiva,
        elementoClave: punto.codigo,
        offset: punto.distancia,
        clave: claveCelda(progresiva, punto.codigo),
      })
    }
  }
  return celdas
}

/**
 * Las progresivas que de verdad se midieron en estas estaciones: las de cada
 * lectura cuyo destino es una celda de grilla, sin repetir y ordenadas. Es lo
 * que alimenta a `construirGrilla` desde una toma — nunca un rango inventado.
 */
export function progresivasMedidas(estaciones: Estacion[]): number[] {
  const valores = new Set<number>()
  for (const estacion of estaciones) {
    for (const lectura of estacion.intermedias) {
      if (lectura.destino.tipo === 'celda') valores.add(lectura.destino.celda.progresiva)
    }
    if (estacion.vistaAdelante && estacion.vistaAdelante.destino.tipo === 'celda') {
      valores.add(estacion.vistaAdelante.destino.celda.progresiva)
    }
    if (estacion.vistaAtras.destino.tipo === 'celda') {
      valores.add(estacion.vistaAtras.destino.celda.progresiva)
    }
  }
  return [...valores].sort((a, b) => a - b)
}
