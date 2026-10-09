import { leerDxf, type PlanoVectorial, type TextoPlano } from '../../planos/dxf'
import { abrirPdf, renderizarPagina, textosDePagina } from '../../planos/pdf'

/**
 * Abrir los bytes de un plano con los lectores de `src/planos`. Va en su
 * propio módulo para que las pruebas de la pantalla lo puedan cambiar: en
 * jsdom no hay <canvas> con que pintar un PDF.
 */

/**
 * Un DXF en texto. Casi todos vienen en UTF-8; los R12 viejos, en la
 * página de códigos de Windows: si no es UTF-8 válido se lee como latin1,
 * para que una «Ñ» de un rótulo no rompa el archivo.
 */
export function leerDxfDeBytes(bytes: Uint8Array): PlanoVectorial {
  let texto: string
  try {
    texto = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    texto = new TextDecoder('latin1').decode(bytes)
  }
  return leerDxf(texto)
}

export interface PdfCargado {
  /** Imagen de la página; quien la recibe la libera con URL.revokeObjectURL. */
  url: string
  /** Tamaño de la página en puntos PDF: el sistema del visor. */
  anchoPt: number
  altoPt: number
  paginas: number
  /** La página que se pintó (puede no ser la pedida si ya no existe). */
  pagina: number
  /** Textos en puntos PDF, con la Y hacia arriba. */
  textos: TextoPlano[]
}

/** Ancho con que se pinta la página: nítido al acercar sin pasar lo que aguanta un celular. */
const ANCHO_IMAGEN_PX = 2400
const LADO_MAX_PX = 4096

/** Pinta la página del PDF y saca sus textos. */
export async function cargarPdf(bytes: Uint8Array, pagina: number): Promise<PdfCargado> {
  const doc = await abrirPdf(bytes)
  try {
    const numero = Math.min(Math.max(1, Math.trunc(pagina) || 1), doc.paginas)
    const imagen = await renderizarPagina(doc, numero, { anchoObjetivoPx: ANCHO_IMAGEN_PX, ladoMaxPx: LADO_MAX_PX })
    const textos = await textosDePagina(doc, numero)
    return {
      url: imagen.url,
      anchoPt: imagen.anchoPt,
      altoPt: imagen.altoPt,
      paginas: doc.paginas,
      pagina: numero,
      textos,
    }
  } finally {
    await doc.cerrar()
  }
}

/** Abre el PDF solo para saber que se puede leer, antes de guardarlo. Devuelve sus páginas. */
export async function revisarPdf(bytes: Uint8Array): Promise<number> {
  const doc = await abrirPdf(bytes)
  const paginas = doc.paginas
  await doc.cerrar()
  return paginas
}

/**
 * Los planos vectoriales ya leídos, por sus bytes: abrir otra vez el mismo
 * DWG (o pasar de un plano a otro y volver) es instantáneo. Los bytes del
 * almacén no cambian; si se reimporta, son otros bytes y se lee de nuevo.
 */
const leidos = new WeakMap<Uint8Array, PlanoVectorial>()
const leyendo = new WeakMap<Uint8Array, Promise<PlanoVectorial>>()

/** El plano de un DWG si ya se leyó; si no, undefined. */
export function dwgYaLeido(bytes: Uint8Array): PlanoVectorial | undefined {
  return leidos.get(bytes)
}

/** Lee un DWG en segundo plano (una sola vez por archivo). */
export function cargarDwg(bytes: Uint8Array): Promise<PlanoVectorial> {
  const listo = leidos.get(bytes)
  if (listo) return Promise.resolve(listo)
  let enCurso = leyendo.get(bytes)
  if (!enCurso) {
    enCurso = import('../../planos/dwgEnSegundoPlano')
      .then(({ leerDwgEnSegundoPlano }) => leerDwgEnSegundoPlano(bytes))
      .then((plano) => {
        leidos.set(bytes, plano)
        return plano
      })
      .finally(() => leyendo.delete(bytes))
    leyendo.set(bytes, enCurso)
  }
  return enCurso
}
