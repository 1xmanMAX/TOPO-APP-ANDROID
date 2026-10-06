import { instrumentoCompleto, type Calle, type Id } from '@topo/core'
import { useId, useMemo, useState } from 'react'
import AvisoEspesores from '../../componentes/AvisoEspesores'
import { useAlmacen } from '../../estado/almacen'
import { cuenta } from '../../formato'
import {
  compararJornadas,
  estadoDeCierre,
  jornadasDeCalle,
  lecturasDeToma,
  tramoDeTomas,
  type ComparacionDeJornadas,
  type JornadaDeCalle,
} from './estadoObra'

const COLOR_CIERRE = { '✓': 'text-pasa', '△': 'text-aviso', '✗': 'text-falla', '·': 'text-slate-500' } as const

function etiquetaJornada(j: JornadaDeCalle): string {
  return `${j.toma.fecha} · ${j.capa?.nombre ?? 'capa sin elegir'}`
}

/** Fecha, capa, banco de nivel y calle de una jornada, por si se anotaron mal. */
function CorregirJornada({ jornada }: { jornada: JornadaDeCalle }) {
  const proyecto = useAlmacen((s) => s.proyecto)
  const actualizarCampania = useAlmacen((s) => s.actualizarCampania)
  const { toma } = jornada
  const senia = etiquetaJornada(jornada)
  const control = 'min-h-11 rounded border border-slate-300 bg-white px-2 text-base dark:border-slate-700 dark:bg-slate-900'

  return (
    <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-sm">
        Fecha
        <input
          type="date"
          aria-label={`Fecha de la jornada ${senia}`}
          value={toma.fecha}
          onChange={(e) => actualizarCampania(toma.id, { fecha: e.target.value })}
          className={control}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Capa
        <select
          aria-label={`Capa de la jornada ${senia}`}
          value={toma.capaId}
          onChange={(e) => actualizarCampania(toma.id, { capaId: e.target.value })}
          className={control}
        >
          {proyecto.capas.map((capa) => (
            <option key={capa.id} value={capa.id}>
              {capa.nombre}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        BM de arranque
        <select
          aria-label={`BM de la jornada ${senia}`}
          value={toma.bmInicialId}
          onChange={(e) => actualizarCampania(toma.id, { bmInicialId: e.target.value })}
          className={control}
        >
          {proyecto.bms.map((bm) => (
            <option key={bm.id} value={bm.id}>
              {bm.nombre}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Calle
        <select
          aria-label={`Calle de la jornada ${senia}`}
          value={jornada.calle.id}
          onChange={(e) => actualizarCampania(toma.id, { calleId: e.target.value })}
          className={control}
        >
          {proyecto.calles.map((calle) => (
            <option key={calle.id} value={calle.id}>
              {calle.nombre}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

function Cifra({ etiqueta, valor }: { etiqueta: string; valor: number | null }) {
  return (
    <div>
      <div className="text-xs text-slate-300">{etiqueta}</div>
      <div className="numerico text-xl font-semibold text-white">{valor === null ? '—' : valor}</div>
    </div>
  )
}

/** Lo que sale de comparar las dos jornadas elegidas (pantalla 13 del lienzo). */
function ResultadoComparar({ cmp }: { cmp: ComparacionDeJornadas }) {
  const fijarComparacion = useAlmacen((s) => s.fijarComparacion)
  const activarCampania = useAlmacen((s) => s.activarCampania)
  const fijarModoCalle = useAlmacen((s) => s.fijarModoCalle)

  function verCeldaPorCelda() {
    // Revisar muestra los espesores de la comparación sobre la calle de la
    // jornada activa: se activa la de arriba, que es la que se está revisando.
    activarCampania(cmp.superior.toma.id)
    fijarComparacion(cmp.inferior.toma.id, cmp.superior.toma.id)
    fijarModoCalle('revisar')
  }

  return (
    <section aria-label="Comparación de las dos jornadas" className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 rounded-2xl bg-slate-900 p-4 text-white dark:bg-slate-800">
        <p className="text-sm text-slate-300">{cmp.titulo} · mm</p>
        <p className="text-lg font-bold">{cmp.que}</p>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Cifra etiqueta="mínimo" valor={cmp.minimoMm} />
          <Cifra etiqueta="medio" valor={cmp.medioMm} />
          <Cifra etiqueta="máximo" valor={cmp.maximoMm} />
        </div>
        <p className="text-sm text-slate-200">{cmp.lectura}</p>
        <p className="text-xs text-slate-300">
          {cuenta(cmp.comparacion.comparables, 'celda medida', 'celdas medidas')} en las dos
          {cmp.comparacion.sinPareja > 0 ? ` · ${cuenta(cmp.comparacion.sinPareja, 'sin pareja', 'sin pareja')}` : ''}
        </p>
      </div>
      <AvisoEspesores estado={cmp.estado} />
      {cmp.comparacion.avisos.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm text-aviso">
          {cmp.comparacion.avisos.map((aviso, i) => (
            <li key={`${aviso.clave ?? 'g'}-${i}`}>
              <span aria-hidden="true">△ </span>
              {aviso.mensaje}
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={verCeldaPorCelda}
        className="min-h-11 rounded-lg border border-slate-300 bg-white text-base font-semibold dark:border-slate-700 dark:bg-slate-900"
      >
        Ver celda por celda
      </button>
    </section>
  )
}

/**
 * El historial de la calle: cada jornada con su fecha, su capa y cómo cerró.
 * Tocar dos las compara; «Abrir» lleva a su libreta.
 */
export default function JornadasCalle({ calle }: { calle: Calle }) {
  const proyecto = useAlmacen((s) => s.proyecto)
  const activarCampania = useAlmacen((s) => s.activarCampania)
  const fijarModoCalle = useAlmacen((s) => s.fijarModoCalle)
  const jornadas = useMemo(() => jornadasDeCalle(proyecto, calle), [proyecto, calle])
  const [elegidas, setElegidas] = useState<Id[]>([])
  const [corrigiendo, setCorrigiendo] = useState<Id | null>(null)
  const prefijo = useId()
  const largoMira = instrumentoCompleto(proyecto.instrumento).largoMira

  // Una jornada que se fue (borrada o movida a otra calle) sale de la elección.
  const vigentes = elegidas.filter((id) => jornadas.some((j) => j.toma.id === id))
  const pareja = vigentes.map((id) => jornadas.find((j) => j.toma.id === id)!)
  const [primera, segunda] = pareja
  const comparacion = useMemo(
    () => (primera && segunda ? compararJornadas(primera, segunda) : null),
    [primera, segunda],
  )

  function alternar(id: Id) {
    setElegidas((antes) => {
      const actuales = antes.filter((x) => jornadas.some((j) => j.toma.id === x))
      if (actuales.includes(id)) return actuales.filter((x) => x !== id)
      // Con dos ya elegidas, la tercera reemplaza a la más antigua en elegirse.
      return [...actuales, id].slice(-2)
    })
  }

  if (jornadas.length === 0) {
    return (
      <p className="p-4 text-sm text-slate-600 dark:text-slate-300">
        Esta calle todavía no tiene jornadas. Empieza una con «Nueva jornada» o sube una hoja.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3 p-3 sm:p-4">
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Toca dos jornadas para compararlas: espesor, profundidad de corte o repetibilidad.
      </p>
      <ul className="flex flex-col gap-2">
        {jornadas.map((j) => {
          const cierre = estadoDeCierre(j.toma, j.resultado)
          const elegida = vigentes.includes(j.toma.id)
          // A es la de abajo (o la más antigua), B la de arriba: así se lee «A → B».
          const marca = !elegida ? '' : !comparacion ? '·' : comparacion.inferior.toma.id === j.toma.id ? 'A' : 'B'
          const tramo = tramoDeTomas([j.toma])
          const senia = etiquetaJornada(j)
          // El nombre del botón es corto y fijo; tramo, lecturas y cierre van
          // como descripción, que es lo que se mira para decidir qué comparar.
          const idDetalle = `${prefijo}-${j.toma.id}-detalle`
          const idCierre = `${prefijo}-${j.toma.id}-cierre`
          return (
            <li
              key={j.toma.id}
              className={`rounded-xl border-2 bg-white dark:bg-slate-900 ${
                elegida ? 'border-slate-900 dark:border-slate-200' : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              <div className="flex items-stretch gap-1">
                <button
                  type="button"
                  aria-pressed={elegida}
                  aria-label={`Comparar la jornada ${senia}`}
                  aria-describedby={`${idDetalle} ${idCierre}`}
                  onClick={() => alternar(j.toma.id)}
                  className="grid min-h-14 flex-1 grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-2 px-3 py-2 text-left"
                >
                  <span
                    aria-hidden="true"
                    className={`flex size-7 items-center justify-center rounded-full text-xs font-bold ${
                      elegida ? 'bg-marca text-white' : 'bg-slate-200 dark:bg-slate-700'
                    }`}
                  >
                    {marca}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <b className="truncate text-base">{j.capa?.nombre ?? 'capa sin elegir'}</b>
                    <span id={idDetalle} className="truncate text-sm text-slate-600 dark:text-slate-400">
                      {tramo ?? 'sin progresivas'} · {cuenta(lecturasDeToma(j.toma, largoMira), 'lectura', 'lecturas')}
                    </span>
                  </span>
                  <span className="flex flex-col items-end">
                    <span className="numerico text-sm">{j.toma.fecha}</span>
                    <span id={idCierre} className={`text-sm ${COLOR_CIERRE[cierre.simbolo]}`}>
                      {cierre.simbolo} {cierre.corto}
                    </span>
                  </span>
                </button>
              </div>
              <div className="flex flex-wrap gap-2 border-t border-slate-100 px-3 py-2 dark:border-slate-800">
                <button
                  type="button"
                  aria-label={`Abrir la jornada ${senia}`}
                  onClick={() => {
                    activarCampania(j.toma.id)
                    fijarModoCalle('medir')
                  }}
                  className="min-h-11 rounded border border-marca px-3 text-sm font-medium text-marca"
                >
                  Abrir en la libreta
                </button>
                <button
                  type="button"
                  aria-expanded={corrigiendo === j.toma.id}
                  aria-label={`Corregir la jornada ${senia}`}
                  onClick={() => setCorrigiendo((c) => (c === j.toma.id ? null : j.toma.id))}
                  className="min-h-11 rounded border border-slate-300 px-3 text-sm dark:border-slate-700"
                >
                  Corregir fecha, capa o calle
                </button>
              </div>
              {corrigiendo === j.toma.id && <CorregirJornada jornada={j} />}
            </li>
          )
        })}
      </ul>

      {comparacion ? (
        <ResultadoComparar cmp={comparacion} />
      ) : (
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {pareja.length === 1 ? 'Elige otra jornada para compararla con esta.' : ''}
        </p>
      )}
    </div>
  )
}
