import { useEffect, useState } from 'react'

const CONSULTA = '(max-width: 767px)'

function coincide(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia(CONSULTA).matches
}

/**
 * Si la pantalla es de celular (por debajo de md, 768 px). Para lo que no se
 * puede resolver solo con clases. Sin matchMedia (jsdom), es false.
 */
export function useEsCelular(): boolean {
  const [esCelular, setEsCelular] = useState(coincide)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const consulta = window.matchMedia(CONSULTA)
    if (!consulta) return
    const alCambiar = () => setEsCelular(consulta.matches)
    alCambiar()
    consulta.addEventListener?.('change', alCambiar)
    return () => consulta.removeEventListener?.('change', alCambiar)
  }, [])

  return esCelular
}

export default useEsCelular
