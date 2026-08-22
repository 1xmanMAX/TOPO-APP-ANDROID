import { construirGrilla, type Calle, type Plantilla } from '@topo/core'

export interface EsqueletoTabla {
  progresivas: number[]
  elementos: string[]
}

/**
 * El armazón que comparten las tablas de una misma calle — cotas, espesores
 * y diferencias contra la rasante, tanto en pantalla como en lo exportado:
 * qué progresivas van de filas y en qué orden de columnas van los elementos
 * (por `offset`, no por como estén escritos en la plantilla). Las tablas de
 * la misma calle tienen que salir con las columnas alineadas — si cada una
 * decidiera el orden por su cuenta, un empate de `offset` podría ordenarlas
 * distinto y desalinearlas sin que nada lo avisara. `null` si la calle o la
 * plantilla no arman una grilla válida.
 */
export function armarEsqueletoTabla(calle: Calle, plantilla: Plantilla): EsqueletoTabla | null {
  let celdas: ReturnType<typeof construirGrilla> = []
  try {
    celdas = construirGrilla(calle, plantilla)
  } catch {
    return null
  }

  const progresivas = [...new Set(celdas.map((c) => c.progresiva))].sort((a, b) => a - b)

  const vistos = new Map<string, number>()
  for (const celda of celdas) if (!vistos.has(celda.elementoClave)) vistos.set(celda.elementoClave, celda.offset)
  const elementos = [...vistos.entries()].sort((a, b) => a[1] - b[1]).map(([clave]) => clave)

  return { progresivas, elementos }
}
