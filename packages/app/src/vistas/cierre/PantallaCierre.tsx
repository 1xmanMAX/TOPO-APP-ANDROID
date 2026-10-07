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
import Plegable from '../../componentes/Plegable'
import Segmentado from '../../componentes/Segmentado'
import { BOTON_PRINCIPAL, BOTON_SECUNDARIO, TARJETA } from '../../componentes/ui'
import { useAlmacen } from '../../estado/almacen'
import { useResultado } from '../../estado/derivados'
import { formatearCota } from '../../formato'
import { Aviso, useCalleYToma } from '../analisis/comunes'
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

/** En el modo sol los fondos suaves son negros: el borde dice el estado. */
const BORDE_SOL = '[.sol_&]:border-2 [.sol_&]:border-current'

/**
 * Calle › Cierre: la lectura de cierre si falta (antes de visar el BM se
 * puede probar con `simularCierre`), el veredicto con su barra, el recorrido
 * de la toma activa, k y K plegados, y la corrección por estación. Aplicarla
 * guarda k y K en la toma: desde ahí `calcularCampania` compensa las cotas,
 * igual que hacía la barra de cierre de Revisar. Las cuentas son todas de
 * `nivelacion/cierreEnVivo` del motor.
 */
export default function PantallaCierre() {
  const idTitulo = useId()
  const { calle, contexto } = useCalleYToma()

  return (
    <section aria-labelledby={idTitulo} className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-col">
        <h2 id={idTitulo} className="text-[26px] leading-tight font-bold">
          Cierre
        </h2>
        {calle && (
          <p className="text-[15px] text-tenue">
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
  const aplicada = guardadoIgual && resultado?.cierre.pasa === true
  const puedeAplicar = cierre?.pasa === true && !aplicada
  const toleranciaMm = cierre?.toleranciaMm ?? k * Math.sqrt(Math.max(0, km))

  const veredicto = <Veredicto estado={estado} tipo={toma.cierre.tipo} />
  const lectura = estado.previo ? <LecturaDeCierre toma={toma} estado={estado} k={k} km={km} largoMira={largoMira} /> : null

  return (
    <div className="flex flex-col gap-4">
      {/* Sin cierre todavía, lo primero es la lectura que lo cierra; con cierre, el veredicto. */}
      {cierre ? (
        <>
          {veredicto}
          {/* Ya cerrado, probar otra lectura es lo raro: va plegado. */}
          {lectura && estado.previo && (
            <Plegable
              titulo="Probar otra lectura"
              resumen={`en ${estado.previo.bmCierre.nombre}`}
              className="border-y border-borde"
            >
              <div className="pb-3">{lectura}</div>
            </Plegable>
          )}
        </>
      ) : (
        <>
          {lectura}
          {veredicto}
        </>
      )}

      <Recorrido pasos={recorrido} primeraDelCircuito={tramo.primeraEstacion} cotasInstrumento={resultado?.cotasInstrumento ?? []} />

      {toma.cierre.tipo !== 'abierto' && (
        <section aria-label="Tolerancia" className="border-y border-borde">
          <Plegable
            titulo="Tolerancia"
            resumen={`±${toleranciaMm.toFixed(1)} mm (${k}·√${km.toFixed(3)} km) · cambiar`}
            abierto={!guardadoIgual || puedeAplicar}
          >
            <div className="flex flex-col gap-3 pb-3">
              <Segmentado
                etiqueta="Constante k"
                opciones={coeficientes.map((valor) => ({ valor: String(valor), texto: `k = ${valor}` }))}
                valor={String(k)}
                alCambiar={(valor) => setK(Number(valor))}
                anchoCompleto
                className="sm:w-auto"
              />
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[15px]">
                <span className="flex items-center gap-2">
                  <span className="text-tenue">Longitud K</span>
                  <CampoNumero ariaLabel="Longitud K" valor={km} soloLectura={kmAuto} ancho="w-28" alCambiar={setKmManual} />
                  <span className="text-tenue">km</span>
                </span>
                <label className="flex min-h-11 items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-marca"
                    checked={kmAuto}
                    onChange={(e) => {
                      if (!e.target.checked) setKmManual(kmDeLoMedido)
                      setKmAuto(e.target.checked)
                    }}
                  />
                  K de lo medido
                </label>
              </div>
              {puedeAplicar && (
                <button type="button" onClick={aplicar} className={`${BOTON_PRINCIPAL} w-full sm:w-auto sm:self-start`}>
                  Aplicar compensación
                </button>
              )}
            </div>
          </Plegable>
        </section>
      )}

      {cierre?.pasa && (
        <section aria-label="Compensación" className={`${TARJETA} flex flex-col gap-3`}>
          <h3 className="text-[17px] font-bold">Corrección por estación</h3>
          <div className="overflow-x-auto">
            <table aria-label="Corrección por estación" className="w-full border-collapse text-[15px]">
              <thead>
                <tr className="border-b border-tinta text-left text-sm text-tenue">
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
                    <tr key={estacion.id} className="border-t border-borde">
                      <td className="px-2 py-1.5">E{indice + 1}</td>
                      <td className="numerico px-2 py-1.5 text-right">
                        {ai !== undefined && Number.isFinite(ai) ? formatearCota(ai) : '—'}
                      </td>
                      <td className="numerico px-2 py-1.5 text-right font-semibold">
                        {fuera ? (
                          <span className="font-normal text-aviso">
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
          <p className="text-sm text-tenue">
            Cada punto leído desde una estación recibe la corrección de esa estación. La última anula el error.
          </p>

          {aplicada ? (
            <Aviso tono="pasa" simbolo="✓">
              Compensación aplicada: las cotas de Revisar y de los informes ya van corregidas.
            </Aviso>
          ) : (
            <Aviso tono="aviso" simbolo="△">
              Todavía sin aplicar: las cotas no van corregidas. Aplícala en «Tolerancia».
            </Aviso>
          )}
        </section>
      )}

      {cierre && !cierre.pasa && (
        <section aria-label="Qué revisar" className={`${TARJETA} flex flex-col gap-3`}>
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
          <h3 className="text-[17px] font-bold">Qué revisar</h3>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-[15px]">
            {queRevisar(estado, toma, bms).map((texto) => (
              <li key={texto}>{texto}</li>
            ))}
          </ul>
          <button type="button" onClick={() => fijarModoCalle('medir')} className={`${BOTON_SECUNDARIO} self-start`}>
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
    bm: 'border-2 border-tinta bg-tarjeta font-semibold',
    estacion: 'border border-borde bg-tarjeta',
    cambio: 'border-2 border-dashed border-borde-fuerte bg-tarjeta',
    punto: 'border border-borde bg-tarjeta text-tenue',
    falta: 'border-2 border-dashed border-marca bg-tarjeta font-semibold text-marca',
  }
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[15px] font-semibold text-tenue">Recorrido</h3>
      <ol aria-label="Recorrido de la nivelación" className="flex flex-wrap items-center gap-x-1 gap-y-2 text-sm">
        {pasos.map((paso, indice) => {
          const fuera = paso.estacionIndice !== undefined && paso.estacionIndice < primeraDelCircuito
          const ai = paso.estacionIndice !== undefined ? cotasInstrumento[paso.estacionIndice] : undefined
          const falta = paso.tipo === 'falta'
          return (
            <li key={`${paso.tipo}-${paso.nombre}-${indice}`} className="flex items-center gap-1">
              {indice > 0 &&
                (falta ? (
                  // El tramo que falta: discontinuo y en el color de la marca.
                  <span aria-hidden="true" className="flex items-center text-marca">
                    <span className="w-5 border-t-2 border-dashed border-current" />
                    <span className="-ml-0.5 leading-none">▸</span>
                  </span>
                ) : (
                  <span aria-hidden="true" className="text-[#8B96A2]">
                    →
                  </span>
                ))}
              <div className={`numerico flex min-h-11 flex-col justify-center rounded-[10px] px-2.5 py-1 ${clases[paso.tipo]}`}>
                <span>
                  {falta && <span aria-hidden="true">? </span>}
                  {paso.nombre}
                  {falta && ' (falta visar)'}
                  {paso.tipo === 'cambio' && <span className="sr-only"> (punto de cambio)</span>}
                </span>
                {ai !== undefined && Number.isFinite(ai) && <span className="text-xs text-tenue">AI {formatearCota(ai)}</span>}
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
  // La barra va de −2·tol a +2·tol: la franja verde del centro es lo que pasa.
  const posicion =
    tolerancia > 0 ? 50 + (cierre.errorMm / tolerancia) * 25 : cierre.errorMm === 0 ? 50 : cierre.errorMm > 0 ? 100 : 0
  const marcador = Math.max(1, Math.min(99, posicion))
  return (
    <section
      aria-label="Veredicto del cierre"
      className={`flex flex-col gap-3 rounded-[14px] p-4 ${BORDE_SOL} ${cierre.pasa ? 'bg-pasa-suave text-pasa' : 'bg-falla-suave text-falla'}`}
    >
      <div>
        <p className="text-3xl leading-tight font-bold">
          <span aria-hidden="true" className="mr-3 inline-block align-middle text-5xl leading-none">
            {cierre.pasa ? '✓' : '✗'}
          </span>{' '}
          {cierre.pasa ? 'Cierra' : 'No cierra'}
        </p>
        <p className="mt-1 text-base">
          Error <span className="numerico font-semibold">{mmConSigno(cierre.errorMmRedondeado)}</span> de{' '}
          <span className="numerico">±{tolerancia.toFixed(1)} mm</span> permitidos
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <div
          role="img"
          aria-label={`Error ${mmConSigno(cierre.errorMmRedondeado)} contra una tolerancia de ±${tolerancia.toFixed(1)} mm`}
          className="relative h-10 w-full overflow-hidden rounded-md border border-borde-fuerte bg-tarjeta"
        >
          <div className="absolute inset-0 bg-falla-suave" />
          <div className="absolute inset-y-0 left-1/4 w-1/2 border-x-2 border-pasa bg-pasa/25" />
          <div className="absolute inset-y-0 left-1/2 w-px bg-tenue" />
          <div
            className="absolute inset-y-0 w-1.5 -translate-x-1/2 rounded-sm bg-tinta"
            style={{ left: `${marcador}%` }}
          />
        </div>
        <div className="numerico relative h-4 text-xs text-tinta">
          <span className="absolute left-1/4 -translate-x-1/2">−{tolerancia.toFixed(1)}</span>
          <span className="absolute left-1/2 -translate-x-1/2">0</span>
          <span className="absolute left-3/4 -translate-x-1/2">+{tolerancia.toFixed(1)} mm</span>
        </div>
      </div>
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
    <section aria-label="Lectura de cierre" className={`${TARJETA} flex flex-col gap-3`}>
      <h3 className="text-[17px] leading-snug font-bold">
        Lectura de cierre en {previo.bmCierre.nombre}
        {ultimaIndice >= 0 && <span className="font-normal text-tenue"> · desde la Estación {ultimaIndice + 1}</span>}
      </h3>
      <dl className="flex flex-col gap-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <dt className="text-[15px]">Para cerrar exacto</dt>
          <dd className="numerico text-3xl font-semibold">{formatearCota(previo.lecturaParaCerrarExacto)}</dd>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-1.5 text-sm text-tenue">
          <dt>Pasa si lees entre</dt>
          <dd className="numerico">
            {formatearCota(previo.rangoLecturaQuePasa[0])} y {formatearCota(previo.rangoLecturaQuePasa[1])}
          </dd>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-1.5 text-sm text-tenue">
          <dt>Cota del BM</dt>
          <dd className="numerico">{formatearCota(previo.bmCierre.cota)}</dd>
        </div>
      </dl>
      {anotada !== undefined && (
        <p className="text-sm">
          Anotada en la libreta: <span className="numerico font-semibold">{formatearCota(anotada)}</span>
        </p>
      )}
      <label className="flex flex-col gap-1">
        <span className="text-[15px] font-semibold">{anotada !== undefined ? 'Probar otra lectura' : 'Lectura en el BM'}</span>
        <input
          aria-label="Lectura en el BM de cierre"
          inputMode="decimal"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="escribe la lectura"
          className="numerico h-16 w-full min-w-0 rounded-[10px] border-2 border-tinta sm:max-w-sm bg-tarjeta px-3 text-[32px] font-semibold placeholder:text-lg placeholder:font-normal placeholder:text-tenue"
        />
      </label>
      {fallo && (
        <p className="text-sm text-falla">
          <span aria-hidden="true">✗ </span>
          {fallo}
        </p>
      )}
      {simulacion && (
        <p
          className={`rounded-[10px] px-3 py-2 text-base font-semibold ${BORDE_SOL} ${simulacion.pasa ? 'bg-pasa-suave text-pasa' : 'bg-falla-suave text-falla'}`}
        >
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
          className={`${BOTON_PRINCIPAL} w-full`}
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
