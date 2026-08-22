import { construirGrilla, esLecturaUsable, formatearProgresiva } from '@topo/core'
import { useEffect, useMemo, useState } from 'react'
import BarraCierre from '../componentes/BarraCierre'
import CorteTransversal from '../componentes/CorteTransversal'
import DeslizadorProgresiva from '../componentes/DeslizadorProgresiva'
import ListaAvisos from '../componentes/ListaAvisos'
import MapaGrilla from '../componentes/MapaGrilla'
import PanelEstacion from '../componentes/PanelEstacion'
import { useAlmacen } from '../estado/almacen'
import { useContexto, useProgresivas, useResultado } from '../estado/derivados'
import { armarEsqueletoTabla } from '../esqueletoTabla'
import { resumenPendientes, siguienteCeldaPendiente } from '../libreta/navegacion'

export default function VistaLibreta() {
  const contexto = useContexto()
  const resultado = useResultado()
  const agregarIntermedia = useAlmacen((s) => s.agregarIntermedia)
  const agregarEstacion = useAlmacen((s) => s.agregarEstacion)
  const seleccionar = useAlmacen((s) => s.seleccionar)

  const estacionActiva = useAlmacen((s) => s.estacionActiva)
  const activarEstacion = useAlmacen((s) => s.activarEstacion)
  const campaniaActivaId = useAlmacen((s) => s.campaniaActivaId)
  const [claveActiva, setClaveActiva] = useState<string | null>(null)
  const [texto, setTexto] = useState('')

  const celdas = useMemo(() => {
    if (!contexto) return []
    try {
      return construirGrilla(contexto.calle, contexto.plantilla)
    } catch {
      return []
    }
  }, [contexto])
  const llenas = useMemo(
    () => new Set(resultado ? [...resultado.cotasPorCelda.keys()] : []),
    [resultado],
  )
  // Mismo orden de columnas que las tablas de Resultados y la exportación:
  // si cada rejilla lo calculara por su cuenta, un empate de offset podría
  // desalinearlas sin que nada lo avisara.
  const esqueleto = useMemo(
    () => (contexto ? armarEsqueletoTabla(contexto.calle, contexto.plantilla) : null),
    [contexto],
  )

  const progresivas = useProgresivas()
  const progresivaActiva = useAlmacen((s) => s.seleccion.progresiva) ?? progresivas[0] ?? 0
  const irAProgresiva = useAlmacen((s) => s.irAProgresiva)

  // La libreta dibuja siempre la campaña activa: es la que se está midiendo
  // ahora mismo. Nunca las marcadas en el selector de capas de Resultados —
  // esa es otra pantalla, con otra pregunta ("¿qué comparo?") distinta de
  // esta ("¿qué estoy midiendo?").
  const idsVisibles = useMemo(() => (campaniaActivaId ? [campaniaActivaId] : []), [campaniaActivaId])

  useEffect(() => {
    if (claveActiva === null && celdas.length > 0) {
      setClaveActiva(siguienteCeldaPendiente(celdas, llenas, null)?.clave ?? null)
    }
  }, [celdas, llenas, claveActiva])

  useEffect(() => {
    function alPresionar(evento: KeyboardEvent) {
      const enCampo = evento.target instanceof HTMLInputElement || evento.target instanceof HTMLSelectElement
      if (enCampo) return

      const indice = progresivas.indexOf(progresivaActiva)
      if (evento.key === 'ArrowRight' && indice < progresivas.length - 1) {
        irAProgresiva(progresivas[indice + 1]!)
      }
      if (evento.key === 'ArrowLeft' && indice > 0) {
        irAProgresiva(progresivas[indice - 1]!)
      }
    }

    window.addEventListener('keydown', alPresionar)
    return () => window.removeEventListener('keydown', alPresionar)
  }, [progresivas, progresivaActiva, irAProgresiva])

  if (!contexto || !resultado) {
    return <p className="p-6 text-sm text-slate-500">Crea una campaña para abrir la libreta.</p>
  }

  // Protege contra un índice que se salga del rango: una campaña con menos
  // estaciones que la que se estaba viendo antes de cambiar de pestaña.
  const indiceSeguro = Math.min(estacionActiva, Math.max(0, contexto.campania.estaciones.length - 1))

  const celdaActiva = celdas.find((c) => c.clave === claveActiva) ?? null

  function registrarLectura() {
    const valor = Number(texto.replace(',', '.'))
    if (!celdaActiva || !Number.isFinite(valor) || texto.trim() === '') return

    agregarIntermedia(contexto!.campania.id, indiceSeguro, {
      destino: {
        tipo: 'celda',
        celda: { progresiva: celdaActiva.progresiva, elementoClave: celdaActiva.elementoClave },
      },
      valor,
    })

    // Una lectura que no puede ser de una mira deja la celda sin llenar: el
    // aviso del motor ya explica por qué, así que no hay que avanzar y perder
    // de vista el texto que hay que corregir.
    if (!esLecturaUsable(valor)) return

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
          {contexto.campania.estaciones.length === 0 ? (
            <div className="flex flex-col gap-3 rounded border border-aviso p-4">
              <p className="text-sm">
                Esta libreta todavía no tiene ninguna estación. Toda nivelación empieza plantando el
                nivel y leyendo hacia atrás al banco de nivel.
              </p>
              <button
                type="button"
                onClick={() =>
                  agregarEstacion(contexto.campania.id, {
                    destino: { tipo: 'bm', bmId: contexto.campania.bmInicialId },
                    valor: 0,
                  })
                }
                className="self-start rounded bg-marca px-3 py-1.5 text-sm font-medium text-white"
              >
                Empezar la libreta
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">Estación {indiceSeguro + 1}</h3>
                <div className="ml-auto flex gap-1">
                  {contexto.campania.estaciones.map((_, indice) => (
                    <button
                      key={indice}
                      type="button"
                      onClick={() => activarEstacion(indice)}
                      className={`h-7 w-7 rounded text-xs ${
                        indice === indiceSeguro
                          ? 'bg-marca text-white'
                          : 'bg-slate-100 dark:bg-slate-800'
                      }`}
                    >
                      {indice + 1}
                    </button>
                  ))}
                </div>
              </div>

              <PanelEstacion estacionIndice={indiceSeguro} alCambiarEstacion={activarEstacion} />

              {indiceSeguro < contexto.campania.estaciones.length - 1 && (
                <p className="rounded border border-aviso px-3 py-2 text-xs text-aviso">
                  Estás escribiendo en la estación {indiceSeguro + 1} de{' '}
                  {contexto.campania.estaciones.length}, que no es la última.
                </p>
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
            </>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <p className="text-sm text-slate-500">
            llenadas {resultado.celdasLlenas} de {resultado.celdasTotales}
          </p>
          <MapaGrilla
            progresivas={esqueleto?.progresivas ?? []}
            elementos={esqueleto?.elementos ?? []}
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

      <section className="flex flex-col gap-2">
        <h3 className="font-semibold">Corte transversal</h3>
        <CorteTransversal
          progresiva={progresivaActiva}
          idsVisibles={idsVisibles}
          idCampaniaReferencia={campaniaActivaId}
        />
        <DeslizadorProgresiva progresivas={progresivas} valor={progresivaActiva} alCambiar={irAProgresiva} />
      </section>

      <ListaAvisos />
    </div>
  )
}
