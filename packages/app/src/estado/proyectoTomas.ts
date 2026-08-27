import type { Id, Nivelacion, Proyecto, Toma } from '@topo/core'

/**
 * Puente entre la forma antigua del proyecto (una lista plana de campañas) y
 * la nueva (cada calle agrupa sus tomas en nivelaciones): estas funciones son
 * las únicas que recorren `calle.nivelaciones` para encontrar o modificar una
 * toma por id. El resto del código del `app` sigue pensando en "la toma
 * activa" por su id, igual que antes pensaba en "la campaña activa".
 */
export interface TomaHallada {
  calleId: Id
  nivelacion: Nivelacion
  toma: Toma
}

/** Busca una toma por id en toda la obra. Null si no existe. */
export function buscarToma(proyecto: Proyecto, tomaId: Id | null): TomaHallada | null {
  if (!tomaId) return null
  for (const calle of proyecto.calles) {
    for (const nivelacion of calle.nivelaciones) {
      const toma = nivelacion.tomas.find((t) => t.id === tomaId)
      if (toma) return { calleId: calle.id, nivelacion, toma }
    }
  }
  return null
}

/** Todas las tomas de la obra, de cualquier calle y nivelación, en una sola lista. */
export function todasLasTomas(proyecto: Proyecto): Toma[] {
  return proyecto.calles.flatMap((calle) => calle.nivelaciones.flatMap((nivelacion) => nivelacion.tomas))
}

/** La primera toma que encuentra, para elegir una por defecto al cargar un proyecto. */
export function primeraTomaId(proyecto: Proyecto): Id | null {
  for (const calle of proyecto.calles) {
    for (const nivelacion of calle.nivelaciones) {
      const primera = nivelacion.tomas[0]
      if (primera) return primera.id
    }
  }
  return null
}

/** El id de la calle que contiene esta toma, o null si no se activó ninguna o no existe. */
export function calleDeToma(proyecto: Proyecto, tomaId: Id | null): Id | null {
  return buscarToma(proyecto, tomaId)?.calleId ?? null
}

/**
 * Devuelve un proyecto nuevo con esa toma transformada, dondequiera que esté.
 * Si el id no existe en ninguna calle, devuelve el proyecto tal cual.
 */
export function conToma(proyecto: Proyecto, tomaId: Id, transformar: (toma: Toma) => Toma): Proyecto {
  return {
    ...proyecto,
    calles: proyecto.calles.map((calle) => ({
      ...calle,
      nivelaciones: calle.nivelaciones.map((nivelacion) => ({
        ...nivelacion,
        tomas: nivelacion.tomas.map((toma) => (toma.id === tomaId ? transformar(toma) : toma)),
      })),
    })),
  }
}

/** Paleta que se reparte a las nivelaciones nuevas, una tras otra. */
const PALETA_NIVELACIONES = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2']

export function colorDeNivelacion(indice: number): string {
  return PALETA_NIVELACIONES[indice % PALETA_NIVELACIONES.length]!
}

/**
 * Agrega una toma nueva a una calle, como su propia nivelación de una sola
 * toma: es el puente para lo que hoy en la pantalla sigue siendo «crear una
 * campaña» — agrupar tomas en una nivelación existente es una decisión de
 * Max, no algo que esta pantalla decida por su cuenta todavía.
 */
export function agregarTomaComoNivelacion(
  proyecto: Proyecto,
  calleId: Id,
  toma: Toma,
  nivelacionId: Id,
): Proyecto {
  const totalNivelaciones = proyecto.calles.reduce((total, calle) => total + calle.nivelaciones.length, 0)
  const nivelacion: Nivelacion = {
    id: nivelacionId,
    nombre: `Toma del ${toma.fecha}`,
    color: colorDeNivelacion(totalNivelaciones),
    tomas: [toma],
  }

  return {
    ...proyecto,
    calles: proyecto.calles.map((calle) =>
      calle.id === calleId ? { ...calle, nivelaciones: [...calle.nivelaciones, nivelacion] } : calle,
    ),
  }
}

/** Quita una toma de dondequiera que esté (y su nivelación, si se queda sin tomas). */
export function quitarToma(proyecto: Proyecto, tomaId: Id): Proyecto {
  return {
    ...proyecto,
    calles: proyecto.calles.map((calle) => ({
      ...calle,
      nivelaciones: calle.nivelaciones
        .map((nivelacion) => ({ ...nivelacion, tomas: nivelacion.tomas.filter((t) => t.id !== tomaId) }))
        .filter((nivelacion) => nivelacion.tomas.length > 0),
    })),
  }
}

/**
 * Mueve una toma a otra calle: la saca de donde está y la vuelve a poner como
 * una nivelación nueva de una sola toma en la calle de destino. Conserva el
 * id de la nivelación (y por tanto su color) cuando la toma era la única de
 * su nivelación; si la compartía con otras, nace una nivelación nueva porque
 * ya no tiene sentido que seguir agrupada con tomas de otra calle.
 */
export function moverTomaDeCalle(proyecto: Proyecto, tomaId: Id, calleDestinoId: Id, nuevoId: () => Id): Proyecto {
  const hallado = buscarToma(proyecto, tomaId)
  if (!hallado) return proyecto

  const nivelacionId = hallado.nivelacion.tomas.length === 1 ? hallado.nivelacion.id : nuevoId()
  return agregarTomaComoNivelacion(quitarToma(proyecto, tomaId), calleDestinoId, hallado.toma, nivelacionId)
}
