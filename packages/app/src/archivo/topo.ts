import type { Proyecto } from '@topo/core'
import { unzipSync, zipSync } from 'fflate'

const NOMBRE_INTERNO = 'proyecto.json'
const VERSION_SOPORTADA = 1

export function empaquetarProyecto(proyecto: Proyecto): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify(proyecto, null, 2))
  return zipSync({ [NOMBRE_INTERNO]: json }, { level: 6 })
}

export function desempaquetarProyecto(datos: Uint8Array): Proyecto {
  let contenido: Record<string, Uint8Array>
  try {
    contenido = unzipSync(datos)
  } catch {
    throw new Error(
      'No se pudo leer el archivo .topo: parece estar dañado o no ser un archivo de la app.',
    )
  }

  const json = contenido[NOMBRE_INTERNO]
  if (!json) {
    throw new Error(
      'No se pudo leer el archivo .topo: parece estar dañado o no ser un archivo de la app.',
    )
  }

  let proyecto: Proyecto
  try {
    proyecto = JSON.parse(new TextDecoder().decode(json)) as Proyecto
  } catch {
    throw new Error('El archivo .topo está dañado: los datos del proyecto no se entienden.')
  }

  if (proyecto.version > VERSION_SOPORTADA) {
    throw new Error('Este archivo fue creado con una versión más nueva de la app.')
  }

  return proyecto
}

export function descargarTopo(proyecto: Proyecto): void {
  const datos = empaquetarProyecto(proyecto)
  const enlace = document.createElement('a')
  const url = URL.createObjectURL(new Blob([datos as BlobPart], { type: 'application/zip' }))

  enlace.href = url
  enlace.download = `${proyecto.meta.nombre.replace(/[^\w\s-]/g, '').trim() || 'proyecto'}.topo`
  enlace.click()
  URL.revokeObjectURL(url)
}

export async function abrirTopo(archivo: File): Promise<Proyecto> {
  const datos = new Uint8Array(await archivo.arrayBuffer())
  return desempaquetarProyecto(datos)
}
