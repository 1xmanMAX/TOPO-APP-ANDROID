import { BOTON_PRINCIPAL as PRINCIPAL, BOTON_SECUNDARIO } from '../../componentes/ui'

/**
 * Botones del planificador y la guía: los del sistema común (ui.ts), de
 * 44 px de alto como mínimo, para el dedo en campo.
 */
export const BOTON = BOTON_SECUNDARIO
export const BOTON_PRINCIPAL = PRINCIPAL
/**
 * Para el contenedor de varios CampoNumero: sus campos suben a 44 px y a
 * letra legible sin tocar el componente compartido.
 */
export const CAMPOS_GRANDES = '[&_input]:min-h-11 [&_input]:text-base'
