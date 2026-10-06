import { formatearProgresiva, instrumentoCompleto, type OpcionesControles, type PlanConControles } from '@topo/core'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
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

/**
 * Calle › Planificar › Guía de campo: el plan, una estación por pantalla,
 * para seguirlo con el celular en la mano. Cada tramo va de ida y luego de
 * vuelta, y al llegar a un control se recuerda comparar su cota y cerrar el
 * tramo: así el error de un tramo no pasa al siguiente.
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

  const volver = (
    <button type="button" onClick={() => abrirPantallaCalle('planificar')} className={`${BOTON} self-start`}>
      Volver a Planificar
    </button>
  )

  const titulo = (
    <h2 id={idTitulo} className="text-lg font-semibold">
      Guía de campo
    </h2>
  )

  if (!datos || !plan || !recorrido || recorrido.pasos.length === 0) {
    return (
      <section aria-labelledby={idTitulo} className="mx-auto flex w-full max-w-xl flex-col gap-3 p-4 sm:p-6">
        {titulo}
        <p className="rounded border border-falla bg-falla/10 p-3 text-sm text-falla">
          <span aria-hidden="true">✗ </span>
          {!datos
            ? 'Elige una calle para ver su guía.'
            : plan && !plan.posible
              ? `No hay guía: ${plan.motivo}.`
              : 'No hay guía: el perfil de la calle no sirve todavía. Arréglalo en Planificar.'}
        </p>
        {volver}
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
  const altura = instrumentoCompleto(instrumento).alturaInstrumento
  const alturaPlan = opciones.alturaInstrumento ?? altura

  // El BM de donde se lleva cota al primer control: el de la última toma de la calle, o el único de la obra.
  const ultimaToma = datos.calle.nivelaciones.at(-1)?.tomas.at(-1)
  const bm = bms.find((b) => b.id === ultimaToma?.bmInicialId) ?? (bms.length === 1 ? bms[0] : undefined)
  const tramosMalos = plan.tramos.filter((t) => !t.ok).length

  return (
    <section aria-labelledby={idTitulo} className="mx-auto flex w-full max-w-xl flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          {titulo}
          <p className="text-sm text-slate-600 dark:text-slate-300">{datos.calle.nombre}</p>
        </div>
        {volver}
      </header>

      {sigueGuardado ? (
        datos.diferencias.length > 0 && (
          <p className="rounded border border-aviso bg-aviso/10 p-2 text-sm text-aviso">
            <span aria-hidden="true">△ </span>
            Esta guía sigue el plan guardado en la calle (el del plano, con el que se clavan las estacas). En Planificar
            se ve otro sin guardar: {datos.diferencias.join('; ')}.
          </p>
        )
      ) : (
        <p className="rounded border border-aviso bg-aviso/10 p-2 text-xs text-aviso">
          <span aria-hidden="true">△ </span>
          Este plan no está guardado en la calle: guárdalo en Planificar para que sus controles salgan en el plano.
        </p>
      )}
      {sigueGuardado && !datos.guardado!.coincide && (
        <p className="rounded border border-aviso bg-aviso/10 p-2 text-sm text-aviso">
          <span aria-hidden="true">△ </span>
          Al rehacer el plan guardado salen controles algo distintos de los guardados: ubícate por las estacas clavadas
          y revisa el plan en Planificar.
        </p>
      )}

      {pasoDeOtroPlan && (
        <p role="status" className="rounded border border-aviso bg-aviso/10 p-2 text-sm text-aviso">
          <span aria-hidden="true">△ </span>
          El plan cambió desde que dejaste la guía en el paso {(pasoGuardado ?? 0) + 1}: los pasos ya no caen en el
          mismo lugar, así que la guía volvió al inicio. Busca la estación donde te quedaste.
        </p>
      )}

      {!plan.ok && (
        <div className="rounded border border-falla bg-falla/10 p-2 text-sm text-falla">
          <p className="font-medium">
            <span aria-hidden="true">✗ </span>
            {cuenta(tramosMalos, 'tramo no cumple', 'tramos no cumplen')}: su cierre puede salir fuera de la tolerancia.
          </p>
          <ul className="list-disc pl-5 text-xs">
            {plan.avisos.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-slate-600 dark:text-slate-300">
        <span aria-hidden="true" className="text-aviso">
          △{' '}
        </span>
        Lecturas aproximadas: salen del perfil con el nivel a {alturaPlan.toFixed(2)} m. Sirven para ubicarte, no para
        comprobar.
      </p>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">
          {terminado
            ? `Recorrido completo: ${total} de ${total} pasos`
            : `Paso ${indice + 1} de ${total} · tramo ${paso!.tramo} de ${plan.tramos.length}, ${paso!.sentido}`}
        </p>
        <div
          role="progressbar"
          aria-label="Avance de la guía"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={indice}
          aria-valuetext={terminado ? `Completo, ${total} pasos` : `Paso ${indice + 1} de ${total}`}
          className="flex h-3 items-center gap-0.5"
        >
          {recorrido.pasos.map((p) => (
            <span
              key={p.indice}
              className={`flex-1 rounded-sm ${
                p.indice < indice
                  ? 'h-2 bg-marca/60'
                  : p.indice === indice
                    ? 'h-3 bg-marca'
                    : 'h-2 bg-slate-200 dark:bg-slate-700'
              } ${p.llegaA ? 'mr-1' : ''}`}
            />
          ))}
        </div>
        <p className="text-sm text-slate-700 dark:text-slate-200">
          Ida: estaciones {hecho.estaciones} de {recorrido.totalEstaciones} · Cambios {hecho.cambios} de{' '}
          {recorrido.totalCambios} · Controles {hecho.controles} de {recorrido.nombresControl.length}
        </p>
      </div>

      {paso && indice === 0 && (
        <p role="note" className="rounded border border-marca bg-marca/10 p-3 text-sm">
          <span aria-hidden="true">⚑ </span>
          <strong>Antes de empezar:</strong> lleva cota desde {bm ? `el BM ${bm.nombre}` : 'un BM'} hasta el{' '}
          {recorrido.nombresControl[0]} con una nivelación cerrada. Sin eso las cotas de los controles no están
          comprobadas y no hay con qué compararlas.
        </p>
      )}

      {paso ? (
        <Tarjeta key={paso.indice} paso={paso} opciones={opciones} enfocar={seMovio} />
      ) : (
        <p className="rounded border border-marca bg-marca/10 p-4 text-sm font-medium">
          <span aria-hidden="true">⚑ </span>
          Guía completa: todos los tramos nivelados de ida y vuelta. Pasa las lecturas a la libreta y revisa el cierre
          de cada tramo; recién entonces se sabe si cumple.
        </p>
      )}

      <div className="sticky bottom-0 grid grid-cols-2 gap-2 bg-white py-2 dark:bg-slate-950">
        {/*
          En el celular el final de la tarjeta puede quedar bajo el borde. Lo último que se hace antes de
          pulsar «Hecho, siguiente» (leer adelante y, al llegar a un control, cerrar el tramo) va junto al botón.
        */}
        {paso && (
          <p aria-label="Lectura adelante" className="col-span-2 text-sm">
            Adelante: {paso.adelante.nombre} ({formatearProgresiva(paso.adelante.progresiva)}) ≈{' '}
            <strong className="numerico">{paso.adelante.lectura.toFixed(2)} m</strong>
          </p>
        )}
        {paso?.llegaA && (
          <p
            role="note"
            aria-label="Recordatorio de cierre"
            className="col-span-2 rounded border border-marca bg-marca/10 px-2 py-1 text-sm font-medium"
          >
            <span aria-hidden="true">⚑ </span>
            {recordatorioDeCierre(paso)}
          </p>
        )}
        <button type="button" className={BOTON} disabled={indice === 0} onClick={() => ir(indice - 1)}>
          Anterior
        </button>
        {terminado ? (
          <button type="button" className={BOTON} onClick={() => ir(0)}>
            Empezar de nuevo
          </button>
        ) : (
          <button type="button" className={BOTON_PRINCIPAL} onClick={() => ir(indice + 1)}>
            Hecho, siguiente
          </button>
        )}
      </div>
    </section>
  )
}

/**
 * La orden de cerrar, corta, para la barra del botón: así no se pulsa
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
  return (
    <article
      aria-labelledby={idTitulo}
      className="flex flex-col gap-3 rounded border border-slate-200 p-4 text-base dark:border-slate-800"
    >
      <h3 id={idTitulo} ref={refTitulo} tabIndex={-1} className="text-base font-semibold outline-none">
        Estación {paso.numero} · tramo {paso.tramo}, {vuelta ? 'vuelta' : 'ida'}
      </h3>
      <ol className="flex list-decimal flex-col gap-3 pl-5">
        <li>
          Planta el nivel en ≈ <strong className="numerico">{formatearProgresiva(e.progresiva)}</strong>
          <span className="block text-sm text-slate-500 dark:text-slate-400">
            A medio camino entre atrás y adelante: así las dos visuales quedan iguales.
          </span>
        </li>
        <li>
          Mira atrás en {paso.atras.nombre} ({formatearProgresiva(paso.atras.progresiva)}): debería marcar ≈{' '}
          <strong className="numerico">{paso.atras.lectura.toFixed(2)} m</strong>
        </li>
        {paso.lecturas.length > 0 && (
          <li>
            Lee estas progresivas:
            <ul aria-label="Lecturas esperadas" className="mt-1 grid grid-cols-2 gap-1 text-sm">
              {paso.lecturas.map((l) => (
                <li key={l.progresiva} className="rounded bg-slate-100 px-2 py-1 dark:bg-slate-800">
                  {formatearProgresiva(l.progresiva)} ≈ <span className="numerico">{l.lectura.toFixed(2)}</span>
                </li>
              ))}
            </ul>
          </li>
        )}
        <li>
          {paso.adelante.tipo === 'cambio' ? (
            <>
              {vuelta ? 'Pon la mira en' : 'Clava'} el {paso.adelante.nombre} en{' '}
              {formatearProgresiva(paso.adelante.progresiva)}
            </>
          ) : (
            <>
              Remata en el {paso.adelante.nombre} ({formatearProgresiva(paso.adelante.progresiva)})
            </>
          )}{' '}
          y lee adelante ≈ <strong className="numerico">{paso.adelante.lectura.toFixed(2)} m</strong>
        </li>
      </ol>

      {alLimite.length > 0 ? (
        <ul aria-label="Lecturas al límite de la mira" className="flex flex-col gap-1 text-sm text-aviso">
          {alLimite.map((l) => (
            <li key={`${l.cual}-${l.progresiva}`}>
              <span aria-hidden="true">△ </span>
              {consejo(l)}
            </li>
          ))}
        </ul>
      ) : (
        e.alLimite && (
          <p className="text-sm text-aviso">
            <span aria-hidden="true">△ </span>
            La visual pasa cerca del borde de la mira en un quiebre del perfil: si no se lee, mueve un poco el nivel.
          </p>
        )
      )}

      {paso.llegaA && tramo && (
        // Color de marca y ⚑, no ✓ verde: llegar no es haber comprobado nada.
        <div role="note" className="flex flex-col gap-1 rounded border border-marca bg-marca/10 p-3 text-sm">
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
              {formatearCota(paso.llegaA.control.cotaPerfil)} (del perfil, sin comprobar) y cierra el tramo de ida y
              vuelta: regresa por los mismos PC hasta el control de salida.
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
    </article>
  )
}
