import type { Proyecto } from '@topo/core'
import { del, get, set } from 'idb-keyval'

const CLAVE = 'topo:borrador'

interface Borrador {
  proyecto: Proyecto
  guardado: string
}

export async function guardarBorrador(proyecto: Proyecto): Promise<void> {
  await set(CLAVE, { proyecto, guardado: new Date().toISOString() } satisfies Borrador)
}

export async function leerBorrador(): Promise<Borrador | null> {
  return (await get<Borrador>(CLAVE)) ?? null
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
