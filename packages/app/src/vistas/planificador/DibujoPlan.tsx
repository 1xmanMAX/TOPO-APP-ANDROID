import { formatearProgresiva, type PlanConControles } from '@topo/core'
import { formatearCota } from '../../formato'
import { escalaLineal, marcas } from '../../grafico/escala'
import type { Vertice } from './perfilDeLaCalle'
import type { Recorrido } from './recorrido'

const ANCHO = 720
const ALTO = 300
const M = { arriba: 18, derecha: 14, abajo: 32, izquierda: 60 }
// Con más estaciones que esto los rótulos se pisan: se dejan las marcas y
// las lecturas quedan en la tabla.
const MAX_ROTULOS = 12

interface Props {
  perfil: Vertice[]
  plan: PlanConControles
  recorrido: Recorrido
}

/**
 * El perfil de la pista con las estaciones, los puntos de cambio, los
 * controles, las visuales y lo que debe marcar la mira. La escala vertical
 * va exagerada (si no, una pista de 100 m con 8 m de desnivel sería una
 * raya) y el factor se escribe al pie: así nadie lee la pendiente a ojo.
 */
export default function DibujoPlan({ perfil, plan, recorrido }: Props) {
  const ida = recorrido.pasos.filter((p) => p.sentido === 'ida')
  const x0 = perfil[0]!.progresiva
  const x1 = perfil[perfil.length - 1]!.progresiva
  const cotas = [...perfil.map((v) => v.cota), ...ida.map((p) => p.estacion.alturaInstrumental)]
  const yMin = Math.min(...cotas)
  const yMax = Math.max(...cotas)
  const holgura = Math.max((yMax - yMin) * 0.12, 0.25)
  const dominioY: [number, number] = [yMin - holgura, yMax + holgura]

  const anchoUtil = ANCHO - M.izquierda - M.derecha
  const altoUtil = ALTO - M.arriba - M.abajo
  const x = escalaLineal([x0, x1], [M.izquierda, ANCHO - M.derecha])
  const y = escalaLineal(dominioY, [ALTO - M.abajo, M.arriba])
  const exageracion = altoUtil / (dominioY[1] - dominioY[0]) / (anchoUtil / (x1 - x0))
  const conRotulos = ida.length <= MAX_ROTULOS

  const resumen =
    `Perfil de ${formatearProgresiva(x0)} a ${formatearProgresiva(x1)}: ` +
    `${recorrido.totalEstaciones} estaciones, ${recorrido.totalCambios} puntos de cambio y ` +
    `${plan.controles.length} puntos de control. Escala vertical exagerada ${exageracion.toFixed(1)} veces.`

  return (
    <figure className="flex flex-col gap-2">
      {/* En el celular el dibujo no se encoge hasta ser ilegible: se desliza de lado dentro de su marco. */}
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${ANCHO} ${ALTO}`}
          role="img"
          aria-label={resumen}
          className="w-full min-w-[640px] rounded border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
        >
          {marcas(dominioY, 4).map((cota) => (
            <g key={`y-${cota}`}>
              <line
                x1={M.izquierda}
                x2={ANCHO - M.derecha}
                y1={y(cota)}
                y2={y(cota)}
                className="stroke-slate-200 dark:stroke-slate-800"
              />
              <text x={M.izquierda - 6} y={y(cota) + 4} textAnchor="end" className="fill-slate-500 text-[12px]">
                {formatearCota(cota)}
              </text>
            </g>
          ))}
          {marcas([x0, x1], 6).map((p) => (
            <text
              key={`x-${p}`}
              x={x(p)}
              y={ALTO - M.abajo + 16}
              textAnchor="middle"
              className="fill-slate-500 text-[12px]"
            >
              {formatearProgresiva(p)}
            </text>
          ))}

          <polyline
            points={perfil.map((v) => `${x(v.progresiva)},${y(v.cota)}`).join(' ')}
            fill="none"
            strokeWidth={2.5}
            className="stroke-slate-700 dark:stroke-slate-300"
          />

          {ida.map((paso) => {
            const e = paso.estacion
            const hi = y(e.alturaInstrumental)
            const aviso = e.alLimite
            return (
              <g key={`e-${paso.numero}`}>
                <line
                  x1={x(e.atras.progresiva)}
                  x2={x(e.adelante.progresiva)}
                  y1={hi}
                  y2={hi}
                  strokeDasharray="5 4"
                  strokeWidth={1.2}
                  className={aviso ? 'stroke-aviso' : 'stroke-marca'}
                />
                {[e.atras, e.adelante].map((v, i) => (
                  <line
                    key={i}
                    x1={x(v.progresiva)}
                    x2={x(v.progresiva)}
                    y1={y(v.cota)}
                    y2={hi}
                    strokeWidth={1}
                    className="stroke-slate-400 dark:stroke-slate-500"
                  />
                ))}
                {/* El nivel sobre su trípode: el anteojo a la altura instrumental, las patas al suelo. */}
                {[-6, 0, 6].map((abre) => (
                  <line
                    key={abre}
                    x1={x(e.progresiva)}
                    x2={x(e.progresiva) + abre}
                    y1={hi + 3}
                    y2={y(e.cotaSuelo)}
                    strokeWidth={1.3}
                    className="stroke-marca"
                  />
                ))}
                <rect
                  x={x(e.progresiva) - 6}
                  y={hi - 3}
                  width={12}
                  height={6}
                  rx={1.5}
                  className={aviso ? 'fill-aviso' : 'fill-marca'}
                />
                {conRotulos && (
                  <>
                    <text
                      x={x(e.progresiva)}
                      y={hi - 6}
                      textAnchor="middle"
                      className={`text-[13px] font-semibold ${aviso ? 'fill-aviso' : 'fill-marca'}`}
                    >
                      {aviso ? `△ E${paso.numero}` : `E${paso.numero}`}
                    </text>
                    <text
                      x={x(e.atras.progresiva) + 3}
                      y={hi + 15}
                      className="fill-slate-600 text-[12px] dark:fill-slate-300"
                    >
                      {e.atras.lectura.toFixed(2)}
                    </text>
                    <text
                      x={x(e.adelante.progresiva) - 3}
                      y={hi + 15}
                      textAnchor="end"
                      className="fill-slate-600 text-[12px] dark:fill-slate-300"
                    >
                      {e.adelante.lectura.toFixed(2)}
                    </text>
                  </>
                )}
              </g>
            )
          })}

          {ida
            .filter((p) => p.adelante.tipo === 'cambio')
            .map((p) => (
              <g key={`pc-${p.adelante.nombre}`}>
                <circle
                  cx={x(p.adelante.progresiva)}
                  cy={y(p.estacion.adelante.cota)}
                  r={4.5}
                  className="fill-white stroke-marca dark:fill-slate-950"
                  strokeWidth={2}
                />
                {conRotulos && (
                  <text
                    x={x(p.adelante.progresiva)}
                    y={y(p.estacion.adelante.cota) + 18}
                    textAnchor="middle"
                    className="fill-slate-600 text-[12px] dark:fill-slate-300"
                  >
                    {p.adelante.nombre}
                  </text>
                )}
              </g>
            ))}

          {plan.controles.map((c, i) => (
            <g key={`c-${i}`}>
              <rect
                x={x(c.progresiva) - 5.5}
                y={y(c.cotaPerfil) - 5.5}
                width={11}
                height={11}
                className="fill-slate-800 stroke-white dark:fill-slate-100 dark:stroke-slate-950"
                strokeWidth={1.5}
              />
              <text
                x={x(c.progresiva)}
                y={y(c.cotaPerfil) + 21}
                textAnchor="middle"
                className="fill-slate-800 text-[13px] font-semibold dark:fill-slate-100"
              >
                C{i + 1}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
        <span>
          <span aria-hidden="true" className="text-marca">
            ⊼
          </span>{' '}
          estación: nivel sobre su trípode (E)
        </span>
        <span>
          <span aria-hidden="true" className="text-marca">
            ○
          </span>{' '}
          punto de cambio (PC)
        </span>
        <span>
          <span aria-hidden="true" className="text-slate-800 dark:text-slate-100">
            ■
          </span>{' '}
          punto de control (C)
        </span>
        <span>
          <span aria-hidden="true" className="text-marca">
            - -
          </span>{' '}
          visual, con lo que marca la mira
        </span>
        <span>
          <span aria-hidden="true" className="text-aviso">
            △
          </span>{' '}
          estación con una lectura cerca del borde de la mira
        </span>
        <span className="font-medium">Escala vertical exagerada ×{exageracion.toFixed(1)}</span>
      </figcaption>
    </figure>
  )
}
