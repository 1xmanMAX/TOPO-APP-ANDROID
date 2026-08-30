import { claveCelda, formatearProgresiva, progresivasMedidas } from '@topo/core'
import { useMemo } from 'react'
import { useAlmacen } from '../estado/almacen'
import { useContexto, useResultado } from '../estado/derivados'
import { armarEsqueletoTabla } from '../esqueletoTabla'
import { formatearCota } from '../formato'

export default function TablaResultados() {
  const contexto = useContexto()
  const resultado = useResultado()
  const seleccion = useAlmacen((s) => s.seleccion)
  const seleccionar = useAlmacen((s) => s.seleccionar)

  const esqueleto = useMemo(
    () =>
      contexto ? armarEsqueletoTabla(contexto.calle, progresivasMedidas(contexto.campania.estaciones)) : null,
    [contexto],
  )
  const progresivas = esqueleto?.progresivas ?? []
  const elementos = esqueleto?.elementos ?? []

  if (!resultado || !contexto) return null

  return (
    <div className="overflow-auto rounded border border-slate-200 dark:border-slate-800">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900">
          <tr>
            <th className="px-3 py-2 text-left font-medium text-slate-500">Progresiva</th>
            {elementos.map((elemento) => (
              <th key={elemento.clave} className="px-3 py-2 text-right font-medium text-slate-500">
                {elemento.palabra}
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
              {elementos.map((elemento) => {
                const clave = claveCelda(progresiva, elemento.clave)
                const celda = resultado.cotasPorCelda.get(clave)
                const activa = seleccion.clave === clave
                return (
                  <td key={clave} className="p-0.5">
                    <button
                      type="button"
                      aria-label={
                        celda
                          ? `Cota en ${formatearProgresiva(progresiva)} ${elemento.palabra}: ${formatearCota(celda.cota)}`
                          : `Cota en ${formatearProgresiva(progresiva)} ${elemento.palabra}, sin medir`
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
