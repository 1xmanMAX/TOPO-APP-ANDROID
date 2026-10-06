import {
  calibrar,
  cotaEjeRasante,
  formatearPendiente,
  largoPolilinea,
  redondear3,
  type Calibracion,
  type EstacaSobrePlano,
  type Pista,
  type PlanoImportado,
  type Punto2,
} from '@topo/core'
import { useId, useMemo, useState } from 'react'
import { useAlmacen } from '../../estado/almacen'
import type { PlanoVectorial } from '../../planos/dxf'
import { PENDIENTE_EMPINADA, rasanteDeCroquis } from './datosPista'
import { BOTON_PRINCIPAL, BOTON_SECUNDARIO, CAJA } from './estilos'

/**
 * «3244,5», «3244.5», «−6» (el menos de los teclados que lo ponen bonito)
 * o «5%» → número; vacío o basura → null (no es lo mismo que cero).
 */
export function leerDecimal(texto: string): number | null {
  const limpio = texto
    .trim()
    .replace(/[−–]/g, '-')
    .replace(/\s*%$/, '')
    .replace(',', '.')
  if (limpio === '') return null
  const n = Number(limpio)
  return Number.isFinite(n) ? n : null
}

/** Escrito pero ilegible: no es lo mismo que vacío, y no se debe tomar como cero. */
function esInvalido(texto: string): boolean {
  return texto.trim() !== '' && leerDecimal(texto) === null
}

const ESTILO_CAMPO =
  'min-h-11 w-full rounded border border-slate-300 bg-white px-2 text-sm outline-none focus:border-marca focus:ring-1 focus:ring-marca dark:border-slate-700 dark:bg-slate-900'

/**
 * Campo de texto de 44 px para tocarlo con guantes. El CampoTexto común
 * mide menos; mientras no crezca, esta carpeta usa el suyo.
 */
export function CampoTextoAlto({ etiqueta, valor, alCambiar, marcador }: { etiqueta: string; valor: string; alCambiar: (v: string) => void; marcador?: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{etiqueta}</span>
      <input type="text" value={valor} placeholder={marcador} onChange={(e) => alCambiar(e.target.value)} className={ESTILO_CAMPO} />
    </label>
  )
}

interface PropsDecimal {
  etiqueta: string
  valor: string
  alCambiar: (v: string) => void
  sufijo?: string
  ayuda?: string
  /** Botón ± al lado: en el teclado numérico del iPhone no hay signo menos. */
  conSigno?: boolean
}

/** Campo numérico que puede quedar vacío: una cota sin escribir no es una cota cero. */
function CampoDecimal({ etiqueta, valor, alCambiar, sufijo, ayuda, conSigno }: PropsDecimal) {
  const idAyuda = useId()
  const invalido = esInvalido(valor)
  function cambiarSigno() {
    const t = valor.trim()
    if (t.startsWith('-') || t.startsWith('−')) alCambiar(t.slice(1))
    else alCambiar(`-${t.startsWith('+') ? t.slice(1) : t}`)
  }
  return (
    <div className="flex flex-col gap-1">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{etiqueta}</span>
        <span className="flex items-center gap-1">
          <input
            type="text"
            inputMode="decimal"
            aria-label={etiqueta}
            aria-describedby={ayuda ? idAyuda : undefined}
            value={valor}
            aria-invalid={invalido || undefined}
            onChange={(e) => alCambiar(e.target.value)}
            className={`numerico ${ESTILO_CAMPO} text-right`}
          />
          {sufijo && <span className="text-xs text-slate-500">{sufijo}</span>}
        </span>
      </label>
      {conSigno && (
        <button type="button" className={`${BOTON_SECUNDARIO} self-start`} aria-label={`Cambiar el signo de ${etiqueta.toLowerCase()}`} onClick={cambiarSigno}>
          ± signo
        </button>
      )}
      {ayuda && (
        <span id={idAyuda} className="text-xs text-slate-500 dark:text-slate-400">
          {ayuda}
        </span>
      )}
      {invalido && <span className="text-xs text-falla">✗ No es un número.</span>}
    </div>
  )
}

// ─── Capas del DXF ───────────────────────────────────────────────────────

export function PanelCapas({ vectorial, ocultas, alCambiar }: { vectorial: PlanoVectorial; ocultas: ReadonlySet<string>; alCambiar: (capa: string, visible: boolean) => void }) {
  return (
    <fieldset className={CAJA}>
      <legend className="px-1 text-sm font-semibold">Capas del plano</legend>
      <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-1">
        {vectorial.capas.map((capa) => (
          <li key={capa.nombre}>
            <label className="flex min-h-11 items-center gap-2 rounded px-1 text-sm hover:bg-slate-100 dark:hover:bg-slate-800">
              <input
                type="checkbox"
                className="size-5"
                checked={!ocultas.has(capa.nombre)}
                onChange={(e) => alCambiar(capa.nombre, e.target.checked)}
              />
              <span
                aria-hidden="true"
                className="inline-block size-4 shrink-0 rounded-sm border border-slate-400"
                style={{ backgroundColor: capa.color }}
              />
              <span className="min-w-0 break-all">{capa.nombre}</span>
            </label>
          </li>
        ))}
      </ul>
      {vectorial.ignoradasDetalle.length > 0 && (
        <p className="text-xs text-slate-600 dark:text-slate-300">
          <span aria-hidden="true">△ </span>
          No se dibujan: {vectorial.ignoradasDetalle.map((f) => `${f.cantidad} ${f.tipo}`).join(', ')}.
        </p>
      )}
    </fieldset>
  )
}

// ─── Calibrar escala ─────────────────────────────────────────────────────

/** «1 punto = 0.3528 m»: así se lee la escala que tiene el plano. */
export function textoEscala(plano: PlanoImportado): string {
  if (!plano.calibracion) return 'Sin escala'
  const unidad = plano.formato === 'pdf' ? 'punto del PDF' : 'unidad del dibujo'
  return `1 ${unidad} = ${Number(plano.calibracion.metrosPorUnidad.toPrecision(6))} m`
}

type NuevaEscala = { calibracion: Calibracion } | { error: string } | null

interface PropsCalibrar {
  plano: PlanoImportado
  /** Las pistas dibujadas sobre este plano: cambiar la escala cambia su largo. */
  pistas: readonly Pista[]
  puntos: Punto2[]
  alReiniciar: () => void
  alTerminar: (mensaje: string) => void
}

export function PanelCalibrar({ plano, pistas, puntos, alReiniciar, alTerminar }: PropsCalibrar) {
  const idTitulo = useId()
  const actualizarPlano = useAlmacen((s) => s.actualizarPlano)
  const [distancia, setDistancia] = useState('')
  const [intentado, setIntentado] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const metros = leerDecimal(distancia)

  // La escala nueva la arma el motor; si no puede, dice por qué.
  const nueva = useMemo<NuevaEscala>(() => {
    if (puntos.length < 2 || metros === null) return null
    try {
      return { calibracion: calibrar(puntos[0]!, puntos[1]!, metros, 'arriba') }
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  }, [puntos, metros])

  // Recalibrar mueve todo lo dibujado: largo, estacas, pendientes y controles.
  const afectadas =
    plano.calibracion && nueva && 'calibracion' in nueva
      ? pistas.map((p) => {
          const unidades = largoPolilinea(p.polilinea)
          return { nombre: p.nombre, antes: unidades * plano.calibracion!.metrosPorUnidad, despues: unidades * nueva.calibracion.metrosPorUnidad }
        })
      : []

  function aplicar(calibracion: Calibracion) {
    actualizarPlano(plano.id, { calibracion })
    setConfirmando(false)
    alTerminar(`✓ Escala fijada: ${textoEscala({ ...plano, calibracion })}.`)
  }

  function fijar() {
    setIntentado(true)
    if (!nueva || !('calibracion' in nueva)) return
    if (afectadas.length > 0) {
      setConfirmando(true)
      return
    }
    aplicar(nueva.calibracion)
  }

  return (
    <section aria-labelledby={idTitulo} className={CAJA}>
      <h3 id={idTitulo} className="text-base font-semibold">
        Calibrar escala
      </h3>
      <p className="text-sm">Escala actual: {textoEscala(plano)}.</p>
      <ol className="flex flex-col gap-1 text-sm">
        <li>
          {puntos.length >= 1 ? '✓' : '1.'} Toca el primer punto de una distancia conocida (una cota del plano, la barra de escala).
        </li>
        <li>{puntos.length >= 2 ? '✓' : '2.'} Toca el segundo punto.</li>
        <li>3. Escribe la distancia real entre los dos.</li>
      </ol>
      <CampoDecimal
        etiqueta="Distancia real"
        sufijo="m"
        valor={distancia}
        alCambiar={(v) => {
          setDistancia(v)
          setIntentado(false)
          setConfirmando(false)
        }}
      />
      {intentado && nueva && 'error' in nueva && (
        <p role="alert" className="text-sm text-falla">
          ✗ {nueva.error}
        </p>
      )}
      {confirmando && nueva && 'calibracion' in nueva && afectadas.length > 0 ? (
        <div className="flex flex-col gap-2 rounded border border-aviso/60 bg-aviso/10 p-2 text-sm">
          <p>
            <span aria-hidden="true">△ </span>
            La escala nueva cambia el largo, las estacas, las pendientes y los controles de{' '}
            {afectadas.length === 1 ? 'una pista' : `${afectadas.length} pistas`}:
          </p>
          <ul aria-label="Pistas que cambian de largo" className="numerico flex flex-col gap-1">
            {afectadas.map((a) => (
              <li key={a.nombre}>
                {a.nombre}: {a.antes.toFixed(1)} m → {a.despues.toFixed(1)} m
              </li>
            ))}
          </ul>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={BOTON_PRINCIPAL} onClick={() => aplicar(nueva.calibracion)}>
              Sí, cambiar la escala
            </button>
            <button type="button" className={BOTON_SECUNDARIO} onClick={() => setConfirmando(false)}>
              No, dejarla
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={BOTON_PRINCIPAL} disabled={puntos.length < 2 || metros === null || !(metros > 0)} onClick={fijar}>
            Fijar escala
          </button>
          <button
            type="button"
            className={BOTON_SECUNDARIO}
            disabled={puntos.length === 0}
            onClick={() => {
              setIntentado(false)
              setConfirmando(false)
              alReiniciar()
            }}
          >
            Volver a tocar
          </button>
        </div>
      )}
    </section>
  )
}

// ─── Croquis ─────────────────────────────────────────────────────────────

/** Lo escrito en el croquis. Vive en la pantalla para no perderse al cambiar de herramienta. */
export interface BorradorCroquis {
  nombre: string
  cota: string
  pendiente: string
}

export const BORRADOR_VACIO: BorradorCroquis = { nombre: '', cota: '', pendiente: '' }

interface PropsCroquis {
  plano: PlanoImportado
  puntos: Punto2[]
  estacas: EstacaSobrePlano[]
  borrador: BorradorCroquis
  alCambiarBorrador: (cambio: Partial<BorradorCroquis>) => void
  alDeshacer: () => void
  alEmpezarDeNuevo: () => void
  alCrear: (pistaId: string, mensaje: string) => void
}

/**
 * Dibujar la pista vértice a vértice sobre el plano y crear su calle. La
 * cota final sale de la rasante (cota de arranque y pendiente) con el motor,
 * y solo cuando las dos están escritas: una pendiente sin escribir no es 0 %.
 */
export function PanelCroquis({ plano, puntos, estacas, borrador, alCambiarBorrador, alDeshacer, alEmpezarDeNuevo, alCrear }: PropsCroquis) {
  const idTitulo = useId()
  const agregarPista = useAlmacen((s) => s.agregarPista)
  const crearCalleDesdePista = useAlmacen((s) => s.crearCalleDesdePista)
  const fijarRasante = useAlmacen((s) => s.fijarRasante)
  const { nombre, cota, pendiente } = borrador

  const largo = estacas.length > 0 ? estacas[estacas.length - 1]!.progresiva : null
  const cotaArranque = leerDecimal(cota)
  const pendienteNum = leerDecimal(pendiente)
  const ilegible = esInvalido(cota) || esInvalido(pendiente)
  const rasante = cotaArranque !== null && pendienteNum !== null ? rasanteDeCroquis(cotaArranque, pendienteNum, null) : null
  const cotaFinal = rasante && largo !== null ? cotaEjeRasante(rasante, largo) : null
  const desnivel = cotaFinal !== null && cotaArranque !== null ? redondear3(cotaFinal - cotaArranque) : null
  const empinada = pendienteNum !== null && Math.abs(pendienteNum) >= PENDIENTE_EMPINADA
  const falta =
    ilegible || rasante
      ? null
      : cotaArranque !== null
        ? 'Falta la pendiente: sin rasante todavía.'
        : pendienteNum !== null
          ? 'Falta la cota de arranque: sin rasante todavía.'
          : null
  const puedeCrear = puntos.length >= 2 && nombre.trim() !== '' && !ilegible

  function crear() {
    if (!puedeCrear) return
    const nombreFinal = nombre.trim()
    const pistaId = agregarPista({ nombre: nombreFinal, planoId: plano.id, polilinea: puntos, origen: 'croquis', progresivaInicio: 0 })
    const calleId = crearCalleDesdePista(pistaId)
    let mensaje = `✓ Calle «${nombreFinal}» creada con el croquis.`
    if (calleId && rasante && cotaArranque !== null && pendienteNum !== null) {
      fijarRasante(calleId, rasante)
      mensaje += ` Rasante: ${cotaArranque.toFixed(3)} m en 0+000, ${formatearPendiente(pendienteNum)}.`
    } else {
      mensaje += ' Sin rasante todavía: ponla en la calle.'
    }
    alCrear(pistaId, mensaje)
  }

  const razon =
    puntos.length < 2
      ? 'Faltan al menos dos vértices.'
      : nombre.trim() === ''
        ? 'Falta el nombre de la calle.'
        : 'La cota de arranque o la pendiente no es un número: corrígela o déjala vacía.'

  return (
    <section aria-labelledby={idTitulo} className={CAJA}>
      <h3 id={idTitulo} className="text-base font-semibold">
        Croquis de la pista
      </h3>
      <p className="text-sm">Toca el plano vértice a vértice, desde el 0+000 en el sentido de avance.</p>
      {!plano.calibracion && (
        <p className="text-sm">
          <span aria-hidden="true">△ </span>
          El plano no tiene escala: sin ella no hay progresivas ni largo. Calíbralo primero.
        </p>
      )}
      <p className="numerico text-sm" aria-live="polite">
        {puntos.length} {puntos.length === 1 ? 'vértice' : 'vértices'}
        {largo !== null ? ` · ${largo.toFixed(3)} m` : ''}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={BOTON_SECUNDARIO} disabled={puntos.length === 0} onClick={alDeshacer}>
          Deshacer
        </button>
        <button type="button" className={BOTON_SECUNDARIO} disabled={puntos.length === 0} onClick={alEmpezarDeNuevo}>
          Empezar de nuevo
        </button>
      </div>
      <CampoTextoAlto etiqueta="Nombre de la calle" valor={nombre} alCambiar={(v) => alCambiarBorrador({ nombre: v })} marcador="Jr. Lima" />
      <div className="grid grid-cols-2 gap-2">
        <CampoDecimal etiqueta="Cota de arranque" sufijo="m" valor={cota} alCambiar={(v) => alCambiarBorrador({ cota: v })} />
        <CampoDecimal
          etiqueta="Pendiente"
          sufijo="%"
          valor={pendiente}
          alCambiar={(v) => alCambiarBorrador({ pendiente: v })}
          ayuda="+ sube, − baja en el sentido de avance."
          conSigno
        />
      </div>
      {cotaFinal !== null && desnivel !== null && (
        <dl aria-label="Resultado del croquis" className="numerico grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-slate-500 dark:text-slate-400">Cota final</dt>
          <dd>{cotaFinal.toFixed(3)} m</dd>
          <dt className="text-slate-500 dark:text-slate-400">Desnivel</dt>
          <dd>
            {desnivel > 0 ? '+' : ''}
            {desnivel.toFixed(3)} m{empinada ? ' · △ empinada: la precisión manda' : ''}
          </dd>
        </dl>
      )}
      {falta && (
        <p className="text-sm">
          <span aria-hidden="true">△ </span>
          {falta}
        </p>
      )}
      <button type="button" className={BOTON_PRINCIPAL} disabled={!puedeCrear} onClick={crear}>
        Crear calle con este croquis
      </button>
      {!puedeCrear && <p className="text-xs text-slate-500 dark:text-slate-400">{razon}</p>}
    </section>
  )
}
