import { construirGrilla, formatearProgresiva, generarProgresivas, parsearProgresiva } from '@topo/core'
import { useEffect, useMemo, useState } from 'react'
import CampoNumero from '../componentes/CampoNumero'
import CampoTexto from '../componentes/CampoTexto'
import EditorRasante from '../componentes/EditorRasante'
import { useAlmacen } from '../estado/almacen'
import { useContexto } from '../estado/derivados'

export default function VistaCalle() {
  const contexto = useContexto()
  const plantillas = useAlmacen((s) => s.proyecto.plantillas)
  const actualizarCalle = useAlmacen((s) => s.actualizarCalle)
  const [textoExtra, setTextoExtra] = useState('')
  const [textoIntervalo, setTextoIntervalo] = useState(String(contexto?.calle.intervalo ?? 20))
  const [editandoIntervalo, setEditandoIntervalo] = useState(false)
  const [avisoExtra, setAvisoExtra] = useState<string | null>(null)

  useEffect(() => {
    if (!editandoIntervalo) setTextoIntervalo(String(contexto?.calle.intervalo ?? 20))
  }, [contexto?.calle.intervalo, editandoIntervalo])

  const { progresivas, problema } = useMemo(() => {
    if (!contexto) return { progresivas: [] as number[], problema: null as string | null }
    const { calle } = contexto
    try {
      return {
        progresivas: generarProgresivas(
          calle.progresivaInicio,
          calle.progresivaFin,
          calle.intervalo,
          calle.progresivasExtra,
        ),
        problema: null as string | null,
      }
    } catch (fallo) {
      return { progresivas: [] as number[], problema: (fallo as Error).message }
    }
  }, [contexto])

  const celdas = useMemo(() => {
    if (!contexto || problema) return []
    try {
      return construirGrilla(contexto.calle, contexto.plantilla)
    } catch {
      return []
    }
  }, [contexto, problema])

  if (!contexto) {
    return <p className="p-6 text-sm text-slate-500">Crea una calle y una campaña para empezar.</p>
  }

  const { calle, plantilla } = contexto

  function agregarExtra() {
    const valor = parsearProgresiva(textoExtra)

    if (valor === null) {
      setAvisoExtra('No entiendo esa progresiva. Escríbela como 0+047 o como 47.')
      return
    }
    if (valor < calle.progresivaInicio || valor > calle.progresivaFin) {
      setAvisoExtra(
        `${formatearProgresiva(valor)} queda fuera del tramo, que va de ` +
          `${formatearProgresiva(calle.progresivaInicio)} a ${formatearProgresiva(calle.progresivaFin)}.`,
      )
      return
    }
    if (calle.progresivasExtra.includes(valor)) {
      setAvisoExtra(`${formatearProgresiva(valor)} ya está en la lista.`)
      return
    }

    actualizarCalle(calle.id, { progresivasExtra: [...calle.progresivasExtra, valor] })
    setTextoExtra('')
    setAvisoExtra(null)
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
            inputMode="decimal"
            value={textoIntervalo}
            onFocus={() => setEditandoIntervalo(true)}
            onBlur={() => {
              setEditandoIntervalo(false)
              setTextoIntervalo(String(calle.intervalo))
            }}
            onChange={(evento) => {
              setTextoIntervalo(evento.target.value)
              const numero = Number(evento.target.value.replace(',', '.'))
              if (Number.isFinite(numero) && numero > 0) {
                actualizarCalle(calle.id, { intervalo: numero })
              }
            }}
            className="numerico rounded border border-slate-300 px-2 py-1.5 text-right text-sm dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
      </div>

      <section className="flex flex-col gap-2">
        <h3 className="font-semibold">Rasante de proyecto</h3>
        <EditorRasante calleId={calle.id} />
      </section>

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
        {avisoExtra && <p className="text-sm text-aviso">{avisoExtra}</p>}
      </section>

      <section className="flex flex-col gap-2">
        {problema ? (
          <p className="rounded border border-aviso px-3 py-2 text-sm text-aviso">
            {problema}. Corrige los valores para ver la grilla.
          </p>
        ) : (
          <h3 className="font-semibold">
            Grilla: {progresivas.length} progresivas × {plantilla.elementos.length} elementos ={' '}
            <span className="text-marca">{celdas.length} celdas</span>
          </h3>
        )}
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
