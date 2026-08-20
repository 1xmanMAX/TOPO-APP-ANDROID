import { formatearProgresiva, type CeldaGrilla } from '@topo/core'
import { useMemo } from 'react'

interface Props {
  celdas: CeldaGrilla[]
  llenas: Set<string>
  claveActiva: string | null
  alElegir: (clave: string) => void
}

export default function MapaGrilla({ celdas, llenas, claveActiva, alElegir }: Props) {
  const { progresivas, elementos } = useMemo(() => {
    const progresivas = [...new Set(celdas.map((c) => c.progresiva))].sort((a, b) => a - b)
    const vistos = new Map<string, number>()
    for (const celda of celdas) if (!vistos.has(celda.elementoClave)) vistos.set(celda.elementoClave, celda.offset)
    const elementos = [...vistos.entries()].sort((a, b) => a[1] - b[1]).map(([clave]) => clave)
    return { progresivas, elementos }
  }, [celdas])

  return (
    <div className="overflow-auto rounded border border-slate-200 dark:border-slate-800">
      <table className="w-full border-collapse text-xs">
        <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900">
          <tr>
            <th className="px-2 py-1.5 text-left font-medium text-slate-500">Progresiva</th>
            {elementos.map((clave) => (
              <th key={clave} className="px-2 py-1.5 font-medium text-slate-500">
                {clave}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {progresivas.map((progresiva) => (
            <tr key={progresiva} className="border-t border-slate-100 dark:border-slate-800">
              <td className="numerico px-2 py-1 text-slate-600 dark:text-slate-300">
                {formatearProgresiva(progresiva)}
              </td>
              {elementos.map((elementoClave) => {
                const clave = `${progresiva}|${elementoClave}`
                const llena = llenas.has(clave)
                const activa = clave === claveActiva
                return (
                  <td key={clave} className="p-0.5 text-center">
                    <button
                      type="button"
                      aria-label={`${formatearProgresiva(progresiva)} ${elementoClave}`}
                      onClick={() => alElegir(clave)}
                      className={`h-6 w-full rounded text-xs ${
                        activa
                          ? 'bg-marca text-white'
                          : llena
                            ? 'bg-pasa/20 text-pasa'
                            : 'bg-slate-100 text-slate-400 dark:bg-slate-800'
                      }`}
                    >
                      {llena ? '✓' : '·'}
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
