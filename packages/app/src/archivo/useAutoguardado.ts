import { useEffect, useRef, useState } from 'react'
import { useAlmacen } from '../estado/almacen'
import { guardarArchivosDePlano, guardarBorrador } from './autoguardado'

/** Cuánto se espera tras el último cambio antes de guardar. */
const RETARDO_MS = 1000
/** Techo: aunque el usuario no pare de teclear, no se pasa de aquí sin guardar. */
const MAXIMO_SIN_GUARDAR_MS = 10000

const MENSAJE_FALLO =
  'Este navegador no deja guardar tu trabajo automáticamente. ' +
  'Guarda el archivo .topo a mano para no perderlo.'

/**
 * Guarda el proyecto en el navegador mientras `activo` sea verdadero, y
 * también los archivos de los planos.
 *
 * Se mantiene apagado hasta que la recuperación esté resuelta: si guardara
 * antes, sobrescribiría el borrador del usuario con el proyecto en pantalla
 * y le destruiría el trabajo sin que se entere.
 *
 * Los planos van aparte y solo cuando cambian (el almacén los reemplaza
 * entero al agregar o quitar uno): no cambian al anotar una lectura, y
 * reescribir megas de PDF a cada segundo sería gastar el celular en balde.
 *
 * Devuelve un mensaje si el navegador no deja guardar, para poder avisarlo.
 */
export function useAutoguardado(activo: boolean): string | null {
  const proyecto = useAlmacen((s) => s.proyecto)
  const archivosDePlano = useAlmacen((s) => s.archivosDePlano)
  const [fallo, setFallo] = useState<string | null>(null)
  const ultimoGuardado = useRef(Date.now())

  useEffect(() => {
    if (!activo) return

    const transcurrido = Date.now() - ultimoGuardado.current
    const espera = transcurrido > MAXIMO_SIN_GUARDAR_MS ? 0 : RETARDO_MS

    const temporizador = window.setTimeout(() => {
      ultimoGuardado.current = Date.now()
      guardarBorrador(proyecto).then(
        () => setFallo(null),
        () => setFallo(MENSAJE_FALLO),
      )
    }, espera)

    return () => window.clearTimeout(temporizador)
  }, [proyecto, activo])

  useEffect(() => {
    if (!activo) return

    const temporizador = window.setTimeout(() => {
      guardarArchivosDePlano(archivosDePlano).catch(() => setFallo(MENSAJE_FALLO))
    }, RETARDO_MS)

    return () => window.clearTimeout(temporizador)
  }, [archivosDePlano, activo])

  return fallo
}
