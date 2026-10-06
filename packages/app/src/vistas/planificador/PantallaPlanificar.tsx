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

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h3 id={id} className="text-base font-semibold">
        {titulo}
      </h3>
      {children}
    </section>
  )
}

/**
 * Calle › Planificar: dónde poner estaciones, puntos de cambio y puntos de
 * control para que el error no se acumule (sección 2 del diseño). Todo sale
 * de `planificarConControles` del motor; aquí solo se elige el perfil, se
 * ajustan las reglas del instrumento y se muestra el resultado. Lo decidido
 * se guarda en la calle para el plano y la guía.
 */
export default function PantallaPlanificar() {
  const abrirPantallaCalle = useAlmacen((s) => s.abrirPantallaCalle)
  const cambiarRecuerdo = usePlanificador((s) => s.cambiar)
  const datos = usePlanDeLaCalle()
  const idTitulo = useId()

  const plan = datos?.plan ?? null
  const recorrido = useMemo(() => (plan ? recorridoDelPlan(plan) : null), [plan])

  if (!datos) {
    return (
      <section aria-labelledby={idTitulo} className="mx-auto flex max-w-5xl flex-col gap-3 p-4 sm:p-6">
        <h2 id={idTitulo} className="text-lg font-semibold">
          Planificar
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">Elige una calle para planificar su nivelación.</p>
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

  return (
    <section aria-labelledby={idTitulo} className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id={idTitulo} className="text-lg font-semibold">
            Planificar
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {calle.nombre}: dónde plantar el nivel, dónde clavar los cambios y dónde dejar puntos de control.
          </p>
        </div>
        <button type="button" onClick={() => abrirPantallaCalle('guia')} className={BOTON_PRINCIPAL}>
          Guía de campo
        </button>
      </header>

      <Seccion titulo="Perfil de la pista">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm text-slate-600 dark:text-slate-300">De dónde sale el perfil</legend>
          <div className="flex flex-wrap gap-2">
            {fuentes.map((f) => (
              <label
                key={f}
                className={`${BOTON} flex cursor-pointer items-center gap-2 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 ${
                  fuente === f ? 'border-marca bg-marca/10 font-medium text-marca' : ''
                }`}
              >
                <input
                  type="radio"
                  name={`fuente-${calle.id}`}
                  value={f}
                  checked={fuente === f}
                  disabled={disponibles[f] !== null}
                  onChange={() => elegirFuente(f)}
                  className="size-4 accent-marca"
                />
                {NOMBRE_FUENTE[f]}
              </label>
            ))}
          </div>
        </fieldset>
        {fuentes.some((f) => disponibles[f] !== null) && (
          <ul className="text-xs text-slate-500 dark:text-slate-400">
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
            <p className="text-sm text-slate-600 dark:text-slate-300">
              La rasante tiene una sola pendiente ({formatearPendiente(calle.rasante.pendienteLongitudinal)}): no trae
              quiebres. Si la pista los tiene, usa «Digitado» y escribe sus vértices.
            </p>
            <div className={`grid grid-cols-2 gap-3 sm:max-w-md ${CAMPOS_GRANDES}`}>
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
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {cuenta(perfil.length, 'cota leída', 'cotas leídas')} del plano a lo largo de la pista.
            {datos.cotasPlano.conflictos.length > 0 &&
              ` △ ${cuenta(datos.cotasPlano.conflictos.length, 'estaca tiene', 'estacas tienen')} cotas distintas y no entran: elígelas en Obra › Plano.`}
          </p>
        )}

        {fuente === 'digitado' && datos.perfilDeEjemplo && (
          <p className="rounded border border-aviso bg-aviso/10 p-2 text-sm text-aviso">
            <span aria-hidden="true">△ </span>
            La calle no tiene rasante ni cotas del plano. Estos vértices son de ejemplo (cota 100): escribe las cotas de
            la pista para planificar.
          </p>
        )}

        {fuente === 'digitado' && <EditorVertices vertices={perfil} alCambiar={fijarDigitados} />}

        {datos.problemasPerfil.length === 0 && (
          <ul aria-label="Pendientes del perfil" className="flex flex-wrap gap-2 text-xs">
            {pendientes(perfil).map((t) => (
              <li key={t.desde} className="rounded bg-slate-100 px-2 py-1 dark:bg-slate-800">
                {formatearProgresiva(t.desde)} a {formatearProgresiva(t.hasta)}:{' '}
                {formatearPendiente(t.pendientePorcentaje)}
              </li>
            ))}
          </ul>
        )}
      </Seccion>

      <ReglasDelNivel />

      {datos.problemasPerfil.length > 0 && (
        <p role="alert" className="rounded border border-falla bg-falla/10 p-3 text-sm text-falla">
          <span aria-hidden="true">✗ </span>
          El perfil no sirve todavía: {datos.problemasPerfil.join('; ')}.
        </p>
      )}

      {plan && recorrido && (
        <>
          <Veredicto plan={plan} />

          {plan.controles.length > 0 && (
            <p className="rounded border border-dashed border-aviso p-3 text-xs text-slate-600 dark:text-slate-300">
              <span aria-hidden="true" className="text-aviso">
                △{' '}
              </span>
              Sin comprobar: las cotas de los controles y las lecturas salen del perfil, no de una nivelación cerrada.
              Un control recién tiene cota cuando una nivelación cerrada desde un BM se la da.
            </p>
          )}

          {pasosIda.length > 0 && <DibujoPlan perfil={perfil} plan={plan} recorrido={recorrido} />}

          {pasosIda.length > 0 && (
            <Seccion titulo="Estaciones">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Lecturas de ida, aproximadas al centímetro. La vuelta usa las mismas estaciones y los mismos PC, al
                revés.
              </p>
              <table aria-label="Estaciones del plan" className="w-full text-sm">
                <thead className="hidden text-left text-xs text-slate-500 sm:table-header-group">
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
                      className="block rounded border border-slate-200 p-2 sm:table-row sm:rounded-none sm:border-0 sm:border-t sm:p-0 dark:border-slate-800"
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
            </Seccion>
          )}

          {plan.controles.length > 0 && (
            <Seccion titulo="Puntos de control">
              <ol aria-label="Puntos de control" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {plan.controles.map((c, i) => (
                  <li key={c.progresiva} className="rounded border border-slate-200 p-3 dark:border-slate-800">
                    <p className="font-semibold">
                      {/* Color de marca, no verde: la estaca aún no tiene cota comprobada. */}
                      <span aria-hidden="true" className="text-marca">
                        ■{' '}
                      </span>
                      Control {i + 1} · {formatearProgresiva(c.progresiva)}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Cota prevista {formatearCota(c.cotaPerfil)} (del perfil, sin comprobar)
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
            </Seccion>
          )}

          {plan.tramos.length > 0 && (
            <Seccion titulo="Tramos entre controles">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Cada tramo se nivela ida y vuelta y cierra por su cuenta. Cumple si el doble del error esperado no pasa
                de la tolerancia.
              </p>
              <ol aria-label="Tramos entre controles" className="grid gap-2 sm:grid-cols-2">
                {plan.tramos.map((t, i) => {
                  const [simbolo, texto, claseTexto, claseBorde] = !t.ok
                    ? ['✗', 'No cumple', 'text-falla', 'border-falla bg-falla/5']
                    : sinMejora(t)
                      ? ['△', 'No se puede mejorar (una estación)', 'text-aviso', 'border-aviso bg-aviso/5']
                      : ['✓', 'Cumple', 'text-pasa', 'border-pasa/50']
                  return (
                    <li key={`${t.desde}-${t.hasta}`} className={`rounded border p-3 text-sm ${claseBorde}`}>
                      <p className="font-semibold">
                        Tramo {i + 1}: {formatearProgresiva(t.desde)} a {formatearProgresiva(t.hasta)}
                      </p>
                      <p>
                        {cuenta(t.estaciones, 'estación', 'estaciones')}, {cuenta(t.cambios, 'cambio', 'cambios')}
                      </p>
                      <p>
                        Error esperado ida y vuelta: 2 × {t.errorEsperadoMm.toFixed(2)} ={' '}
                        {(2 * t.errorEsperadoMm).toFixed(2)} mm · tolerancia {t.toleranciaMm.toFixed(2)} mm
                      </p>
                      <p className={`font-medium ${claseTexto}`}>
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
            </Seccion>
          )}

          {plan.posible && <BloqueGuardar datos={datos} plan={plan} />}
        </>
      )}
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
    <div className="flex flex-col gap-2 rounded border border-slate-200 p-3 dark:border-slate-800">
      <div className="text-sm" role="status">
        {datos.guardadoAlDia ? (
          <p className="text-pasa">
            <span aria-hidden="true">✓ </span>Guardado en la calle: sale en el plano y en la guía.
          </p>
        ) : calle.planControles ? (
          <div className="text-aviso">
            <p>
              <span aria-hidden="true">△ </span>La calle guarda otro plan: es el que siguen el plano y la guía.
              {datos.diferencias.length > 0 && ` Diferencias: ${datos.diferencias.join('; ')}.`}
            </p>
            <p className="text-slate-600 dark:text-slate-300">
              Si ya clavaste sus estacas, no lo reemplaces: vuelve al perfil y las reglas con que se guardó.
            </p>
          </div>
        ) : (
          <p>Todavía no se guardó en la calle.</p>
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
        <div className="flex flex-wrap gap-2 sm:justify-end">
          {calle.planControles && (
            <button type="button" className={BOTON} onClick={() => setConfirmando(true)}>
              Quitar el plan guardado
            </button>
          )}
          <button type="button" className={BOTON_PRINCIPAL} disabled={datos.guardadoAlDia} onClick={guardar}>
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

  return (
    <Seccion titulo="Reglas del nivel">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Son las de toda la obra: también las usan la libreta, el aviso al anotar y el replanteo.
      </p>
      <div className={`grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 ${CAMPOS_GRANDES}`}>
        {CAMPOS_INSTRUMENTO.map((c) => (
          <div key={c.clave} className="flex flex-col gap-1">
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
    </Seccion>
  )
}

function Celda({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <td className="block p-1 sm:table-cell sm:p-2">
      <span className="text-xs text-slate-500 sm:hidden">{etiqueta}: </span>
      {children}
    </td>
  )
}

function Veredicto({ plan }: { plan: PlanConControles }) {
  const malos = plan.tramos.filter((t) => !t.ok).length
  const [simbolo, clase, texto] = !plan.posible
    ? ['✗', 'border-falla bg-falla/10 text-falla', `No se puede nivelar con estas reglas: ${plan.motivo}.`]
    : !plan.ok
      ? [
          '✗',
          'border-falla bg-falla/10 text-falla',
          `${cuenta(malos, 'tramo no cumple', 'tramos no cumplen')}: mira los avisos de cada tramo.`,
        ]
      : plan.notas.length > 0
        ? [
            '△',
            'border-aviso bg-aviso/10 text-aviso',
            `El plan cumple, con ${cuenta(plan.notas.length, 'nota', 'notas')} para tener en cuenta.`,
          ]
        : ['✓', 'border-pasa bg-pasa/10 text-pasa', 'El plan cumple: todos los tramos cierran dentro de su tolerancia.']
  return (
    <p className={`rounded border p-3 text-sm font-medium ${clase}`}>
      <span aria-hidden="true">{simbolo} </span>
      {texto}
    </p>
  )
}

/** Los vértices del perfil digitado: progresiva y cota, uno por fila. */
function EditorVertices({ vertices, alCambiar }: { vertices: Vertice[]; alCambiar: (v: Vertice[]) => void }) {
  const cambiarEn = (i: number, cambio: Partial<Vertice>) =>
    alCambiar(vertices.map((v, j) => (j === i ? { ...v, ...cambio } : v)))
  return (
    <div className={`flex flex-col gap-2 ${CAMPOS_GRANDES}`}>
      <ol aria-label="Vértices del perfil" className="flex flex-col gap-2">
        {vertices.map((v, i) => (
          <li key={i} className="flex flex-wrap items-end gap-2">
            <span className="w-6 pb-3 text-xs text-slate-500">{i + 1}</span>
            <CampoNumero
              etiqueta="Progresiva (m)"
              ariaLabel={`Progresiva del vértice ${i + 1}`}
              valor={v.progresiva}
              decimales={2}
              ancho="w-32"
              confirmarAlSalir
              alCambiar={(n) => cambiarEn(i, { progresiva: n })}
            />
            <CampoNumero
              etiqueta="Cota (m)"
              ariaLabel={`Cota del vértice ${i + 1}`}
              valor={v.cota}
              ancho="w-36"
              confirmarAlSalir
              alCambiar={(n) => cambiarEn(i, { cota: n })}
            />
            <button
              type="button"
              className={BOTON}
              disabled={vertices.length <= 2}
              aria-label={`Quitar el vértice ${i + 1}`}
              onClick={() => alCambiar(vertices.filter((_, j) => j !== i))}
            >
              Quitar
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
        Agregar vértice
      </button>
    </div>
  )
}
