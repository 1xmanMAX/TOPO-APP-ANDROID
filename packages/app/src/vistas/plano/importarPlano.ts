import type { Calibracion, Id, PlanoImportado } from '@topo/core'
import { bytesDelArchivo } from '../../archivo/bytes'
import { pareceDwg } from '../../planos/dwg'
import type { PlanoVectorial } from '../../planos/dxf'
import { cargarDwg, leerDxfDeBytes, revisarPdf } from './cargarPlano'
import { metrosPorUnidadDe } from './geometriaVisor'

export type ResultadoImportacion =
  | { ok: true; id: Id; aviso: string | null }
  | { ok: false; mensaje: string }

const MENSAJE_OTRO = 'Solo se importan planos en DWG, DXF o PDF.'

function pareceEsPdf(bytes: Uint8Array): boolean {
  return new TextDecoder('latin1').decode(bytes.subarray(0, 1024)).includes('%PDF-')
}

function mensajeDe(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/**
 * Lee el archivo elegido, comprueba que se puede abrir y lo guarda con
 * `agregarPlano` (los bytes van aparte del JSON). Un DXF que declara sus
 * unidades llega ya calibrado (igual un DWG); un PDF o un DXF sin unidades, sin calibrar.
 */
export async function importarPlano(
  archivo: File,
  agregarPlano: (datos: Omit<PlanoImportado, 'id'>, bytes: Uint8Array) => Id,
): Promise<ResultadoImportacion> {
  const partes = archivo.name.split('.')
  const extension = partes.length > 1 ? partes.pop()!.toLowerCase() : ''
  const nombre = partes.join('.') || archivo.name

  let bytes: Uint8Array
  try {
    bytes = await bytesDelArchivo(archivo)
  } catch (e) {
    return { ok: false, mensaje: mensajeDe(e) }
  }
  // La firma manda sobre la extensión: un DWG renombrado .dxf se lee igual.
  const formato = pareceDwg(bytes)
    ? 'dwg'
    : extension === 'pdf' || extension === 'dxf'
      ? extension
      : pareceEsPdf(bytes)
        ? 'pdf'
        : null
  if (formato === null) return { ok: false, mensaje: MENSAJE_OTRO }

  if (formato === 'dxf' || formato === 'dwg') {
    try {
      const vectorial: PlanoVectorial = formato === 'dwg' ? await cargarDwg(bytes) : leerDxfDeBytes(bytes)
      const metros = metrosPorUnidadDe(vectorial.unidades)
      const calibracion: Calibracion | null = metros ? { metrosPorUnidad: metros, ejeY: 'arriba' } : null
      // Las capas apagadas en el archivo empiezan ocultas, como las dejó el proyectista.
      const apagadas = vectorial.capas.filter((c) => !c.visible).map((c) => c.nombre)
      const id = agregarPlano({ nombre, formato, calibracion, capasOcultas: apagadas }, bytes)
      return {
        ok: true,
        id,
        aviso: calibracion ? null : `El ${formato.toUpperCase()} no dice en qué unidades está: calibra la escala con dos puntos de distancia conocida.`,
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

export interface ResultadoVarios {
  importados: { id: Id; nombre: string; aviso: string | null }[]
  fallidos: { nombre: string; mensaje: string }[]
}

/**
 * Varios archivos de una vez (elegidos juntos o soltados juntos), uno tras
 * otro para no tener dos DWG grandes en memoria a la vez. Lo que falla no
 * detiene a los demás.
 */
export async function importarPlanos(
  archivos: readonly File[],
  agregarPlano: (datos: Omit<PlanoImportado, 'id'>, bytes: Uint8Array) => Id,
  alAvanzar?: (hechos: number, total: number) => void,
): Promise<ResultadoVarios> {
  const resultado: ResultadoVarios = { importados: [], fallidos: [] }
  for (const [i, archivo] of archivos.entries()) {
    alAvanzar?.(i, archivos.length)
    const r = await importarPlano(archivo, agregarPlano)
    if (r.ok) resultado.importados.push({ id: r.id, nombre: archivo.name, aviso: r.aviso })
    else resultado.fallidos.push({ nombre: archivo.name, mensaje: r.mensaje })
  }
  alAvanzar?.(archivos.length, archivos.length)
  return resultado
}
