import type { Calle, Estacion } from '../modelo/tipos'
import { redondear3 } from '../numero'

export interface CeldaGrilla {
  progresiva: number
  /** El id del punto de la sección. Llave interna: no se le enseña a nadie. */
  elementoClave: string
  /**
   * Cómo se llama el punto en pantalla («Borde izquierdo»). Viaja aquí, con
   * la celda, para que ninguna vista tenga que volver a buscarlo en la
   * sección: el texto legible sale del mismo sitio que la llave, y así solo
   * hay un lugar donde puedan discrepar.
   */
  elementoNombre: string
  /**
   * La palabra corta con la que Max lo escribe en su hoja («BI»). Es para
   * los dos sitios donde el nombre largo no sirve: los rótulos apretados del
   * dibujo y las cabeceras de lo que se exporta, que tienen que poder
   * volver a importarse. Si el punto se quedó sin palabras, cae al nombre.
   */
  elementoPalabra: string
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
 * limpia, para que quien la use sepa qué va a salir. Los puntos de la sección
 * sí se ordenan aquí, por distancia al eje, para que las columnas salgan
 * siempre en el mismo orden sin importar cómo se escribieron.
 *
 * `elementoClave` es el **id** del punto de la sección, nunca una de sus
 * palabras: la clave queda guardada dentro de cada lectura del proyecto, y
 * las palabras las edita Max cuando quiere. Con las palabras de llave,
 * renombrar una dejaría huérfanas lecturas ya tomadas; el id no cambia nunca.
 * Por eso cada celda sale de aquí con su texto ya resuelto —`elementoNombre`
 * y `elementoPalabra`—: la llave no se enseña, y quien pinta la celda no
 * tiene que ir a buscar cómo se llama.
 */
export function construirGrilla(calle: Calle, progresivas: number[]): CeldaGrilla[] {
  const puntosOrdenados = [...calle.seccion.puntos].sort((a, b) => a.distancia - b.distancia)

  const celdas: CeldaGrilla[] = []
  for (const progresiva of progresivas) {
    for (const punto of puntosOrdenados) {
      celdas.push({
        progresiva,
        elementoClave: punto.id,
        elementoNombre: punto.nombre,
        // Un punto puede quedarse sin ninguna palabra: Max las añade y las
        // quita. Entonces el nombre es lo único que hay para enseñar.
        elementoPalabra: punto.palabras[0] ?? punto.nombre,
        offset: punto.distancia,
        clave: claveCelda(progresiva, punto.id),
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
