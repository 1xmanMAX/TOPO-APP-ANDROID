import { formatearProgresiva, pendientesDeLinea, type LineaNivel } from '@topo/core'
import MarcoGrafico from '../../grafico/MarcoGrafico'

/**
 * Arriba en azul (la línea de arriba, o la capa que se va a dar) y abajo en
 * ocre (la de abajo, o la capa medida de la que se parte): los colores de
 * la herramienta de Max, con los tokens del lienzo para el modo oscuro.
 */
export type TonoLinea = 'superior' | 'inferior'

const TRAZO: Record<TonoLinea, string> = {
  superior: 'stroke-proyecto',
  inferior: 'stroke-aviso',
}
const RELLENO: Record<TonoLinea, string> = {
  superior: 'fill-proyecto',
  inferior: 'fill-aviso',
}

export interface LineaDibujo {
  linea: LineaNivel
  tono: TonoLinea
  /** Trazo discontinuo: lo que todavía no existe (la capa a dar). */
  discontinua?: boolean
  /** Rotula la pendiente de cada tramo largo, como su gráfica. */
  pendientes?: boolean
}

/** Un segmento vertical entre dos cotas en una progresiva (la separación). */
export interface Vertical {
  progresiva: number
  desde: number
  hasta: number
}

export interface Cursor extends Vertical {
  tono: 'pasa' | 'falla' | 'tinta'
  /** Lo que se escribe junto al cursor («18.0 cm»). */
  texto?: string
}

interface Props {
  etiqueta: string
  lineas: LineaDibujo[]
  /** Lo que no cumple: en rojo. */
  fallas?: Vertical[]
  /** El punto crítico: más grueso, con dos círculos. */
  critico?: Vertical | null
  /** El escáner: la línea vertical que se mueve con el deslizador. */
  cursor?: Cursor | null
  alto?: number
}

const TONO_CURSOR: Record<Cursor['tono'], { trazo: string; relleno: string }> = {
  pasa: { trazo: 'stroke-pasa', relleno: 'fill-pasa' },
  falla: { trazo: 'stroke-falla', relleno: 'fill-falla' },
  tinta: { trazo: 'stroke-tinta', relleno: 'fill-tinta' },
}

/** El halo que deja leer un rótulo encima de las líneas (la «paint-order» de su gráfica). */
const HALO = 'stroke-tarjeta [paint-order:stroke] [stroke-width:3px]'

/**
 * Las líneas de niveles a lo largo de la calle, con lo que pide cada
 * pantalla encima: la separación que no cumple, el punto crítico y el
 * escáner. Sale del mismo marco que el perfil longitudinal, así que en el
 * celular los rótulos conservan su tamaño.
 */
export default function GraficoNiveles({ etiqueta, lineas, fallas = [], critico = null, cursor = null, alto = 240 }: Props) {
  const puntos = lineas.flatMap((l) => l.linea.puntos)
  if (puntos.length < 2) return null
  const valoresY = [...puntos.map((p) => p.cota), ...(cursor ? [cursor.desde, cursor.hasta] : [])]
  const valoresX = [...puntos.map((p) => p.progresiva), ...(cursor ? [cursor.progresiva] : [])]

  return (
    <MarcoGrafico
      valoresX={valoresX}
      valoresY={valoresY}
      rotuloX="progresiva"
      formatearX={formatearProgresiva}
      margenX={0.04}
      alto={alto}
      etiqueta={etiqueta}
    >
      {({ x, y }) => (
        <>
          {lineas.map(({ linea, tono, discontinua }, i) => (
            <g key={`l-${i}`}>
              <polyline
                fill="none"
                strokeWidth={2.4}
                strokeDasharray={discontinua ? '7 4' : undefined}
                className={TRAZO[tono]}
                points={linea.puntos.map((p) => `${x(p.progresiva)},${y(p.cota)}`).join(' ')}
              />
              {!discontinua &&
                linea.puntos.map((p, j) => (
                  // Un punto sin comprobar va hueco: se ve sin depender del color.
                  <circle
                    key={j}
                    cx={x(p.progresiva)}
                    cy={y(p.cota)}
                    r={3.4}
                    strokeWidth={1.6}
                    className={p.comprobado ? `${RELLENO[tono]} ${TRAZO[tono]}` : `fill-tarjeta ${TRAZO[tono]}`}
                  />
                ))}
            </g>
          ))}

          {lineas.map(({ linea, tono, pendientes }, i) =>
            !pendientes
              ? null
              : pendientesDeLinea(linea).map((t) => {
                  const a = linea.puntos.find((p) => p.progresiva === t.desde)
                  const b = linea.puntos.find((p) => p.progresiva === t.hasta)
                  if (!a || !b) return null
                  const ax = x(a.progresiva)
                  const bx = x(b.progresiva)
                  const ay = y(a.cota)
                  const by = y(b.cota)
                  // Solo donde el tramo es largo: si no, los rótulos se pisan.
                  if (Math.hypot(bx - ax, by - ay) < 56) return null
                  const signo = t.pendientePct > 0 ? '+' : t.pendientePct < 0 ? '−' : ''
                  return (
                    <text
                      key={`p-${i}-${t.desde}`}
                      x={(ax + bx) / 2}
                      y={(ay + by) / 2 + (tono === 'superior' ? -8 : 16)}
                      textAnchor="middle"
                      className={`${RELLENO[tono]} ${HALO} text-[11px] font-semibold`}
                    >
                      {signo}
                      {Math.abs(t.pendientePct).toFixed(2)}%
                    </text>
                  )
                }),
          )}

          {fallas.map((f) => (
            <line
              key={`f-${f.progresiva}`}
              x1={x(f.progresiva)}
              x2={x(f.progresiva)}
              y1={y(f.desde)}
              y2={y(f.hasta)}
              strokeWidth={2.5}
              className="stroke-falla"
            />
          ))}

          {critico && (
            <g className="stroke-tinta" fill="none" strokeWidth={2}>
              <line x1={x(critico.progresiva)} x2={x(critico.progresiva)} y1={y(critico.desde)} y2={y(critico.hasta)} strokeWidth={3} />
              <circle cx={x(critico.progresiva)} cy={y(critico.desde)} r={5} />
              <circle cx={x(critico.progresiva)} cy={y(critico.hasta)} r={5} />
            </g>
          )}

          {cursor && (
            <g>
              <line
                x1={x(cursor.progresiva)}
                x2={x(cursor.progresiva)}
                y1={8}
                y2={alto - 34}
                strokeWidth={1.2}
                strokeDasharray="5 4"
                className={TONO_CURSOR[cursor.tono].trazo}
              />
              <line
                x1={x(cursor.progresiva)}
                x2={x(cursor.progresiva)}
                y1={y(cursor.desde)}
                y2={y(cursor.hasta)}
                strokeWidth={4}
                className={TONO_CURSOR[cursor.tono].trazo}
              />
              {cursor.texto && (
                <text
                  // Cerca del borde derecho el rótulo va a la izquierda del cursor, para no salirse.
                  x={x(cursor.progresiva) + (x(cursor.progresiva) > 0.8 * x(Math.max(...valoresX)) ? -8 : 8)}
                  y={(y(cursor.desde) + y(cursor.hasta)) / 2 - 4}
                  textAnchor={x(cursor.progresiva) > 0.8 * x(Math.max(...valoresX)) ? 'end' : 'start'}
                  className={`${TONO_CURSOR[cursor.tono].relleno} ${HALO} text-[13px] font-bold`}
                >
                  {cursor.texto}
                </text>
              )}
            </g>
          )}
        </>
      )}
    </MarcoGrafico>
  )
}

/** La leyenda del gráfico: el color nunca va solo, cada línea dice su nombre. */
export function LeyendaNiveles({ lineas }: { lineas: { nombre: string; tono: TonoLinea; discontinua?: boolean }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] font-semibold">
      {lineas.map((l) => (
        <li key={l.nombre} className={l.tono === 'superior' ? 'text-proyecto' : 'text-aviso'}>
          <span aria-hidden="true">{l.discontinua ? '╌ ' : '━ '}</span>
          {l.nombre}
        </li>
      ))}
      <li className="font-normal text-tenue">
        <span aria-hidden="true">○ </span>punto sin comprobar
      </li>
    </ul>
  )
}
