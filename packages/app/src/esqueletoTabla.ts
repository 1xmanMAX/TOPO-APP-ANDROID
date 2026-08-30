import { construirGrilla, type Calle } from '@topo/core'

/**
 * Una columna de las tablas: la llave con la que se busca cada celda y los
 * dos textos con los que se la nombra. Van juntos a propósito — quien pinta
 * una columna tiene ahí mismo cómo se llama, sin volver a buscarla en la
 * sección de la calle. Buscarla en cada vista era tener nueve sitios donde
 * equivocarse.
 */
export interface ElementoTabla {
  /** El id del punto de la sección: con esto se compone `claveCelda`, nunca con el texto. */
  clave: string
  /** El texto que se lee en pantalla: «Borde izquierdo». */
  nombre: string
  /**
   * La palabra corta que Max escribe en su hoja: «BI». Para los rótulos del
   * dibujo, donde el nombre largo no cabe, y para las cabeceras de lo
   * exportado, que tienen que poder volver a importarse.
   */
  palabra: string
}

export interface EsqueletoTabla {
  progresivas: number[]
  elementos: ElementoTabla[]
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

  const vistos = new Map<string, { elemento: ElementoTabla; offset: number }>()
  for (const celda of celdas) {
    if (vistos.has(celda.elementoClave)) continue
    vistos.set(celda.elementoClave, {
      elemento: {
        clave: celda.elementoClave,
        nombre: celda.elementoNombre,
        palabra: celda.elementoPalabra,
      },
      offset: celda.offset,
    })
  }
  const elementos = [...vistos.values()].sort((a, b) => a.offset - b.offset).map((v) => v.elemento)

  return { progresivas: progresivasOrdenadas, elementos }
}
