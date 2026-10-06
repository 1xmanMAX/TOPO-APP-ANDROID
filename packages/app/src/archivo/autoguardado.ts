import type { Proyecto } from '@topo/core'
import { del, get, set } from 'idb-keyval'
import { todasLasTomas } from '../estado/proyectoTomas'
import { migrarProyecto, type ArchivosDePlano } from './topo'

const CLAVE = 'topo:borrador'
/**
 * Los bytes de los planos van en su propia clave y no junto al proyecto: el
 * proyecto se guarda a cada segundo de trabajo, y arrastrar con él varios
 * megas de PDF que no cambiaron sería escribirlos una y otra vez en el
 * celular. Esta clave solo se escribe cuando cambian los planos.
 */
const CLAVE_PLANOS = 'topo:borrador:planos'

export interface Borrador {
  proyecto: Proyecto
  guardado: string
  /** Vacío si el borrador es de antes de los planos, o si no hay ninguno. */
  archivosDePlano: ArchivosDePlano
}

export async function guardarBorrador(proyecto: Proyecto): Promise<void> {
  await set(CLAVE, { proyecto, guardado: new Date().toISOString() })
}

export async function guardarArchivosDePlano(archivosDePlano: ArchivosDePlano): Promise<void> {
  await set(CLAVE_PLANOS, archivosDePlano)
}

/**
 * Un borrador puede llevar tiempo guardado en el navegador: si viene de antes
 * de esta entrega, sus capas no traen `espesor` ni `toleranciaMm`, y sus
 * calles no traen `rasante`. Pasa por la misma migración que un archivo
 * `.topo` (`migrarProyecto`) para que el proyecto recuperado quede tan
 * usable como uno abierto desde archivo, y no entre con campos a medias.
 *
 * De los planos guardados se devuelven solo los que el proyecto declara,
 * igual que al abrir un .topo.
 */
export async function leerBorrador(): Promise<Borrador | null> {
  const borrador = await get<Omit<Borrador, 'archivosDePlano'>>(CLAVE)
  if (!borrador) return null
  const proyecto = migrarProyecto(borrador.proyecto)
  const guardados = (await get<ArchivosDePlano>(CLAVE_PLANOS)) ?? {}
  const archivosDePlano: ArchivosDePlano = {}
  for (const plano of proyecto.planos ?? []) {
    const bytes = guardados[plano.id]
    if (bytes) archivosDePlano[plano.id] = bytes
  }
  return { proyecto, guardado: borrador.guardado, archivosDePlano }
}

export async function borrarBorrador(): Promise<void> {
  await del(CLAVE)
  await del(CLAVE_PLANOS)
}

/** Cuenta lecturas para el mensaje de recuperación. */
export function contarLecturas(proyecto: Proyecto): number {
  return todasLasTomas(proyecto).reduce(
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
