import type { AnclaTexto } from '../../planos/dxf'
import { comoSeVe, seLeeTexto, teselasALaVista, type DibujoPreparado, type Lote } from '../../planos/indiceDibujo'

/**
 * Pinta un plano vectorial (DXF o DWG) ya preparado en un <canvas>, para la
 * porción que se ve. El SVG del visor queda encima con las pistas, los
 * puntos y los rótulos de la app; el canvas es solo el fondo.
 */

/** Dónde está la ventana: lo mismo que usa el SVG del visor (viewBox con Y hacia abajo y encaje «meet»). */
export interface Encuadre {
  /** viewBox del SVG. */
  vista: { x: number; y: number; ancho: number; alto: number }
  /** Tamaño del lienzo en píxeles CSS. */
  ancho: number
  alto: number
  /** Píxeles del dispositivo por píxel CSS. */
  dpr: number
  /** El origen del SVG en el plano (ver origenDelVisor): el viewBox es relativo a él. */
  origen: { x: number; y: number }
}

export interface OpcionesPintado {
  ocultas: ReadonlySet<string>
  /** El color con que se pinta el blanco de AutoCAD (el 7): el texto del tema. */
  colorTinta: string
  /** Mientras se arrastra o se pellizca: sin el detalle tenue (los textos sí). */
  rapido: boolean
}

/** Tope de textos por cuadro: más de esto en pantalla no se lee y traba. */
const TEXTOS_MAXIMOS = 4000

const ALINEA = { izquierda: 'left', centro: 'center', derecha: 'right' } as const
const BASE = { base: 'alphabetic', abajo: 'bottom', medio: 'middle', arriba: 'top' } as const

function trazoDe(lote: Lote): Path2D {
  if (lote.cache instanceof Path2D) return lote.cache
  const camino = new Path2D()
  const { coords, inicios, cerradas } = lote
  for (let i = 0; i < cerradas.length; i++) {
    const desde = inicios[i]!
    const hasta = inicios[i + 1]!
    camino.moveTo(coords[2 * desde]!, coords[2 * desde + 1]!)
    for (let k = desde + 1; k < hasta; k++) camino.lineTo(coords[2 * k]!, coords[2 * k + 1]!)
    if (cerradas[i]) camino.closePath()
  }
  lote.cache = camino
  return camino
}

function colorVisible(color: string, tinta: string): string {
  return color.toLowerCase() === '#ffffff' ? tinta : color
}

/** Pinta el cuadro entero. Devuelve cuánto se dibujó, para medir. */
export function pintarVectorial(
  ctx: CanvasRenderingContext2D,
  dibujo: DibujoPreparado,
  e: Encuadre,
  op: OpcionesPintado,
): { teselas: number; textos: number } {
  const { vista, ancho, alto, dpr, origen } = e
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  if (!(vista.ancho > 0) || !(vista.alto > 0) || !(ancho > 0) || !(alto > 0)) return { teselas: 0, textos: 0 }

  // El mismo encaje que hace el SVG con su viewBox.
  const escala = Math.min(ancho / vista.ancho, alto / vista.alto)
  const margenX = (ancho - vista.ancho * escala) / 2
  const margenY = (alto - vista.alto * escala) / 2
  // Lo que se ve, en el sistema del plano (Y hacia arriba).
  const minX = origen.x + vista.x - margenX / escala
  const maxX = minX + ancho / escala
  const maxY = origen.y - (vista.y - margenY / escala)
  const minY = maxY - alto / escala
  const ventana = { minX, minY, maxX, maxY, escala }
  const teselas = teselasALaVista(dibujo, ventana)

  ctx.lineWidth = 1 / escala
  ctx.lineJoin = 'round'
  for (const t of teselas) {
    // Cada tesela con su propia traslación: sus puntos son relativos a su esquina.
    ctx.setTransform(
      escala * dpr,
      0,
      0,
      -escala * dpr,
      (margenX + (t.origen.x - origen.x - vista.x) * escala) * dpr,
      (margenY + (origen.y - t.origen.y - vista.y) * escala) * dpr,
    )
    for (const lote of t.lotes) {
      if (op.ocultas.has(lote.capa)) continue
      const como = comoSeVe(lote, escala)
      if (como === 'nada' || (op.rapido && como === 'tenue')) continue
      ctx.globalAlpha = como === 'tenue' ? 0.35 : 1
      ctx.strokeStyle = colorVisible(lote.color, op.colorTinta)
      ctx.stroke(trazoDe(lote))
    }
    ctx.globalAlpha = 1
  }

  // Los textos también mientras se mueve el plano: si desaparecieran, las
  // tablas y los rótulos parpadearían en cada arrastre.
  let textos = 0
  {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    for (const t of teselas) {
      for (const i of t.textos) {
        if (textos >= TEXTOS_MAXIMOS) break
        const texto = dibujo.textos[i]!
        if (op.ocultas.has(texto.capa) || !seLeeTexto(texto, escala)) continue
        const x = margenX + (texto.x - origen.x - vista.x) * escala
        const y = margenY + (origen.y - texto.y - vista.y) * escala
        if (x < -ancho || x > 2 * ancho || y < -alto || y > 2 * alto) continue
        const [fila, columna] = (texto.ancla ?? ('base-izquierda' as AnclaTexto)).split('-') as [keyof typeof BASE, keyof typeof ALINEA]
        ctx.save()
        ctx.translate(x, y)
        const giro = texto.rotacion ?? 0
        if (giro) ctx.rotate((-giro * Math.PI) / 180)
        ctx.font = `${texto.altura * escala}px system-ui, sans-serif`
        ctx.textAlign = ALINEA[columna]
        ctx.textBaseline = BASE[fila]
        ctx.fillStyle = colorVisible(texto.color ?? dibujo.colorDeCapa.get(texto.capa) ?? '#808080', op.colorTinta)
        ctx.fillText(texto.texto, 0, 0)
        ctx.restore()
        textos++
      }
    }
  }
  return { teselas: teselas.length, textos }
}
