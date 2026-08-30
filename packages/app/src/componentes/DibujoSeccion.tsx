import { ladoDe, palabraDePunto, type PuntoSeccion } from '@topo/core'

/** Lienzo del dibujo, en unidades del `viewBox`. */
const ANCHO = 720
const ALTO = 190
/** Aire a los lados: el punto más lejano cae justo aquí, no pegado al borde. */
const MARGEN = 48
/** Altura de la línea de la calzada dentro del lienzo. */
const SUELO = 112

/**
 * Pasos posibles de la barra de escala, en metros. El más pequeño es 0.20
 * porque el dibujo nunca baja de 1 m de alcance: con ese mínimo la escala
 * llega a 312 px/m, y ahí un paso de 0.50 daría una barra de 156 px, más
 * larga que el máximo que se le deja.
 */
const PASOS_BARRA = [0.2, 0.5, 1, 2, 5, 10, 20, 50]
/** Lo que se le deja crecer a la barra de escala dentro del lienzo. */
const BARRA_MAXIMA = 140

interface Props {
  /**
   * Los puntos de la sección **ya ordenados de izquierda a derecha**: de los
   * extremos salen la línea de la calzada y el nombre accesible, y las dos
   * alturas alternas de los rótulos suponen ese orden para no pisarse.
   *
   * No tienen por qué estar guardados: este dibujo no sabe nada del almacén,
   * así que sirve igual para una sección declarada que para la que se está
   * proponiendo en una vista previa antes de aceptarla.
   */
  puntos: PuntoSeccion[]
}

/**
 * La distancia dicha en palabras: el signo no se lee en voz alta, el lado
 * sí. Negativo es izquierda, como en todo el modelo.
 */
function distanciaEnPalabras(distancia: number): string {
  const lado = ladoDe(distancia)
  if (lado === 'eje') return 'en el eje'
  return `${Math.abs(distancia).toFixed(2)} m a la ${lado}`
}

/** El paso más largo de la barra de escala que todavía cabe en el lienzo. */
function pasoDeBarra(escala: number): number {
  const caben = PASOS_BARRA.filter((paso) => paso * escala <= BARRA_MAXIMA)
  return caben[caben.length - 1] ?? PASOS_BARRA[0]!
}

/**
 * Todo lo que el dibujo enseña, dicho de corrido: es lo único que llega a
 * quien no lo ve, y por eso nombra los extremos de la sección. Lo demás —lo
 * que se puede tocar— está en la lista de puntos de la pantalla, que basta
 * por sí sola.
 */
function etiquetaDelDibujo(puntos: PuntoSeccion[]): string {
  if (puntos.length === 0) return 'Sección de la calle: todavía sin puntos'

  const primero = puntos[0]!
  const ultimo = puntos[puntos.length - 1]!
  return (
    `Sección de la calle: ${puntos.length} ${puntos.length === 1 ? 'punto' : 'puntos'}, ` +
    `desde ${distanciaEnPalabras(primero.distancia)} hasta ${distanciaEnPalabras(ultimo.distancia)}`
  )
}

/**
 * La sección vista de frente: el eje al centro y cada punto colocado por su
 * distancia, a escala, con la palabra con la que se escribe en la hoja.
 *
 * El rótulo es la palabra y no el nombre largo porque a 0.15 m de separación
 * —un sardinel y su borde— dos nombres enteros se pisan; `palabraDePunto`
 * existe justo para estos rótulos, y cae al nombre largo si el punto todavía
 * no tiene ninguna palabra. Los rótulos van a dos alturas alternas por el
 * mismo motivo.
 *
 * Este dibujo **no** es el único portador del significado: no hay nada aquí
 * que no se pueda leer y cambiar en la lista de puntos.
 */
export default function DibujoSeccion({ puntos }: Props) {
  const alcance = Math.max(1, ...puntos.map((punto) => Math.abs(punto.distancia)))
  const escala = (ANCHO / 2 - MARGEN) / alcance
  const x = (distancia: number) => ANCHO / 2 + distancia * escala

  const paso = pasoDeBarra(escala)
  const primero = puntos[0]
  const ultimo = puntos[puntos.length - 1]

  return (
    <svg
      viewBox={`0 0 ${ANCHO} ${ALTO}`}
      role="img"
      aria-label={etiquetaDelDibujo(puntos)}
      className="w-full rounded border border-slate-200 dark:border-slate-800"
    >
      <text x={MARGEN} y={20} className="fill-slate-400 text-[10px]">
        izquierda
      </text>
      <text x={ANCHO - MARGEN} y={20} textAnchor="end" className="fill-slate-400 text-[10px]">
        derecha
      </text>

      <line
        x1={x(0)}
        x2={x(0)}
        y1={30}
        y2={SUELO + 30}
        strokeDasharray="4 4"
        className="stroke-slate-400 dark:stroke-slate-500"
      />

      {primero && ultimo && (
        <line
          x1={x(primero.distancia)}
          x2={x(ultimo.distancia)}
          y1={SUELO}
          y2={SUELO}
          strokeWidth={2}
          className="stroke-marca"
        />
      )}

      {puntos.map((punto, indice) => {
        const arriba = indice % 2 === 0
        const yPalabra = arriba ? SUELO - 24 : SUELO - 44
        const yDistancia = arriba ? SUELO + 20 : SUELO + 36

        return (
          <g key={punto.id}>
            <line
              x1={x(punto.distancia)}
              x2={x(punto.distancia)}
              y1={yPalabra + 4}
              y2={SUELO - 6}
              className="stroke-slate-300 dark:stroke-slate-700"
            />
            <circle cx={x(punto.distancia)} cy={SUELO} r={4.5} className="fill-marca" />
            <text
              x={x(punto.distancia)}
              y={yPalabra}
              textAnchor="middle"
              className="fill-slate-600 text-[10px] dark:fill-slate-300"
            >
              {palabraDePunto(punto)}
            </text>
            <text
              x={x(punto.distancia)}
              y={yDistancia}
              textAnchor="middle"
              className="fill-slate-400 text-[10px]"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {punto.distancia.toFixed(2)}
            </text>
          </g>
        )
      })}

      <line
        x1={MARGEN}
        x2={MARGEN + paso * escala}
        y1={ALTO - 14}
        y2={ALTO - 14}
        className="stroke-slate-400"
      />
      <line x1={MARGEN} x2={MARGEN} y1={ALTO - 18} y2={ALTO - 10} className="stroke-slate-400" />
      <line
        x1={MARGEN + paso * escala}
        x2={MARGEN + paso * escala}
        y1={ALTO - 18}
        y2={ALTO - 10}
        className="stroke-slate-400"
      />
      <text x={MARGEN + (paso * escala) / 2} y={ALTO - 20} textAnchor="middle" className="fill-slate-400 text-[10px]">
        {paso} m
      </text>
    </svg>
  )
}
