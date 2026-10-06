/** Clases comunes de la pantalla Plano: botones de 44 px y cajas de ficha. */
export const BOTON_PRINCIPAL =
  'min-h-11 rounded bg-marca px-3 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50'
export const BOTON_SECUNDARIO =
  'min-h-11 rounded border border-slate-300 px-3 text-sm hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800'
export const CAJA = 'flex flex-col gap-3 rounded border border-slate-200 p-3 dark:border-slate-800'

/** Lo que la pantalla dice tras una acción; el color nunca va solo (✓ △ ✗ y texto). */
export type AvisoPantalla = { tipo: 'ok' | 'error' | 'aviso'; texto: string }
