import { claveCelda, formatearProgresiva } from '@topo/core'
import { useMemo } from 'react'
import type { ElementoTabla } from '../esqueletoTabla'
import { CLASES_ESTADO } from './ui'

/**
 * Cómo se pinta una celda cuando el mapa colorea por estado en vez de solo
 * marcar lo que ya se midió. `simbolo` y `etiqueta` son el segundo canal —
 * además del color — para que el estado nunca dependa solo de la vista:
 * `simbolo` va en pantalla, `etiqueta` es el nombre accesible completo.
 */
export interface CeldaPintada {
  simbolo: string
  /** Un texto corto que va tras el símbolo en la celda («+5»). Opcional. */
  texto?: string
  etiqueta: string
  clases: string
}

interface Props {
  progresivas: number[]
  /** Las columnas, con su llave y su nombre ya resueltos: ver `ElementoTabla`. */
  elementos: ElementoTabla[]
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
  /**
   * Cómo se nombra el elemento de esta celda en el nombre accesible por
   * defecto: el nombre completo del punto («Borde izquierdo»), no la palabra
   * corta que lleva la cabecera. En pantalla manda el ancho de la rejilla,
   * pero aquí manda distinguir: la sección permite la misma palabra a los dos
   * lados del eje, así que dos celdas anunciadas «0+000 VEREDA» en la misma
   * fila no se distinguirían de oído.
   */
  elementoNombre: string
}

interface Fila {
  clave: string
  titulo: string
  celdas: CeldaFila[]
}

/** Una columna de la cabecera: la llave es para React, el título es lo que se lee. */
interface Columna {
  clave: string
  titulo: string
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

  const cabecera = useMemo<Columna[]>(
    () =>
      porElemento
        ? elementos.map((elemento) => ({ clave: elemento.clave, titulo: elemento.palabra }))
        : progresivas.map((p) => ({ clave: String(p), titulo: formatearProgresiva(p) })),
    [porElemento, elementos, progresivas],
  )

  const filas = useMemo<Fila[]>(() => {
    if (porElemento) {
      return progresivas.map((progresiva) => ({
        clave: String(progresiva),
        titulo: formatearProgresiva(progresiva),
        celdas: elementos.map((elemento) => ({
          clave: claveCelda(progresiva, elemento.clave),
          progresiva,
          elementoNombre: elemento.nombre,
        })),
      }))
    }
    return elementos.map((elemento) => ({
      clave: elemento.clave,
      titulo: elemento.palabra,
      celdas: progresivas.map((progresiva) => ({
        clave: claveCelda(progresiva, elemento.clave),
        progresiva,
        elementoNombre: elemento.nombre,
      })),
    }))
  }, [porElemento, progresivas, elementos])

  return (
    // El borde y el fondo los pone la tarjeta que lo contiene; aquí solo se
    // desplaza (VistaComun lo busca como [&_div.overflow-auto]).
    <div className="overflow-auto">
      <table className="w-full border-collapse text-xs">
        <thead className="sticky top-0 z-20 bg-tarjeta">
          <tr>
            <th className="sticky left-0 z-10 bg-tarjeta px-2 py-1.5 text-left text-[13px] font-medium text-tenue">
              {porElemento ? 'Progresiva' : 'Elemento'}
            </th>
            {cabecera.map(({ clave, titulo }) => (
              <th
                key={clave}
                className={`px-1 py-1.5 text-[13px] ${
                  porElemento ? 'font-medium text-slate-700 dark:text-slate-300' : 'font-mono font-normal text-tenue'
                }`}
              >
                {titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((fila) => (
            <tr key={fila.clave}>
              <td
                className={`sticky left-0 z-10 bg-tarjeta px-2 py-0.5 text-[13px] whitespace-nowrap ${
                  porElemento ? 'numerico text-tenue' : 'font-medium text-slate-700 dark:text-slate-300'
                }`}
              >
                {fila.titulo}
              </td>
              {fila.celdas.map(({ clave, progresiva, elementoNombre }) => {
                const llena = llenas.has(clave)
                const activa = clave === claveActiva
                const pintado = pintarCelda?.(clave)
                return (
                  <td key={clave} className="p-0.5 text-center">
                    <button
                      type="button"
                      aria-label={pintado?.etiqueta ?? `${formatearProgresiva(progresiva)} ${elementoNombre}`}
                      onClick={() => alElegir(clave)}
                      className={`h-11 w-full min-w-[52px] rounded-md font-mono text-[13px] font-semibold whitespace-nowrap md:h-[38px] ${
                        pintado ? pintado.clases : llena ? CLASES_ESTADO.sinMedir : 'bg-sin-suave text-sin'
                      } ${activa ? 'ring-2 ring-tinta ring-inset' : ''}`}
                    >
                      <span aria-hidden="true">{pintado ? pintado.simbolo : llena ? '●' : '·'}</span>
                      {pintado?.texto && ' ' + pintado.texto}
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
