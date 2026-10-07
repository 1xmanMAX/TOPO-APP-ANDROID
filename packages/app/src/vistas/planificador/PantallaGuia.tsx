import { formatearProgresiva, instrumentoCompleto, type OpcionesControles, type PlanConControles } from '@topo/core'
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import AvisoLinea from '../../componentes/AvisoLinea'
import Plegable from '../../componentes/Plegable'
import { BOTON_ICONO } from '../../componentes/ui'
import { useAlmacen } from '../../estado/almacen'
import { cuenta, formatearCota } from '../../formato'
import { usePlanificador } from './almacenPlanificador'
import { BOTON, BOTON_PRINCIPAL } from './estilos'
import { avanceHasta, lecturasAlLimite, recorridoDelPlan, type LecturaAlLimite, type PasoGuia } from './recorrido'
import { usePlanDeLaCalle } from './usePlanDeLaCalle'

/**
 * De qué plan es un paso guardado: los controles y las reglas. Si cambian,
 * el mismo número de paso cae en otra estación u otro tramo.
 */
function firmaDelPlan(plan: PlanConControles, opciones: Partial<OpcionesControles>): string {
  const reglas = Object.keys(opciones)
    .sort()
    .map((k) => `${k}=${opciones[k as keyof OpcionesControles]}`)
    .join(',')
  return `${plan.controles.map((c) => c.progresiva.toFixed(3)).join(';')}|${reglas}`
}

const NOMBRE_LECTURA: Record<LecturaAlLimite['cual'], string> = {
  atras: 'La de atrás',
  adelante: 'La de adelante',
  intermedia: 'La de la',
}

/** «4» o «4.5»: sin ceros de más, como se dice en obra. */
const metrosCortos = (m: number) => String(Number(m.toFixed(2)))

/** Una parte de la línea de avisos del plan: su símbolo y lo que dice en corto. */
interface ParteAviso {
  simbolo: '✗' | '△'
  texto: string
}

/**
 * Calle › Planificar › Guía de campo: el plan, una estación por pantalla,
 * para seguirlo con el celular en la mano. Cada tramo va de ida y luego de
 * vuelta, y al llegar a un control se recuerda comparar su cota y cerrar el
 * tramo: así el error de un tramo no pasa al siguiente.
 *
 * Primero lo que se hace (la tarjeta oscura del paso), después el detalle;
 * los avisos del plan van plegados en una línea, y abajo, fijo, solo
 * «Anterior» y «Hecho, siguiente».
 *
 * Si la calle tiene un plan guardado, la guía sigue ese: es el que sale en
 * el plano y con el que se clavaron las estacas. Lo que se esté probando en
 * Planificar sin guardar no la mueve.
 */
export default function PantallaGuia() {
  const abrirPantallaCalle = useAlmacen((s) => s.abrirPantallaCalle)
  const instrumento = useAlmacen((s) => s.proyecto.instrumento)
  const bms = useAlmacen((s) => s.proyecto.bms)
  const cambiarRecuerdo = usePlanificador((s) => s.cambiar)
  const datos = usePlanDeLaCalle()
  const idCalle = datos?.calle.id ?? ''
  const pasoGuardado = usePlanificador((s) => s.porCalle[idCalle]?.pasoGuia)
  const firmaGuardada = usePlanificador((s) => s.porCalle[idCalle]?.firmaGuia)
  const [seMovio, setSeMovio] = useState(false)
  const idTitulo = useId()

  const sigueGuardado = !!datos?.guardado?.plan?.posible
  const plan = sigueGuardado ? datos!.guardado!.plan : (datos?.plan ?? null)
  const opciones = sigueGuardado ? datos!.guardado!.opciones : (datos?.opciones ?? {})
  const recorrido = useMemo(() => (plan?.posible ? recorridoDelPlan(plan) : null), [plan])

  if (!datos || !plan || !recorrido || recorrido.pasos.length === 0) {
    return (
      <section aria-labelledby={idTitulo} className="mx-auto flex w-full max-w-xl flex-col gap-3 p-4 sm:p-6">
        <h2 id={idTitulo} className="text-[20px] font-bold">
          Guía de campo
        </h2>
        <AvisoLinea tono="falla">
          {!datos
            ? 'Elige una calle para ver su guía.'
            : plan && !plan.posible
              ? `No hay guía: ${plan.motivo}.`
              : 'No hay guía: el perfil de la calle no sirve todavía. Arréglalo en Planificar.'}
        </AvisoLinea>
        <button type="button" onClick={() => abrirPantallaCalle('planificar')} className={`${BOTON} self-start`}>
          Volver a Planificar
        </button>
      </section>
    )
  }

  const firma = firmaDelPlan(plan, opciones)
  // Un paso de otro plan no apunta al mismo lugar: se vuelve al inicio y se dice.
  const pasoDeOtroPlan = firmaGuardada !== undefined && firmaGuardada !== firma && (pasoGuardado ?? 0) > 0
  const total = recorrido.pasos.length
  const indice = pasoDeOtroPlan ? 0 : Math.min(Math.max(pasoGuardado ?? 0, 0), total)
  const terminado = indice >= total
  const ir = (n: number) => {
    setSeMovio(true)
    cambiarRecuerdo(datos.calle.id, {
      pasoGuia: Math.min(Math.max(n, 0), total),
      firmaGuia: firma,
    })
  }
  const hecho = avanceHasta(recorrido, indice)
  const paso = terminado ? null : recorrido.pasos[indice]!
  const equipo = instrumentoCompleto(instrumento)
  const alturaPlan = opciones.alturaInstrumento ?? equipo.alturaInstrumento
  const miraPlan = opciones.largoMira ?? equipo.largoMira

  // El BM de donde se lleva cota al primer control: el de la última toma de la calle, o el único de la obra.
  const ultimaToma = datos.calle.nivelaciones.at(-1)?.tomas.at(-1)
  const bm = bms.find((b) => b.id === ultimaToma?.bmInicialId) ?? (bms.length === 1 ? bms[0] : undefined)
  const tramosMalos = plan.tramos.filter((t) => !t.ok).length

  // Los avisos del plan, en una sola línea plegada: primero lo que falla.
  const partes: ParteAviso[] = []
  const detalle: ReactNode[] = []
  if (!plan.ok) {
    partes.push({ simbolo: '✗', texto: cuenta(tramosMalos, 'tramo no cumple', 'tramos no cumplen') })
    detalle.push(
      <div key="malos" className="rounded-[10px] bg-falla-suave px-3 py-2 text-sm text-falla">
        <p className="font-medium">
          <span aria-hidden="true">✗ </span>
          {cuenta(tramosMalos, 'tramo no cumple', 'tramos no cumplen')}: su cierre puede salir fuera de la tolerancia.
        </p>
        <ul className="list-disc pl-5 text-xs">
          {plan.avisos.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </div>,
    )
  }
  if (!sigueGuardado) {
    partes.push({ simbolo: '△', texto: 'plan sin guardar' })
    detalle.push(
      <AvisoLinea key="sinGuardar" tono="aviso">
        Este plan no está guardado en la calle: guárdalo en Planificar para que sus controles salgan en el plano.
      </AvisoLinea>,
    )
  } else if (datos.diferencias.length > 0) {
    partes.push({ simbolo: '△', texto: 'Planificar muestra otro plan' })
    detalle.push(
      <AvisoLinea key="otro" tono="aviso">
        Esta guía sigue el plan guardado en la calle (el del plano, con el que se clavan las estacas). En Planificar se
        ve otro sin guardar: {datos.diferencias.join('; ')}.
      </AvisoLinea>,
    )
  }
  if (sigueGuardado && !datos.guardado!.coincide) {
    partes.push({ simbolo: '△', texto: 'controles distintos' })
    detalle.push(
      <AvisoLinea key="coincide" tono="aviso">
        Al rehacer el plan guardado salen controles algo distintos de los guardados: ubícate por las estacas clavadas y
        revisa el plan en Planificar.
      </AvisoLinea>,
    )
  }
  const hayFalla = partes.some((p) => p.simbolo === '✗')

  return (
    <section aria-labelledby={idTitulo} className="mx-auto flex w-full max-w-xl flex-col gap-3 px-4 pt-3 pb-4 sm:px-6">
      <header className="flex items-start gap-2">
        <button
          type="button"
          aria-label="Volver a Planificar"
          title="Volver a Planificar"
          onClick={() => abrirPantallaCalle('planificar')}
          className={`${BOTON_ICONO} -ml-1 border-0 bg-transparent`}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <h2 id={idTitulo} className="leading-tight">
            <span className="block text-xs font-medium text-tenue">Guía de campo</span>
            <span className="block text-[20px] font-bold">{datos.calle.nombre}</span>
          </h2>
          <p className="text-[13px] text-tenue">
            Mira de {metrosCortos(miraPlan)} m · instrumento a {alturaPlan.toFixed(2)}
            {paso
              ? ` · tramo ${paso.tramo} de ${plan.tramos.length}, ${paso.sentido}`
              : ` · recorrido completo, ${total} de ${total} pasos`}
          </p>
        </div>
        <span className="numerico inline-flex h-9 shrink-0 items-center rounded-full bg-marca px-3 text-sm font-bold text-white">
          {terminado ? `Paso ${total} / ${total}` : `Paso ${indice + 1} / ${total}`}
        </span>
      </header>

      <Avance pasos={recorrido.pasos} indice={indice} total={total} terminado={terminado} />
      <p className="-mt-1 text-[13px] text-tenue">
        Ida: estaciones {hecho.estaciones} de {recorrido.totalEstaciones} · Cambios {hecho.cambios} de{' '}
        {recorrido.totalCambios} · Controles {hecho.controles} de {recorrido.nombresControl.length}
      </p>

      {partes.length > 0 && (
        <div className={`rounded-[10px] px-3 ${hayFalla ? 'bg-falla-suave text-falla' : 'bg-aviso-suave text-aviso'}`}>
          <Plegable
            titulo={`${partes[0]!.simbolo} ${partes[0]!.texto}`}
            resumen={partes
              .slice(1)
              .map((p) => `${p.simbolo} ${p.texto}`)
              .join(' · ')}
          >
            <div className="flex flex-col gap-2 pb-3">{detalle}</div>
          </Plegable>
        </div>
      )}

      {pasoDeOtroPlan && (
        <div role="status">
          <AvisoLinea tono="aviso">
            El plan cambió desde que dejaste la guía en el paso {(pasoGuardado ?? 0) + 1}: los pasos ya no caen en el
            mismo lugar, así que la guía volvió al inicio. Busca la estación donde te quedaste.
          </AvisoLinea>
        </div>
      )}

      {paso ? (
        <Tarjeta key={paso.indice} paso={paso} opciones={opciones} enfocar={seMovio} />
      ) : (
        <p className="rounded-[14px] bg-cabecera p-4 text-base font-medium text-white">
          <span aria-hidden="true">⚑ </span>
          Guía completa: todos los tramos nivelados de ida y vuelta. Pasa las lecturas a la libreta y revisa el cierre
          de cada tramo; recién entonces se sabe si cumple.
        </p>
      )}

      <p className="text-xs text-tenue">
        <span aria-hidden="true" className="text-aviso">
          △{' '}
        </span>
        Lecturas aproximadas: salen del perfil con el nivel a {alturaPlan.toFixed(2)} m. Sirven para ubicarte, no para
        comprobar.
      </p>

      {paso && indice === 0 && (
        <p role="note" className="rounded-[10px] border border-marca/30 bg-marca-suave px-3 py-2 text-sm">
          <span aria-hidden="true">⚑ </span>
          <strong>Antes de empezar:</strong> lleva cota desde {bm ? `el BM ${bm.nombre}` : 'un BM'} hasta el{' '}
          {recorrido.nombresControl[0]} con una nivelación cerrada. Sin eso las cotas de los controles no están
          comprobadas y no hay con qué compararlas.
        </p>
      )}

      <div className="sticky bottom-0 -mx-4 mt-auto grid grid-cols-2 gap-2 border-t border-borde bg-fondo/95 px-4 py-2 backdrop-blur-sm sm:-mx-6 sm:px-6">
        <button type="button" className={`${BOTON} h-12 text-base`} disabled={indice === 0} onClick={() => ir(indice - 1)}>
          <span aria-hidden="true">‹</span>
          Anterior
        </button>
        {terminado ? (
          <button type="button" className={`${BOTON} h-12 text-base`} onClick={() => ir(0)}>
            Empezar de nuevo
          </button>
        ) : (
          <button type="button" className={`${BOTON_PRINCIPAL} h-12`} onClick={() => ir(indice + 1)}>
            Hecho, siguiente
            <span aria-hidden="true">›</span>
          </button>
        )}
      </div>
    </section>
  )
}

/**
 * La barra de avance: lo hecho en naranja y, encima, dónde se llega a un
 * control (cuadro azul) y dónde se clava un cambio (punto naranja).
 */
function Avance({
  pasos,
  indice,
  total,
  terminado,
}: {
  pasos: PasoGuia[]
  indice: number
  total: number
  terminado: boolean
}) {
  const x = (n: number) => `${(n / total) * 100}%`
  return (
    <div
      role="progressbar"
      aria-label="Avance de la guía"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={indice}
      aria-valuetext={terminado ? `Completo, ${total} pasos` : `Paso ${indice + 1} de ${total}`}
      className="relative mx-1.5 h-4"
    >
      <div className="absolute inset-x-0 top-1 h-2 rounded bg-borde" />
      <div className="absolute left-0 top-1 h-2 rounded bg-marca-viva" style={{ width: x(indice) }} />
      {pasos.map((p) =>
        p.llegaA ? (
          <span
            key={p.indice}
            aria-hidden="true"
            className="absolute top-0.5 h-3 w-3 -translate-x-1/2 rounded-[2px] border-2 border-fondo bg-proyecto"
            style={{ left: x(p.indice + 1) }}
          />
        ) : p.adelante.tipo === 'cambio' ? (
          <span
            key={p.indice}
            aria-hidden="true"
            className="absolute top-1 h-2 w-2 -translate-x-1/2 rounded-full border border-fondo bg-marca"
            style={{ left: x(p.indice + 1) }}
          />
        ) : null,
      )}
      {!terminado && (
        <span
          aria-hidden="true"
          className="absolute top-0 h-4 w-4 -translate-x-1/2 rounded-full border-[3px] border-marca-viva bg-cabecera"
          style={{ left: x(indice) }}
        />
      )}
    </div>
  )
}

/**
 * La orden de cerrar, corta, para la tarjeta oscura del paso: así no se pulsa
 * «Hecho, siguiente» sin haberla visto.
 */
export function recordatorioDeCierre(paso: PasoGuia): string {
  const llega = paso.llegaA!
  const tol = `± ${llega.tramo.toleranciaMm.toFixed(1)} mm`
  return paso.sentido === 'vuelta'
    ? `Antes de seguir, cierra el tramo en el ${llega.nombre}: ida y vuelta dentro de ${tol}. Si se pasa, repítelo.`
    : `Llegaste al ${llega.nombre}: compara su cota y vuelve por los mismos PC para cerrar el tramo (${tol}).`
}

/** Qué hacer si una lectura no se ve, según el borde de la mira al que está cerca. */
function consejo(l: LecturaAlLimite): string {
  const donde =
    l.cual === 'intermedia'
      ? `${NOMBRE_LECTURA.intermedia} ${formatearProgresiva(l.progresiva)}`
      : NOMBRE_LECTURA[l.cual]
  return l.lado === 'maxima'
    ? `${donde} (≈ ${l.lectura.toFixed(2)} m) queda cerca de lo más alto que se lee en la mira: si no se ve, baja el trípode o acerca el nivel al punto de abajo.`
    : `${donde} (≈ ${l.lectura.toFixed(2)} m) queda cerca del pie de la mira: si no se ve, sube el trípode o corre el nivel hacia el lado que sube.`
}

/** Las tarjetas blancas de los pasos 2 a 4. */
const TARJETA_PASO = 'flex flex-col gap-1 rounded-xl border border-borde bg-tarjeta px-4 py-3'

/**
 * Lo que se hace en una estación. Arriba, oscura, lo primero y lo último
 * (dónde plantar, qué leer adelante y, al llegar a un control, cerrar); debajo,
 * en blanco, el detalle de cada lectura.
 */
function Tarjeta({
  paso,
  opciones,
  enfocar,
}: {
  paso: PasoGuia
  opciones: Partial<OpcionesControles>
  enfocar: boolean
}) {
  const e = paso.estacion
  const idTitulo = useId()
  const refTitulo = useRef<HTMLHeadingElement>(null)
  const vuelta = paso.sentido === 'vuelta'
  const alLimite = e.alLimite || e.atras.alLimite || e.adelante.alLimite ? lecturasAlLimite(paso, opciones) : []

  // Al pasar de estación, el lector de pantalla lee la tarjeta nueva.
  useEffect(() => {
    if (enfocar) refTitulo.current?.focus()
  }, [enfocar])

  const tramo = paso.llegaA?.tramo
  const hayLecturas = paso.lecturas.length > 0
  const nAdelante = hayLecturas ? 4 : 3
  return (
    <article aria-labelledby={idTitulo} className="flex flex-col gap-2">
      <div className="flex flex-col gap-1 rounded-[14px] bg-cabecera p-4 text-white">
        <h3 id={idTitulo} ref={refTitulo} tabIndex={-1} className="text-[13px] font-medium text-cabecera-tenue outline-none">
          Estación {paso.numero} · tramo {paso.tramo}, {vuelta ? 'vuelta' : 'ida'}
        </h3>
        <div data-paso="planta">
          <p className="text-[20px] font-bold">1 · Planta el nivel</p>
          <p className="numerico text-[30px] font-bold leading-tight text-[#FDBA74]">
            ≈ {formatearProgresiva(e.progresiva)}
          </p>
          <p className="text-sm text-cabecera-texto">
            A medio camino entre atrás y adelante: así las dos visuales quedan iguales.
          </p>
        </div>
        {/*
          Lo último que se hace antes de pulsar «Hecho, siguiente» (leer adelante y, al llegar a un
          control, cerrar el tramo) va también aquí, en lo primero que se ve.
        */}
        <div className="mt-2 flex flex-col gap-1 border-t border-cabecera-borde pt-2 text-sm">
          <p aria-label="Lectura adelante" className="text-cabecera-texto">
            Adelante: {paso.adelante.nombre} ({formatearProgresiva(paso.adelante.progresiva)}) ≈{' '}
            <strong className="numerico text-white">{paso.adelante.lectura.toFixed(2)} m</strong>
          </p>
          {paso.llegaA && (
            <p role="note" aria-label="Recordatorio de cierre" className="font-semibold text-[#FDBA74]">
              <span aria-hidden="true">⚑ </span>
              {recordatorioDeCierre(paso)}
            </p>
          )}
        </div>
      </div>

      <div data-paso="atras" className={TARJETA_PASO}>
        <p className="text-[13px] text-tenue">
          2 · Mira atrás en{' '}
          <b className="text-tinta">
            {paso.atras.nombre} ({formatearProgresiva(paso.atras.progresiva)})
          </b>
        </p>
        <p className="text-base">
          Debería marcar <b className="numerico text-[20px]">≈ {paso.atras.lectura.toFixed(2)} m</b>
        </p>
      </div>

      {hayLecturas && (
        <div data-paso="progresivas" className={TARJETA_PASO}>
          <p className="text-[13px] text-tenue">3 · Lee estas progresivas</p>
          <ul aria-label="Lecturas esperadas" className="grid grid-cols-2 gap-1">
            {paso.lecturas.map((l) => (
              <li key={l.progresiva} className="rounded-lg bg-fondo px-2 py-1 text-[15px]">
                <span className="numerico">{formatearProgresiva(l.progresiva)}</span> ≈{' '}
                <span className="numerico font-semibold">{l.lectura.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div data-paso="adelante" className="flex flex-col gap-1 rounded-xl border border-marca/30 bg-marca-suave px-4 py-3">
        <p className="text-[13px] font-medium text-marca">
          {nAdelante} ·{' '}
          {paso.adelante.tipo === 'cambio' ? (
            <>
              {vuelta ? 'Pon la mira en' : 'Clava'} el {paso.adelante.nombre} en{' '}
              {formatearProgresiva(paso.adelante.progresiva)}
            </>
          ) : (
            <>
              Remata en el {paso.adelante.nombre} ({formatearProgresiva(paso.adelante.progresiva)})
            </>
          )}
        </p>
        <p className="text-base">
          y lee adelante <b className="numerico text-[20px]">≈ {paso.adelante.lectura.toFixed(2)} m</b>
        </p>

        {paso.llegaA && tramo && (
          // Color de marca y ⚑, no ✓ verde: llegar no es haber comprobado nada.
          <div
            role="note"
            aria-label="Cierre del tramo"
            className="mt-1 flex flex-col gap-1 border-t border-marca/30 pt-2 text-sm"
          >
            {vuelta ? (
              <p>
                <span aria-hidden="true">⚑ </span>
                Llegaste de vuelta al <strong>{paso.llegaA.nombre}</strong>. Cierra el tramo: la diferencia entre ida y
                vuelta debe quedar dentro de ± {tramo.toleranciaMm.toFixed(1)} mm. Si se pasa de ±{' '}
                {tramo.toleranciaMm.toFixed(1)} mm, repite el tramo antes de seguir.
              </p>
            ) : (
              <p>
                <span aria-hidden="true">⚑ </span>
                Llegaste al <strong>{paso.llegaA.nombre}</strong>. Compara su cota con la prevista ≈{' '}
                <span className="numerico">{formatearCota(paso.llegaA.control.cotaPerfil)}</span> (del perfil, sin
                comprobar) y cierra el tramo de ida y vuelta: regresa por los mismos PC hasta el control de salida.
              </p>
            )}
            {!tramo.ok && (
              <p className="text-falla">
                <span aria-hidden="true">✗ </span>
                Este tramo no cumple en el plan: {tramo.avisos.join('; ')}.
              </p>
            )}
          </div>
        )}
      </div>

      {alLimite.length > 0 ? (
        <ul aria-label="Lecturas al límite de la mira" className="flex flex-col gap-1">
          {alLimite.map((l) => (
            <li key={`${l.cual}-${l.progresiva}`}>
              <AvisoLinea tono="aviso">{consejo(l)}</AvisoLinea>
            </li>
          ))}
        </ul>
      ) : (
        e.alLimite && (
          <AvisoLinea tono="aviso">
            La visual pasa cerca del borde de la mira en un quiebre del perfil: si no se lee, mueve un poco el nivel.
          </AvisoLinea>
        )
      )}
    </article>
  )
}
