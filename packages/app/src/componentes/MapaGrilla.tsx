import { claveCelda, formatearProgresiva } from '@topo/core'
import { useMemo } from 'react'

/**
 * Cómo se pinta una celda cuando el mapa colorea por estado en vez de solo
 * marcar lo que ya se midió. `simbolo` y `etiqueta` son el segundo canal —
 * además del color — para que el estado nunca dependa solo de la vista:
 * `simbolo` va en pantalla, `etiqueta` es el nombre accesible completo.
 */
export interface CeldaPintada {
  simbolo: string
  etiqueta: string
  clases: string
}

interface Props {
  progresivas: number[]
  elementos: string[]
  llenas: Set<string>
  claveActiva: string | null
  alElegir: (clave: string) => void
  /**
   * Cuando se indica, sustituye el pintado binario (medida/vacía) por el que
   * decida quien llama, celda por celda: el mapa de estado la usa para
   * colorear por conforme, al límite, fuera, sin medir o sin rasante, en vez
   * de marcar solo lo que ya se midió.
   */
  pintarCelda?: (clave: string) => CeldaPintada
  /**
   * `porElemento` (por defecto) es la rejilla de siempre: una progresiva por
   * fila, un elemento por columna — así la usa la libreta. `porProgresiva`
   * la transpone: un elemento por fila, una progresiva por columna, para que
   * el mapa de la calle quepa de un vistazo con la calle entera a lo ancho.
   */
  orientacion?: 'porElemento' | 'porProgresiva'
}

interface CeldaFila {
  clave: string
  progresiva: number
  elementoClave: string
}

interface Fila {
  clave: string
  titulo: string
  celdas: CeldaFila[]
}

export default function MapaGrilla({
  progresivas,
  elementos,
  llenas,
  claveActiva,
  alElegir,
  pintarCelda,
  orientacion = 'porElemento',
}: Props) {
  const porElemento = orientacion === 'porElemento'

  const cabecera = useMemo(
    () => (porElemento ? elementos : progresivas.map((p) => formatearProgresiva(p))),
    [porElemento, elementos, progresivas],
  )

  const filas = useMemo<Fila[]>(() => {
    if (porElemento) {
      return progresivas.map((progresiva) => ({
        clave: String(progresiva),
        titulo: formatearProgresiva(progresiva),
        celdas: elementos.map((elementoClave) => ({
          clave: claveCelda(progresiva, elementoClave),
          progresiva,
          elementoClave,
        })),
      }))
    }
    return elementos.map((elementoClave) => ({
      clave: elementoClave,
      titulo: elementoClave,
      celdas: progresivas.map((progresiva) => ({
        clave: claveCelda(progresiva, elementoClave),
        progresiva,
        elementoClave,
      })),
    }))
  }, [porElemento, progresivas, elementos])

  return (
    <div className="overflow-auto rounded border border-slate-200 dark:border-slate-800">
      <table className="w-full border-collapse text-xs">
        <thead className="sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">
          <tr>
            <th className="sticky left-0 z-10 bg-slate-50 px-2 py-1.5 text-left font-medium text-slate-500 dark:bg-slate-900">
              {porElemento ? 'Progresiva' : 'Elemento'}
            </th>
            {cabecera.map((titulo) => (
              <th key={titulo} className="px-2 py-1.5 font-medium text-slate-500">
                {titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((fila) => (
            <tr key={fila.clave} className="border-t border-slate-100 dark:border-slate-800">
              <td className="numerico sticky left-0 z-10 bg-white px-2 py-1 text-slate-600 dark:bg-slate-950 dark:text-slate-300">
                {fila.titulo}
              </td>
              {fila.celdas.map(({ clave, progresiva, elementoClave }) => {
                const llena = llenas.has(clave)
                const activa = clave === claveActiva
                const pintado = pintarCelda?.(clave)
                return (
                  <td key={clave} className="p-0.5 text-center">
                    <button
                      type="button"
                      aria-label={pintado?.etiqueta ?? `${formatearProgresiva(progresiva)} ${elementoClave}`}
                      onClick={() => alElegir(clave)}
                      className={`h-6 w-full rounded text-xs ${
                        activa
                          ? 'bg-marca text-white'
                          : pintado
                            ? pintado.clases
                            : llena
                              ? 'bg-pasa/20 text-pasa'
                              : 'bg-slate-100 text-slate-400 dark:bg-slate-800'
                      }`}
                    >
                      {pintado ? pintado.simbolo : llena ? '✓' : '·'}
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
