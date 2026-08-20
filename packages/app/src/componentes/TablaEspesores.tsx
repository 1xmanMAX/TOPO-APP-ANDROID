import { claveCelda, compararCapas, construirGrilla, formatearProgresiva } from '@topo/core'
import { useMemo } from 'react'
import { useAlmacen } from '../estado/almacen'
import { useContexto, useResultadoDe } from '../estado/derivados'
import { formatearCota } from '../formato'

const MENSAJE_SIN_COMPARACION = 'Elige dos capas arriba para ver el espesor colocado entre ellas.'

export default function TablaEspesores() {
  const contexto = useContexto()
  const comparacion = useAlmacen((s) => s.comparacion)
  const seleccion = useAlmacen((s) => s.seleccion)
  const seleccionar = useAlmacen((s) => s.seleccionar)

  const resultadoInferior = useResultadoDe(comparacion.inferior)
  const resultadoSuperior = useResultadoDe(comparacion.superior)

  const celdasGrilla = useMemo(() => {
    if (!contexto) return []
    try {
      return construirGrilla(contexto.calle, contexto.plantilla)
    } catch {
      return []
    }
  }, [contexto])

  const { progresivas, elementos } = useMemo(() => {
    const progresivas = [...new Set(celdasGrilla.map((c) => c.progresiva))].sort((a, b) => a - b)
    const vistos = new Map<string, number>()
    for (const celda of celdasGrilla) if (!vistos.has(celda.elementoClave)) vistos.set(celda.elementoClave, celda.offset)
    const elementos = [...vistos.entries()].sort((a, b) => a[1] - b[1]).map(([clave]) => clave)
    return { progresivas, elementos }
  }, [celdasGrilla])

  const comparacionResultado = useMemo(() => {
    if (!resultadoInferior || !resultadoSuperior) return null
    return compararCapas(resultadoInferior, resultadoSuperior)
  }, [resultadoInferior, resultadoSuperior])

  if (!contexto) return null

  if (!comparacionResultado) {
    return (
      <p className="rounded border border-dashed border-slate-300 p-3 text-sm text-slate-500 dark:border-slate-700">
        {MENSAJE_SIN_COMPARACION}
      </p>
    )
  }

  const totalCeldas = comparacionResultado.comparables + comparacionResultado.sinPareja
  const resumen =
    comparacionResultado.comparables > 0
      ? `Espesor colocado: mínimo ${formatearCota(comparacionResultado.espesorMinimo!)} m · ` +
        `medio ${formatearCota(comparacionResultado.espesorMedio!)} m · ` +
        `máximo ${formatearCota(comparacionResultado.espesorMaximo!)} m · ` +
        `${comparacionResultado.comparables} de ${totalCeldas} celdas comparables`
      : `Espesor colocado: ${comparacionResultado.comparables} de ${totalCeldas} celdas comparables`

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-auto rounded border border-slate-200 dark:border-slate-800">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-slate-500">Progresiva</th>
              {elementos.map((clave) => (
                <th key={clave} className="px-3 py-2 text-right font-medium text-slate-500">
                  {clave}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {progresivas.map((progresiva) => (
              <tr key={progresiva} className="border-t border-slate-100 dark:border-slate-800">
                <td className="numerico px-3 py-1.5 text-slate-600 dark:text-slate-300">
                  {formatearProgresiva(progresiva)}
                </td>
                {elementos.map((elementoClave) => {
                  const clave = claveCelda(progresiva, elementoClave)
                  const celda = comparacionResultado.celdas.get(clave)
                  const espesor = celda?.espesor ?? null
                  const activa = seleccion.clave === clave
                  const negativo = espesor !== null && espesor < 0
                  return (
                    <td key={clave} className="p-0.5">
                      <button
                        type="button"
                        aria-label={`${formatearProgresiva(progresiva)} ${elementoClave}`}
                        onClick={() => seleccionar(clave)}
                        className={`numerico w-full rounded px-2 py-1 text-right ${
                          activa
                            ? 'bg-marca text-white'
                            : negativo
                              ? 'font-semibold text-falla hover:bg-falla/10'
                              : espesor !== null
                                ? 'hover:bg-slate-100 dark:hover:bg-slate-800'
                                : 'text-slate-300 dark:text-slate-700'
                        }`}
                      >
                        {espesor !== null ? formatearCota(espesor) : '—'}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-slate-500">{resumen}</p>
    </div>
  )
}
