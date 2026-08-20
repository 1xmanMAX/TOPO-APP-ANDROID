import type { Proyecto } from '@topo/core'
import { unzipSync, zipSync } from 'fflate'

const NOMBRE_INTERNO = 'proyecto.json'
const VERSION_SOPORTADA = 1

export function empaquetarProyecto(proyecto: Proyecto) {
  const json = new TextEncoder().encode(JSON.stringify(proyecto, null, 2))
  return zipSync({ [NOMBRE_INTERNO]: json }, { level: 6 })
}

export function desempaquetarProyecto(datos: Uint8Array): Proyecto {
  let contenido: Record<string, Uint8Array>
  try {
    contenido = unzipSync(datos)
  } catch {
    throw new Error(
      'No se pudo leer el archivo .topo: parece estar dañado o no ser un archivo de la app.' +
        ' Comprueba que sea el archivo .topo que guardaste.',
    )
  }

  const json = contenido[NOMBRE_INTERNO]
  if (!json) {
    throw new Error(
      'No se pudo leer el archivo .topo: parece estar dañado o no ser un archivo de la app.' +
        ' Comprueba que sea el archivo .topo que guardaste.',
    )
  }

  let proyecto: Proyecto
  try {
    proyecto = JSON.parse(new TextDecoder().decode(json)) as Proyecto
  } catch {
    throw new Error('El archivo .topo está dañado: los datos del proyecto no se entienden.')
  }

  if (typeof proyecto?.version !== 'number') {
    throw new Error(
      'El archivo .topo está dañado: los datos del proyecto no se entienden. ' +
        'Prueba con otra copia del archivo.',
    )
  }

  if (proyecto.version > VERSION_SOPORTADA) {
    throw new Error(
      'Este archivo fue creado con una versión más nueva de la app.' +
        ' Actualiza la aplicación para poder abrirlo.',
    )
  }

  return migrarCapasSinOrden(proyecto)
}

/**
 * El campo `orden` de las capas es nuevo en la Entrega 2A: un archivo `.topo`
 * guardado con la Entrega 1 trae capas sin él. Si se dejara así, `ordenarCapas`
 * restaría `a.orden - b.orden`, que da `NaN` para cada par — y aunque V8 hoy
 * conserva el orden original del array cuando el comparador da `NaN` (que es
 * el orden físico del paquete, porque así se guardaban antes de que existiera
 * el campo), la especificación del lenguaje no lo garantiza. Se renumera aquí
 * por la posición en el array, no con `renumerarCapas` de `@topo/core`
 * directamente: esa función empieza ordenando por el propio campo `orden`,
 * que es justo el que falta.
 */
function migrarCapasSinOrden(proyecto: Proyecto): Proyecto {
  const faltaOrden = proyecto.capas.some((capa) => typeof capa.orden !== 'number')
  if (!faltaOrden) return proyecto

  return {
    ...proyecto,
    capas: proyecto.capas.map((capa, indice) => ({ ...capa, orden: indice })),
  }
}

export function descargarTopo(proyecto: Proyecto): void {
  const datos = empaquetarProyecto(proyecto)
  const enlace = document.createElement('a')
  const url = URL.createObjectURL(new Blob([datos], { type: 'application/zip' }))

  enlace.href = url
  enlace.download = `${proyecto.meta.nombre.replace(/[^\w\s-]/g, '').trim() || 'proyecto'}.topo`
  enlace.click()
  URL.revokeObjectURL(url)
}

export async function abrirTopo(archivo: File): Promise<Proyecto> {
  const datos = new Uint8Array(await archivo.arrayBuffer())
  return desempaquetarProyecto(datos)
}
