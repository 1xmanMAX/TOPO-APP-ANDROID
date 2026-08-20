import { construirGrilla, formatearProgresiva, generarProgresivas, parsearProgresiva } from '@topo/core'
import { useEffect, useMemo, useState } from 'react'
import CampoNumero from '../componentes/CampoNumero'
import CampoTexto from '../componentes/CampoTexto'
import { useAlmacen } from '../estado/almacen'
import { useContexto } from '../estado/derivados'

export default function VistaCalle() {
  const contexto = useContexto()
  const plantillas = useAlmacen((s) => s.proyecto.plantillas)
  const actualizarCalle = useAlmacen((s) => s.actualizarCalle)
  const [textoExtra, setTextoExtra] = useState('')
  const [displayIntervalo, setDisplayIntervalo] = useState(contexto?.calle.intervalo.toString() ?? '')

  useEffect(() => {
    if (contexto) {
      setDisplayIntervalo(contexto.calle.intervalo.toString())
    }
  }, [contexto?.calle.intervalo])

  const progresivas = useMemo(() => {
    if (!contexto) return []
    const { calle } = contexto
    try {
      return generarProgresivas(
        calle.progresivaInicio,
        calle.progresivaFin,
        calle.intervalo,
        calle.progresivasExtra,
      )
    } catch {
      return []
    }
  }, [contexto])

  const celdas = useMemo(
    () => (contexto ? construirGrilla(contexto.calle, contexto.plantilla) : []),
    [contexto],
  )

  if (!contexto) {
    return <p className="p-6 text-sm text-slate-500">Crea una calle y una campaña para empezar.</p>
  }

  const { calle, plantilla } = contexto

  function agregarExtra() {
    const valor = parsearProgresiva(textoExtra)
    if (valor === null) return
    actualizarCalle(calle.id, { progresivasExtra: [...calle.progresivasExtra, valor] })
    setTextoExtra('')
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <h2 className="text-lg font-semibold">Calle</h2>

      <div className="grid grid-cols-2 gap-3">
        <CampoTexto etiqueta="Nombre" valor={calle.nombre} alCambiar={(v) => actualizarCalle(calle.id, { nombre: v })} />
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-500">Plantilla transversal</span>
          <select
            value={calle.plantillaId}
            onChange={(evento) => actualizarCalle(calle.id, { plantillaId: evento.target.value })}
            className="rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            {plantillas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <CampoNumero
          etiqueta="Progresiva inicial"
          valor={calle.progresivaInicio}
          alCambiar={(v) => actualizarCalle(calle.id, { progresivaInicio: v })}
          decimales={2}
          sufijo="m"
        />
        <CampoNumero
          etiqueta="Progresiva final"
          valor={calle.progresivaFin}
          alCambiar={(v) => actualizarCalle(calle.id, { progresivaFin: v })}
          decimales={2}
          sufijo="m"
        />
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-500">Intervalo</span>
          <input
            aria-label="Intervalo"
            type="text"
            inputMode="decimal"
            value={displayIntervalo}
            onChange={(evento) => {
              const nuevoDisplay = evento.target.value
              setDisplayIntervalo(nuevoDisplay)
              const numero = Number(nuevoDisplay.replace(',', '.'))
              if (Number.isFinite(numero) && numero > 0) actualizarCalle(calle.id, { intervalo: numero })
            }}
            className="numerico rounded border border-slate-300 px-2 py-1.5 text-right text-sm dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
      </div>

      <section className="flex flex-col gap-2">
        <h3 className="font-semibold">Progresivas extra</h3>
        <div className="flex items-end gap-2">
          <CampoTexto
            etiqueta="Progresiva extra"
            valor={textoExtra}
            alCambiar={setTextoExtra}
            marcador="0+047 o 47"
            ancho="w-40"
          />
          <button
            type="button"
            onClick={agregarExtra}
            className="rounded bg-marca px-3 py-1.5 text-sm font-medium text-white"
          >
            Agregar progresiva
          </button>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="font-semibold">
          Grilla: {progresivas.length} progresivas × {plantilla.elementos.length} elementos ={' '}
          <span className="text-marca">{celdas.length} celdas</span>
        </h3>
        <ul className="flex flex-wrap gap-1.5">
          {progresivas.map((progresiva) => {
            const esExtra = calle.progresivasExtra.includes(progresiva)
            return (
              <li
                key={progresiva}
                className={`numerico rounded px-2 py-1 text-xs ${
                  esExtra
                    ? 'bg-marca/10 text-marca'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {formatearProgresiva(progresiva)}
                {esExtra && (
                  <button
                    type="button"
                    aria-label={`Quitar ${formatearProgresiva(progresiva)}`}
                    onClick={() =>
                      actualizarCalle(calle.id, {
                        progresivasExtra: calle.progresivasExtra.filter((p) => p !== progresiva),
                      })
                    }
                    className="ml-1 text-slate-400 hover:text-falla"
                  >
                    ×
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
