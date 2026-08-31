import { claveCelda, compararCapas, formatearProgresiva, progresivasDeLaToma } from '@topo/core'
import { useMemo } from 'react'
import { useAlmacen } from '../estado/almacen'
import { useContexto, useResultadoDe } from '../estado/derivados'
import { armarEsqueletoTabla } from '../esqueletoTabla'
import { formatearCota } from '../formato'

const MENSAJE_SIN_COMPARACION = 'Elige dos capas arriba para ver el espesor colocado entre ellas.'

export default function TablaEspesores() {
  const contexto = useContexto()
  const comparacion = useAlmacen((s) => s.comparacion)
  const seleccion = useAlmacen((s) => s.seleccion)
  const seleccionar = useAlmacen((s) => s.seleccionar)

  const resultadoInferior = useResultadoDe(comparacion.inferior)
  const resultadoSuperior = useResultadoDe(comparacion.superior)

  const esqueleto = useMemo(
    () =>
      contexto ? armarEsqueletoTabla(contexto.calle, progresivasDeLaToma(contexto.campania)) : null,
    [contexto],
  )
  const progresivas = esqueleto?.progresivas ?? []
  const elementos = esqueleto?.elementos ?? []

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
                  const celda = comparacionResultado.celdas.get(clave)
                  const espesor = celda?.espesor ?? null
                  const activa = seleccion.clave === clave
                  const negativo = espesor !== null && espesor < 0
                  return (
                    <td key={clave} className="p-0.5">
                      <button
                        type="button"
                        // El nombre completo, no la palabra corta de la
                        // cabecera: la sección permite la misma palabra a los
                        // dos lados del eje, y dos botones anunciados «0+000
                        // VEREDA» en la misma fila no se distinguirían de oído.
                        aria-label={
                          espesor !== null
                            ? `Espesor en ${formatearProgresiva(progresiva)} ${elemento.nombre}: ${formatearCota(espesor)}`
                            : `Espesor en ${formatearProgresiva(progresiva)} ${elemento.nombre}, sin comparar`
                        }
                        onClick={() => seleccionar(clave)}
                        className={`numerico w-full rounded px-2 py-1 text-right ${
                          activa ? 'bg-marca' : negativo ? 'hover:bg-falla/10' : espesor !== null ? 'hover:bg-slate-100 dark:hover:bg-slate-800' : ''
                        } ${
                          negativo
                            ? 'font-semibold text-falla'
                            : activa
                              ? 'text-white'
                              : espesor === null
                                ? 'text-slate-300 dark:text-slate-700'
                                : ''
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
