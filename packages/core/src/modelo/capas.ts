import type { Capa, Id, Toma } from './tipos'

/** De arriba hacia abajo del paquete: terreno primero, carpeta al final. */
export function ordenarCapas(capas: Capa[]): Capa[] {
  return [...capas].sort((a, b) => a.orden - b.orden)
}

/** Orden consecutivo desde cero. Un borrado deja huecos que hay que cerrar. */
export function renumerarCapas(capas: Capa[]): Capa[] {
  return ordenarCapas(capas).map((capa, indice) => ({ ...capa, orden: indice }))
}

/** True si alguna toma usa esta capa: borrarla la dejaría apuntando a algo inexistente. */
export function capaEnUso(tomas: Toma[], capaId: Id): boolean {
  return tomas.some((toma) => toma.capaId === capaId)
}

/**
 * Sube o baja una capa dentro del paquete. El orden manda para el cálculo de
 * espesores, así que tiene que poder corregirse: una capa creada tarde queda
 * al final aunque físicamente vaya en medio.
 */
export function moverCapa(capas: Capa[], capaId: Id, direccion: -1 | 1): Capa[] {
  const ordenadas = ordenarCapas(capas)
  const indice = ordenadas.findIndex((capa) => capa.id === capaId)
  const destino = indice + direccion

  if (indice < 0 || destino < 0 || destino >= ordenadas.length) return capas

  const reordenadas = [...ordenadas]
  const [movida] = reordenadas.splice(indice, 1)
  reordenadas.splice(destino, 0, movida!)

  // No renumerarCapas: reordenadas ya está en el orden deseado por posición,
  // pero el campo `orden` de cada capa todavía trae su valor viejo, y
  // renumerarCapas empieza ordenando por ese campo — deshaciendo el cambio.
  // Renumeramos directo por posición.
  return reordenadas.map((capa, indice) => ({ ...capa, orden: indice }))
}
