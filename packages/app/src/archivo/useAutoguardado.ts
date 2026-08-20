import { useEffect, useRef, useState } from 'react'
import { useAlmacen } from '../estado/almacen'
import { guardarBorrador } from './autoguardado'

/** Cuánto se espera tras el último cambio antes de guardar. */
const RETARDO_MS = 1000
/** Techo: aunque el usuario no pare de teclear, no se pasa de aquí sin guardar. */
const MAXIMO_SIN_GUARDAR_MS = 10000

/**
 * Guarda el proyecto en el navegador mientras `activo` sea verdadero.
 *
 * Se mantiene apagado hasta que la recuperación esté resuelta: si guardara
 * antes, sobrescribiría el borrador del usuario con el proyecto en pantalla
 * y le destruiría el trabajo sin que se entere.
 *
 * Devuelve un mensaje si el navegador no deja guardar, para poder avisarlo.
 */
export function useAutoguardado(activo: boolean): string | null {
  const proyecto = useAlmacen((s) => s.proyecto)
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
        () =>
          setFallo(
            'Este navegador no deja guardar tu trabajo automáticamente. ' +
              'Guarda el archivo .topo a mano para no perderlo.',
          ),
      )
    }, espera)

    return () => window.clearTimeout(temporizador)
  }, [proyecto, activo])

  return fallo
}
