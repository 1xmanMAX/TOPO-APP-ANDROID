import { construirGrilla, type Calle } from '@topo/core'

export interface EsqueletoTabla {
  progresivas: number[]
  elementos: string[]
}

/**
 * El armazón que comparten las tablas de una misma calle — cotas, espesores
 * y diferencias contra la rasante, tanto en pantalla como en lo exportado:
 * qué progresivas van de filas y en qué orden de columnas van los elementos
 * (por `distancia`, no por como estén escritos en la calle). Las tablas de
 * la misma calle tienen que salir con las columnas alineadas — si cada una
 * decidiera el orden por su cuenta, un empate de distancia podría ordenarlas
 * distinto y desalinearlas sin que nada lo avisara.
 */
export function armarEsqueletoTabla(calle: Calle, progresivas: number[]): EsqueletoTabla {
  const celdas = construirGrilla(calle, progresivas)

  const progresivasOrdenadas = [...new Set(celdas.map((c) => c.progresiva))].sort((a, b) => a - b)

  const vistos = new Map<string, number>()
  for (const celda of celdas) if (!vistos.has(celda.elementoClave)) vistos.set(celda.elementoClave, celda.offset)
  const elementos = [...vistos.entries()].sort((a, b) => a[1] - b[1]).map(([clave]) => clave)

  return { progresivas: progresivasOrdenadas, elementos }
}
