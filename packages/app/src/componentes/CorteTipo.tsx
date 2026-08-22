import { desnivelTransversal, type Rasante, type TramoTransversal } from '@topo/core'
import { useMemo } from 'react'
import MarcoGrafico from '../grafico/MarcoGrafico'

interface Props {
  rasante: Rasante
  /** Ancho fijo del dibujo, en metros a cada lado del eje. Sin esto, el ancho salta con cada tramo que se edita. */
  anchoMaximo?: number
}

interface Quiebre {
  clave: string
  /** Metros desde el eje. Negativo a la izquierda. */
  offset: number
  desnivel: number
}

/**
 * Qué lista de tramos gobierna un lado. Repite la misma regla que
 * `tramosDelLado` de `packages/core/src/rasante/geometria.ts` (no exportada):
 * si `simetrica` es false y `tramosIzquierda` es null, la rasante está a
 * medio configurar y se degrada en silencio al lado derecho.
 */
function tramosDelLado(rasante: Rasante, lado: 'derecha' | 'izquierda'): TramoTransversal[] {
  if (lado === 'derecha') return rasante.tramos
  return rasante.simetrica ? rasante.tramos : (rasante.tramosIzquierda ?? rasante.tramos)
}

/**
 * Los quiebres de un lado: uno por tramo, en el offset donde termina. Un
 * tramo de tipo `salto` aporta dos, ambos en su propio `hastaOffset` — el de
 * antes de la subida (la cota que traía el tramo anterior) y el de después
 * (ya con el salto aplicado) — para que la polilínea dibuje la cara vertical
 * del sardinel en vez de una rampa.
 */
function quiebresDelLado(rasante: Rasante, lado: 'derecha' | 'izquierda'): Quiebre[] {
  const signo = lado === 'derecha' ? 1 : -1
  const tramos = tramosDelLado(rasante, lado)
  const quiebres: Quiebre[] = []
  let anterior: TramoTransversal | null = null

  for (const tramo of tramos) {
    const offset = signo * tramo.hastaOffset

    if (tramo.tipo === 'salto') {
      const offsetAntes = signo * (anterior?.hastaOffset ?? 0)
      quiebres.push({
        clave: `${lado}-${tramo.nombre}-antes`,
        offset,
        desnivel: desnivelTransversal(rasante, offsetAntes) ?? 0,
      })
      quiebres.push({
        clave: `${lado}-${tramo.nombre}-despues`,
        offset,
        desnivel: desnivelTransversal(rasante, offset) ?? 0,
      })
    } else {
      quiebres.push({
        clave: `${lado}-${tramo.nombre}`,
        offset,
        desnivel: desnivelTransversal(rasante, offset) ?? 0,
      })
    }

    anterior = tramo
  }

  return quiebres
}

/** El nombre accesible de un quiebre: a qué distancia y a qué cota queda, con el signo explicado en palabras. */
function etiquetaQuiebre(offset: number, desnivel: number): string {
  const distancia = Math.abs(offset).toFixed(2)
  if (desnivel === 0) return `Quiebre a ${distancia} m del eje: en el eje`
  const verbo = desnivel > 0 ? 'sube' : 'baja'
  const relativo = desnivel > 0 ? 'sobre' : 'bajo'
  return `Quiebre a ${distancia} m del eje: ${verbo} ${Math.abs(desnivel).toFixed(3)} m ${relativo} el eje`
}

/**
 * Dibuja la sección transversal que produce la rasante, sin datos medidos:
 * solo los quiebres que definen los tramos, a los dos lados del eje. Sirve
 * para comprobar en vivo, mientras se escribe, que el signo de cada tramo es
 * el que se quería.
 */
export default function CorteTipo({ rasante, anchoMaximo }: Props) {
  const puntos = useMemo(() => {
    const izquierda = quiebresDelLado(rasante, 'izquierda')
    const derecha = quiebresDelLado(rasante, 'derecha')
    const eje: Quiebre = { clave: 'eje', offset: 0, desnivel: 0 }
    // De más lejos a la izquierda hasta más lejos a la derecha, pasando por
    // el eje: es el orden en que la polilínea tiene que recorrerlos.
    return [...[...izquierda].reverse(), eje, ...derecha]
  }, [rasante])

  const valoresX = useMemo(() => {
    const offsets = puntos.map((p) => p.offset)
    return anchoMaximo ? [...offsets, -anchoMaximo, anchoMaximo] : offsets
  }, [puntos, anchoMaximo])

  return (
    <MarcoGrafico
      valoresX={valoresX}
      valoresY={puntos.map((p) => p.desnivel)}
      margenX={0.1}
      rotuloX="distancia al eje (m)"
      formatearX={(valor) => valor.toFixed(1)}
      etiqueta="Corte tipo de la sección"
    >
      {({ x, y }) => (
        <>
          <polyline
            points={puntos.map((p) => `${x(p.offset).toFixed(1)},${y(p.desnivel).toFixed(1)}`).join(' ')}
            fill="none"
            className="stroke-marca"
            strokeWidth={2}
          />
          {puntos.map((punto, indice) => (
            <circle
              key={`${punto.clave}-${indice}`}
              cx={x(punto.offset)}
              cy={y(punto.desnivel)}
              r={4.5}
              aria-label={etiquetaQuiebre(punto.offset, punto.desnivel)}
              className={punto.clave === 'eje' ? 'fill-slate-500 dark:fill-slate-400' : 'fill-marca'}
            />
          ))}
        </>
      )}
    </MarcoGrafico>
  )
}
