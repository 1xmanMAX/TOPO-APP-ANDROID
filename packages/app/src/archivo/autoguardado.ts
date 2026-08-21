import type { Proyecto } from '@topo/core'
import { del, get, set } from 'idb-keyval'
import { migrarProyecto } from './topo'

const CLAVE = 'topo:borrador'

export interface Borrador {
  proyecto: Proyecto
  guardado: string
}

export async function guardarBorrador(proyecto: Proyecto): Promise<void> {
  await set(CLAVE, { proyecto, guardado: new Date().toISOString() } satisfies Borrador)
}

/**
 * Un borrador puede llevar tiempo guardado en el navegador: si viene de antes
 * de esta entrega, sus capas no traen `espesor` ni `toleranciaMm`, y sus
 * calles no traen `rasante`. Pasa por la misma migración que un archivo
 * `.topo` (`migrarProyecto`) para que el proyecto recuperado quede tan
 * usable como uno abierto desde archivo, y no entre con campos a medias.
 */
export async function leerBorrador(): Promise<Borrador | null> {
  const borrador = await get<Borrador>(CLAVE)
  if (!borrador) return null
  return { ...borrador, proyecto: migrarProyecto(borrador.proyecto) }
}

export async function borrarBorrador(): Promise<void> {
  await del(CLAVE)
}

/** Cuenta lecturas para el mensaje de recuperación. */
export function contarLecturas(proyecto: Proyecto): number {
  return proyecto.campanias.reduce(
    (total, campania) =>
      total +
      campania.estaciones.reduce(
        (suma, estacion) =>
          suma + estacion.intermedias.length + 1 + (estacion.vistaAdelante ? 1 : 0),
        0,
      ),
    0,
  )
}
