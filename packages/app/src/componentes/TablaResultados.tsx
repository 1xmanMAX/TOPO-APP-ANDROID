import { claveCelda, construirGrilla, formatearProgresiva } from '@topo/core'
import { useMemo } from 'react'
import { useAlmacen } from '../estado/almacen'
import { useContexto, useResultado } from '../estado/derivados'
import { formatearCota } from '../formato'

export default function TablaResultados() {
  const contexto = useContexto()
  const resultado = useResultado()
  const seleccion = useAlmacen((s) => s.seleccion)
  const seleccionar = useAlmacen((s) => s.seleccionar)

  const celdas = useMemo(() => {
    if (!contexto) return []
    try {
      return construirGrilla(contexto.calle, contexto.plantilla)
    } catch {
      return []
    }
  }, [contexto])

  const { progresivas, elementos } = useMemo(() => {
    const progresivas = [...new Set(celdas.map((c) => c.progresiva))].sort((a, b) => a - b)
    const vistos = new Map<string, number>()
    for (const celda of celdas) if (!vistos.has(celda.elementoClave)) vistos.set(celda.elementoClave, celda.offset)
    const elementos = [...vistos.entries()].sort((a, b) => a[1] - b[1]).map(([clave]) => clave)
    return { progresivas, elementos }
  }, [celdas])

  if (!resultado || !contexto) return null

  return (
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
                const celda = resultado.cotasPorCelda.get(clave)
                const activa = seleccion.clave === clave
                return (
                  <td key={clave} className="p-0.5">
                    <button
                      type="button"
                      aria-label={
                        celda
                          ? `Cota en ${formatearProgresiva(progresiva)} ${elementoClave}: ${formatearCota(celda.cota)}`
                          : `Cota en ${formatearProgresiva(progresiva)} ${elementoClave}, sin medir`
                      }
                      onClick={() => seleccionar(clave)}
                      className={`numerico w-full rounded px-2 py-1 text-right ${
                        activa
                          ? 'bg-marca text-white'
                          : celda
                            ? 'hover:bg-slate-100 dark:hover:bg-slate-800'
                            : 'text-slate-300 dark:text-slate-700'
                      }`}
                    >
                      {celda ? formatearCota(celda.cota) : '—'}
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
