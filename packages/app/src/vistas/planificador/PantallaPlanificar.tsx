import {
  formatearPendiente,
  formatearProgresiva,
  instrumentoCompleto,
  pendientes,
  type Instrumento,
  type PlanConControles,
  type TipoMotivoControl,
  type TramoControlado,
} from '@topo/core'
import { useId, useMemo, useState, type ReactNode } from 'react'
import CampoNumero from '../../componentes/CampoNumero'
import { useEsCelular } from '../../componentes/useEsCelular'
import { BOTON_ICONO, ENLACE_PELIGRO, TARJETA } from '../../componentes/ui'
import { useAlmacen } from '../../estado/almacen'
import { cuenta, formatearCota } from '../../formato'
import { usePlanificador, type PlanificadorDeCalle } from './almacenPlanificador'
import DibujoPlan from './DibujoPlan'
import { BOTON, BOTON_PRINCIPAL, CAMPOS_GRANDES } from './estilos'
import type { FuentePerfil, Vertice } from './perfilDeLaCalle'
import { recorridoDelPlan, type PuntoDeMira } from './recorrido'
import { revisarRegla } from './reglas'
import { usePlanDeLaCalle, type PlanDeLaCalle } from './usePlanDeLaCalle'

const NOMBRE_FUENTE: Record<FuentePerfil, string> = {
  rasante: 'Rasante',
  plano: 'Cotas del plano',
  digitado: 'Digitado',
}

/** Un símbolo por motivo, siempre junto a su texto: el color nunca va solo. */
const SIMBOLO_MOTIVO: Record<TipoMotivoControl, string> = {
  inicio: '▶',
  fin: '■',
  quiebre: '∠',
  maxCambios: '#',
  error: '±',
}

const CAMPOS_INSTRUMENTO: {
  clave: keyof Instrumento
  etiqueta: string
  sufijo?: string
  decimales: number
}[] = [
  {
    clave: 'largoMira',
    etiqueta: 'Largo de la mira',
    sufijo: 'm',
    decimales: 2,
  },
  {
    clave: 'alturaInstrumento',
    etiqueta: 'Altura del instrumento',
    sufijo: 'm',
    decimales: 2,
  },
  { clave: 'visualMax', etiqueta: 'Visual máxima', sufijo: 'm', decimales: 1 },
  {
    clave: 'desequilibrioMax',
    etiqueta: 'Desequilibrio máximo',
    sufijo: 'm',
    decimales: 1,
  },
  {
    clave: 'maxCambiosPorTramo',
    etiqueta: 'Máx. cambios por tramo',
    decimales: 0,
  },
  {
    clave: 'coeficienteK',
    etiqueta: 'k de la tolerancia',
    sufijo: 'mm',
    decimales: 1,
  },
]

/**
 * «Control 1 (0+000) ≈ 1.23 m». Al centímetro: la lectura sale del perfil
 * con el trípode a la altura exacta; en campo varía, y el milímetro haría
 * creer que algo anda mal cuando no.
 */
function textoMira(p: PuntoDeMira): string {
  return `${p.nombre} (${formatearProgresiva(p.progresiva)}) ≈ ${p.lectura.toFixed(2)} m`
}

/**
 * Un tramo de una sola estación que no alcanza la cifra: el motor lo deja
 * pasar (no hay cómo mejorarlo), pero no se puede pintar como que cumple.
 */
function sinMejora(t: TramoControlado): boolean {
  return t.ok && 2 * t.errorEsperadoMm > t.toleranciaMm + 1e-3
}

function Seccion({
  titulo,
  children,
  enTarjeta = false,
}: {
  titulo: string
  children: ReactNode
  enTarjeta?: boolean
}) {
  const id = useId()
  return (
    <section aria-labelledby={id} className={`flex min-w-0 flex-col gap-3 ${enTarjeta ? TARJETA : ''}`}>
      <h3 id={id} className="text-[17px] font-semibold">
        {titulo}
      </h3>
      {children}
    </section>
  )
}

/**
 * Una tarjeta que se pliega (<details>), con el título arriba y lo que tiene
 * debajo, entero: el resumen puede pasar a una segunda línea, nunca se corta
 * con «…», porque es justo lo que se lee sin abrirla.
 */
function Apartado({
  titulo,
  resumen,
  abierto = false,
  children,
}: {
  titulo: string
  resumen?: ReactNode
  abierto?: boolean
  children: ReactNode
}) {
  const id = useId()
  return (
    <details open={abierto} className={`group min-w-0 ${TARJETA} py-1`}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 py-2 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 flex-1 flex-col">
          <h3 id={id} className="text-[15px] font-semibold leading-snug">
            {titulo}
          </h3>
          {resumen && <span className="text-[13px] leading-snug text-tenue tabular-nums">{resumen}</span>}
        </span>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-5 w-5 shrink-0 text-tenue transition-transform group-open:rotate-90"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
      </summary>
      <section aria-labelledby={id} className="flex min-w-0 flex-col gap-3 pb-3 pt-1">
        {children}
      </section>
    </details>
  )
}

/** Espacios que no se parten: un valor y su unidad van juntos en la misma línea. */
function sinCortar(texto: string): string {
  return texto.replace(/ /g, '\u00a0')
}

/** «✓ 1 cumple · ✗ 2 no cumplen»: lo que dicen los tramos sin abrirlos. */
function resumenDeTramos(plan: PlanConControles): string {
  const malos = plan.tramos.filter((t) => !t.ok).length
  const sinMejorar = plan.tramos.filter(sinMejora).length
  const buenos = plan.tramos.length - malos - sinMejorar
  const partes: string[] = []
  if (buenos > 0) partes.push(`✓ ${buenos} ${buenos === 1 ? 'cumple' : 'cumplen'}`)
  if (sinMejorar > 0) partes.push(`△ ${sinMejorar} sin mejora`)
  if (malos > 0) partes.push(`✗ ${malos} no ${malos === 1 ? 'cumple' : 'cumplen'}`)
  return partes.join(' · ')
}

/** Lo que dice el plegable del perfil sin abrirlo: «Digitado · 4 vértices · +6.00 % / +9.00 %». */
function resumenDelPerfil(datos: PlanDeLaCalle): string {
  const { fuente, perfil } = datos
  const partes = [NOMBRE_FUENTE[fuente]]
  if (fuente === 'digitado') partes.push(cuenta(perfil.length, 'vértice', 'vértices'))
  if (fuente === 'plano') partes.push(cuenta(perfil.length, 'cota', 'cotas'))
  if (datos.problemasPerfil.length > 0) partes.push('✗ no sirve todavía')
  else if (perfil.length >= 2)
    partes.push(
      pendientes(perfil)
        // Sin cortar «+6.92 %» entre el número y el signo al pasar de línea.
        .map((t) => sinCortar(formatearPendiente(t.pendientePorcentaje)))
        .join(' / '),
    )
  return partes.join(' · ')
}

/**
 * Calle › Planificar: dónde poner estaciones, puntos de cambio y puntos de
 * control para que el error no se acumule (sección 2 del diseño). Todo sale
 * de `planificarConControles` del motor; aquí solo se elige el perfil, se
 * ajustan las reglas del instrumento y se muestra el resultado. Lo decidido
 * se guarda en la calle para el plano y la guía.
 *
 * Primero el plan (cuántas estaciones, si cumple y el botón de la guía);
 * el perfil y las reglas del nivel van plegados, con lo que tienen dicho
 * debajo del título. En la laptop van a la derecha. En el celular también se
 * pliegan las listas largas (estaciones, controles, tramos): queda el
 * resumen, el dibujo y luego todo plegado, cada cosa con su línea.
 */
export default function PantallaPlanificar() {
  const abrirPantallaCalle = useAlmacen((s) => s.abrirPantallaCalle)
  const cambiarRecuerdo = usePlanificador((s) => s.cambiar)
  const datos = usePlanDeLaCalle()
  const idTitulo = useId()
  const esCelular = useEsCelular()

  const plan = datos?.plan ?? null
  const recorrido = useMemo(() => (plan ? recorridoDelPlan(plan) : null), [plan])

  if (!datos) {
    return (
      <section aria-labelledby={idTitulo} className="mx-auto flex w-full max-w-6xl flex-col gap-3 p-4 sm:p-6">
        <h2 id={idTitulo} className="text-[20px] font-bold">
          Planificar
        </h2>
        <p className="text-sm text-tenue">Elige una calle para planificar su nivelación.</p>
      </section>
    )
  }

  const { calle, fuente, disponibles, perfil } = datos
  const cambiar = (c: Partial<PlanificadorDeCalle>) => cambiarRecuerdo(calle.id, c)
  const fijarDigitados = (vertices: Vertice[]) => cambiar({ fuente: 'digitado', digitados: vertices })

  function elegirFuente(f: FuentePerfil) {
    // Al pasar a «Digitado» por primera vez se copia el perfil que se veía,
    // para empezar de algo. Si la calle ya tiene sus vértices escritos, se
    // vuelve a ellos: copiar encima los borraría sin aviso.
    if (f === 'digitado' && fuente !== 'digitado' && !datos!.tieneDigitados) fijarDigitados(perfil)
    else cambiar({ fuente: f })
  }

  const pasosIda = recorrido?.pasos.filter((p) => p.sentido === 'ida') ?? []
  const fuentes = Object.keys(NOMBRE_FUENTE) as FuentePerfil[]
  const totalCambios = plan?.tramos.reduce((s, t) => s + t.cambios, 0) ?? 0

  return (
    <section aria-labelledby={idTitulo} className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 sm:p-6">
      <header>
        <h2 id={idTitulo} className="text-[20px] font-bold leading-tight">
          Planificar
        </h2>
        <p className="text-[13px] text-tenue">
          {calle.nombre}: dónde plantar el nivel, dónde clavar los cambios y dónde dejar puntos de control.
        </p>
      </header>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className={`${TARJETA} flex flex-col gap-3`}>
            {plan?.posible && pasosIda.length > 0 && (
              <p className="text-[17px] font-semibold tabular-nums">
                {cuenta(pasosIda.length, 'estación', 'estaciones')} · {cuenta(totalCambios, 'cambio', 'cambios')} ·{' '}
                {cuenta(plan.controles.length, 'control', 'controles')}
              </p>
            )}
            {datos.problemasPerfil.length > 0 ? (
              <p role="alert" className="flex gap-2 rounded-[10px] bg-falla-suave px-3 py-2 text-sm text-falla">
                <span aria-hidden="true">✗</span>
                <span>El perfil no sirve todavía: {datos.problemasPerfil.join('; ')}.</span>
              </p>
            ) : (
              plan && <Veredicto plan={plan} />
            )}
            <button
              type="button"
              onClick={() => abrirPantallaCalle('guia')}
              className={`${BOTON_PRINCIPAL} w-full sm:w-auto sm:self-start`}
            >
              Guía de campo
            </button>
          </div>

          {plan && recorrido && (
            <>
              {plan.controles.length > 0 && (
                <p className="flex gap-2 rounded-[10px] bg-aviso-suave px-3 py-2 text-[13px] text-aviso">
                  <span aria-hidden="true">△</span>
                  <span>
                    Sin comprobar: las cotas de los controles y las lecturas salen del perfil, no de una nivelación
                    cerrada. Un control recién tiene cota cuando una nivelación cerrada desde un BM se la da.
                  </span>
                </p>
              )}

              {pasosIda.length > 0 && (
                <Seccion titulo="Perfil y dónde poner el nivel" enTarjeta>
                  <DibujoPlan perfil={perfil} plan={plan} recorrido={recorrido} />
                </Seccion>
              )}

              {pasosIda.length > 0 && (
                <Apartado
                  titulo="Estaciones"
                  resumen={`${cuenta(pasosIda.length, 'estación', 'estaciones')} de ida · dónde plantar y qué leer`}
                  abierto={!esCelular}
                >
                  <p className="text-[13px] text-tenue">
                    Lecturas de ida, aproximadas al centímetro. La vuelta usa las mismas estaciones y los mismos PC, al
                    revés.
                  </p>
                  <table aria-label="Estaciones del plan" className="w-full text-sm">
                    <thead className="hidden text-left text-xs text-tenue sm:table-header-group">
                      <tr>
                        <th className="p-2">Estación</th>
                        <th className="p-2">Plantar en</th>
                        <th className="p-2">Lee atrás</th>
                        <th className="p-2">Cubre</th>
                        <th className="p-2">Lee adelante</th>
                      </tr>
                    </thead>
                    <tbody className="flex flex-col gap-2 sm:table-row-group">
                      {pasosIda.map((p) => (
                        <tr
                          key={p.numero}
                          className="block rounded-[10px] border border-borde p-2 sm:table-row sm:rounded-none sm:border-0 sm:border-t sm:p-0"
                        >
                          <th scope="row" className="block p-1 text-left font-semibold sm:table-cell sm:p-2">
                            E{p.numero}
                            {p.estacion.alLimite && (
                              <span className="ml-1 text-xs font-normal text-aviso">
                                <span aria-hidden="true">△</span> lectura al límite
                              </span>
                            )}
                          </th>
                          <Celda etiqueta="Plantar en">≈ {formatearProgresiva(p.estacion.progresiva)}</Celda>
                          <Celda etiqueta="Lee atrás">{textoMira(p.atras)}</Celda>
                          <Celda etiqueta="Cubre">
                            {p.lecturas.length === 0
                              ? '—'
                              : p.lecturas
                                  .map((l) => `${formatearProgresiva(l.progresiva)} ≈ ${l.lectura.toFixed(2)}`)
                                  .join(' · ')}
                          </Celda>
                          <Celda etiqueta="Lee adelante">{textoMira(p.adelante)}</Celda>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Apartado>
              )}

              {plan.controles.length > 0 && (
                <Apartado
                  titulo="Puntos de control"
                  resumen={`${plan.controles.length}: ${plan.controles.map((c) => formatearProgresiva(c.progresiva)).join(' · ')}`}
                  abierto={!esCelular}
                >
                  <ol aria-label="Puntos de control" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {plan.controles.map((c, i) => (
                      <li key={c.progresiva} className="rounded-[10px] border border-borde p-3">
                        <p className="font-semibold">
                          {/* Azul del proyecto, no verde: la estaca aún no tiene cota comprobada. */}
                          <span aria-hidden="true" className="text-proyecto">
                            ■{' '}
                          </span>
                          Control {i + 1} · {formatearProgresiva(c.progresiva)}
                        </p>
                        <p className="text-xs text-tenue">
                          Cota prevista <span className="numerico">{formatearCota(c.cotaPerfil)}</span> (del perfil, sin
                          comprobar)
                        </p>
                        <ul className="mt-1 text-sm">
                          {c.motivos.map((m, j) => (
                            <li key={j}>
                              <span aria-hidden="true">{SIMBOLO_MOTIVO[m.tipo]} </span>
                              {m.texto}
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ol>
                </Apartado>
              )}

              {plan.tramos.length > 0 && (
                <Apartado titulo="Tramos entre controles" resumen={resumenDeTramos(plan)} abierto={!esCelular}>
                  <p className="text-[13px] text-tenue">
                    Cada tramo se nivela ida y vuelta y cierra por su cuenta. Cumple si el doble del error esperado no
                    pasa de la tolerancia.
                  </p>
                  <ol aria-label="Tramos entre controles" className="grid gap-2 sm:grid-cols-2">
                    {plan.tramos.map((t, i) => {
                      const [simbolo, texto, claseTexto, claseBorde] = !t.ok
                        ? ['✗', 'No cumple', 'text-falla', 'border-falla/40 bg-falla-suave']
                        : sinMejora(t)
                          ? ['△', 'No se puede mejorar (una estación)', 'text-aviso', 'border-aviso/40 bg-aviso-suave']
                          : ['✓', 'Cumple', 'text-pasa', 'border-borde']
                      return (
                        <li key={`${t.desde}-${t.hasta}`} className={`rounded-[10px] border p-3 text-sm ${claseBorde}`}>
                          <p className="font-semibold">
                            Tramo {i + 1}: {formatearProgresiva(t.desde)} a {formatearProgresiva(t.hasta)}
                          </p>
                          <p>
                            {cuenta(t.estaciones, 'estación', 'estaciones')}, {cuenta(t.cambios, 'cambio', 'cambios')}
                          </p>
                          <p className="text-tenue">
                            Error esperado ida y vuelta: 2 × {t.errorEsperadoMm.toFixed(2)} ={' '}
                            {(2 * t.errorEsperadoMm).toFixed(2)} mm · tolerancia {t.toleranciaMm.toFixed(2)} mm
                          </p>
                          <p className={`font-semibold ${claseTexto}`}>
                            <span aria-hidden="true">{simbolo} </span>
                            {texto}
                          </p>
                          {t.avisos.map((a) => (
                            <p key={a} className="text-falla">
                              <span aria-hidden="true">✗ </span>
                              {a}
                            </p>
                          ))}
                          {t.notas.map((n) => (
                            <p key={n} className="text-aviso">
                              <span aria-hidden="true">△ </span>
                              {n}
                            </p>
                          ))}
                        </li>
                      )
                    })}
                  </ol>
                </Apartado>
              )}

              {plan.posible && <BloqueGuardar datos={datos} plan={plan} />}
            </>
          )}
        </div>

        <aside aria-label="Perfil y reglas" className="flex min-w-0 flex-col gap-3">
          <Apartado
            titulo="Perfil de la pista"
            resumen={resumenDelPerfil(datos)}
            abierto={datos.problemasPerfil.length > 0 || datos.perfilDeEjemplo}
          >
            <div className="flex flex-col gap-3">
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-[13px] font-medium text-tenue">De dónde sale el perfil</legend>
                <div className="flex gap-1 rounded-xl bg-borde/60 p-1 dark:bg-cabecera-2">
                  {fuentes.map((f) => (
                    <label
                      key={f}
                      className={`relative inline-flex min-h-11 flex-auto cursor-pointer items-center justify-center whitespace-nowrap rounded-[9px] px-2 text-sm font-semibold has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-40 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-marca/40 ${
                        fuente === f ? 'bg-tarjeta text-tinta shadow-sm' : 'text-tenue hover:text-tinta'
                      }`}
                    >
                      {/* El radio cubre la opción entera (invisible): se toca toda la cápsula y sigue siendo un radio. */}
                      <input
                        type="radio"
                        name={`fuente-${calle.id}`}
                        value={f}
                        checked={fuente === f}
                        disabled={disponibles[f] !== null}
                        onChange={() => elegirFuente(f)}
                        className="absolute inset-0 m-0 cursor-pointer appearance-none rounded-[9px] opacity-0 disabled:cursor-not-allowed"
                      />
                      {NOMBRE_FUENTE[f]}
                    </label>
                  ))}
                </div>
              </fieldset>
              {fuentes.some((f) => disponibles[f] !== null) && (
                <ul className="text-xs text-tenue">
                  {fuentes
                    .filter((f) => disponibles[f] !== null)
                    .map((f) => (
                      <li key={f}>
                        {NOMBRE_FUENTE[f]}: {disponibles[f]}.
                      </li>
                    ))}
                </ul>
              )}

              {fuente === 'rasante' && calle.rasante && (
                <>
                  <p className="text-sm text-tenue">
                    La rasante tiene una sola pendiente ({formatearPendiente(calle.rasante.pendienteLongitudinal)}): no
                    trae quiebres. Si la pista los tiene, usa «Digitado» y escribe sus vértices.
                  </p>
                  <div className={`grid grid-cols-2 gap-3 ${CAMPOS_GRANDES}`}>
                    <CampoNumero
                      etiqueta="Desde (m)"
                      valor={datos.desde}
                      decimales={2}
                      confirmarAlSalir
                      alCambiar={(v) => cambiar({ desde: v })}
                    />
                    <CampoNumero
                      etiqueta="Hasta (m)"
                      valor={datos.hasta}
                      decimales={2}
                      confirmarAlSalir
                      alCambiar={(v) => cambiar({ hasta: v })}
                    />
                  </div>
                </>
              )}

              {fuente === 'plano' && (
                <p className="text-sm text-tenue">
                  {cuenta(perfil.length, 'cota leída', 'cotas leídas')} del plano a lo largo de la pista.
                  {datos.cotasPlano.conflictos.length > 0 &&
                    ` △ ${cuenta(datos.cotasPlano.conflictos.length, 'estaca tiene', 'estacas tienen')} cotas distintas y no entran: elígelas en Obra › Plano.`}
                </p>
              )}

              {fuente === 'digitado' && datos.perfilDeEjemplo && (
                <p className="flex gap-2 rounded-[10px] bg-aviso-suave px-3 py-2 text-sm text-aviso">
                  <span aria-hidden="true">△</span>
                  <span>
                    La calle no tiene rasante ni cotas del plano. Estos vértices son de ejemplo (cota 100): escribe las
                    cotas de la pista para planificar.
                  </span>
                </p>
              )}

              {fuente === 'digitado' && <EditorVertices vertices={perfil} alCambiar={fijarDigitados} />}

              {datos.problemasPerfil.length === 0 && (
                <ul aria-label="Pendientes del perfil" className="flex flex-wrap gap-2 text-xs">
                  {pendientes(perfil).map((t) => (
                    <li key={t.desde} className="numerico rounded-lg bg-fondo px-2 py-1">
                      {formatearProgresiva(t.desde)} a {formatearProgresiva(t.hasta)}:{' '}
                      {formatearPendiente(t.pendientePorcentaje)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Apartado>

          <ReglasDelNivel />
        </aside>
      </div>
    </section>
  )
}

/** Guardar el plan en la calle, decir si lo guardado es otro, y quitarlo (con confirmación). */
function BloqueGuardar({ datos, plan }: { datos: PlanDeLaCalle; plan: PlanConControles }) {
  const fijarPlanControles = useAlmacen((s) => s.fijarPlanControles)
  const [confirmando, setConfirmando] = useState(false)
  const { calle } = datos
  const guardados = calle.planControles?.controles.length ?? 0

  function guardar() {
    fijarPlanControles(calle.id, {
      opciones: datos.opciones,
      controles: plan.controles.map((c) => ({
        progresiva: c.progresiva,
        cota: c.cotaPerfil,
        motivos: c.motivos,
      })),
    })
  }

  return (
    <div className={`${TARJETA} flex flex-col gap-2`}>
      <div className="text-sm" role="status">
        {datos.guardadoAlDia ? (
          <p className="font-medium text-pasa">
            <span aria-hidden="true">✓ </span>Guardado en la calle: sale en el plano y en la guía.
          </p>
        ) : calle.planControles ? (
          <div className="text-aviso">
            <p>
              <span aria-hidden="true">△ </span>La calle guarda otro plan: es el que siguen el plano y la guía.
              {datos.diferencias.length > 0 && ` Diferencias: ${datos.diferencias.join('; ')}.`}
            </p>
            <p className="text-tenue">
              Si ya clavaste sus estacas, no lo reemplaces: vuelve al perfil y las reglas con que se guardó.
            </p>
          </div>
        ) : (
          <p className="text-tenue">Todavía no se guardó en la calle.</p>
        )}
      </div>
      {confirmando ? (
        <div role="group" aria-label="Confirmar quitar el plan" className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium">
            ¿Quitar {guardados === 1 ? 'el control guardado' : `los ${guardados} controles guardados`} de la calle?
            Dejan de salir en el plano y en la guía.
          </p>
          <button
            type="button"
            className={`${BOTON} border-falla text-falla`}
            onClick={() => {
              fijarPlanControles(calle.id, null)
              setConfirmando(false)
            }}
          >
            Sí, quitar
          </button>
          <button type="button" className={BOTON} onClick={() => setConfirmando(false)}>
            Cancelar
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {calle.planControles && (
            <button type="button" className={ENLACE_PELIGRO} onClick={() => setConfirmando(true)}>
              Quitar el plan guardado
            </button>
          )}
          <button type="button" className={BOTON} disabled={datos.guardadoAlDia} onClick={guardar}>
            Guardar en la calle
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Las reglas del instrumento de la obra. Cada valor se revisa antes de
 * guardarlo: son de toda la obra, y un error de dedo cambiaría lo que acepta
 * la libreta. Si no sirve, se dice junto al campo y no se guarda.
 */
function ReglasDelNivel() {
  const fijarInstrumento = useAlmacen((s) => s.fijarInstrumento)
  const parcial = useAlmacen((s) => s.proyecto.instrumento)
  const instrumento = instrumentoCompleto(parcial)
  const [errores, setErrores] = useState<Partial<Record<keyof Instrumento, string>>>({})
  const idBase = useId()

  function fijar(clave: keyof Instrumento, valor: number) {
    const problema = revisarRegla(clave, valor, parcial)
    setErrores((e) => ({ ...e, [clave]: problema ?? undefined }))
    if (problema === null) fijarInstrumento({ [clave]: valor })
  }

  const hayErrores = Object.values(errores).some(Boolean)
  const resumen =
    `Tu equipo: ${sinCortar(`mira ${Number(instrumento.largoMira.toFixed(2))} m`)} · ` +
    `${sinCortar(`instrumento ${instrumento.alturaInstrumento.toFixed(2)} m`)} · ` +
    sinCortar(`visual ≤ ${Number(instrumento.visualMax.toFixed(1))} m`)

  return (
    <Apartado titulo="Reglas del nivel" resumen={resumen} abierto={hayErrores}>
      <div className="flex flex-col gap-3">
        <p className="text-[13px] text-tenue">
          Son las de toda la obra: también las usan la libreta, el aviso al anotar y el replanteo.
        </p>
        <div className={`grid grid-cols-2 gap-3 ${CAMPOS_GRANDES}`}>
          {CAMPOS_INSTRUMENTO.map((c) => (
            <div key={c.clave} className="flex min-w-0 flex-col gap-1">
              <CampoNumero
                etiqueta={c.etiqueta}
                valor={instrumento[c.clave]}
                decimales={c.decimales}
                sufijo={c.sufijo}
                confirmarAlSalir
                alCambiar={(v) => fijar(c.clave, v)}
              />
              {errores[c.clave] && (
                <p id={`${idBase}-${c.clave}`} role="alert" className="text-xs text-falla">
                  <span aria-hidden="true">✗ </span>
                  {c.etiqueta}: {errores[c.clave]}. No se guardó.
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </Apartado>
  )
}

function Celda({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <td className="block p-1 sm:table-cell sm:p-2">
      <span className="text-xs text-tenue sm:hidden">{etiqueta}: </span>
      {children}
    </td>
  )
}

function Veredicto({ plan }: { plan: PlanConControles }) {
  const malos = plan.tramos.filter((t) => !t.ok).length
  const [simbolo, clase, texto] = !plan.posible
    ? ['✗', 'bg-falla-suave text-falla', `No se puede nivelar con estas reglas: ${plan.motivo}.`]
    : !plan.ok
      ? [
          '✗',
          'bg-falla-suave text-falla',
          `${cuenta(malos, 'tramo no cumple', 'tramos no cumplen')}: mira los avisos de cada tramo.`,
        ]
      : plan.notas.length > 0
        ? [
            '△',
            'bg-aviso-suave text-aviso',
            `El plan cumple, con ${cuenta(plan.notas.length, 'nota', 'notas')} para tener en cuenta.`,
          ]
        : ['✓', 'bg-pasa-suave text-pasa', 'El plan cumple: todos los tramos cierran dentro de su tolerancia.']
  return (
    <p className={`rounded-[10px] px-3 py-2 text-sm font-semibold ${clase}`}>
      <span aria-hidden="true">{simbolo} </span>
      {texto}
    </p>
  )
}

/** Los vértices del perfil digitado: progresiva y cota, uno por fila. */
function EditorVertices({ vertices, alCambiar }: { vertices: Vertice[]; alCambiar: (v: Vertice[]) => void }) {
  const cambiarEn = (i: number, cambio: Partial<Vertice>) =>
    alCambiar(vertices.map((v, j) => (j === i ? { ...v, ...cambio } : v)))
  const FILA = 'grid grid-cols-[2rem_minmax(0,1fr)_minmax(0,1fr)_44px] items-center gap-2'
  return (
    <div className={`flex flex-col gap-2 ${CAMPOS_GRANDES}`}>
      <div aria-hidden="true" className={`${FILA} text-[13px] font-medium text-tenue`}>
        <span>#</span>
        <span>Progresiva (m)</span>
        <span>Cota (m)</span>
        <span />
      </div>
      <ol aria-label="Vértices del perfil" className="flex flex-col gap-2">
        {vertices.map((v, i) => (
          <li key={i} className={FILA}>
            <span className="numerico text-sm text-tenue">{i + 1}</span>
            <CampoNumero
              ariaLabel={`Progresiva del vértice ${i + 1}`}
              valor={v.progresiva}
              decimales={2}
              confirmarAlSalir
              alCambiar={(n) => cambiarEn(i, { progresiva: n })}
            />
            <CampoNumero
              ariaLabel={`Cota del vértice ${i + 1}`}
              valor={v.cota}
              confirmarAlSalir
              alCambiar={(n) => cambiarEn(i, { cota: n })}
            />
            <button
              type="button"
              className={`${BOTON_ICONO} text-xl text-tenue disabled:opacity-40`}
              disabled={vertices.length <= 2}
              aria-label={`Quitar el vértice ${i + 1}`}
              title={`Quitar el vértice ${i + 1}`}
              onClick={() => alCambiar(vertices.filter((_, j) => j !== i))}
            >
              <span aria-hidden="true">×</span>
            </button>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className={`${BOTON} self-start`}
        onClick={() => {
          const ultimo = vertices[vertices.length - 1]
          alCambiar([
            ...vertices,
            {
              progresiva: (ultimo?.progresiva ?? 0) + 20,
              cota: ultimo?.cota ?? 100,
            },
          ])
        }}
      >
        <span aria-hidden="true">+</span>
        Agregar vértice
      </button>
    </div>
  )
}
