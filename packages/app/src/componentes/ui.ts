/**
 * Las clases que se repiten en toda la app, con los tokens del lienzo
 * (estilos.css). Solo constantes: cada pantalla las combina con lo suyo.
 * En el celular todo lo que se toca mide al menos 44 px (min-h-11).
 */

/** El botón de lo que se hace en esta pantalla: uno solo por pantalla. */
export const BOTON_PRINCIPAL =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-[10px] bg-marca px-4 text-base font-semibold text-white hover:bg-marca-oscura disabled:opacity-40'

export const BOTON_SECUNDARIO =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] border border-borde-fuerte bg-tarjeta px-4 text-sm font-medium text-tinta hover:bg-fondo disabled:opacity-40'

/** Un botón cuadrado de 44 px con solo un ícono: lleva siempre aria-label. */
export const BOTON_ICONO =
  'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] border border-borde-fuerte bg-tarjeta text-tinta'

/** Borrar, descartar: texto rojo, sin caja, para que no se pulse sin querer. */
export const ENLACE_PELIGRO =
  'inline-flex min-h-11 items-center text-sm font-medium text-falla underline-offset-2 hover:underline'

export const ENLACE =
  'inline-flex min-h-11 items-center text-sm font-semibold text-proyecto underline-offset-2 hover:underline'

export const TARJETA = 'rounded-xl border border-borde bg-tarjeta p-4'

/** La tarjeta oscura de lo más importante («Seguir donde lo dejaste»). */
export const TARJETA_OSCURA = 'rounded-[14px] bg-cabecera p-4 text-white'

/** Las etiquetas en mayúsculas del lienzo: «MEDIR · ESTACIÓN 1». */
export const CEJA = 'text-xs font-medium uppercase tracking-[0.1em] text-tenue'

export type EstadoSemaforo = 'conforme' | 'alLimite' | 'fuera' | 'sinMedir' | 'sinRasante'

/** El fondo y el texto de cada estado del semáforo. Siempre con su símbolo. */
export const CLASES_ESTADO: Record<EstadoSemaforo, string> = {
  conforme: 'bg-pasa-suave text-pasa',
  alLimite: 'bg-aviso-suave text-aviso',
  fuera: 'bg-falla-suave text-falla',
  sinMedir: 'bg-sin-suave text-sin',
  sinRasante: 'border border-dashed border-borde-fuerte bg-tarjeta text-sin',
}

export const SIMBOLO_ESTADO: Record<EstadoSemaforo, string> = {
  conforme: '✓',
  alLimite: '△',
  fuera: '✗',
  sinMedir: '·',
  sinRasante: '—',
}
