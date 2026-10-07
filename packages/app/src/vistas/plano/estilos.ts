import { TARJETA } from '../../componentes/ui'

/** Los botones de la pantalla Plano son los de toda la app (componentes/ui.ts). */
export { BOTON_ICONO, BOTON_PRINCIPAL, BOTON_SECUNDARIO, CEJA, ENLACE_PELIGRO, TARJETA } from '../../componentes/ui'

/** Una ficha o panel de la pantalla: la tarjeta del lienzo con sus partes en columna. */
export const CAJA = `${TARJETA} flex flex-col gap-3`

/** Una fila de un menú «⋯»: 44 px, sin caja, se resalta al pasar. */
export const ITEM_MENU = 'flex min-h-11 w-full cursor-pointer items-center rounded-lg px-3 text-left text-[15px] text-tinta hover:bg-fondo'

/** Lo que la pantalla dice tras una acción; el color nunca va solo (✓ △ ✗ y texto). */
export type AvisoPantalla = { tipo: 'ok' | 'error' | 'aviso'; texto: string }
