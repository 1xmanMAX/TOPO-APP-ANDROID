import type { Calibracion, Id, PlanoImportado } from '@topo/core'
import { bytesDelArchivo } from '../../archivo/bytes'
import { leerDxfDeBytes, revisarPdf } from './cargarPlano'
import { metrosPorUnidadDe } from './geometriaVisor'

export type ResultadoImportacion =
  | { ok: true; id: Id; aviso: string | null }
  | { ok: false; mensaje: string }

export const MENSAJE_DWG =
  'Los DWG no se pueden leer aquí. Ábrelo con ODA File Converter (gratis), guárdalo como DXF y vuelve a importarlo.'

const MENSAJE_OTRO = 'Solo se importan planos en DXF o PDF.'

/** Firma de un DWG de AutoCAD: «AC10» seguido de la versión. */
function pareceDwg(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && new TextDecoder('latin1').decode(bytes.subarray(0, 4)) === 'AC10'
}

function pareceEsPdf(bytes: Uint8Array): boolean {
  return new TextDecoder('latin1').decode(bytes.subarray(0, 1024)).includes('%PDF-')
}

function mensajeDe(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/**
 * Lee el archivo elegido, comprueba que se puede abrir y lo guarda con
 * `agregarPlano` (los bytes van aparte del JSON). Un DXF que declara sus
 * unidades llega ya calibrado; un PDF o un DXF sin unidades, sin calibrar.
 */
export async function importarPlano(
  archivo: File,
  agregarPlano: (datos: Omit<PlanoImportado, 'id'>, bytes: Uint8Array) => Id,
): Promise<ResultadoImportacion> {
  const partes = archivo.name.split('.')
  const extension = partes.length > 1 ? partes.pop()!.toLowerCase() : ''
  const nombre = partes.join('.') || archivo.name
  // El DWG se reconoce por el nombre, sin leerlo: no hay nada que intentar.
  if (extension === 'dwg') return { ok: false, mensaje: MENSAJE_DWG }

  let bytes: Uint8Array
  try {
    bytes = await bytesDelArchivo(archivo)
  } catch (e) {
    return { ok: false, mensaje: mensajeDe(e) }
  }
  if (pareceDwg(bytes)) return { ok: false, mensaje: MENSAJE_DWG }

  const formato = extension === 'pdf' || extension === 'dxf' ? extension : pareceEsPdf(bytes) ? 'pdf' : null
  if (formato === null) return { ok: false, mensaje: MENSAJE_OTRO }

  if (formato === 'dxf') {
    try {
      const vectorial = leerDxfDeBytes(bytes)
      const metros = metrosPorUnidadDe(vectorial.unidades)
      const calibracion: Calibracion | null = metros ? { metrosPorUnidad: metros, ejeY: 'arriba' } : null
      // Las capas apagadas en el archivo empiezan ocultas, como las dejó el proyectista.
      const apagadas = vectorial.capas.filter((c) => !c.visible).map((c) => c.nombre)
      const id = agregarPlano({ nombre, formato: 'dxf', calibracion, capasOcultas: apagadas }, bytes)
      return {
        ok: true,
        id,
        aviso: calibracion ? null : 'El DXF no dice en qué unidades está: calibra la escala con dos puntos de distancia conocida.',
      }
    } catch (e) {
      return { ok: false, mensaje: mensajeDe(e) }
    }
  }

  try {
    await revisarPdf(bytes)
  } catch (e) {
    return { ok: false, mensaje: mensajeDe(e) }
  }
  const id = agregarPlano({ nombre, formato: 'pdf', pagina: 1, calibracion: null }, bytes)
  return { ok: true, id, aviso: 'Un PDF no trae escala: calibra con dos puntos de distancia conocida antes de medir sobre él.' }
}
