import type { Punto2 } from '@topo/core'
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as EventoPuntero, type ReactNode } from 'react'
import type { LimitesPlano } from '../../planos/dxf'
import {
  acercar,
  desplazar,
  encuadrar,
  pantallaAMundo,
  pantallaASvg,
  unidadesPorPixel,
  type Vista,
} from './geometriaVisor'
import { BOTON_ICONO } from './estilos'

interface Props {
  /** Lo que «Encuadrar» deja a la vista. */
  limites: LimitesPlano | null
  /** Si cambia, se vuelve a encuadrar (otro plano, otra página). */
  claveEncuadre: string
  /**
   * Un toque sin arrastre: el punto en el sistema del plano (Y hacia arriba)
   * y lo que había debajo del dedo, para saber si se tocó una pista.
   */
  alTocar: (punto: Punto2, objetivo: Element | null) => void
  /** En los modos de tocar puntos (croquis, calibrar) el cursor es una cruz. */
  enModoPuntos?: boolean
  /** Se dibuja con el tamaño de un píxel en unidades del plano, para que rótulos y marcas no crezcan con el zoom. */
  children: (unidadesPorPixel: number) => ReactNode
  /**
   * Lo que flota sobre el plano (el plano a la vista, la escala, las
   * herramientas). Va junto a los botones de zoom, fuera del dibujo.
   */
  encima?: ReactNode
}

/** Pasado este arrastre (en píxeles), el gesto ya no es un toque sino mover el plano. */
const UMBRAL_TOQUE_PX = 6
const CAJA_DE_FABRICA = { width: 800, height: 500 }
/** Los botones de zoom: 44 px, con sombra para que se lean sobre el dibujo. */
const BOTON = `${BOTON_ICONO} bg-tarjeta/95 text-xl shadow-sm hover:bg-fondo disabled:opacity-40`

/**
 * El plano a pantalla: rueda o pellizco para acercar, arrastrar para mover,
 * y un toque (sin arrastre) para elegir una pista o poner un punto.
 */
export default function VisorPlano({ limites, claveEncuadre, alTocar, enModoPuntos = false, children, encima }: Props) {
  const contenedor = useRef<HTMLDivElement>(null)
  const lienzo = useRef<SVGSVGElement>(null)
  const [caja, setCaja] = useState(CAJA_DE_FABRICA)
  const [vista, setVista] = useState<Vista | null>(() => (limites ? encuadrar(limites, CAJA_DE_FABRICA) : null))

  const punteros = useRef(new Map<number, Punto2>())
  const toque = useRef<{ x: number; y: number; objetivo: Element | null; movido: boolean } | null>(null)
  const pellizco = useRef<{ distancia: number; centro: Punto2 } | null>(null)

  // El tamaño real de la caja, para que el encuadre llene la pantalla sin franjas.
  useLayoutEffect(() => {
    const elemento = contenedor.current
    if (!elemento) return
    const medir = () => {
      const r = elemento.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) setCaja({ width: r.width, height: r.height })
    }
    medir()
    if (typeof ResizeObserver === 'undefined') return
    const observador = new ResizeObserver(medir)
    observador.observe(elemento)
    return () => observador.disconnect()
  }, [])

  // Otro plano u otra página: se encuadra de nuevo. El tamaño de la caja no
  // re-encuadra: girar el celular no debe perder el zoom que se tenía.
  const cajaActual = useRef(caja)
  cajaActual.current = caja
  useEffect(() => {
    setVista(limites ? encuadrar(limites, cajaActual.current) : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveEncuadre])

  // La primera medida real de la caja corrige el encuadre de fábrica.
  const yaMedido = useRef(false)
  useEffect(() => {
    if (yaMedido.current || caja === CAJA_DE_FABRICA) return
    yaMedido.current = true
    if (limites) setVista(encuadrar(limites, caja))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caja])

  // La rueda: con listener propio y no pasivo, para que no desplace la página.
  useEffect(() => {
    const svg = lienzo.current
    if (!svg) return
    const alGirar = (evento: WheelEvent) => {
      evento.preventDefault()
      const rect = svg.getBoundingClientRect()
      const factor = Math.exp(-evento.deltaY * 0.0015)
      setVista((v) => (v ? acercar(v, pantallaASvg(evento.clientX, evento.clientY, rect, v), factor) : v))
    }
    svg.addEventListener('wheel', alGirar, { passive: false })
    return () => svg.removeEventListener('wheel', alGirar)
  }, [])

  function rectangulo() {
    const r = lienzo.current?.getBoundingClientRect()
    return r && r.width > 0 && r.height > 0 ? r : { left: 0, top: 0, ...caja }
  }

  function alBajar(evento: EventoPuntero<SVGSVGElement>) {
    punteros.current.set(evento.pointerId, { x: evento.clientX, y: evento.clientY })
    try {
      evento.currentTarget.setPointerCapture?.(evento.pointerId)
    } catch {
      // jsdom y algunos navegadores viejos no capturan: el gesto funciona igual.
    }
    if (punteros.current.size === 1) {
      toque.current = { x: evento.clientX, y: evento.clientY, objetivo: evento.target as Element, movido: false }
    } else if (punteros.current.size === 2) {
      // Dos dedos: es un pellizco, no un toque.
      if (toque.current) toque.current.movido = true
      const [a, b] = [...punteros.current.values()] as [Punto2, Punto2]
      pellizco.current = { distancia: Math.hypot(b.x - a.x, b.y - a.y), centro: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }
    }
  }

  function alMover(evento: EventoPuntero<SVGSVGElement>) {
    const anterior = punteros.current.get(evento.pointerId)
    if (!anterior || !vista) return
    const actual = { x: evento.clientX, y: evento.clientY }
    punteros.current.set(evento.pointerId, actual)
    const rect = rectangulo()

    if (punteros.current.size === 1) {
      const t = toque.current
      if (t && !t.movido && Math.hypot(actual.x - t.x, actual.y - t.y) > UMBRAL_TOQUE_PX) t.movido = true
      if (!t?.movido) return
      const escala = 1 / unidadesPorPixel(vista, rect)
      setVista((v) => (v ? desplazar(v, (actual.x - anterior.x) / escala, (actual.y - anterior.y) / escala) : v))
      return
    }
    if (punteros.current.size === 2 && pellizco.current) {
      const [a, b] = [...punteros.current.values()] as [Punto2, Punto2]
      const distancia = Math.hypot(b.x - a.x, b.y - a.y)
      const centro = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const antes = pellizco.current
      pellizco.current = { distancia, centro }
      if (!(antes.distancia > 0) || !(distancia > 0)) return
      setVista((v) => {
        if (!v) return v
        const escala = 1 / unidadesPorPixel(v, rect)
        const movida = desplazar(v, (centro.x - antes.centro.x) / escala, (centro.y - antes.centro.y) / escala)
        return acercar(movida, pantallaASvg(centro.x, centro.y, rect, movida), distancia / antes.distancia)
      })
    }
  }

  function alSoltar(evento: EventoPuntero<SVGSVGElement>, cancelado: boolean) {
    if (!punteros.current.has(evento.pointerId)) return
    punteros.current.delete(evento.pointerId)
    if (punteros.current.size < 2) pellizco.current = null
    if (punteros.current.size > 0) return
    const t = toque.current
    toque.current = null
    if (cancelado || !t || t.movido || !vista) return
    alTocar(pantallaAMundo(evento.clientX, evento.clientY, rectangulo(), vista), t.objetivo)
  }

  function zoomBoton(factor: number) {
    setVista((v) => (v ? acercar(v, { x: v.x + v.ancho / 2, y: v.y + v.alto / 2 }, factor) : v))
  }

  const upp = vista ? unidadesPorPixel(vista, caja) : 1

  return (
    <div
      ref={contenedor}
      className="relative h-[60vh] min-h-72 w-full overflow-hidden border-y border-borde bg-white sm:rounded-xl sm:border md:h-[55vh] lg:h-[calc(100dvh-12rem)] dark:bg-slate-900"
    >
      <svg
        ref={lienzo}
        role="application"
        aria-label="Visor del plano"
        aria-roledescription="plano"
        viewBox={vista ? `${vista.x} ${vista.y} ${vista.ancho} ${vista.alto}` : '0 0 1 1'}
        width="100%"
        height="100%"
        className={`block select-none text-slate-800 dark:text-slate-100 ${enModoPuntos ? 'cursor-crosshair' : 'cursor-grab'}`}
        style={{ touchAction: 'none' }}
        onPointerDown={alBajar}
        onPointerMove={alMover}
        onPointerUp={(e) => alSoltar(e, false)}
        onPointerCancel={(e) => alSoltar(e, true)}
      >
        {vista && children(upp)}
      </svg>
      {encima}
      {/* Abajo a la derecha (en el celular, encima de las herramientas): la esquina de arriba es de la escala. */}
      <div className="absolute bottom-[4.5rem] right-3 flex flex-col gap-2 sm:bottom-3">
        <button type="button" className={BOTON} aria-label="Acercar" onClick={() => zoomBoton(1.5)}>
          <span aria-hidden="true">+</span>
        </button>
        <button type="button" className={BOTON} aria-label="Alejar" onClick={() => zoomBoton(1 / 1.5)}>
          <span aria-hidden="true">−</span>
        </button>
        <button
          type="button"
          className={BOTON}
          aria-label="Encuadrar"
          title="Encuadrar: ver todo el plano"
          onClick={() => limites && setVista(encuadrar(limites, caja))}
          disabled={!limites}
        >
          <span aria-hidden="true">⤢</span>
        </button>
      </div>
    </div>
  )
}
