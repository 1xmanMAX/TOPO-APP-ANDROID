import { estadoCierreEnVivo, type BM, type Toma } from '@topo/core'
import { useMemo } from 'react'
import { formatearCota } from '../../formato'

interface Props {
  toma: Toma
  bms: BM[]
  largoMira: number
}

/**
 * El cierre en vivo, siempre a la vista mientras se mide: si el circuito
 * ya cerró, por cuánto, y si no, qué lectura en el BM lo cerraría. Lo arma
 * `estadoCierreEnVivo` con las mismas piezas que el cálculo final, así que
 * el número de campo es el mismo que saldrá en gabinete.
 */
export default function CierreEnVivo({ toma, bms, largoMira }: Props) {
  const estado = useMemo(() => estadoCierreEnVivo(toma, bms, { largoMira }), [toma, bms, largoMira])

  let simbolo: string
  let veredicto: string
  let clases: string
  if (estado.circuito === 'cerrado' && estado.cierre?.pasa) {
    simbolo = '✓'
    veredicto = 'Cierra'
    clases = 'border-pasa bg-pasa/10 text-pasa'
  } else if (estado.circuito === 'cerrado') {
    simbolo = '✗'
    veredicto = 'No cierra'
    clases = 'border-falla bg-falla/10 text-falla'
  } else if (estado.circuito === 'error') {
    simbolo = '✗'
    veredicto = 'No se puede calcular'
    clases = 'border-falla bg-falla/10 text-falla'
  } else {
    simbolo = '△'
    veredicto = 'Sin cerrar: nada comprobado aún'
    // Ámbar oscuro para el texto: el ámbar del tema sobre blanco no se lee al sol.
    clases = 'border-aviso bg-aviso/10 text-amber-900 dark:text-amber-200'
  }

  return (
    <section aria-label="Cierre en vivo" aria-live="polite" className={`flex flex-col gap-1 rounded border px-3 py-2 ${clases}`}>
      <h3 className="text-sm font-bold">
        <span aria-hidden="true">{simbolo} </span>
        {veredicto}
      </h3>
      <p className="text-sm">{estado.texto}</p>
      {estado.motivo && <p className="text-sm font-semibold">{estado.motivo}</p>}
      {estado.circuito === 'abierto' && estado.previo && (
        <p className="text-sm text-slate-700 dark:text-slate-200">
          Para cerrar en {estado.previo.bmCierre.nombre}: lee{' '}
          <strong className="numerico">{formatearCota(estado.previo.lecturaParaCerrarExacto)}</strong> (pasa entre{' '}
          <span className="numerico">{formatearCota(estado.previo.rangoLecturaQuePasa[0])}</span> y{' '}
          <span className="numerico">{formatearCota(estado.previo.rangoLecturaQuePasa[1])}</span>, tolerancia ±
          {estado.previo.toleranciaMm.toFixed(1)} mm).
        </p>
      )}
      {estado.controles.map((control) => (
        <p key={`${control.bmId}-${control.estacionIndice}`} className="text-xs text-slate-700 dark:text-slate-200">
          Control en {control.nombre} (estación {control.estacionIndice + 1}):{' '}
          <span className="numerico">
            {control.errorMm > 0 ? '+' : control.errorMm < 0 ? '−' : ''}
            {Math.abs(control.errorMm).toFixed(1)} mm
          </span>
        </p>
      ))}
    </section>
  )
}
