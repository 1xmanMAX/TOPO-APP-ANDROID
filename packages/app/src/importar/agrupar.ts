import type { NoImportado } from './interpretar'

/** Lo que quedó fuera, contado una sola vez y con todos sus motivos juntos. */
export interface CosaNoImportada {
  valor: string
  veces: number
  motivos: string[]
}

/**
 * Junta lo no importado por su contenido, no por el camino que lo dejó fuera.
 *
 * El intérprete puede nombrar el mismo valor dos veces —una porque su columna
 * entera se quedó fuera, y otra porque su fila tampoco entró—, y los ceros
 * arrastrados del archivo de Max salen justo por esos dos caminos. No se
 * pierde nada, se dice de más; pero repetido en pantalla parece desorden y
 * tapa lo demás. Aquí cada valor sale una vez, con todos sus motivos.
 *
 * Las veces son las del camino que más lo vio, no la suma de los dos: son las
 * mismas celdas contadas dos veces, y sumarlas diría que hay el doble.
 *
 * Agrupa por el **texto** de la celda, así que dos celdas distintas que
 * casualmente lleven escrito lo mismo salen en un solo renglón, con los dos
 * motivos. Se dice de menos, nunca de más: ninguna se calla.
 */
export function agruparNoImportado(entradas: NoImportado[]): CosaNoImportada[] {
  const porValor = new Map<string, CosaNoImportada>()

  for (const entrada of entradas) {
    const vecesEnEstaEntrada = new Map<string, number>()
    for (const valor of entrada.contenido) {
      vecesEnEstaEntrada.set(valor, (vecesEnEstaEntrada.get(valor) ?? 0) + 1)
    }

    for (const [valor, veces] of vecesEnEstaEntrada) {
      const cosa = porValor.get(valor)
      if (!cosa) {
        porValor.set(valor, { valor, veces, motivos: [entrada.que] })
        continue
      }

      cosa.veces = Math.max(cosa.veces, veces)
      if (!cosa.motivos.includes(entrada.que)) cosa.motivos.push(entrada.que)
    }
  }

  return [...porValor.values()]
}
