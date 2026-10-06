import {
  alturaInstrumental as alturaInstrumentalDe,
  AVISO_SIN_COMPROBAR,
  avisoDeLectura,
  clasificarLectura,
  cotaDesdeLectura,
  evaluarLectura,
  formatearProgresiva,
  gradosAPorcentaje,
  interpolarCota,
  lecturaObjetivo,
  parsearProgresiva,
  pendiente,
  porcentajeAGrados,
  porcentajeARelacion,
  reglasDeMira,
  relacionAPorcentaje,
  volumenAreasMedias,
  type EstadoAviso,
  type ReglasMira,
} from '@topo/core'
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useAlmacen } from '../../estado/almacen'
import { formatearDiferencia } from '../../estadoRasante'
import { useContextoCalculadora, type ContextoCalculadora } from './contextoCalculadora'

type IdPestana = 'cota' | 'objetivo' | 'pendiente' | 'interpolar' | 'volumen' | 'conversion'

const PESTANAS: { id: IdPestana; etiqueta: string }[] = [
  { id: 'cota', etiqueta: 'Cota' },
  { id: 'objetivo', etiqueta: 'Lectura objetivo' },
  { id: 'pendiente', etiqueta: 'Pendiente' },
  { id: 'interpolar', etiqueta: 'Interpolar' },
  { id: 'volumen', etiqueta: 'Volumen' },
  { id: 'conversion', etiqueta: 'Conversión' },
]

type UnidadPendiente = 'porcentaje' | 'grados' | 'relacion'

/** Todos los casilleros de todas las pestañas: al cambiar de pestaña no se pierde lo escrito. */
type Valores = Record<string, string>

/**
 * Si cada dato MEDIDO que trajo la libreta está respaldado por un cierre que
 * pasa. Va casillero por casillero: la AI de la estación activa puede estar
 * comprobada y la cota vecina, leída antes del último circuito, no. Si un
 * casillero sigue con lo que trajo la libreta y aquí dice false, el resultado
 * se marca como no comprobado (diseño §3). La cota de proyecto y las
 * progresivas no dependen del cierre y no aparecen.
 */
type Comprobados = Record<string, boolean>

/** Lo que se trajo de la libreta de una vez: los datos, de qué punto son y si están comprobados. */
interface Foto {
  ctx: ContextoCalculadora
  valores: Valores
  comprobados: Comprobados
  /** Sube cada vez que se traen datos: así las tarjetas vuelven a arrancar con la progresiva nueva. */
  generacion: number
}

function m3(valor: number | null | undefined): string {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor.toFixed(3) : ''
}

/** Progresiva en metros, sin ceros de más: así se lee igual que en la libreta. */
function metros(valor: number | null | undefined): string {
  return typeof valor === 'number' && Number.isFinite(valor) ? String(Number(valor.toFixed(3))) : ''
}

/** Lo que se escribió, como número. Vacío o basura da NaN, y el motor responde null. */
function numero(texto: string | undefined): number {
  const limpio = (texto ?? '').trim().replace(',', '.')
  return limpio === '' ? Number.NaN : Number(limpio)
}

function progresivaDe(texto: string | undefined): number {
  return parsearProgresiva(texto ?? '') ?? Number.NaN
}

/** Si la última lectura del punto es de la estación activa: solo entonces vale para replantear desde ella. */
function lecturaDeLaActiva(ctx: ContextoCalculadora): boolean {
  return ctx.lectura !== null && ctx.estacionLectura !== null && ctx.estacionLectura === ctx.numeroEstacion
}

function valoresIniciales(ctx: ContextoCalculadora): Valores {
  const { anterior, siguiente, progresiva } = ctx
  // Pendiente: del mismo punto en la progresiva anterior al seleccionado; si
  // el seleccionado no está medido, de la anterior a la siguiente.
  const finalPendiente =
    ctx.cotaMedida !== null && progresiva !== null
      ? { progresiva, cota: ctx.cotaMedida }
      : siguiente
  return {
    ai: m3(ctx.alturaInstrumental),
    // La cota del punto sale de la AI de la estación que lo leyó, que no
    // siempre es la activa (después de un cambio de estación, o al revisar).
    aiCota: m3(ctx.lectura !== null ? ctx.alturaInstrumentalLectura : ctx.alturaInstrumental),
    lectura: m3(ctx.lectura),
    cotaConocida: '',
    vistaAtras: '',
    cotaProyecto: m3(ctx.cotaProyecto),
    // Una lectura de otra estación contra la AI de la activa daría un corte o
    // relleno falso: en ese caso se deja vacío, para que se lea ahora.
    lecturaMira: lecturaDeLaActiva(ctx) ? m3(ctx.lectura) : '',
    tolerancia: ctx.toleranciaMm !== null ? String(ctx.toleranciaMm) : '',
    pendInicial: m3(anterior?.cota),
    pendFinal: anterior ? m3(finalPendiente?.cota) : '',
    pendDist: anterior && finalPendiente ? metros(finalPendiente.progresiva - anterior.progresiva) : '',
    progA: metros(anterior?.progresiva),
    cotaA: m3(anterior?.cota),
    progB: metros(siguiente?.progresiva),
    cotaB: m3(siguiente?.cota),
    progX: metros(progresiva),
    areaA: '',
    areaB: '',
    volDist: '',
    convValor: '',
  }
}

function comprobadosIniciales(ctx: ContextoCalculadora): Comprobados {
  const finalPendiente = ctx.cotaMedida !== null ? ctx.cotaMedidaComprobada : (ctx.siguiente?.comprobada ?? false)
  return {
    ai: ctx.alturaComprobada,
    aiCota: ctx.lectura !== null ? ctx.lecturaComprobada : ctx.alturaComprobada,
    lectura: ctx.lecturaComprobada,
    lecturaMira: ctx.lecturaComprobada,
    pendInicial: ctx.anterior?.comprobada ?? false,
    pendFinal: finalPendiente,
    cotaA: ctx.anterior?.comprobada ?? false,
    cotaB: ctx.siguiente?.comprobada ?? false,
  }
}

function tomarFoto(ctx: ContextoCalculadora, generacion: number): Foto {
  return { ctx, valores: valoresIniciales(ctx), comprobados: comprobadosIniciales(ctx), generacion }
}

/** Qué punto describe un contexto: si cambia, los casilleros ya no son del seleccionado. */
function firma(ctx: ContextoCalculadora): string {
  return JSON.stringify([
    ctx.calleId,
    ctx.numeroEstacion,
    ctx.alturaInstrumental,
    ctx.progresiva,
    ctx.nombrePunto,
    ctx.lectura,
  ])
}

function describirPunto(ctx: ContextoCalculadora): string {
  if (ctx.progresiva === null) return 'ningún punto'
  return [formatearProgresiva(ctx.progresiva), ctx.nombrePunto].filter(Boolean).join(' ')
}

// ---------------------------------------------------------------------------
// Piezas
// ---------------------------------------------------------------------------

function Casillero({
  etiqueta,
  valor,
  alCambiar,
  sufijo,
  ayuda,
  modo = 'decimal',
}: {
  etiqueta: string
  valor: string
  alCambiar: (valor: string) => void
  sufijo?: string
  ayuda?: string
  modo?: 'decimal' | 'text'
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{etiqueta}</span>
      <span className="flex items-center gap-1">
        <input
          type="text"
          inputMode={modo}
          // Nombre propio: sin él, la unidad de al lado se pegaría al nombre («Lecturam»).
          aria-label={etiqueta}
          value={valor}
          onChange={(evento) => alCambiar(evento.target.value)}
          className="numerico min-h-11 w-full min-w-0 rounded border border-slate-300 bg-white px-2 text-right text-base outline-none focus:border-marca focus:ring-2 focus:ring-marca dark:border-slate-600 dark:bg-slate-900"
        />
        {sufijo && <span className="w-6 shrink-0 text-xs text-slate-500 dark:text-slate-400">{sufijo}</span>}
      </span>
      {ayuda && <span className="text-xs text-slate-500 dark:text-slate-400">{ayuda}</span>}
    </label>
  )
}

interface Estado {
  simbolo: '✓' | '△' | '✗'
  texto: string
}

const CLASE_ESTADO: Record<Estado['simbolo'], string> = {
  '✓': 'border-pasa bg-pasa/10 text-pasa',
  '△': 'border-aviso bg-aviso/10 text-amber-800 dark:text-aviso',
  '✗': 'border-falla bg-falla/10 text-falla',
}

function Marca({ estado }: { estado: Estado }) {
  return (
    <p className={`rounded border px-2 py-1.5 text-sm font-medium ${CLASE_ESTADO[estado.simbolo]}`}>
      <span aria-hidden="true">{estado.simbolo} </span>
      {estado.texto}
    </p>
  )
}

function Avisos({ avisos }: { avisos: string[] }) {
  if (avisos.length === 0) return null
  return (
    <ul className="flex flex-col gap-1 text-sm text-amber-800 dark:text-aviso">
      {avisos.map((aviso) => (
        <li key={aviso}>
          <span aria-hidden="true">△ </span>
          {aviso}
        </li>
      ))}
    </ul>
  )
}

/** Lo que una pestaña calculó, listo para mostrarse, copiarse y guardarse. */
interface Calculo {
  titulo: string
  /** Lo que se ve en grande; null si faltan datos o no tienen sentido. */
  valor: string | null
  /** Lo que «Copiar» pone en el portapapeles: el número solo, para pegarlo. */
  copiable: string | null
  detalle?: string
  estados?: Estado[]
  avisos?: string[]
  /** Por qué no hay resultado, en palabras. */
  falta?: string
}

const NO_COMPROBADO: Estado = {
  simbolo: '△',
  texto: 'No comprobado: usa datos de la libreta que ningún cierre respalda todavía.',
}

/**
 * La tarjeta se monta de nuevo cada vez que se traen datos (su key lleva la
 * generación de la foto), así que la progresiva de la nota arranca en el
 * punto traído y no en el de antes.
 */
function TarjetaResultado({
  calculo,
  ctx,
  noComprobado,
  calleViva,
}: {
  calculo: Calculo
  /** El contexto de los datos que hay en los casilleros (la foto), no el seleccionado ahora. */
  ctx: ContextoCalculadora
  noComprobado: boolean
  /** La calle activa ahora: si ya no es la de la foto, no se guarda una nota en la calle equivocada. */
  calleViva: string | null
}) {
  const agregarNota = useAlmacen((s) => s.agregarNota)
  const [progresivaNota, setProgresivaNota] = useState(
    ctx.progresiva !== null ? formatearProgresiva(ctx.progresiva) : '',
  )
  const [mensaje, setMensaje] = useState<string | null>(null)
  // «Copiado: X» o «Nota guardada» hablan del resultado de antes: si el
  // resultado cambia, el mensaje se va (patrón de estado previo de React).
  const [copiablePrevio, setCopiablePrevio] = useState(calculo.copiable)
  if (copiablePrevio !== calculo.copiable) {
    setCopiablePrevio(calculo.copiable)
    setMensaje(null)
  }
  const idTitulo = useId()

  const estados = [...(calculo.estados ?? []), ...(noComprobado && calculo.valor ? [NO_COMPROBADO] : [])]
  const progresiva = parsearProgresiva(progresivaNota)
  const mismaCalle = ctx.calleId !== null && ctx.calleId === calleViva
  const puedeGuardar = calculo.valor !== null && mismaCalle && progresiva !== null

  async function copiar() {
    if (!calculo.copiable) return
    try {
      await navigator.clipboard.writeText(calculo.copiable)
      setMensaje(`Copiado: ${calculo.copiable}`)
    } catch {
      setMensaje('No se pudo copiar: anótelo a mano.')
    }
  }

  function guardarNota() {
    if (!puedeGuardar || ctx.calleId === null || progresiva === null) return
    const partes = [`${calculo.titulo}: ${calculo.valor}`]
    if (calculo.detalle) partes.push(calculo.detalle)
    if (noComprobado) partes.push('no comprobado, ningún cierre lo respalda')
    agregarNota(ctx.calleId, { progresiva, texto: partes.join(' · '), fecha: new Date().toISOString() })
    setMensaje(`Nota guardada en ${formatearProgresiva(progresiva)}.`)
  }

  return (
    <section
      aria-labelledby={idTitulo}
      className="flex flex-col gap-2 rounded-lg border-2 border-slate-300 p-3 dark:border-slate-600"
    >
      <h3 id={idTitulo} className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
        Resultado · {calculo.titulo}
      </h3>
      <output aria-live="polite" className="numerico block text-4xl leading-tight font-bold break-words">
        {calculo.valor ?? '—'}
      </output>
      {calculo.valor === null && calculo.falta && (
        <p className="text-sm text-slate-600 dark:text-slate-300">{calculo.falta}</p>
      )}
      {calculo.valor !== null && calculo.detalle && (
        <p className="text-sm text-slate-700 dark:text-slate-200">{calculo.detalle}</p>
      )}
      {estados.map((estado) => (
        <Marca key={estado.texto} estado={estado} />
      ))}
      <Avisos avisos={calculo.avisos ?? []} />

      <div className="flex flex-wrap items-end gap-2 pt-1">
        <button
          type="button"
          onClick={copiar}
          disabled={!calculo.copiable}
          className="min-h-11 rounded border border-slate-300 px-4 text-sm font-medium hover:bg-slate-100 disabled:opacity-40 dark:border-slate-600 dark:hover:bg-slate-800"
        >
          Copiar
        </button>
        <label className="flex w-28 flex-col gap-1">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Progresiva de la nota</span>
          <input
            type="text"
            inputMode="decimal"
            value={progresivaNota}
            placeholder="0+020"
            onChange={(evento) => setProgresivaNota(evento.target.value)}
            className="numerico min-h-11 w-full rounded border border-slate-300 bg-white px-2 text-base outline-none focus:border-marca focus:ring-2 focus:ring-marca dark:border-slate-600 dark:bg-slate-900"
          />
        </label>
        <button
          type="button"
          onClick={guardarNota}
          disabled={!puedeGuardar}
          className="min-h-11 rounded bg-marca px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
        >
          Guardar como nota
        </button>
      </div>
      {calleViva === null ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">Elija una calle para poder guardar notas.</p>
      ) : (
        !mismaCalle && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Estos datos son de otra calle: traiga los de la calle activa para guardar la nota.
          </p>
        )
      )}
      <p role="status" className="min-h-5 text-sm text-slate-700 dark:text-slate-200">
        {mensaje}
      </p>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Cálculos de cada pestaña: solo llaman al motor y ponen palabras
// ---------------------------------------------------------------------------

function estadoDeAvisoLectura(estado: EstadoAviso, diferenciaMm: number | null): Estado | null {
  const mm = diferenciaMm !== null ? formatearDiferencia(diferenciaMm) : ''
  switch (estado) {
    case 'conforme':
      return { simbolo: '✓', texto: `Conforme (${mm})` }
    case 'alLimite':
      return { simbolo: '△', texto: `Al límite de tolerancia (${mm})` }
    case 'fuera':
      return { simbolo: '✗', texto: `Fuera de tolerancia (${mm})` }
    default:
      return null
  }
}

function avisoDeMira(lectura: number, reglas: ReglasMira | null): string | null {
  if (!reglas || !Number.isFinite(lectura)) return null
  return avisoDeLectura(lectura, clasificarLectura(lectura, reglas), reglas)
}

function calculoCota(v: Valores, ctx: ContextoCalculadora, reglas: ReglasMira | null): Calculo {
  const ai = numero(v.aiCota)
  const lectura = numero(v.lectura)
  const cota = cotaDesdeLectura(ai, lectura, ctx.instrumento.largoMira)
  const aviso = avisoDeMira(lectura, reglas)
  return {
    titulo: 'Cota',
    valor: cota !== null ? `${m3(cota)} m` : null,
    copiable: cota !== null ? m3(cota) : null,
    // La libreta reparte el error de cierre entre las cotas; esta cuenta no,
    // y se dice para que unos milímetros de diferencia no parezcan un error.
    detalle: cota !== null ? `AI ${m3(ai)} − lectura ${m3(lectura)}, sin repartir el error de cierre` : undefined,
    avisos: aviso ? [aviso] : [],
    falta: 'Escriba la altura instrumental y la lectura.',
  }
}

function textoAccion(tipo: 'corta' | 'rellena' | 'enCota', mm: number): string {
  if (tipo === 'corta') return `Cortar ${mm} mm`
  if (tipo === 'rellena') return `Rellenar ${mm} mm`
  return 'En cota'
}

function calculoObjetivo(
  v: Valores,
  reglas: ReglasMira | null,
  alturaComprobada: boolean,
  tarjetaMarcaNoComprobado: boolean,
): { principal: Calculo; control: Calculo | null } {
  const ai = numero(v.ai)
  const cotaProyecto = numero(v.cotaProyecto)
  const objetivo = lecturaObjetivo(ai, cotaProyecto)
  const avisos: string[] = []
  if (objetivo !== null) {
    const aviso = avisoDeMira(objetivo, reglas)
    if (aviso) avisos.push(`Objetivo: ${aviso}`)
  }
  const principal: Calculo = {
    titulo: 'Lectura objetivo',
    valor: objetivo !== null ? `${m3(objetivo)} m` : null,
    copiable: objetivo !== null ? m3(objetivo) : null,
    detalle: objetivo !== null ? `AI ${m3(ai)} − cota de proyecto ${m3(cotaProyecto)}` : undefined,
    avisos,
    falta: 'Escriba la altura instrumental y la cota de proyecto.',
  }

  if ((v.lecturaMira ?? '').trim() === '' || objetivo === null) return { principal, control: null }

  const evaluado = evaluarLectura({
    alturaInstrumental: ai,
    lectura: numero(v.lecturaMira),
    cotaProyecto,
    toleranciaMm: numero(v.tolerancia),
    alturaComprobada,
    mira: reglas ?? undefined,
  })
  const estado = estadoDeAvisoLectura(evaluado.estado, evaluado.diferenciaMm)
  return {
    principal,
    control: {
      titulo: 'Lo que marca la mira',
      valor: evaluado.accion ? textoAccion(evaluado.accion.tipo, evaluado.accion.mm) : null,
      copiable: evaluado.diferenciaMm !== null ? String(evaluado.diferenciaMm) : null,
      detalle: evaluado.cota !== null ? `Cota medida ${m3(evaluado.cota)} m` : undefined,
      estados: estado ? [estado] : [],
      // Si la tarjeta ya pone el «no comprobado» con su símbolo, no se repite.
      // Si no lo pone (AI escrita a mano o sacada de un punto conocido), lo
      // dice el motor: lo no comprobado nunca se calla (diseño §3).
      avisos: tarjetaMarcaNoComprobado
        ? evaluado.avisos.filter((a) => a !== AVISO_SIN_COMPROBAR)
        : evaluado.avisos,
      falta: 'La lectura no se puede juzgar todavía.',
    },
  }
}

function conSigno(valor: number, decimales: number): string {
  return `${valor > 0 ? '+' : valor < 0 ? '−' : ''}${Math.abs(valor).toFixed(decimales)}`
}

function calculoPendiente(v: Valores): Calculo {
  const resultado = pendiente(numero(v.pendInicial), numero(v.pendFinal), numero(v.pendDist))
  const sentido = resultado ? { sube: 'Sube', baja: 'Baja', plano: 'Plano' }[resultado.sentido] : ''
  return {
    titulo: 'Pendiente',
    valor: resultado ? `${conSigno(resultado.porcentaje, 2)} %` : null,
    copiable: resultado ? resultado.porcentaje.toFixed(2) : null,
    detalle: resultado
      ? `${sentido} · desnivel ${conSigno(resultado.desnivel, 3)} m · ${conSigno(resultado.pormil, 1)} ‰`
      : undefined,
    falta: 'Escriba las dos cotas y la distancia (mayor que cero).',
  }
}

function calculoInterpolar(v: Valores): Calculo {
  const progX = progresivaDe(v.progX)
  const resultado = interpolarCota(
    progresivaDe(v.progA),
    numero(v.cotaA),
    progresivaDe(v.progB),
    numero(v.cotaB),
    progX,
  )
  return {
    titulo: 'Cota interpolada',
    valor: resultado ? `${m3(resultado.cota)} m` : null,
    copiable: resultado ? m3(resultado.cota) : null,
    detalle: resultado ? `En la progresiva ${formatearProgresiva(progX)}` : undefined,
    avisos: resultado?.extrapolada
      ? ['Fuera del tramo A–B: es una extrapolación, y la rasante podría quebrar antes.']
      : [],
    falta: 'Escriba dos progresivas distintas con su cota, y la progresiva buscada.',
  }
}

function calculoVolumen(v: Valores): Calculo {
  const volumen = volumenAreasMedias(numero(v.areaA), numero(v.areaB), numero(v.volDist))
  return {
    titulo: 'Volumen',
    valor: volumen !== null ? `${m3(volumen)} m³` : null,
    copiable: volumen !== null ? m3(volumen) : null,
    detalle: volumen !== null ? 'Áreas medias: (A1 + A2) / 2 × distancia' : undefined,
    falta: 'Escriba las dos áreas (no negativas) y la distancia (mayor que cero).',
  }
}

function calculoConversion(v: Valores, unidad: UnidadPendiente): Calculo {
  const texto = v.convValor ?? ''
  let porcentaje: number | null = null
  if (texto.trim() !== '') {
    if (unidad === 'porcentaje') porcentaje = Number.isFinite(numero(texto)) ? numero(texto) : null
    else if (unidad === 'grados') porcentaje = gradosAPorcentaje(numero(texto))
    else porcentaje = relacionAPorcentaje(texto)
  }
  if (porcentaje === null) {
    return {
      titulo: 'Conversión',
      valor: null,
      copiable: null,
      falta:
        unidad === 'relacion'
          ? 'Escriba la relación como 1:50, 2:3 o solo 50.'
          : 'Escriba una pendiente para convertirla.',
    }
  }
  const grados = porcentajeAGrados(porcentaje)
  const relacion = porcentajeARelacion(porcentaje)
  const partes = [
    `${conSigno(porcentaje, 3)} %`,
    grados !== null ? `${conSigno(grados, 3)}°` : null,
    relacion ? relacion.texto : 'sin relación (plano)',
  ].filter((p): p is string => p !== null)
  return {
    titulo: 'Conversión',
    valor: partes.join(' = '),
    // Se copia lo que se fue a buscar: desde porcentaje, los grados; si no, el porcentaje.
    copiable: unidad === 'porcentaje' ? (grados !== null ? grados.toFixed(3) : null) : porcentaje.toFixed(3),
    detalle: relacion ? `1 m vertical por ${relacion.texto.slice(2)} m horizontales (${relacion.sentido})` : undefined,
  }
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

/**
 * La calculadora de campo. El marco (el diálogo, cerrar con botón o Escape)
 * lo pone App; esto es su contenido. Se abre ya llena con lo que la libreta
 * tiene delante —AI de la estación activa, cota de proyecto y lectura del
 * punto seleccionado, el mismo punto en las progresivas vecinas—, y todas las
 * cuentas son las de `campo/calculadora` del motor.
 *
 * Los casilleros son una foto de la libreta al abrir (o al pulsar «Traer
 * datos de la libreta»): en la laptop el panel queda abierto mientras se
 * tocan otros puntos, y lo que se escribió no se borra solo. Si el punto
 * seleccionado cambia, se avisa en vez de mezclar datos de dos puntos.
 */
export default function PanelCalculadora() {
  const ctx = useContextoCalculadora()
  const [foto, setFoto] = useState<Foto>(() => tomarFoto(ctx, 0))
  const [valores, setValores] = useState<Valores>(() => foto.valores)
  const [pestana, setPestana] = useState<IdPestana>('cota')
  const [unidad, setUnidad] = useState<UnidadPendiente>('porcentaje')
  const idBase = useId()
  const refPestanas = useRef<Partial<Record<IdPestana, HTMLButtonElement | null>>>({})

  const reglas = reglasDeMira(ctx.instrumento)
  const cambiar = (clave: string) => (valor: string) => setValores((x) => ({ ...x, [clave]: valor }))
  const v = (clave: string): string => valores[clave] ?? ''
  const datos = foto.ctx

  function traerDeLaLibreta() {
    const nueva = tomarFoto(ctx, foto.generacion + 1)
    setFoto(nueva)
    setValores((x) => ({ ...x, ...nueva.valores }))
  }

  /** Si este casillero sigue con el dato que trajo la libreta. */
  const deLaLibreta = (clave: string) => v(clave) !== '' && v(clave) === foto.valores[clave]
  const noComprobado = (claves: string[]) => claves.some((c) => deLaLibreta(c) && foto.comprobados[c] === false)
  const alturaComprobada = deLaLibreta('ai') && foto.comprobados.ai === true
  const llave = (nombre: string) => `${nombre}-${foto.generacion}`
  const tarjeta = (nombre: string, calculo: Calculo, marcar: boolean) => (
    <TarjetaResultado
      key={llave(nombre)}
      calculo={calculo}
      ctx={datos}
      noComprobado={marcar}
      calleViva={ctx.calleId}
    />
  )

  function contenido(): ReactNode {
    switch (pestana) {
      case 'cota': {
        const aiPunto = alturaInstrumentalDe(
          numero(v('cotaConocida')),
          numero(v('vistaAtras')),
          ctx.instrumento.largoMira,
        )
        const deOtraEstacion =
          datos.estacionLectura !== null && datos.estacionLectura !== datos.numeroEstacion && deLaLibreta('aiCota')
        return (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Casillero
                etiqueta="Altura instrumental"
                sufijo="m"
                valor={v('aiCota')}
                alCambiar={cambiar('aiCota')}
                ayuda={deOtraEstacion ? `La de la estación ${datos.estacionLectura}, que leyó este punto.` : undefined}
              />
              <Casillero etiqueta="Lectura" sufijo="m" valor={v('lectura')} alCambiar={cambiar('lectura')} />
            </div>
            {tarjeta('cota', calculoCota(valores, ctx, reglas), noComprobado(['aiCota', 'lectura']))}
            <details className="rounded border border-slate-200 p-3 dark:border-slate-700">
              <summary className="min-h-11 cursor-pointer content-center text-sm font-medium">
                Altura instrumental desde un punto conocido
              </summary>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <Casillero
                  etiqueta="Cota del punto conocido"
                  sufijo="m"
                  valor={v('cotaConocida')}
                  alCambiar={cambiar('cotaConocida')}
                />
                <Casillero etiqueta="Vista atrás" sufijo="m" valor={v('vistaAtras')} alCambiar={cambiar('vistaAtras')} />
              </div>
              <p className="numerico mt-2 text-lg font-semibold">AI = {aiPunto !== null ? `${m3(aiPunto)} m` : '—'}</p>
              <button
                type="button"
                disabled={aiPunto === null}
                // Sirve para las dos pestañas que usan AI: la cota y la lectura objetivo.
                onClick={() => aiPunto !== null && setValores((x) => ({ ...x, aiCota: m3(aiPunto), ai: m3(aiPunto) }))}
                className="mt-2 min-h-11 rounded border border-slate-300 px-3 text-sm font-medium hover:bg-slate-100 disabled:opacity-40 dark:border-slate-600 dark:hover:bg-slate-800"
              >
                Usar esta altura instrumental
              </button>
            </details>
          </>
        )
      }
      case 'objetivo': {
        const marcarControl = noComprobado(['ai', 'lecturaMira'])
        const { principal, control } = calculoObjetivo(valores, reglas, alturaComprobada, marcarControl)
        const lecturaDeOtra =
          datos.lectura !== null && datos.estacionLectura !== null && !lecturaDeLaActiva(datos)
        return (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Casillero etiqueta="Altura instrumental" sufijo="m" valor={v('ai')} alCambiar={cambiar('ai')} />
              <Casillero
                etiqueta="Cota de proyecto"
                sufijo="m"
                valor={v('cotaProyecto')}
                alCambiar={cambiar('cotaProyecto')}
              />
            </div>
            {tarjeta('objetivo', principal, noComprobado(['ai']))}
            <div className="grid grid-cols-2 gap-3">
              <Casillero
                etiqueta="Lectura en la mira"
                sufijo="m"
                ayuda={
                  lecturaDeOtra
                    ? `Opcional. La anotada en este punto es de la estación ${datos.estacionLectura}, no de la activa: lea la mira ahora.`
                    : 'Opcional: dice si corta o rellena.'
                }
                valor={v('lecturaMira')}
                alCambiar={cambiar('lecturaMira')}
              />
              <Casillero etiqueta="Tolerancia" sufijo="mm" valor={v('tolerancia')} alCambiar={cambiar('tolerancia')} />
            </div>
            {control && tarjeta('control', control, marcarControl)}
          </>
        )
      }
      case 'pendiente':
        return (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Casillero etiqueta="Cota inicial" sufijo="m" valor={v('pendInicial')} alCambiar={cambiar('pendInicial')} />
              <Casillero etiqueta="Cota final" sufijo="m" valor={v('pendFinal')} alCambiar={cambiar('pendFinal')} />
              <Casillero etiqueta="Distancia" sufijo="m" valor={v('pendDist')} alCambiar={cambiar('pendDist')} />
            </div>
            {tarjeta('pendiente', calculoPendiente(valores), noComprobado(['pendInicial', 'pendFinal']))}
          </>
        )
      case 'interpolar':
        return (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Casillero etiqueta="Progresiva A" modo="text" valor={v('progA')} alCambiar={cambiar('progA')} />
              <Casillero etiqueta="Cota A" sufijo="m" valor={v('cotaA')} alCambiar={cambiar('cotaA')} />
              <Casillero etiqueta="Progresiva B" modo="text" valor={v('progB')} alCambiar={cambiar('progB')} />
              <Casillero etiqueta="Cota B" sufijo="m" valor={v('cotaB')} alCambiar={cambiar('cotaB')} />
              <Casillero etiqueta="Progresiva buscada" modo="text" valor={v('progX')} alCambiar={cambiar('progX')} />
            </div>
            {tarjeta('interpolar', calculoInterpolar(valores), noComprobado(['cotaA', 'cotaB']))}
          </>
        )
      case 'volumen':
        return (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Casillero etiqueta="Área inicial" sufijo="m²" valor={v('areaA')} alCambiar={cambiar('areaA')} />
              <Casillero etiqueta="Área final" sufijo="m²" valor={v('areaB')} alCambiar={cambiar('areaB')} />
              <Casillero
                etiqueta="Distancia entre secciones"
                sufijo="m"
                valor={v('volDist')}
                alCambiar={cambiar('volDist')}
              />
            </div>
            {tarjeta('volumen', calculoVolumen(valores), false)}
          </>
        )
      case 'conversion':
        return (
          <>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-xs font-medium text-slate-600 dark:text-slate-300">Convertir desde</legend>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ['porcentaje', 'Porcentaje'],
                    ['grados', 'Grados'],
                    ['relacion', 'Relación 1:n'],
                  ] as const
                ).map(([id, texto]) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={unidad === id}
                    onClick={() => setUnidad(id)}
                    className={`min-h-11 rounded border px-2 text-sm font-medium ${
                      unidad === id
                        ? 'border-marca bg-marca text-white'
                        : 'border-slate-300 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800'
                    }`}
                  >
                    {texto}
                  </button>
                ))}
              </div>
            </fieldset>
            <Casillero
              etiqueta="Pendiente a convertir"
              modo={unidad === 'relacion' ? 'text' : 'decimal'}
              sufijo={unidad === 'porcentaje' ? '%' : unidad === 'grados' ? '°' : undefined}
              valor={v('convValor')}
              alCambiar={cambiar('convValor')}
            />
            {tarjeta('conversion', calculoConversion(valores, unidad), false)}
          </>
        )
    }
  }

  /** Patrón ARIA de pestañas: flechas, Inicio y Fin mueven la pestaña y el foco. */
  function alTeclaEnPestanas(evento: KeyboardEvent<HTMLDivElement>) {
    const actual = PESTANAS.findIndex((p) => p.id === pestana)
    let siguiente: number
    if (evento.key === 'ArrowRight') siguiente = (actual + 1) % PESTANAS.length
    else if (evento.key === 'ArrowLeft') siguiente = (actual - 1 + PESTANAS.length) % PESTANAS.length
    else if (evento.key === 'Home') siguiente = 0
    else if (evento.key === 'End') siguiente = PESTANAS.length - 1
    else return
    evento.preventDefault()
    const id = PESTANAS[siguiente]!.id
    setPestana(id)
    refPestanas.current[id]?.focus()
  }

  const hayLibreta = datos.alturaInstrumental !== null
  const otroPunto = firma(ctx) !== firma(datos)
  const lecturaDeOtraEstacion =
    datos.lectura !== null && datos.estacionLectura !== null && datos.estacionLectura !== datos.numeroEstacion

  return (
    <section aria-labelledby={`${idBase}-titulo`} className="flex flex-col gap-3 px-4 pb-6">
      <h2 id={`${idBase}-titulo`} className="text-lg font-semibold">
        Calculadora de campo
      </h2>

      <div className="flex flex-col gap-2 rounded bg-slate-100 p-2 text-sm dark:bg-slate-900">
        {hayLibreta ? (
          <p>
            Estación {datos.numeroEstacion} · AI <span className="numerico">{m3(datos.alturaInstrumental)}</span> m
            {datos.progresiva !== null && ` · ${formatearProgresiva(datos.progresiva)}`}
            {datos.nombrePunto && ` · ${datos.nombrePunto}`}
          </p>
        ) : (
          <p>Sin estación activa: escriba los datos a mano.</p>
        )}
        {hayLibreta &&
          (datos.alturaComprobada ? (
            <Marca estado={{ simbolo: '✓', texto: 'AI de la estación activa comprobada por el cierre.' }} />
          ) : (
            <Marca
              estado={{
                simbolo: '△',
                texto:
                  'AI de la estación activa sin comprobar: la nivelación todavía no cierra, o esta estación queda antes del último circuito.',
              }}
            />
          ))}
        {lecturaDeOtraEstacion && (
          <p>
            La lectura de este punto se tomó desde la estación {datos.estacionLectura} (AI{' '}
            <span className="numerico">{m3(datos.alturaInstrumentalLectura)}</span> m
            {datos.lecturaComprobada ? ', comprobada' : ', sin comprobar'}).
          </p>
        )}
        {otroPunto && (
          <Marca
            estado={{
              simbolo: '△',
              texto: `Los datos son de ${describirPunto(datos)}; ahora está seleccionado ${describirPunto(ctx)}. Toque «Traer datos de la libreta» para cambiarlos.`,
            }}
          />
        )}
        <button
          type="button"
          onClick={traerDeLaLibreta}
          className="min-h-11 self-start rounded border border-slate-300 px-3 font-medium hover:bg-white dark:border-slate-600 dark:hover:bg-slate-800"
        >
          Traer datos de la libreta
        </button>
      </div>

      <div role="tablist" aria-label="Cálculos" onKeyDown={alTeclaEnPestanas} className="grid grid-cols-3 gap-1">
        {PESTANAS.map((p) => (
          <button
            key={p.id}
            ref={(nodo) => {
              refPestanas.current[p.id] = nodo
            }}
            type="button"
            role="tab"
            id={`${idBase}-pestana-${p.id}`}
            aria-selected={pestana === p.id}
            aria-controls={`${idBase}-panel`}
            tabIndex={pestana === p.id ? 0 : -1}
            onClick={() => setPestana(p.id)}
            className={`min-h-11 rounded px-1 text-sm leading-tight font-medium ${
              pestana === p.id
                ? 'bg-marca text-white'
                : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800'
            }`}
          >
            {p.etiqueta}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`${idBase}-panel`}
        aria-labelledby={`${idBase}-pestana-${pestana}`}
        className="flex flex-col gap-3"
      >
        {contenido()}
      </div>
    </section>
  )
}
