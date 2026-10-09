import { proyectarPunto, type Camara } from '@topo/core'
import { useId, useMemo, useRef, useState, type PointerEvent as EventoPuntero } from 'react'
import { BOTON_SECUNDARIO } from '../../componentes/ui'
import { formatearCota } from '../../formato'
import { exageracionSugerida, cotaEnTriangulo, type ModeloAgua, type VerticeModelo } from '../../niveles/modelo3d'

/**
 * El modelo 3D de la zona nivelada: los puntos del plano levantados a su
 * cota y unidos en triángulos, coloreados de lo bajo (azul) a lo alto
 * (ocre), con una flecha en cada triángulo hacia donde cae el agua y el
 * camino del agua de cada punto, animado, hasta donde termina: una salida
 * (▼), el borde de lo nivelado (△) o un hoyo donde se empoza (✗).
 *
 * Se gira arrastrando con un dedo o el ratón; las cotas van exageradas
 * para que el relieve se lea (se puede cambiar).
 */

const GRADOS_POR_PIXEL = 0.5

interface Props {
  modelo: ModeloAgua
  elegidoId: string | null
  alElegir: (id: string) => void
}

/** Color de una cara por su altura (0 = lo más bajo, 1 = lo más alto), con luz. */
function colorDeCara(t: number, luz: number): string {
  // De azul (#3b82c4) a ocre (#c9893a) en línea recta, sin pasar por el verde; la luz aclara u oscurece.
  const bajo = [59, 130, 196]
  const alto = [201, 137, 58]
  const f = 0.72 + luz * 0.38
  const [r, g, b] = bajo.map((c, i) => Math.round(Math.min(255, (c + (alto[i]! - c) * Math.min(1, Math.max(0, t))) * f)))
  return `rgb(${r} ${g} ${b})`
}

const COLOR_FIN = { salida: 'var(--color-proyecto, #0e7490)', borde: '#d97706', empoza: '#dc2626' } as const

export default function ModeloAgua3D({ modelo, elegidoId, alElegir }: Props) {
  const idTitulo = useId()
  const [giro, setGiro] = useState(35)
  const [inclinacion, setInclinacion] = useState(38)
  const sugerida = exageracionSugerida(modelo)
  const [exageracion, setExageracion] = useState(sugerida)
  const [animar, setAnimar] = useState(true)
  const arrastre = useRef<{ x: number; y: number } | null>(null)
  const camara: Camara = { giro, inclinacion, exageracion }

  const dibujo = useMemo(() => {
    const p = (x: number, y: number, z: number) => proyectarPunto(x, y, z, camara)
    const vs = modelo.vertices
    const proyectados = new Map([...vs.values()].map((v) => [v.id, p(v.x, v.y, v.z)]))
    const caras = modelo.triangulos.map((t) => {
      const [a, b, c] = t.ids.map((id) => vs.get(id)!) as [VerticeModelo, VerticeModelo, VerticeModelo]
      const puntos = t.ids.map((id) => proyectados.get(id)!)
      // Luz desde arriba y un poco del noroeste, sobre la normal ya exagerada.
      const ux = b.x - a.x
      const uy = b.y - a.y
      const uz = (b.z - a.z) * exageracion
      const vx = c.x - a.x
      const vy = c.y - a.y
      const vz = (c.z - a.z) * exageracion
      let nx = uy * vz - uz * vy
      let ny = uz * vx - ux * vz
      let nz = ux * vy - uy * vx
      if (nz < 0) [nx, ny, nz] = [-nx, -ny, -nz]
      const largo = Math.hypot(nx, ny, nz) || 1
      const luz = Math.max(0, (-0.4 * nx + 0.4 * ny + 0.82 * nz) / largo)
      const media = (a.z + b.z + c.z) / 3
      // La flecha: desde el centro, hacia abajo de la pendiente, pegada a la cara.
      let flecha: { desde: { x: number; y: number }; hasta: { x: number; y: number } } | null = null
      if (t.direccion) {
        const cx = (a.x + b.x + c.x) / 3
        const cy = (a.y + b.y + c.y) / 3
        const lado = Math.min(Math.hypot(ux, uy), Math.hypot(vx, vy), Math.hypot(c.x - b.x, c.y - b.y))
        const l = lado * 0.28
        const ex = cx + t.direccion.x * l
        const ey = cy + t.direccion.y * l
        const sx = cx - t.direccion.x * l * 0.6
        const sy = cy - t.direccion.y * l * 0.6
        flecha = { desde: p(sx, sy, cotaEnTriangulo(a, b, c, sx, sy)), hasta: p(ex, ey, cotaEnTriangulo(a, b, c, ex, ey)) }
      }
      return {
        clave: t.ids.join('-'),
        puntos,
        profundidad: puntos.reduce((s, q) => s + q.profundidad, 0) / 3,
        color: colorDeCara(modelo.desnivel > 0 ? media / modelo.desnivel : 0.5, luz),
        plano: t.plano,
        flecha,
      }
    })
    // Las paredes: del borde de la superficie hasta una base, como un bloque
    // de tierra cortado. Así se ve el volumen y cuánto sube cada esquina.
    const base = -Math.max(modelo.desnivel * 0.35, modelo.ancho * 0.04 / Math.max(exageracion, 1))
    const usos = new Map<string, number>()
    for (const t of modelo.triangulos)
      for (let i = 0; i < 3; i++) {
        const [a, b] = [t.ids[i]!, t.ids[(i + 1) % 3]!].sort()
        usos.set(`${a}|${b}`, (usos.get(`${a}|${b}`) ?? 0) + 1)
      }
    const paredes = [...usos.entries()]
      .filter(([, n]) => n === 1)
      .map(([clave]) => {
        const [a, b] = clave.split('|').map((id) => vs.get(id)!) as [VerticeModelo, VerticeModelo]
        const puntos = [p(a.x, a.y, a.z), p(b.x, b.y, b.z), p(b.x, b.y, base), p(a.x, a.y, base)]
        return { clave: `pared-${clave}`, puntos, profundidad: puntos.reduce((s2, q) => s2 + q.profundidad, 0) / 4 }
      })
    caras.sort((x, y) => x.profundidad - y.profundidad)
    const caminos = modelo.caminos
      .filter((c) => c.ids.length > 1)
      .map((c) => ({ ...c, puntos: c.ids.map((id) => proyectados.get(id)!) }))
    const todos = [...proyectados.values(), ...paredes.flatMap((w) => w.puntos)]
    const minX = Math.min(...todos.map((q) => q.x))
    const maxX = Math.max(...todos.map((q) => q.x))
    const minY = Math.min(...todos.map((q) => q.y))
    const maxY = Math.max(...todos.map((q) => q.y))
    const margen = Math.max(maxX - minX, maxY - minY) * 0.12 || 1
    paredes.sort((x, y) => x.profundidad - y.profundidad)
    return {
      caras,
      paredes,
      caminos,
      proyectados,
      caja: { x: minX - margen, y: minY - margen, ancho: maxX - minX + 2 * margen, alto: maxY - minY + 2 * margen },
    }
    // La cámara se arma en cada dibujado: se miran sus tres números.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelo, giro, inclinacion, exageracion])

  // Lo que mide un píxel en el dibujo, para que letras y trazos no cambien con el tamaño de la zona.
  const u = dibujo.caja.ancho / 640

  function alBajar(e: EventoPuntero<SVGSVGElement>) {
    arrastre.current = { x: e.clientX, y: e.clientY }
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId)
    } catch {
      // Sin captura el gesto funciona igual.
    }
  }
  function alMover(e: EventoPuntero<SVGSVGElement>) {
    const a = arrastre.current
    if (!a) return
    setGiro((g) => (g + (e.clientX - a.x) * GRADOS_POR_PIXEL + 360) % 360)
    setInclinacion((i) => Math.min(90, Math.max(5, i + (e.clientY - a.y) * GRADOS_POR_PIXEL * 0.6)))
    arrastre.current = { x: e.clientX, y: e.clientY }
  }

  const cuantos = (fin: string) => modelo.caminos.filter((c) => c.fin === fin).length
  /** Los hoyos: donde termina el agua que se empoza. */
  const hoyos = new Set(modelo.caminos.filter((c) => c.fin === 'empoza').map((c) => c.ids[c.ids.length - 1]!))

  return (
    <section aria-labelledby={idTitulo} className="flex min-w-0 flex-col gap-2 rounded-xl border border-borde bg-tarjeta p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id={idTitulo} className="flex-1 text-[15px] font-semibold">
          Modelo 3D del agua
        </h3>
        <button type="button" className={BOTON_SECUNDARIO} onClick={() => { setGiro(35); setInclinacion(38) }}>
          Vista 3D
        </button>
        <button type="button" className={BOTON_SECUNDARIO} onClick={() => { setGiro(0); setInclinacion(90) }}>
          Planta
        </button>
      </div>
      <svg
        role="img"
        aria-label={`Modelo 3D de ${modelo.vertices.size} puntos: el agua de ${cuantos('salida')} llega a una salida, de ${cuantos('borde')} al borde, de ${cuantos('empoza')} se empoza`}
        viewBox={`${dibujo.caja.x} ${dibujo.caja.y} ${dibujo.caja.ancho} ${dibujo.caja.alto}`}
        className="h-[52vh] max-h-[560px] min-h-64 w-full cursor-grab touch-none select-none rounded-lg bg-gradient-to-b from-sky-50 to-white dark:from-slate-800 dark:to-slate-900"
        onPointerDown={alBajar}
        onPointerMove={alMover}
        onPointerUp={() => (arrastre.current = null)}
        onPointerCancel={() => (arrastre.current = null)}
      >
        <defs>
          <marker id={`${idTitulo}-punta`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="#0f172a" />
          </marker>
          <marker id={`${idTitulo}-gota`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="#0284c7" />
          </marker>
        </defs>
        {/* Los trazos del agua no escalan: sus rayas miden píxeles y corren 24 px por vuelta. */}
        <style>{`
          @keyframes topo-agua-correr { to { stroke-dashoffset: -24; } }
          .camino-agua { animation: topo-agua-correr 0.9s linear infinite; }
          @media (prefers-reduced-motion: reduce) { .camino-agua { animation: none; } }
        `}</style>

        <pattern id={`${idTitulo}-plano`} width={8 * u} height={8 * u} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1={0} y1={0} x2={0} y2={8 * u} stroke="#b45309" strokeWidth={2.5 * u} opacity={0.55} />
        </pattern>
        {dibujo.paredes.map((w) => (
          <polygon
            key={w.clave}
            points={w.puntos.map((q) => `${q.x},${q.y}`).join(' ')}
            className="fill-stone-400 stroke-stone-600 dark:fill-stone-600 dark:stroke-stone-400"
            strokeWidth={u}
            strokeLinejoin="round"
          />
        ))}
        {dibujo.caras.map((c) => (
          <g key={c.clave}>
            <polygon
              data-cara={c.clave}
              points={c.puntos.map((q) => `${q.x},${q.y}`).join(' ')}
              fill={c.color}
              stroke={c.plano ? '#b45309' : 'rgba(15,23,42,0.35)'}
              strokeWidth={(c.plano ? 2 : 1) * u}
              strokeLinejoin="round"
            />
            {c.plano && <polygon points={c.puntos.map((q) => `${q.x},${q.y}`).join(' ')} fill={`url(#${idTitulo}-plano)`} pointerEvents="none" />}
            {c.flecha && (
              <line
                x1={c.flecha.desde.x}
                y1={c.flecha.desde.y}
                x2={c.flecha.hasta.x}
                y2={c.flecha.hasta.y}
                stroke="#0f172a"
                strokeWidth={2 * u}
                markerEnd={`url(#${idTitulo}-punta)`}
                opacity={0.75}
              />
            )}
          </g>
        ))}

        {dibujo.caminos.map((c) => {
          const elegido = c.desde === elegidoId
          return (
            <polyline
              key={c.desde}
              points={c.puntos.map((q) => `${q.x},${q.y}`).join(' ')}
              fill="none"
              stroke="#0284c7"
              strokeWidth={elegido ? 5 : 3}
              vectorEffect="non-scaling-stroke"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="12 12"
              className={animar ? 'camino-agua' : undefined}
              opacity={elegidoId && !elegido ? 0.45 : 0.95}
              markerEnd={`url(#${idTitulo}-gota)`}
            />
          )
        })}

        {[...modelo.vertices.values()].map((v) => {
          const q = dibujo.proyectados.get(v.id)!
          const fin = v.salida ? 'salida' : hoyos.has(v.id) ? 'empoza' : null
          const elegido = v.id === elegidoId
          return (
            <g key={v.id} onClick={() => !v.medido && alElegir(v.id)} className={v.medido ? undefined : 'cursor-pointer'}>
              <circle cx={q.x} cy={q.y} r={(elegido ? 8 : 6) * u} fill={fin ? COLOR_FIN[fin] : v.medido ? '#64748b' : '#ffffff'} stroke="#0f172a" strokeWidth={2 * u} />
              {fin === 'empoza' && <circle cx={q.x} cy={q.y} r={12 * u} fill="none" stroke={COLOR_FIN.empoza} strokeWidth={3 * u} />}
              <text
                x={q.x + 9 * u}
                y={q.y - 8 * u}
                fontSize={13 * u}
                fontWeight={700}
                stroke="white"
                strokeWidth={3 * u}
                paintOrder="stroke"
                fill={fin === 'empoza' ? COLOR_FIN.empoza : '#0f172a'}
                pointerEvents="none"
              >
                {fin === 'empoza' ? '✗ ' : ''}
                {v.nombre}
                {v.salida ? ' ▼' : ''}
                {v.nota ? ` · ${v.nota}` : ''}
              </text>
              <text x={q.x + 9 * u} y={q.y + 7 * u} fontSize={11 * u} stroke="white" strokeWidth={3 * u} paintOrder="stroke" fill="#334155" pointerEvents="none">
                {formatearCota(v.cota)}
              </text>
            </g>
          )
        })}
      </svg>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <label className="flex items-center gap-2">
          <span className="text-tenue">Exagerar la altura</span>
          <input
            type="range"
            min={1}
            max={Math.max(200, sugerida)}
            value={exageracion}
            onChange={(e) => setExageracion(Number(e.target.value))}
            aria-label="Exageración de la altura"
            className="w-32 accent-marca"
          />
          <span className="numerico w-12">×{exageracion}</span>
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" className="size-5" checked={animar} onChange={(e) => setAnimar(e.target.checked)} />
          Animar el agua
        </label>
      </div>
      <p className="text-[13px] text-tenue">
        Arrastra para girar. Azul lo bajo, ocre lo alto; rayados en ámbar los triángulos casi planos (ahí el agua corre lento o se queda). ▶ hacia dónde cae el agua; la línea azul que
        corre es el camino del agua de cada punto: ▼ llega a una salida, ✗ se empoza. Desnivel de la zona:{' '}
        <b className="numerico">{(modelo.desnivel * 100).toFixed(1)} cm</b>
        {modelo.enMetros ? ` en ${modelo.ancho.toFixed(1)} m` : ' (el plano no tiene escala: las distancias no son metros)'}.
      </p>
    </section>
  )
}
