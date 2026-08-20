import { construirGrilla, formatearProgresiva } from '@topo/core'
import { useEffect, useMemo, useState } from 'react'
import BarraCierre from '../componentes/BarraCierre'
import ListaAvisos from '../componentes/ListaAvisos'
import MapaGrilla from '../componentes/MapaGrilla'
import { useAlmacen } from '../estado/almacen'
import { useContexto, useResultado } from '../estado/derivados'
import { resumenPendientes, siguienteCeldaPendiente } from '../libreta/navegacion'

export default function VistaLibreta() {
  const contexto = useContexto()
  const resultado = useResultado()
  const agregarIntermedia = useAlmacen((s) => s.agregarIntermedia)
  const seleccionar = useAlmacen((s) => s.seleccionar)

  const [estacionIndice, setEstacionIndice] = useState(0)
  const [claveActiva, setClaveActiva] = useState<string | null>(null)
  const [texto, setTexto] = useState('')

  const celdas = useMemo(
    () => (contexto ? construirGrilla(contexto.calle, contexto.plantilla) : []),
    [contexto],
  )
  const llenas = useMemo(
    () => new Set(resultado ? [...resultado.cotasPorCelda.keys()] : []),
    [resultado],
  )

  useEffect(() => {
    if (claveActiva === null && celdas.length > 0) {
      setClaveActiva(siguienteCeldaPendiente(celdas, llenas, null)?.clave ?? null)
    }
  }, [celdas, llenas, claveActiva])

  if (!contexto || !resultado) {
    return <p className="p-6 text-sm text-slate-500">Crea una campaña para abrir la libreta.</p>
  }

  const estacion = contexto.campania.estaciones[estacionIndice]
  const celdaActiva = celdas.find((c) => c.clave === claveActiva) ?? null

  function registrarLectura() {
    const valor = Number(texto.replace(',', '.'))
    if (!celdaActiva || !Number.isFinite(valor) || texto.trim() === '') return

    agregarIntermedia(contexto!.campania.id, estacionIndice, {
      destino: {
        tipo: 'celda',
        celda: { progresiva: celdaActiva.progresiva, elementoClave: celdaActiva.elementoClave },
      },
      valor,
    })

    const siguientes = new Set(llenas)
    siguientes.add(celdaActiva.clave)
    setClaveActiva(siguienteCeldaPendiente(celdas, siguientes, celdaActiva.clave)?.clave ?? null)
    setTexto('')
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex flex-wrap items-baseline gap-3">
        <h2 className="text-lg font-semibold">{contexto.calle.nombre}</h2>
        <span className="text-sm text-slate-500">
          {contexto.capa?.nombre ?? 'Sin capa'} · {contexto.campania.fecha}
        </span>
      </header>

      <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">Estación {estacionIndice + 1}</h3>
            <div className="ml-auto flex gap-1">
              {contexto.campania.estaciones.map((_, indice) => (
                <button
                  key={indice}
                  type="button"
                  onClick={() => setEstacionIndice(indice)}
                  className={`h-7 w-7 rounded text-xs ${
                    indice === estacionIndice
                      ? 'bg-marca text-white'
                      : 'bg-slate-100 dark:bg-slate-800'
                  }`}
                >
                  {indice + 1}
                </button>
              ))}
            </div>
          </div>

          {estacion && (
            <dl className="rounded border border-slate-200 p-3 text-sm dark:border-slate-800">
              <div className="flex justify-between">
                <dt className="text-slate-500">Vista atrás</dt>
                <dd className="numerico">{estacion.vistaAtras.valor.toFixed(3)}</dd>
              </div>
              <div className="flex justify-between font-semibold">
                <dt>Cota instrumento</dt>
                <dd className="numerico">
                  {resultado.cotasInstrumento[estacionIndice]?.toFixed(3) ?? '—'}
                </dd>
              </div>
            </dl>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-500">
              Celda activa:{' '}
              <strong>
                {celdaActiva
                  ? `${formatearProgresiva(celdaActiva.progresiva)} ${celdaActiva.elementoClave}`
                  : 'grilla completa'}
              </strong>
            </span>
            <input
              aria-label="Lectura de mira"
              inputMode="decimal"
              autoFocus
              value={texto}
              onChange={(evento) => setTexto(evento.target.value)}
              onKeyDown={(evento) => {
                if (evento.key === 'Enter') registrarLectura()
              }}
              placeholder="escribe y Enter"
              className="numerico rounded border-2 border-marca px-3 py-2 text-right text-lg dark:bg-slate-900"
            />
          </label>

          <p className="text-xs text-slate-500">{resumenPendientes(celdas, llenas)}</p>
        </section>

        <section className="flex flex-col gap-3">
          <p className="text-sm text-slate-500">
            llenadas {resultado.celdasLlenas} de {resultado.celdasTotales}
          </p>
          <MapaGrilla
            celdas={celdas}
            llenas={llenas}
            claveActiva={claveActiva}
            alElegir={(clave) => {
              setClaveActiva(clave)
              seleccionar(clave)
            }}
          />
        </section>
      </div>

      <BarraCierre />
      <ListaAvisos />
    </div>
  )
}
