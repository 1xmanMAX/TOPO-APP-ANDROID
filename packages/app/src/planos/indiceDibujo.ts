/**
 * El plano vectorial preparado para dibujarse rápido en un <canvas>, con la
 * misma idea con que LibreCAD mueve planos grandes sin trabarse (el código
 * es propio):
 *
 * - Índice espacial: el plano se parte en teselas; al dibujar solo se
 *   recorren las que caen en la pantalla.
 * - Lotes: dentro de cada tesela las líneas van juntas por capa y color, y
 *   cada lote se traza de una sola vez (un solo trazo por lote, no uno por
 *   línea).
 * - Nivel de detalle: las líneas van en lotes por tamaño; lo que en
 *   pantalla mediría menos de un par de píxeles (un lote visto de lejos, un
 *   texto diminuto) se dibuja tenue o no se dibuja hasta acercarse.
 * - Coordenadas locales: cada tesela guarda sus puntos relativos a su
 *   esquina. Un plano en UTM (x ≈ 300 000, y ≈ 8 600 000) dibujado con esos
 *   números enteros tiembla en el celular por falta de decimales; así no.
 *
 * Aquí no hay canvas: solo números, para poder probarlo. El trazo lo hace
 * vistas/plano/pintarVectorial.ts.
 */
import type { LimitesPlano, PlanoVectorial, TextoPlano } from './dxf'

/** Unas líneas de la misma capa y color dentro de una tesela, en coordenadas locales. */
export interface Lote {
  capa: string
  color: string
  /** x0, y0, x1, y1, … de todas las líneas, una detrás de otra. */
  coords: Float32Array
  /** Dónde empieza cada línea en `coords` (en puntos, no en números), y un último índice de cierre. */
  inicios: Uint32Array
  /** Si cada línea vuelve a su primer punto. */
  cerradas: Uint8Array
  /** Tamaño de la mayor de sus líneas (el lado mayor de su caja): de eso depende si se distingue. */
  tamano: number
  /** Lo que el pintor guarda para no rehacer el trazo (Path2D). */
  cache?: unknown
}

export interface Tesela {
  /** La caja de todo lo que tiene (puede salirse de su celda: una línea larga). */
  caja: LimitesPlano
  /** Su esquina: las coordenadas de sus lotes son relativas a ella. */
  origen: { x: number; y: number }
  /** Sus lotes, de las líneas más grandes a las más chicas. */
  lotes: Lote[]
  /** Índices de los textos de esta tesela en `textos`. */
  textos: number[]
}

export interface DibujoPreparado {
  limites: LimitesPlano
  teselas: Tesela[]
  textos: TextoPlano[]
  colorDeCapa: Map<string, string>
  /** Cuántos puntos tiene todo el dibujo (para decidir cuánto simplificar). */
  puntos: number
}

/** Líneas por tesela, en promedio: pocas teselas trazan rápido, muchas recortan mejor. */
const LINEAS_POR_TESELA = 400
const TESELAS_POR_LADO_MAX = 48

/** Prepara el plano para dibujarlo. Se hace una vez por plano (unos milisegundos por cada 100 000 líneas). */
export function prepararDibujo(plano: PlanoVectorial): DibujoPreparado {
  const { limites } = plano
  const ancho = Math.max(limites.maxX - limites.minX, 1e-9)
  const alto = Math.max(limites.maxY - limites.minY, 1e-9)
  const total = plano.polilineas.length + plano.textos.length
  const porLado = Math.max(1, Math.min(TESELAS_POR_LADO_MAX, Math.ceil(Math.sqrt(total / LINEAS_POR_TESELA))))
  // Celdas cuadradas: en un plano largo y angosto, más a lo largo.
  const lado = Math.max(ancho, alto) / porLado
  const columnas = Math.max(1, Math.ceil(ancho / lado))
  const filas = Math.max(1, Math.ceil(alto / lado))

  const celda = (x: number, y: number) => {
    const c = Math.min(columnas - 1, Math.max(0, Math.floor((x - limites.minX) / lado)))
    const f = Math.min(filas - 1, Math.max(0, Math.floor((y - limites.minY) / lado)))
    return f * columnas + c
  }

  interface Borrador {
    caja: LimitesPlano
    origen: { x: number; y: number }
    lotes: Map<string, { capa: string; color: string; tamano: number; lineas: { puntos: { x: number; y: number }[]; cerrada: boolean }[] }>
    textos: number[]
  }
  const borradores = new Map<number, Borrador>()
  const borrador = (indice: number): Borrador => {
    let b = borradores.get(indice)
    if (!b) {
      const c = indice % columnas
      const f = Math.floor(indice / columnas)
      b = {
        caja: { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
        origen: { x: limites.minX + c * lado, y: limites.minY + f * lado },
        lotes: new Map(),
        textos: [],
      }
      borradores.set(indice, b)
    }
    return b
  }
  const ampliar = (caja: LimitesPlano, x0: number, y0: number, x1: number, y1: number) => {
    if (x0 < caja.minX) caja.minX = x0
    if (y0 < caja.minY) caja.minY = y0
    if (x1 > caja.maxX) caja.maxX = x1
    if (y1 > caja.maxY) caja.maxY = y1
  }

  const colorDeCapa = new Map(plano.capas.map((c) => [c.nombre, c.color]))
  let puntos = 0
  for (const p of plano.polilineas) {
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    for (const q of p.puntos) {
      if (q.x < x0) x0 = q.x
      if (q.y < y0) y0 = q.y
      if (q.x > x1) x1 = q.x
      if (q.y > y1) y1 = q.y
    }
    puntos += p.puntos.length
    const b = borrador(celda((x0 + x1) / 2, (y0 + y1) / 2))
    ampliar(b.caja, x0, y0, x1, y1)
    const tamano = Math.max(x1 - x0, y1 - y0)
    // Niveles de detalle por tamaño, de a potencias de 2: cada nivel aparece
    // cuando sus líneas ya miden un par de píxeles en pantalla.
    const nivel = tamano > 0 ? Math.floor(Math.log2(tamano)) : -1074
    const color = p.color ?? colorDeCapa.get(p.capa) ?? '#808080'
    const clave = `${nivel}\u0000${p.capa}\u0000${color}`
    let lote = b.lotes.get(clave)
    if (!lote) {
      lote = { capa: p.capa, color, tamano: 0, lineas: [] }
      b.lotes.set(clave, lote)
    }
    if (tamano > lote.tamano) lote.tamano = tamano
    lote.lineas.push({ puntos: p.puntos, cerrada: p.cerrada })
  }
  plano.textos.forEach((t, i) => {
    const b = borrador(celda(t.x, t.y))
    // Una caja aproximada del rótulo: alto y unas letras de ancho a cada lado.
    const r = Math.max(t.altura, 0) * Math.max(1, t.texto.length)
    ampliar(b.caja, t.x - r, t.y - r, t.x + r, t.y + r)
    b.textos.push(i)
  })

  const teselas: Tesela[] = []
  for (const b of borradores.values()) {
    const lotes: Lote[] = []
    for (const l of b.lotes.values()) {
      const n = l.lineas.reduce((s, x) => s + x.puntos.length, 0)
      const coords = new Float32Array(n * 2)
      const inicios = new Uint32Array(l.lineas.length + 1)
      const cerradas = new Uint8Array(l.lineas.length)
      let k = 0
      l.lineas.forEach((linea, i) => {
        inicios[i] = k
        cerradas[i] = linea.cerrada ? 1 : 0
        for (const q of linea.puntos) {
          coords[2 * k] = q.x - b.origen.x
          coords[2 * k + 1] = q.y - b.origen.y
          k++
        }
      })
      inicios[l.lineas.length] = k
      lotes.push({ capa: l.capa, color: l.color, tamano: l.tamano, coords, inicios, cerradas })
    }
    lotes.sort((a, b) => b.tamano - a.tamano)
    teselas.push({ caja: b.caja, origen: b.origen, lotes, textos: b.textos })
  }
  return { limites, teselas, textos: plano.textos, colorDeCapa, puntos }
}

/** La ventana del plano que se ve, en sus unidades (Y hacia arriba). */
export interface Ventana {
  minX: number
  minY: number
  maxX: number
  maxY: number
  /** Píxeles de pantalla por unidad del plano. */
  escala: number
}

/** Las teselas que caen (aunque sea un poco) dentro de la ventana. */
export function teselasALaVista(dibujo: DibujoPreparado, v: Ventana): Tesela[] {
  return dibujo.teselas.filter((t) => t.caja.maxX >= v.minX && t.caja.minX <= v.maxX && t.caja.maxY >= v.minY && t.caja.minY <= v.maxY)
}

/** Desde cuántos píxeles se dibuja algo: lo de menos de esto es un punto que no se distingue. */
export const PIXELES_MINIMOS = 2

/**
 * Cómo se dibuja un lote a esta escala: entero si sus líneas ya se
 * distinguen; tenue si son una trama de menos de un par de píxeles (se ve
 * dónde hay dibujo sin volverse una mancha); nada si son motas.
 */
export function comoSeVe(lote: Lote, escala: number): 'entero' | 'tenue' | 'nada' {
  const px = lote.tamano * escala
  return px >= PIXELES_MINIMOS ? 'entero' : px >= PIXELES_MINIMOS / 4 ? 'tenue' : 'nada'
}

/** Si un texto se puede leer a esta escala (menos de 4 px de alto es una raya). */
export function seLeeTexto(t: TextoPlano, escala: number): boolean {
  return t.altura * escala >= 4
}
