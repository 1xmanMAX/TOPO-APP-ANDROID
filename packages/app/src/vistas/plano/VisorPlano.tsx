import type { Punto2 } from '@topo/core'
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as EventoPuntero, type ReactNode } from 'react'
import type { LimitesPlano } from '../../planos/dxf'
import {
  acercar,
  desplazar,
  encuadrar,
  origenDelVisor,
  pantallaAMundo,
  pantallaASvg,
  unidadesPorPixel,
  type Vista,
} from './geometriaVisor'
import { BOTON_ICONO } from './estilos'
import type { Encuadre } from './pintarVectorial'

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
  /**
   * Un fondo que se pinta en un <canvas> debajo del SVG (el DXF o DWG):
   * miles de líneas que en SVG trabarían el celular. `rapido` es verdadero
   * mientras se arrastra o pellizca: se pinta solo lo grueso y al soltar se
   * completa el detalle. `clave` cambia cuando hay que repintar por algo que
   * no es la vista (capas ocultas, tema).
   */
  fondo?: { pintar: (ctx: CanvasRenderingContext2D, encuadre: Encuadre, rapido: boolean) => void; clave: string }
}

/** Tras la última vuelta de rueda o el último dedo, cuánto esperar para pintar el detalle. */
const PAUSA_DETALLE_MS = 140

/** Un cuadro a 60 por segundo: si pintar tarda más, durante el gesto se mueve la imagen ya pintada. */
const COSTO_MAXIMO_MS = 16

/**
 * La transformación CSS que lleva lo pintado con la vista `antes` a donde
 * cae con la vista `ahora` (las dos con el encaje «meet» del SVG).
 */
function transformacionEntre(antes: Vista, ahora: Vista, caja: { width: number; height: number }): string {
  const encaje = (v: Vista) => {
    const e = Math.min(caja.width / v.ancho, caja.height / v.alto)
    return { e, mx: (caja.width - v.ancho * e) / 2, my: (caja.height - v.alto * e) / 2 }
  }
  const a = encaje(antes)
  const b = encaje(ahora)
  const k = b.e / a.e
  const tx = b.mx + (antes.x - ahora.x) * b.e - a.mx * k
  const ty = b.my + (antes.y - ahora.y) * b.e - a.my * k
  return `translate(${tx}px, ${ty}px) scale(${k})`
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
export default function VisorPlano({ limites, claveEncuadre, alTocar, enModoPuntos = false, children, encima, fondo }: Props) {
  const contenedor = useRef<HTMLDivElement>(null)
  const lienzo = useRef<SVGSVGElement>(null)
  const [caja, setCaja] = useState(CAJA_DE_FABRICA)
  const [vista, setVista] = useState<Vista | null>(() => (limites ? encuadrar(limites, CAJA_DE_FABRICA) : null))

  const fondoLienzo = useRef<HTMLCanvasElement>(null)
  /** Si hay un gesto en curso (arrastre, pellizco, rueda): entonces se pinta rápido. */
  const enGesto = useRef(false)
  const [detalle, setDetalle] = useState(0)
  const pausa = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Marca que hubo movimiento; al quedarse quieto, se repinta con todo el detalle. */
  function moviendo(sigue: boolean) {
    enGesto.current = true
    if (pausa.current) clearTimeout(pausa.current)
    pausa.current = sigue
      ? null
      : setTimeout(() => {
          enGesto.current = false
          setDetalle((n) => n + 1)
        }, PAUSA_DETALLE_MS)
  }
  useEffect(() => () => void (pausa.current && clearTimeout(pausa.current)), [])

  // El fondo en canvas, pintado en el mismo cuadro que el SVG de encima
  // (useLayoutEffect, antes de que el navegador muestre nada): si el fondo
  // llegara un cuadro después, los puntos y las pistas se verían temblar
  // sobre el plano al moverlo. Si pintar cuesta más que un cuadro (un plano
  // enorme en un celular), durante el gesto no se repinta: se mueve y escala
  // la imagen ya pintada (lo hace la tarjeta gráfica, sin costo), con la
  // misma cuenta que el SVG, y al soltar se pinta de nuevo, nítida.
  const pintar = fondo?.pintar
  const pintado = useRef<{ vista: Vista; caja: { width: number; height: number }; costoMs: number; pintar: unknown } | null>(null)
  useLayoutEffect(() => {
    const lienzoFondo = fondoLienzo.current
    if (!pintar || !vista || !lienzoFondo) return
    const anterior = pintado.current
    if (enGesto.current && anterior && anterior.pintar === pintar && anterior.costoMs > COSTO_MAXIMO_MS && anterior.caja === caja) {
      lienzoFondo.style.transform = transformacionEntre(anterior.vista, vista, caja)
      return
    }
    const ctx = lienzoFondo.getContext('2d')
    if (!ctx) return
    const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 3)
    const w = Math.max(1, Math.round(caja.width * dpr))
    const h = Math.max(1, Math.round(caja.height * dpr))
    if (lienzoFondo.width !== w) lienzoFondo.width = w
    if (lienzoFondo.height !== h) lienzoFondo.height = h
    const t0 = performance.now()
    pintar(ctx, { vista, ancho: caja.width, alto: caja.height, dpr, origen: origenDelVisor() }, enGesto.current)
    lienzoFondo.style.transform = ''
    pintado.current = { vista, caja, costoMs: performance.now() - t0, pintar }
  }, [pintar, fondo?.clave, vista, caja, detalle])

  const punteros = useRef(new Map<number, Punto2>())
  const toque = useRef<{ x: number; y: number; objetivo: Element | null; movido: boolean } | null>(null)
  const pellizco = useRef<{ distancia: number; centro: Punto2 } | null>(null)

  // El tamaño real de la caja, para que el encuadre llene la pantalla sin franjas.
  useLayoutEffect(() => {
    const elemento = contenedor.current
    if (!elemento) return
    const medir = () => {
      // Por dentro del borde: es lo que mide el SVG (y el canvas). Con el
      // borde incluido, el fondo y lo de encima quedaban a escalas un poco
      // distintas y se separaban al acercar.
      const svg = lienzo.current?.getBoundingClientRect()
      const ancho = svg && svg.width > 0 ? svg.width : elemento.clientWidth
      const alto = svg && svg.height > 0 ? svg.height : elemento.clientHeight
      if (ancho > 0 && alto > 0) setCaja((c) => (c.width === ancho && c.height === alto ? c : { width: ancho, height: alto }))
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
      moviendo(false)
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
      moviendo(true)
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
      moviendo(true)
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
    if (enGesto.current) moviendo(false)
    const t = toque.current
    toque.current = null
    if (cancelado || !t || t.movido || !vista) return
    alTocar(pantallaAMundo(evento.clientX, evento.clientY, rectangulo(), vista), t.objetivo)
  }

  function zoomBoton(factor: number) {
    setVista((v) => (v ? acercar(v, { x: v.x + v.ancho / 2, y: v.y + v.alto / 2 }, factor) : v))
  }

  const upp = vista ? unidadesPorPixel(vista, caja) : 1

  // Pantalla completa: el visor ocupa toda la pantalla (con sus herramientas
  // encima). En el navegador y en Windows además se pide al sistema que
  // oculte sus barras; en Android basta con ocupar la ventana.
  const [completa, setCompleta] = useState(false)
  function cambiarCompleta(quiere: boolean) {
    setCompleta(quiere)
    try {
      if (quiere) void contenedor.current?.requestFullscreen?.().catch(() => {})
      else if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {})
    } catch {
      // Sin la API de pantalla completa basta con ocupar la ventana.
    }
  }
  useEffect(() => {
    if (!completa) return
    const alSalirDelSistema = () => {
      if (!document.fullscreenElement) setCompleta(false)
    }
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cambiarCompleta(false)
    }
    document.addEventListener('fullscreenchange', alSalirDelSistema)
    document.addEventListener('keydown', alTeclear)
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('fullscreenchange', alSalirDelSistema)
      document.removeEventListener('keydown', alTeclear)
      document.body.style.overflow = antes
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completa])

  return (
    <div
      ref={contenedor}
      data-pantalla-completa={completa || undefined}
      className={
        completa
          ? 'fixed inset-0 z-50 h-[100dvh] w-screen overflow-hidden bg-white dark:bg-slate-900'
          : 'relative h-[60vh] min-h-72 w-full overflow-hidden border-y border-borde bg-white sm:rounded-xl sm:border md:h-[55vh] lg:h-[calc(100dvh-12rem)] dark:bg-slate-900'
      }
    >
      {fondo && <canvas ref={fondoLienzo} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full origin-top-left text-slate-800 will-change-transform dark:text-slate-100" />}
      <svg
        ref={lienzo}
        role="application"
        aria-label="Visor del plano"
        aria-roledescription="plano"
        viewBox={vista ? `${vista.x} ${vista.y} ${vista.ancho} ${vista.alto}` : '0 0 1 1'}
        width="100%"
        height="100%"
        className={`relative block select-none text-slate-800 dark:text-slate-100 ${enModoPuntos ? 'cursor-crosshair' : 'cursor-grab'}`}
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
        <button
          type="button"
          className={BOTON}
          aria-label={completa ? 'Salir de pantalla completa' : 'Pantalla completa'}
          aria-pressed={completa}
          title={completa ? 'Salir de pantalla completa' : 'Ver el plano en pantalla completa'}
          onClick={() => cambiarCompleta(!completa)}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="mx-auto size-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            {completa ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /> : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
          </svg>
        </button>
      </div>
    </div>
  )
}
