import { instrumentoCompleto, type Calle, type Id } from '@topo/core'
import { useId, useMemo, useState } from 'react'
import AvisoEspesores from '../../componentes/AvisoEspesores'
import MenuMas from '../../componentes/MenuMas'
import { BOTON_ICONO, BOTON_SECUNDARIO, CLASES_ESTADO, TARJETA_OSCURA, type EstadoSemaforo } from '../../componentes/ui'
import { useAlmacen } from '../../estado/almacen'
import { cuenta } from '../../formato'
import {
  compararJornadas,
  estadoDeCierre,
  fechaCorta,
  jornadasDeCalle,
  lecturasDeToma,
  tramoDeTomas,
  type ComparacionDeJornadas,
  type JornadaDeCalle,
  type Simbolo,
} from './estadoObra'

/** El cierre de cada jornada con los colores del semáforo común. */
const ESTADO_DEL_CIERRE: Record<Simbolo, EstadoSemaforo> = {
  '✓': 'conforme',
  '△': 'alLimite',
  '✗': 'fuera',
  '·': 'sinMedir',
}

function etiquetaJornada(j: JornadaDeCalle): string {
  return `${j.toma.fecha} · ${j.capa?.nombre ?? 'capa sin elegir'}`
}

/**
 * Fecha, capa, banco de nivel y calle de una jornada, por si se anotaron mal.
 * Va en un bloque aparte debajo de la fila, con su ✕, para que la fila no
 * cambie de tamaño.
 */
function CorregirJornada({ jornada, alCerrar }: { jornada: JornadaDeCalle; alCerrar: () => void }) {
  const proyecto = useAlmacen((s) => s.proyecto)
  const actualizarCampania = useAlmacen((s) => s.actualizarCampania)
  const { toma } = jornada
  const senia = etiquetaJornada(jornada)
  const control = 'min-h-11 rounded-lg border border-slate-400 bg-tarjeta px-2 text-base text-tinta'
  const etiqueta = 'flex flex-col gap-1 text-[13px] text-tenue'

  return (
    <div
      role="group"
      aria-label={`Corregir ${senia}`}
      className="mt-1.5 flex flex-col gap-2 rounded-xl bg-fondo p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Corregir la jornada</p>
        <button
          type="button"
          aria-label={`Cerrar la corrección de la jornada ${senia}`}
          onClick={alCerrar}
          className={BOTON_ICONO}
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className={etiqueta}>
          Fecha
          <input
            type="date"
            aria-label={`Fecha de la jornada ${senia}`}
            value={toma.fecha}
            onChange={(e) => actualizarCampania(toma.id, { fecha: e.target.value })}
            className={`${control} numerico`}
          />
        </label>
        <label className={etiqueta}>
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
        <label className={etiqueta}>
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
        <label className={etiqueta}>
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
    </div>
  )
}

function Cifra({ etiqueta, valor }: { etiqueta: string; valor: number | null }) {
  return (
    <div>
      <div className="text-xs text-cabecera-tenue">{etiqueta}</div>
      <div className="numerico text-[22px] font-semibold text-[#FDBA74]">{valor === null ? '—' : valor}</div>
    </div>
  )
}

/** Lo que sale de comparar las dos jornadas elegidas (lienzo «Historial»). */
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
      <div className={`flex flex-col gap-2 ${TARJETA_OSCURA}`}>
        <p className="text-[13px] text-cabecera-tenue">{cmp.titulo} · mm</p>
        <p className="text-xl font-bold">{cmp.que}</p>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Cifra etiqueta="mínimo" valor={cmp.minimoMm} />
          <Cifra etiqueta="medio" valor={cmp.medioMm} />
          <Cifra etiqueta="máximo" valor={cmp.maximoMm} />
        </div>
        <p className="text-sm text-cabecera-texto">{cmp.lectura}</p>
        <p className="text-xs text-cabecera-tenue">
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
      <button type="button" onClick={verCeldaPorCelda} className={`${BOTON_SECUNDARIO} text-[15px] font-semibold`}>
        Ver celda por celda
      </button>
    </section>
  )
}

/**
 * El historial de la calle (lienzo «Historial»): cada jornada en una fila con
 * su capa, su tramo, su fecha y cómo cerró. Tocar dos las compara; el «⋯» de
 * cada una la abre en la libreta o corrige su fecha, capa o calle.
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
      <p className="p-4 text-sm text-tenue">
        Esta calle todavía no tiene jornadas. Empieza una con «Nueva jornada» o sube una hoja.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3 p-3 sm:p-4">
      <p className="text-[13px] text-tenue">
        Toca dos jornadas para compararlas: espesor, profundidad de corte o repetibilidad.
      </p>
      <ul className="flex flex-col gap-2">
        {jornadas.map((j) => {
          const cierre = estadoDeCierre(j.toma, j.resultado)
          const elegida = vigentes.includes(j.toma.id)
          // A es la de abajo (o la más antigua), B la de arriba: así se lee «A → B».
          const marca = !elegida ? '' : !comparacion ? '' : comparacion.inferior.toma.id === j.toma.id ? 'A' : 'B'
          const tramo = tramoDeTomas([j.toma])
          const senia = etiquetaJornada(j)
          // El nombre del botón es corto y fijo; tramo, lecturas y cierre van
          // como descripción, que es lo que se mira para decidir qué comparar.
          const idDetalle = `${prefijo}-${j.toma.id}-detalle`
          const idCierre = `${prefijo}-${j.toma.id}-cierre`
          const abiertaLaCorreccion = corrigiendo === j.toma.id
          return (
            <li key={j.toma.id}>
              <div
                className={`flex min-h-14 items-center gap-1 rounded-xl border bg-tarjeta pr-1 ${
                  elegida ? 'border-tinta ring-1 ring-tinta' : 'border-borde'
                }`}
              >
                <button
                  type="button"
                  aria-pressed={elegida}
                  aria-label={`Comparar la jornada ${senia}`}
                  aria-describedby={`${idDetalle} ${idCierre}`}
                  onClick={() => alternar(j.toma.id)}
                  className="grid min-h-14 min-w-0 flex-1 grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-1.5 py-1.5 pr-1 text-left"
                >
                  {/* El círculo de 24 px en un blanco de 44. */}
                  <span aria-hidden="true" className="flex size-11 items-center justify-center">
                    <span
                      className={`flex size-6 items-center justify-center rounded-full text-xs font-bold ${
                        elegida ? 'bg-marca text-white' : 'border-2 border-slate-400 bg-tarjeta'
                      }`}
                    >
                      {marca}
                    </span>
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-[15px] font-semibold">{j.capa?.nombre ?? 'capa sin elegir'}</span>
                    <span id={idDetalle} className="truncate text-[13px] text-tenue">
                      {tramo ?? 'sin progresivas'} · {cuenta(lecturasDeToma(j.toma, largoMira), 'lectura', 'lecturas')}
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-0.5">
                    <span className="numerico text-[13px] text-tenue" title={j.toma.fecha}>
                      {fechaCorta(j.toma.fecha)}
                    </span>
                    <span
                      id={idCierre}
                      className={`rounded px-1.5 py-0.5 text-xs whitespace-nowrap ${CLASES_ESTADO[ESTADO_DEL_CIERRE[cierre.simbolo]]}`}
                    >
                      {cierre.simbolo} {cierre.corto}
                    </span>
                  </span>
                </button>
                <MenuMas
                  etiqueta={`Más de la jornada ${senia}`}
                  idMenu={`${prefijo}-${j.toma.id}-menu`}
                  etiquetaGrupo={`Jornada ${senia}`}
                  cerrarAlElegir
                >
                  <div className="flex flex-col">
                    <button
                      type="button"
                      aria-label={`Abrir la jornada ${senia}`}
                      onClick={() => {
                        activarCampania(j.toma.id)
                        fijarModoCalle('medir')
                      }}
                      className="flex min-h-11 items-center rounded-lg px-3 text-left text-[15px] font-medium hover:bg-fondo"
                    >
                      Abrir en la libreta
                    </button>
                    <button
                      type="button"
                      aria-expanded={abiertaLaCorreccion}
                      aria-label={`Corregir la jornada ${senia}`}
                      onClick={() => {
                        setCorrigiendo((c) => (c === j.toma.id ? null : j.toma.id))
                      }}
                      className="flex min-h-11 items-center rounded-lg px-3 text-left text-[15px] hover:bg-fondo"
                    >
                      Corregir fecha, capa o calle
                    </button>
                  </div>
                </MenuMas>
              </div>
              {abiertaLaCorreccion && <CorregirJornada jornada={j} alCerrar={() => setCorrigiendo(null)} />}
            </li>
          )
        })}
      </ul>

      {comparacion ? (
        <ResultadoComparar cmp={comparacion} />
      ) : pareja.length === 1 ? (
        <p className="text-sm text-tenue">Elige otra jornada para compararla con esta.</p>
      ) : null}
    </div>
  )
}
