import { formatearPendiente, formatearProgresiva, puntoA, type EstacaSobrePlano, type Punto2 } from '@topo/core'
import { anguloHaciaDondeBaja, type DatosPista } from './datosPista'
import { aSvg, desfaseAlCostado, puntosSvg, type DesfaseRotulo } from './geometriaVisor'
import type { PdfCargado } from './cargarPlano'

/**
 * Lo que se dibuja dentro del visor. Todo en el sistema del plano (Y hacia
 * arriba) pasado al SVG con `aSvg`; los tamaños de letra y de marca van
 * multiplicados por `upp` (unidades del plano por píxel) para que se lean
 * igual con cualquier zoom.
 */

/** Rótulo con halo, para que se lea sobre el dibujo en los dos temas. */
const ROTULO = 'fill-slate-900 stroke-white dark:fill-white dark:stroke-slate-900'

function Rotulo({ punto, texto, upp, tamano = 12, clase = ROTULO, dx = 0, dy = 0, costado }: {
  punto: Punto2
  texto: string
  upp: number
  tamano?: number
  clase?: string
  dx?: number
  dy?: number
  /** Al costado de la pista: reemplaza dx y dy, y centra el rótulo en su línea. */
  costado?: DesfaseRotulo
}) {
  const p = aSvg(punto)
  return (
    <text
      x={p.x + (costado ? costado.dx : dx) * upp}
      y={p.y + (costado ? costado.dy : dy) * upp}
      textAnchor={costado?.ancla}
      dominantBaseline={costado ? 'central' : undefined}
      fontSize={tamano * upp}
      strokeWidth={3 * upp}
      paintOrder="stroke"
      className={clase}
      pointerEvents="none"
    >
      {texto}
    </text>
  )
}

// ─── Fondo PDF ───────────────────────────────────────────────────────────

export function FondoPdf({ pdf, verCotas, upp }: { pdf: PdfCargado; verCotas: boolean; upp: number }) {
  return (
    <g>
      <image
        href={pdf.url}
        x={aSvg({ x: 0, y: pdf.altoPt }).x}
        y={aSvg({ x: 0, y: pdf.altoPt }).y}
        width={pdf.anchoPt}
        height={pdf.altoPt}
        preserveAspectRatio="none"
        pointerEvents="none"
      />
      {verCotas &&
        pdf.textos
          .filter((t) => t.valor !== null)
          .map((t, i) => {
            const p = aSvg(t)
            return (
              <g key={i} pointerEvents="none">
                <circle cx={p.x} cy={p.y} r={3 * upp} className="fill-marca" />
                <Rotulo punto={t} texto={`cota ${t.valor!.toFixed(3)}`} upp={upp} tamano={10} dx={5} dy={-5} clase="fill-marca stroke-white dark:stroke-slate-900" />
              </g>
            )
          })}
    </g>
  )
}

// ─── Pistas ──────────────────────────────────────────────────────────────

/** Triángulo que apunta en `angulo` (grados del plano, Y hacia arriba). */
function Flecha({ punto, angulo, upp, clase }: { punto: Punto2; angulo: number; upp: number; clase: string }) {
  const p = aSvg(punto)
  const s = upp
  return (
    <path
      d={`M ${7 * s} 0 L ${-5 * s} ${-5 * s} L ${-5 * s} ${5 * s} Z`}
      // En el SVG la Y va al revés: el giro también.
      transform={`translate(${p.x} ${p.y}) rotate(${-angulo})`}
      className={clase}
      pointerEvents="none"
    />
  )
}

function Estacas({ estacas, upp }: { estacas: EstacaSobrePlano[]; upp: number }) {
  return (
    <g pointerEvents="none">
      {estacas.map((e) => {
        const p = aSvg(e)
        return (
          <g key={e.progresiva}>
            <circle cx={p.x} cy={p.y} r={2.5 * upp} className="fill-white stroke-slate-900 dark:fill-slate-900 dark:stroke-white" strokeWidth={upp} />
            {/* Las estacas a la derecha del avance; las pendientes y el nombre, a la izquierda: no se pisan. */}
            <Rotulo punto={e} texto={formatearProgresiva(e.progresiva)} upp={upp} tamano={10} costado={desfaseAlCostado(e.rumbo, 'derecha', 7)} />
          </g>
        )
      })}
    </g>
  )
}

export function DibujoPista({
  id,
  nombre,
  polilinea,
  datos,
  elegida,
  upp,
}: {
  id: string
  nombre: string
  polilinea: Punto2[]
  datos: DatosPista | null
  elegida: boolean
  upp: number
}) {
  const puntos = puntosSvg(polilinea)
  return (
    <g data-pista={id}>
      <title>{`Pista ${nombre}`}</title>
      {/* Ancha e invisible: para que el dedo acierte la pista. */}
      <polyline points={puntos} fill="none" stroke="transparent" strokeWidth={22} vectorEffect="non-scaling-stroke" pointerEvents="stroke" />
      <polyline
        points={puntos}
        fill="none"
        className="stroke-marca"
        strokeWidth={elegida ? 6 : 4}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        pointerEvents="none"
      />
      {datos?.tramos
        .filter((t) => t.empinada)
        .map((t) => (
          <polyline
            key={`e${t.tramo.desde}`}
            points={puntosSvg(t.puntos)}
            fill="none"
            className="stroke-aviso"
            strokeWidth={elegida ? 6 : 4}
            strokeDasharray="10 4"
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        ))}
      {elegida && datos && <Estacas estacas={datos.estacas} upp={upp} />}
      {datos?.tramos.map((t) => {
        if (!t.rotulo) return null
        const angulo = anguloHaciaDondeBaja(t.tramo, t.rotulo.rumbo)
        return (
          <g key={`r${t.tramo.desde}`}>
            {angulo !== null && <Flecha punto={t.rotulo} angulo={angulo} upp={upp} clase={t.empinada ? 'fill-aviso stroke-slate-900' : 'fill-slate-900 dark:fill-white'} />}
            <Rotulo
              punto={t.rotulo}
              texto={`${formatearPendiente(t.tramo.porcentaje)}${t.empinada ? ' △ empinada' : ''}`}
              upp={upp}
              costado={desfaseAlCostado(t.rotulo.rumbo, 'izquierda', 11)}
            />
          </g>
        )
      })}
      {datos?.controles.map(({ control, punto }) => {
        if (!punto) return null
        const p = aSvg(punto)
        const lado = 6 * upp
        return (
          <g key={`c${control.progresiva}`} pointerEvents="none">
            {/* En el color de la marca, no en el verde de «pasa»: es una cota prevista que nadie comprobó. */}
            <title>{`Control previsto ${formatearProgresiva(control.progresiva)}: cota ${control.cota.toFixed(3)}, no comprobada`}</title>
            <rect
              x={p.x - lado / 2}
              y={p.y - lado / 2}
              width={lado}
              height={lado}
              transform={`rotate(45 ${p.x} ${p.y})`}
              className="fill-marca stroke-white dark:stroke-slate-900"
              strokeWidth={upp}
            />
            {elegida && <Rotulo punto={punto} texto={`◆ control previsto ${formatearProgresiva(control.progresiva)}`} upp={upp} tamano={10} dx={7} dy={-6} />}
          </g>
        )
      })}
      {polilinea[0] && (
        <Rotulo
          punto={polilinea[0]}
          texto={nombre}
          upp={upp}
          tamano={13}
          costado={desfaseAlCostado(puntoA(polilinea, 0)?.rumbo ?? 0, 'izquierda', 10)}
          clase={`${ROTULO} font-semibold`}
        />
      )}
    </g>
  )
}

// ─── Ejes del DXF que todavía no son pista ───────────────────────────────

export function DibujoEje({ indice, puntos, elegido }: { indice: number; puntos: Punto2[]; elegido: boolean }) {
  const svg = puntosSvg(puntos)
  return (
    <g data-eje={indice}>
      <polyline points={svg} fill="none" stroke="transparent" strokeWidth={22} vectorEffect="non-scaling-stroke" pointerEvents="stroke" />
      <polyline
        points={svg}
        fill="none"
        className={elegido ? 'stroke-marca' : 'stroke-marca/50'}
        strokeWidth={elegido ? 5 : 3}
        strokeDasharray="8 6"
        vectorEffect="non-scaling-stroke"
        pointerEvents="none"
      />
    </g>
  )
}

// ─── Croquis y calibración ───────────────────────────────────────────────

export function DibujoCroquis({ puntos, estacas, upp }: { puntos: Punto2[]; estacas: EstacaSobrePlano[]; upp: number }) {
  return (
    <g pointerEvents="none">
      {puntos.length > 1 && (
        <polyline points={puntosSvg(puntos)} fill="none" className="stroke-marca" strokeWidth={4} strokeDasharray="12 6" vectorEffect="non-scaling-stroke" />
      )}
      {puntos.map((v, i) => {
        const p = aSvg(v)
        return <circle key={i} cx={p.x} cy={p.y} r={5 * upp} className="fill-marca stroke-white" strokeWidth={1.5 * upp} />
      })}
      <Estacas estacas={estacas} upp={upp} />
    </g>
  )
}

export function MarcasCalibracion({ puntos, upp }: { puntos: Punto2[]; upp: number }) {
  return (
    <g pointerEvents="none">
      {puntos.length === 2 && (
        <line
          x1={puntos[0]!.x}
          y1={-puntos[0]!.y}
          x2={puntos[1]!.x}
          y2={-puntos[1]!.y}
          className="stroke-falla"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
      )}
      {puntos.map((v, i) => {
        const p = aSvg(v)
        return (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={6 * upp} fill="none" className="stroke-falla" strokeWidth={2 * upp} />
            <Rotulo punto={v} texto={`Punto ${i + 1}`} upp={upp} dx={8} dy={-8} />
          </g>
        )
      })}
    </g>
  )
}
