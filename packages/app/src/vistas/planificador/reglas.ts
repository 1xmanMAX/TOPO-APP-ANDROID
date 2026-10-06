import { opcionesDeInstrumento, revisarOpcionesControles, type Instrumento, type OpcionesControles } from '@topo/core'

/**
 * Rangos con que se trabaja en obra. Las reglas son de toda la obra (la
 * libreta, el aviso al anotar y el replanteo las leen), así que un error de
 * dedo —50 en vez de 5.0 en el largo de la mira— no puede guardarse callado.
 */
const RANGOS: Partial<Record<keyof Instrumento, { min: number; max: number; entero?: boolean }>> = {
  largoMira: { min: 1, max: 10 },
  alturaInstrumento: { min: 0.5, max: 2.5 },
  visualMax: { min: 5, max: 150 },
  desequilibrioMax: { min: 0, max: 50 },
  maxCambiosPorTramo: { min: 0, max: 50, entero: true },
  coeficienteK: { min: 1, max: 100 },
}

/** Cómo se llama cada regla del instrumento entre las opciones del plan. */
const EN_OPCIONES: Partial<Record<keyof Instrumento, keyof OpcionesControles>> = {
  coeficienteK: 'k',
}

/**
 * Por qué no se puede guardar este valor de una regla, en palabras; null si
 * sirve. Primero el rango de obra; luego, junto con las demás reglas, lo que
 * dice el motor (que quede algo legible en la mira, por ejemplo).
 */
export function revisarRegla(
  clave: keyof Instrumento,
  valor: number,
  instrumento: Partial<Instrumento> | undefined,
): string | null {
  if (!Number.isFinite(valor)) return 'no es un número'
  const rango = RANGOS[clave]
  if (rango) {
    if (rango.entero && !Number.isInteger(valor)) return 'tiene que ser un número entero'
    if (valor < rango.min || valor > rango.max)
      return `tiene que estar entre ${rango.min} y ${rango.max} (llegó ${valor})`
  }
  const opciones = {
    ...opcionesDeInstrumento(instrumento),
    [EN_OPCIONES[clave] ?? clave]: valor,
  }
  const problemas = revisarOpcionesControles(opciones)
  return problemas.length > 0 ? problemas.join('; ') : null
}
