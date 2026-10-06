import {
  abrirPdf,
  dibujanteNavegador,
  renderizarPagina,
  type BibliotecaPdf,
  type Dibujante,
  type PaginaRenderizada,
} from '../../planos/pdf'

/*
 * Lo que sale de la pantalla de Informes: la imagen de la primera página
 * para la vista previa, la descarga del archivo y el botón Compartir.
 */

export interface OpcionesVistaPrevia {
  anchoObjetivoPx: number
  /** Las pruebas pasan pdfjs «legacy»; en la app se carga el normal. */
  biblioteca?: BibliotecaPdf
  /** Las pruebas pasan un lienzo falso; en la app es un <canvas>. */
  dibujante?: Dibujante
}

/**
 * Pinta la primera página del PDF que se va a descargar, con el mismo lector
 * de planos (planos/pdf.ts): la vista previa es el archivo de verdad, no un
 * dibujo aparte que podría no coincidir con él.
 */
export async function pintarPrimeraPagina(bytes: Uint8Array, opciones: OpcionesVistaPrevia): Promise<PaginaRenderizada> {
  const doc = await abrirPdf(bytes, opciones.biblioteca ? { biblioteca: opciones.biblioteca } : {})
  try {
    return await renderizarPagina(doc, 1, { anchoObjetivoPx: opciones.anchoObjetivoPx }, opciones.dibujante ?? dibujanteNavegador)
  } finally {
    await doc.cerrar()
  }
}

export const TIPO_PDF = 'application/pdf'

/** Descarga unos bytes con su nombre, como hacen los exportadores de Excel. */
export function descargarBytes(bytes: Uint8Array, nombre: string, tipo = TIPO_PDF): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: tipo }))
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombre
  enlace.click()
  URL.revokeObjectURL(url)
}

/** Lo que del navegador usa Compartir; se inyecta en las pruebas. */
export interface Compartidor {
  share?: (datos: ShareData) => Promise<void>
  canShare?: (datos: ShareData) => boolean
}

export type ResultadoCompartir = 'compartido' | 'descargado' | 'cancelado'

/**
 * Comparte el archivo con el menú del teléfono (WhatsApp, correo…) si el
 * navegador sabe compartir archivos; si no, lo descarga. Si el topógrafo
 * cierra el menú sin elegir, no se descarga nada: lo decidió él.
 */
export async function compartirArchivo(
  bytes: Uint8Array,
  nombre: string,
  tipo = TIPO_PDF,
  navegador: Compartidor = typeof navigator === 'undefined' ? {} : navigator,
): Promise<ResultadoCompartir> {
  const archivo = new File([bytes as BlobPart], nombre, { type: tipo })
  const datos: ShareData = { files: [archivo], title: nombre }
  if (typeof navegador.share === 'function' && navegador.canShare?.(datos) === true) {
    try {
      await navegador.share(datos)
      return 'compartido'
    } catch (e) {
      if ((e as { name?: string } | null)?.name === 'AbortError') return 'cancelado'
      // Otro fallo (permiso, archivo muy grande): que al menos baje el archivo.
    }
  }
  descargarBytes(bytes, nombre, tipo)
  return 'descargado'
}
