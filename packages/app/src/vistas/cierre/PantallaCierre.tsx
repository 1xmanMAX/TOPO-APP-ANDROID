import {
  calcularLongitudKAuto,
  estadoCierreEnVivo,
  instrumentoCompleto,
  simularCierre,
  tramoQueCierra,
  type ClaseNivelacion,
  type EstadoCierreEnVivo,
  type Toma,
} from '@topo/core'
import { useId, useMemo, useState } from 'react'
import CampoNumero from '../../componentes/CampoNumero'
import { useAlmacen } from '../../estado/almacen'
import { useResultado } from '../../estado/derivados'
import { formatearCota } from '../../formato'
import { Aviso, BOTON, BOTON_ACTIVO, BOTON_INACTIVO, useCalleYToma } from '../analisis/comunes'
import { armarRecorrido, type PasoRecorrido } from './recorrido'

/** Los k de la tolerancia k·√K que se usan en obra, del más holgado al más exigente. */
const COEFICIENTES = [12, 8, 4]

/** La clase que se guarda con el k; 12 y 7 tienen nombre propio en el modelo. */
function claseDe(k: number): ClaseNivelacion {
  if (k === 12) return 'tercerOrden'
  if (k === 7) return 'precision'
  return 'personalizada'
}

/** Milímetros con signo explícito y el menos tipográfico. */
function mmConSigno(valor: number): string {
  const texto = Math.abs(valor).toFixed(1)
  if (Number(texto) === 0) return `${texto} mm`
  return `${valor < 0 ? '−' : '+'}${texto} mm`
}

/**
 * Calle › Cierre: el recorrido de la toma activa, la lectura de cierre (antes
 * de visar el BM se puede probar con `simularCierre`), k y K, el error contra
 * la tolerancia y la corrección por estación. Aplicarla guarda k y K en la
 * toma: desde ahí `calcularCampania` compensa las cotas, igual que hacía la
 * barra de cierre de Revisar. Las cuentas son todas de
 * `nivelacion/cierreEnVivo` del motor.
 */
export default function PantallaCierre() {
  const idTitulo = useId()
  const { calle, contexto } = useCalleYToma()

  return (
    <section aria-labelledby={idTitulo} className="mx-auto flex w-full max-w-4xl flex-col gap-3 p-3 sm:p-6">
      <div className="flex flex-col gap-1">
        <h2 id={idTitulo} className="text-lg font-semibold">
          Cierre
        </h2>
        {calle && (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {calle.nombre}
            {contexto && ` · ${contexto.capa?.nombre ?? '—'} · ${contexto.campania.fecha}`}
          </p>
        )}
      </div>
      {!calle ? (
        <Aviso tono="neutro" simbolo="△">
          No hay una calle activa. Elige una arriba, o créala en Obra › Calles.
        </Aviso>
      ) : !contexto ? (
        <Aviso tono="neutro" simbolo="△">
          Esta calle todavía no tiene nivelaciones: no hay nada que cerrar. Empieza una en Calle › Medir.
        </Aviso>
      ) : (
        // Con otra toma, k y K vuelven a ser los guardados en ella.
        <CierreDeLaToma key={contexto.campania.id} toma={contexto.campania} />
      )}
    </section>
  )
}

function CierreDeLaToma({ toma }: { toma: Toma }) {
  const bms = useAlmacen((s) => s.proyecto.bms)
  const instrumento = useAlmacen((s) => s.proyecto.instrumento)
  const actualizarCampania = useAlmacen((s) => s.actualizarCampania)
  const fijarModoCalle = useAlmacen((s) => s.fijarModoCalle)
  const resultado = useResultado()
  const largoMira = instrumentoCompleto(instrumento).largoMira

  const [k, setK] = useState(toma.cierre.coeficiente)
  const [kmAuto, setKmAuto] = useState(toma.cierre.longitudKAuto)
  const [kmManual, setKmManual] = useState(toma.cierre.longitudK)
  const kmDeLoMedido = calcularLongitudKAuto(toma, toma.cierre.tipo)
  const km = kmAuto ? kmDeLoMedido : kmManual

  const estado = useMemo(
    () => estadoCierreEnVivo(toma, bms, { coeficiente: k, longitudKKm: km, largoMira }),
    [toma, bms, k, km, largoMira],
  )
  const recorrido = useMemo(() => armarRecorrido(toma, bms), [toma, bms])
  const tramo = tramoQueCierra(toma)

  const guardadoIgual =
    toma.cierre.coeficiente === k &&
    toma.cierre.longitudKAuto === kmAuto &&
    (kmAuto || toma.cierre.longitudK === kmManual)

  function aplicar() {
    actualizarCampania(toma.id, {
      cierre: {
        ...toma.cierre,
        coeficiente: k,
        clase: claseDe(k),
        longitudKAuto: kmAuto,
        longitudK: kmAuto ? toma.cierre.longitudK : kmManual,
      },
    })
  }

  const coeficientes = COEFICIENTES.includes(toma.cierre.coeficiente)
    ? COEFICIENTES
    : [...COEFICIENTES, toma.cierre.coeficiente]
  const cierre = estado.cierre

  return (
    <div className="flex flex-col gap-4">
      <Recorrido pasos={recorrido} primeraDelCircuito={tramo.primeraEstacion} cotasInstrumento={resultado?.cotasInstrumento ?? []} />

      {toma.cierre.tipo !== 'abierto' && (
        <section aria-label="Tolerancia" className="flex flex-col gap-2 rounded border border-slate-200 p-3 dark:border-slate-800">
          <h3 className="font-semibold">Tolerancia k·√K</h3>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate-600 dark:text-slate-300">k</span>
            {coeficientes.map((valor) => (
              <button
                key={valor}
                type="button"
                aria-pressed={k === valor}
                onClick={() => setK(valor)}
                className={`${BOTON} ${k === valor ? BOTON_ACTIVO : BOTON_INACTIVO}`}
              >
                k = {valor}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="flex items-center gap-1.5">
              K
              <CampoNumero ariaLabel="Longitud K" valor={km} soloLectura={kmAuto} ancho="w-24" alCambiar={setKmManual} />
              km
            </span>
            <label className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={kmAuto}
                onChange={(e) => {
                  if (!e.target.checked) setKmManual(kmDeLoMedido)
                  setKmAuto(e.target.checked)
                }}
              />
              K de lo medido
            </label>
          </div>
        </section>
      )}

      <Veredicto estado={estado} tipo={toma.cierre.tipo} />

      {estado.previo && <LecturaDeCierre toma={toma} estado={estado} k={k} km={km} largoMira={largoMira} />}

      {cierre?.pasa && (
        <section aria-label="Compensación" className="flex flex-col gap-2">
          <h3 className="font-semibold">Corrección por estación</h3>
          <div className="overflow-x-auto rounded border border-slate-200 dark:border-slate-800">
            <table aria-label="Corrección por estación" className="w-full border-collapse text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900">
                <tr className="text-left text-slate-500">
                  <th className="px-2 py-1.5 font-medium">Estación</th>
                  <th className="px-2 py-1.5 text-right font-medium">Altura instrumental</th>
                  <th className="px-2 py-1.5 text-right font-medium">Corrección acumulada</th>
                </tr>
              </thead>
              <tbody>
                {toma.estaciones.map((estacion, indice) => {
                  const ai = resultado?.cotasInstrumento[indice]
                  const fuera = indice < cierre.tramoComprobado.primeraEstacion
                  return (
                    <tr key={estacion.id} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-2 py-1.5">E{indice + 1}</td>
                      <td className="numerico px-2 py-1.5 text-right">
                        {ai !== undefined && Number.isFinite(ai) ? formatearCota(ai) : '—'}
                      </td>
                      <td className="numerico px-2 py-1.5 text-right">
                        {fuera ? (
                          <span className="text-aviso">
                            <span aria-hidden="true">△ </span>fuera del circuito
                          </span>
                        ) : (
                          mmConSigno(cierre.correccionesMm[indice] ?? 0)
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300">
            Cada punto leído desde una estación recibe la corrección de esa estación. La última anula el error.
          </p>

          {guardadoIgual && resultado?.cierre.pasa === true ? (
            <Aviso tono="pasa" simbolo="✓">
              Compensación aplicada: las cotas de Revisar y de los informes ya van corregidas.
            </Aviso>
          ) : (
            <button type="button" onClick={aplicar} className={`${BOTON} self-start bg-marca font-medium text-white`}>
              Aplicar compensación
            </button>
          )}
        </section>
      )}

      {cierre && !cierre.pasa && (
        <section aria-label="Qué revisar" className="flex flex-col gap-2">
          <Aviso tono="falla" simbolo="✗">
            No se compensa: un cierre fuera de tolerancia no se reparte entre las estaciones. Las cotas de esta toma
            quedan NO COMPROBADAS.
          </Aviso>
          {!guardadoIgual && resultado?.cierre.pasa === true && (
            <Aviso tono="aviso" simbolo="△">
              En la toma sigue guardado k = {toma.cierre.coeficiente}, con el que sí cierra: las cotas siguen
              compensadas con él.
            </Aviso>
          )}
          <h3 className="font-semibold">Qué revisar</h3>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
            {queRevisar(estado, toma, bms).map((texto) => (
              <li key={texto}>{texto}</li>
            ))}
          </ul>
          <button type="button" onClick={() => fijarModoCalle('medir')} className={`${BOTON} self-start ${BOTON_INACTIVO}`}>
            Revisar la libreta
          </button>
        </section>
      )}
    </div>
  )
}

function Recorrido({
  pasos,
  primeraDelCircuito,
  cotasInstrumento,
}: {
  pasos: PasoRecorrido[]
  primeraDelCircuito: number
  cotasInstrumento: number[]
}) {
  if (pasos.length === 0) {
    return (
      <Aviso tono="neutro" simbolo="△">
        La libreta de esta toma está vacía. Anota la primera estación en Calle › Medir.
      </Aviso>
    )
  }
  const clases: Record<PasoRecorrido['tipo'], string> = {
    bm: 'border-2 border-marca font-semibold',
    estacion: 'border border-slate-400 bg-slate-100 dark:bg-slate-800',
    cambio: 'border border-slate-400',
    punto: 'border border-slate-300 text-slate-600 dark:text-slate-300',
    falta: 'border-2 border-dashed border-aviso text-aviso',
  }
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-semibold">Recorrido</h3>
      <ol aria-label="Recorrido de la nivelación" className="flex flex-wrap items-center gap-x-1 gap-y-2 text-sm">
        {pasos.map((paso, indice) => {
          const fuera = paso.estacionIndice !== undefined && paso.estacionIndice < primeraDelCircuito
          const ai = paso.estacionIndice !== undefined ? cotasInstrumento[paso.estacionIndice] : undefined
          return (
            <li key={`${paso.tipo}-${paso.nombre}-${indice}`} className="flex items-center gap-1">
              {indice > 0 && (
                <span aria-hidden="true" className="text-slate-400">
                  →
                </span>
              )}
              <div className={`flex min-h-11 flex-col justify-center rounded px-2.5 py-1 ${clases[paso.tipo]}`}>
                <span>
                  {paso.tipo === 'falta' && <span aria-hidden="true">? </span>}
                  {paso.nombre}
                  {paso.tipo === 'falta' && ' (falta visar)'}
                  {paso.tipo === 'cambio' && <span className="sr-only"> (punto de cambio)</span>}
                </span>
                {ai !== undefined && Number.isFinite(ai) && (
                  <span className="numerico text-xs text-slate-600 dark:text-slate-300">AI {formatearCota(ai)}</span>
                )}
                {fuera && <span className="text-xs text-aviso">fuera del circuito</span>}
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function Veredicto({ estado, tipo }: { estado: EstadoCierreEnVivo; tipo: Toma['cierre']['tipo'] }) {
  if (estado.circuito === 'error') {
    return (
      <Aviso tono="falla" simbolo="✗">
        No se puede calcular el cierre: {estado.error}
      </Aviso>
    )
  }
  const cierre = estado.cierre
  if (!cierre) {
    // Abierta de verdad es solo la toma configurada así. Una de circuito
    // cerrado o de enlace sin cierre todavía no está «abierta»: le falta
    // cerrar (sin BM elegido, con el BM borrado o sin visarlo). El BM se
    // nombra solo si existe; el porqué lo da `motivo`.
    const titulo =
      tipo === 'abierto'
        ? 'Circuito abierto: lo medido queda NO COMPROBADO.'
        : estado.previo
          ? `Falta cerrar en ${estado.previo.bmCierre.nombre}: lo medido queda NO COMPROBADO.`
          : 'Falta cerrar la nivelación: lo medido queda NO COMPROBADO.'
    return (
      <Aviso tono="aviso">
        <p className="font-semibold">
          <span aria-hidden="true">△ </span>
          {titulo}
        </p>
        {estado.motivo && <p>{estado.motivo}</p>}
      </Aviso>
    )
  }
  const tolerancia = cierre.toleranciaMm
  const fraccion = tolerancia > 0 ? Math.min(1, Math.abs(cierre.errorMm) / (2 * tolerancia)) : cierre.errorMm === 0 ? 0 : 1
  return (
    <section aria-label="Veredicto del cierre" className="flex flex-col gap-2">
      <p className={`text-xl font-bold ${cierre.pasa ? 'text-pasa' : 'text-falla'}`}>
        <span aria-hidden="true">{cierre.pasa ? '✓ ' : '✗ '}</span>
        {cierre.pasa ? 'Cierra' : 'No cierra'}
      </p>
      <div
        role="img"
        aria-label={`Error ${mmConSigno(cierre.errorMmRedondeado)} contra una tolerancia de ±${tolerancia.toFixed(1)} mm`}
        className="relative h-4 w-full rounded bg-slate-100 dark:bg-slate-800"
      >
        <div
          className={`h-4 rounded ${cierre.pasa ? 'bg-pasa' : 'bg-falla'}`}
          style={{ width: `${fraccion * 100}%` }}
        />
        {/* La raya de la tolerancia va a la mitad: la barra llega hasta el doble. */}
        <div className="absolute inset-y-[-4px] left-1/2 w-0.5 bg-slate-700 dark:bg-slate-200" />
      </div>
      <div className="flex justify-between text-xs text-slate-600 dark:text-slate-300">
        <span>0</span>
        <span>tolerancia ±{tolerancia.toFixed(1)} mm</span>
        <span>2×</span>
      </div>
      <p className="numerico text-sm">{estado.texto}</p>
      {estado.motivo && (
        <p className="text-sm text-aviso">
          <span aria-hidden="true">△ </span>
          {estado.motivo}
        </p>
      )}
    </section>
  )
}

function LecturaDeCierre({
  toma,
  estado,
  k,
  km,
  largoMira,
}: {
  toma: Toma
  estado: EstadoCierreEnVivo
  k: number
  km: number
  largoMira: number
}) {
  const fijarVistaAdelante = useAlmacen((s) => s.fijarVistaAdelante)
  const [texto, setTexto] = useState('')
  const previo = estado.previo!
  const ultimaIndice = toma.estaciones.length - 1
  const ultima = toma.estaciones[ultimaIndice]
  const anotada = estado.circuito === 'cerrado' ? ultima?.vistaAdelante?.valor : undefined

  const lectura = Number(texto.trim().replace(',', '.'))
  let simulacion: ReturnType<typeof simularCierre> | null = null
  let fallo: string | null = null
  if (texto.trim() !== '') {
    try {
      simulacion = simularCierre(previo.alturaInstrumentalUltima, lectura, previo.bmCierre.cota, k, km, 0, largoMira)
    } catch (error) {
      fallo = (error as Error).message
    }
  }
  // Solo se anota donde todavía no hay nada: nunca se pisa una vista adelante ya leída.
  const puedeAnotar = simulacion !== null && ultima !== undefined && !ultima.vistaAdelante

  return (
    <section aria-label="Lectura de cierre" className="flex flex-col gap-2 rounded border border-slate-200 p-3 dark:border-slate-800">
      <h3 className="font-semibold">Lectura de cierre en {previo.bmCierre.nombre}</h3>
      <dl className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-slate-500">Cota del BM</dt>
          <dd className="numerico">{formatearCota(previo.bmCierre.cota)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Para cerrar exacto</dt>
          <dd className="numerico font-semibold">{formatearCota(previo.lecturaParaCerrarExacto)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Pasa si lees entre</dt>
          <dd className="numerico">
            {formatearCota(previo.rangoLecturaQuePasa[0])} y {formatearCota(previo.rangoLecturaQuePasa[1])}
          </dd>
        </div>
      </dl>
      {anotada !== undefined && (
        <p className="text-sm">
          Anotada en la libreta: <span className="numerico font-semibold">{formatearCota(anotada)}</span>
        </p>
      )}
      <label className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center">
        <span>{anotada !== undefined ? 'Probar otra lectura' : 'Lectura en el BM'}</span>
        <input
          aria-label="Lectura en el BM de cierre"
          inputMode="decimal"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={formatearCota(previo.lecturaParaCerrarExacto)}
          className="numerico min-h-11 w-full rounded border border-slate-300 bg-white px-2 sm:w-36 dark:border-slate-700 dark:bg-slate-900"
        />
      </label>
      {fallo && (
        <p className="text-sm text-falla">
          <span aria-hidden="true">✗ </span>
          {fallo}
        </p>
      )}
      {simulacion && (
        <p className={`text-sm font-semibold ${simulacion.pasa ? 'text-pasa' : 'text-falla'}`}>
          <span aria-hidden="true">{simulacion.pasa ? '✓ ' : '✗ '}</span>
          Con {formatearCota(lectura)}: {simulacion.pasa ? 'cierra' : 'no cierra'}, error{' '}
          {mmConSigno(simulacion.errorMmRedondeado)} de ±{simulacion.toleranciaMm.toFixed(1)} mm
        </p>
      )}
      {puedeAnotar && (
        <button
          type="button"
          onClick={() => {
            fijarVistaAdelante(toma.id, ultimaIndice, { destino: { tipo: 'bm', bmId: previo.bmCierre.id }, valor: lectura })
            setTexto('')
          }}
          className={`${BOTON} self-start ${BOTON_INACTIVO}`}
        >
          Anotar en la libreta
        </button>
      )}
    </section>
  )
}

/** Qué mirar cuando el cierre no pasa, de lo más probable a lo menos. */
function queRevisar(estado: EstadoCierreEnVivo, toma: Toma, bms: { id: string; nombre: string; cota: number }[]): string[] {
  const cierre = estado.cierre!
  const lista: string[] = []
  const error = Math.abs(cierre.errorMm)
  if (error >= 80 && error <= 120) {
    lista.push('El error se parece a un decímetro: suele ser una lectura con el decímetro mal leído en la mira.')
  } else if (error >= 900 && error <= 1100) {
    lista.push('El error se parece a un metro: suele ser un metro mal leído o anotado en la mira.')
  }
  for (const control of estado.controles) {
    lista.push(
      `La visada a ${control.nombre} desde la estación ${control.estacionIndice + 1} difiere ${mmConSigno(control.errorMm)} de su cota: ` +
        'el error está antes de esa estación si la diferencia es grande.',
    )
  }
  lista.push(
    'Las lecturas en los puntos de cambio: la vista adelante a un PC y la vista atrás desde ese mismo PC en la estación siguiente. Un error ahí se arrastra a todo lo que sigue.',
  )
  const bmFinal = bms.find((bm) => bm.id === toma.cierre.bmFinalId)
  if (bmFinal) {
    lista.push(`La cota del BM de cierre (${bmFinal.nombre}: ${formatearCota(bmFinal.cota)}) y que se visó ese mismo BM.`)
  }
  lista.push(
    `La longitud del circuito: con K = ${cierre.longitudKKm.toFixed(3)} km y k = ${cierre.coeficiente} la tolerancia es ±${cierre.toleranciaMm.toFixed(1)} mm.`,
  )
  lista.push('Si no aparece el error, repite el circuito.')
  return lista
}
