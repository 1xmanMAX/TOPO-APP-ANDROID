/**
 * Lector de planos en PDF: abre el archivo, pinta una página como imagen
 * para ponerla de fondo y saca los textos vectoriales (rótulos y cotas
 * escritas) con su posición.
 *
 * Se usa pdfjs-dist (Apache-2.0). La biblioteca se puede inyectar: las
 * pruebas pasan la «legacy» (node). Si no se inyecta, se carga la normal
 * (navegador) junto con su trabajador (pdfTrabajador.ts, que usa «?url» de
 * Vite y por eso vive aparte).
 *
 * Coordenadas de los textos: puntos PDF (1/72 de pulgada) desde la esquina
 * de abajo a la izquierda de la página tal como se ve, con y hacia arriba,
 * igual que un DXF. Para pasar a píxeles de la imagen pintada se usa
 * ptAPixel: es el único lugar que conoce ese cambio de sistema. No son
 * metros: un plano en PDF no trae unidades, se calibran después.
 *
 * Los textos salen con el mismo tipo TextoPlano del DXF y la misma regla de
 * cota (cotas.ts), para que un plano dé las mismas cotas en los dos formatos.
 */
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import { valorDeCota } from './cotas'
import type { TextoPlano } from './dxf'

/** Lo que este lector usa de pdfjs; sirve el build normal o el legacy. */
export interface BibliotecaPdf {
  getDocument: typeof import('pdfjs-dist').getDocument
}

export type MotivoErrorPdf =
  | 'no-es-pdf'
  | 'danado'
  | 'con-contrasena'
  | 'pagina-inexistente'
  | 'opcion-invalida'
  /** Falló pdfjs o su trabajador, no el archivo: se arregla recargando la app. */
  | 'falla-del-lector'
  /** El plano se leyó, pero el navegador no pudo pintarlo o sacar la imagen. */
  | 'no-se-pudo-pintar'

/** Error con motivo, para que la interfaz decida qué decirle a Max. */
export class ErrorPdf extends Error {
  readonly motivo: MotivoErrorPdf
  constructor(motivo: MotivoErrorPdf, mensaje: string) {
    super(mensaje)
    this.name = 'ErrorPdf'
    this.motivo = motivo
  }
}

export interface DocumentoPdf {
  /** Número de páginas (la primera es la 1). */
  paginas: number
  /** Tamaño de la página tal como se ve (con su giro), en puntos. */
  tamanoPagina(numero: number): Promise<{ anchoPt: number; altoPt: number }>
  /** Libera la memoria del documento. */
  cerrar(): Promise<void>
  /** El documento de pdfjs, por si la interfaz necesita algo más. */
  readonly pdfjs: PDFDocumentProxy
}

export interface OpcionesRender {
  anchoObjetivoPx: number
  /** Lado más largo permitido; los navegadores fallan con lienzos enormes. */
  ladoMaxPx?: number
}

export interface MedidasRender {
  /** Píxeles de la imagen por punto PDF. */
  escala: number
  anchoPx: number
  altoPx: number
  /** Tamaño de la página tal como se ve, en puntos, sin redondear. */
  anchoPt: number
  altoPt: number
  /** true si el lado máximo obligó a pintar más chico de lo pedido. */
  limitada: boolean
}

export interface PaginaRenderizada extends MedidasRender {
  blob: Blob | null
  /** Dirección de la imagen; quien la usa la libera con URL.revokeObjectURL. */
  url: string
}

/**
 * Lo que necesita renderizarPagina para pintar: crear el lienzo y sacarle la
 * imagen. En el navegador es un <canvas>; en pruebas, uno simulado.
 */
export interface Dibujante {
  crearLienzo(anchoPx: number, altoPx: number): HTMLCanvasElement
  exportar(lienzo: HTMLCanvasElement): Promise<{ blob: Blob | null; url: string }>
}

const LADO_MAX_DE_FABRICA = 8000

/** Escala y tamaño de la imagen: al ancho pedido, sin pasar del lado máximo. */
export function calcularEscalaRender(anchoPt: number, altoPt: number, opciones: OpcionesRender): MedidasRender {
  // Un recuadro de página degenerado daría escala infinita y un lienzo NaN.
  if (!(Number.isFinite(anchoPt) && anchoPt > 0 && Number.isFinite(altoPt) && altoPt > 0)) {
    throw new ErrorPdf('danado', `La página no tiene un tamaño válido (${anchoPt} × ${altoPt} pt): el PDF está dañado.`)
  }
  const { anchoObjetivoPx, ladoMaxPx = LADO_MAX_DE_FABRICA } = opciones
  if (!Number.isFinite(anchoObjetivoPx) || anchoObjetivoPx <= 0) {
    throw new ErrorPdf('opcion-invalida', `El ancho pedido para la imagen no sirve: ${anchoObjetivoPx}.`)
  }
  if (!Number.isFinite(ladoMaxPx) || ladoMaxPx <= 0) {
    throw new ErrorPdf('opcion-invalida', `El lado máximo de la imagen no sirve: ${ladoMaxPx}.`)
  }
  let escala = anchoObjetivoPx / anchoPt
  const tope = ladoMaxPx / Math.max(anchoPt, altoPt)
  const limitada = escala > tope
  if (limitada) escala = tope
  // Redondeo, pero nunca por encima del tope (puede rozarlo por decimales).
  const anchoPx = Math.min(Math.round(anchoPt * escala), ladoMaxPx)
  const altoPx = Math.min(Math.round(altoPt * escala), ladoMaxPx)
  return { escala, anchoPx, altoPx, anchoPt, altoPt, limitada }
}

/**
 * Un punto de textosDePagina (puntos PDF, y hacia arriba) en píxeles de la
 * imagen de renderizarPagina (y hacia abajo), que es donde se dibujan las
 * pistas. Usa altoPt sin redondear: altoPx / escala arrastraría el redondeo.
 */
export function ptAPixel(
  medidas: Pick<MedidasRender, 'escala' | 'altoPt'>,
  punto: { x: number; y: number },
): { x: number; y: number } {
  return { x: punto.x * medidas.escala, y: (medidas.altoPt - punto.y) * medidas.escala }
}

function empiezaComoPdf(bytes: Uint8Array): boolean {
  // La firma «%PDF-» puede venir tras basura al inicio; pdfjs busca en 1024 bytes.
  const inicio = new TextDecoder('latin1').decode(bytes.subarray(0, 1024))
  return inicio.includes('%PDF-')
}

async function bibliotecaDeFabrica(): Promise<BibliotecaPdf> {
  // Primero el trabajador: sin workerSrc, pdfjs falla con todos los archivos.
  // Import dinámico de los dos: así las pruebas no cargan el build de navegador.
  // El build «legacy» trae los polyfills de lo más nuevo (Map.getOrInsertComputed):
  // sin él, el PDF no abre en el WebView de un Android no tan nuevo ni en Electron 38.
  await import('./pdfTrabajador')
  return (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as BibliotecaPdf
}

/** Abre un PDF. Copia los bytes porque pdfjs se queda con el búfer que recibe. */
export async function abrirPdf(bytes: Uint8Array, opciones: { biblioteca?: BibliotecaPdf } = {}): Promise<DocumentoPdf> {
  if (bytes.byteLength === 0 || !empiezaComoPdf(bytes)) {
    throw new ErrorPdf('no-es-pdf', 'El archivo no es un PDF: no tiene la firma «%PDF-» al inicio.')
  }
  const biblioteca = opciones.biblioteca ?? (await bibliotecaDeFabrica())
  const tarea = biblioteca.getDocument({ data: bytes.slice(), verbosity: 0 })
  // Sin esto pdfjs se queda esperando la contraseña en vez de fallar. Se
  // anota que la pidió: al destruir la tarea, el error que llega es un
  // genérico «Worker was destroyed», que también sale si el trabajador cae.
  let pidioContrasena = false
  tarea.onPassword = () => {
    pidioContrasena = true
    void tarea.destroy()
  }
  let pdfjs: PDFDocumentProxy
  try {
    pdfjs = await tarea.promise
  } catch (e) {
    throw traducirError(e, pidioContrasena)
  }
  const doc: DocumentoPdf = {
    paginas: pdfjs.numPages,
    pdfjs,
    async tamanoPagina(numero) {
      const vista = (await paginaDe(doc, numero)).getViewport({ scale: 1 })
      return { anchoPt: vista.width, altoPt: vista.height }
    },
    async cerrar() {
      // En pdfjs 6 se cierra por la tarea de carga, que también suelta el trabajador.
      await tarea.destroy()
    },
  }
  return doc
}

function mensajeDe(e: unknown): string {
  return (e as { message?: string } | null)?.message ?? String(e)
}

function traducirError(e: unknown, pidioContrasena: boolean): ErrorPdf {
  const nombre = (e as { name?: string } | null)?.name ?? ''
  const mensaje = mensajeDe(e)
  if (pidioContrasena || nombre === 'PasswordException') {
    return new ErrorPdf(
      'con-contrasena',
      'El PDF está protegido con contraseña. Pide el plano sin contraseña o guárdalo de nuevo sin ella.',
    )
  }
  // Fallos de pdfjs mismo (trabajador sin configurar, caído o destruido): el
  // archivo puede estar bien, y decirle a Max que está dañado lo confundiría.
  if (/workerSrc|fake worker|worker was destroyed|worker was terminated/i.test(mensaje)) {
    return new ErrorPdf(
      'falla-del-lector',
      `No se pudo leer el PDF porque falló el lector de la app, no el archivo. Recarga la app y vuelve a intentarlo (${mensaje}).`,
    )
  }
  return new ErrorPdf('danado', `El PDF está dañado o incompleto y no se puede leer (${mensaje}).`)
}

async function paginaDe(doc: DocumentoPdf, numero: number): Promise<PDFPageProxy> {
  if (!Number.isInteger(numero) || numero < 1 || numero > doc.paginas) {
    const total = doc.paginas === 1 ? '1 página' : `${doc.paginas} páginas`
    throw new ErrorPdf('pagina-inexistente', `La página ${numero} no existe: el PDF tiene ${total}.`)
  }
  return doc.pdfjs.getPage(numero)
}

/**
 * Textos vectoriales de una página, en el formato de los textos del DXF; los
 * vacíos que mete pdfjs se omiten. El PDF no tiene capas: capa va vacía.
 * La altura es la del texto en puntos (largo del vector vertical de su
 * transformación, que no cambia con el giro).
 */
export async function textosDePagina(doc: DocumentoPdf, numero: number): Promise<TextoPlano[]> {
  const pagina = await paginaDe(doc, numero)
  const vista = pagina.getViewport({ scale: 1 })
  const contenido = await pagina.getTextContent()
  const textos: TextoPlano[] = []
  for (const item of contenido.items) {
    // Los marcadores de contenido no traen texto.
    if (!('str' in item)) continue
    const texto = item.str.trim()
    if (texto === '') continue
    // El origen del texto pasa por la vista (aplica el giro y el recuadro de
    // la página) y se voltea para que y vaya hacia arriba, como en el DXF.
    const [vx, vy] = vista.convertToViewportPoint(item.transform[4], item.transform[5])
    const altura = Math.hypot(item.transform[2], item.transform[3])
    textos.push({ capa: '', texto, x: vx, y: vista.height - vy, altura, valor: valorDeCota(texto) })
  }
  return textos
}

/** Dibujante del navegador: un <canvas> y su imagen PNG. */
export const dibujanteNavegador: Dibujante = {
  crearLienzo(anchoPx, altoPx) {
    const lienzo = document.createElement('canvas')
    lienzo.width = anchoPx
    lienzo.height = altoPx
    return lienzo
  },
  exportar(lienzo) {
    return new Promise((resolver, rechazar) => {
      lienzo.toBlob((blob) => {
        if (!blob) {
          rechazar(
            new ErrorPdf('no-se-pudo-pintar', 'El navegador no pudo convertir el plano en imagen (¿muy grande?).'),
          )
          return
        }
        resolver({ blob, url: URL.createObjectURL(blob) })
      }, 'image/png')
    })
  },
}

/** Pinta una página como imagen, al ancho pedido y sin pasar del lado máximo. */
export async function renderizarPagina(
  doc: DocumentoPdf,
  numero: number,
  opciones: OpcionesRender,
  dibujante: Dibujante = dibujanteNavegador,
): Promise<PaginaRenderizada> {
  const pagina = await paginaDe(doc, numero)
  const base = pagina.getViewport({ scale: 1 })
  const medidas = calcularEscalaRender(base.width, base.height, opciones)
  try {
    const lienzo = dibujante.crearLienzo(medidas.anchoPx, medidas.altoPx)
    const vista = pagina.getViewport({ scale: medidas.escala })
    await pagina.render({ canvas: lienzo, viewport: vista }).promise
    const imagen = await dibujante.exportar(lienzo)
    return { ...medidas, ...imagen }
  } catch (e) {
    // Con motivo propio, para que la interfaz no lo confunda con un archivo malo.
    if (e instanceof ErrorPdf) throw e
    throw new ErrorPdf('no-se-pudo-pintar', `No se pudo pintar la página ${numero} del plano (${mensajeDe(e)}).`)
  }
}
