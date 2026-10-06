/**
 * El equipo con el que se nivela y las reglas de precisión que se le exigen.
 *
 * Es UNA sola fuente para la libreta, el aviso al anotar, el replanteo, la
 * calculadora y el planificador. Antes cada uno tenía su propio largo de mira
 * (la libreta aceptaba 5 m fijos y el replanteo 4 m), y una misma lectura
 * podía valer en una pantalla y no en otra.
 */
export interface Instrumento {
  /** Metros. La mira más común en obra es la telescópica de 5 m. */
  largoMira: number
  /** Metros sobre el suelo del anteojo del nivel. */
  alturaInstrumento: number
  /** Por debajo, la refracción cerca del suelo engaña. */
  lecturaMin: number
  /** Margen bajo la punta de la mira, que oscila. */
  margenSuperior: number
  /** Metros. Visual más larga que se acepta por precisión, aunque el equipo alcance más. */
  visualMax: number
  /** Metros. Diferencia máxima entre la visual atrás y la adelante de una estación. */
  desequilibrioMax: number
  /** El k de la tolerancia k·√K, en mm. */
  coeficienteK: number
  /** Error esperado por estación, en mm, para estimar el error de un tramo. */
  sigmaPorEstacionMm: number
  /** Puntos de cambio entre dos puntos de control. */
  maxCambiosPorTramo: number
}

export const INSTRUMENTO_DE_FABRICA: Readonly<Instrumento> = Object.freeze({
  largoMira: 5,
  alturaInstrumento: 1.5,
  lecturaMin: 0.3,
  margenSuperior: 0.3,
  visualMax: 50,
  desequilibrioMax: 5,
  coeficienteK: 12,
  sigmaPorEstacionMm: 1,
  maxCambiosPorTramo: 4,
})

/** Completa con los valores de fábrica lo que falte (proyectos viejos, datos a medias). */
export function instrumentoCompleto(parcial?: Partial<Instrumento> | null): Instrumento {
  const salida: Instrumento = { ...INSTRUMENTO_DE_FABRICA }
  if (!parcial) return salida
  for (const clave of Object.keys(salida) as (keyof Instrumento)[]) {
    const valor = parcial[clave]
    if (typeof valor === 'number' && Number.isFinite(valor) && valor >= 0) salida[clave] = valor
  }
  return salida
}
