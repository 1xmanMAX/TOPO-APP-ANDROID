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
import { flushSync } from 'react-dom'
import AvisoLinea from '../../componentes/AvisoLinea'
import Plegable from '../../componentes/Plegable'
import { BOTON_PRINCIPAL, BOTON_SECUNDARIO, CEJA, ENLACE, TARJETA } from '../../componentes/ui'
import { useAlmacen } from '../../estado/almacen'
import { formatearDiferencia } from '../../estadoRasante'
import { useContextoCalculadora, type ContextoCalculadora } from './contextoCalculadora'
import { alturaDe, puestasDe } from '../../niveles/puestas'
import { textoDePuesta } from '../niveles/EditorPuestas'

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

/** El punto de un contexto en palabras: «0+060 · Eje». Vacío si no hay punto. */
function textoPunto(ctx: ContextoCalculadora): string {
  if (ctx.progresiva === null) return ''
  return [formatearProgresiva(ctx.progresiva), ctx.nombrePunto].filter(Boolean).join(' · ')
}

/** De dónde son los datos, con la calle si se pide: «Av. Sol · 0+060 · Eje» o «Av. Sol · estación 4». */
function describirDatos(ctx: ContextoCalculadora, conCalle: boolean): string {
  const punto = textoPunto(ctx) || (ctx.numeroEstacion !== null ? `estación ${ctx.numeroEstacion}` : 'ningún punto')
  return [conCalle ? ctx.nombreCalle : null, punto].filter(Boolean).join(' · ')
}

/** Las filas de casilleros van juntas en una tarjeta, una debajo de otra. */
const FILAS = `${TARJETA.replace('p-4', 'p-3.5')} flex flex-col gap-2.5`

/**
 * Los chips del lienzo para elegir qué calcular (y desde qué unidad): el
 * elegido oscuro como la cabecera. En modo sol la cabecera es negra como el
 * fondo, así que el elegido va en amarillo.
 */
function claseChip(elegido: boolean): string {
  return `inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold ${
    elegido
      ? 'border border-cabecera bg-cabecera text-white [.sol_&]:border-marca [.sol_&]:bg-marca [.sol_&]:text-black'
      : 'border border-borde-fuerte bg-tarjeta text-tinta hover:bg-fondo'
  }`
}

// ---------------------------------------------------------------------------
// Piezas
// ---------------------------------------------------------------------------

/**
 * Una fila de la tarjeta: el nombre a la izquierda y el casillero a la
 * derecha, como en el lienzo. Debajo del nombre puede ir de qué estación es
 * la AI y si está comprobada.
 */
function Casillero({
  etiqueta,
  valor,
  alCambiar,
  sufijo,
  ayuda,
  modo = 'decimal',
  subirAlEnfocar,
}: {
  etiqueta: string
  valor: string
  alCambiar: (valor: string) => void
  sufijo?: string
  ayuda?: ReactNode
  modo?: 'decimal' | 'text'
  /** En el celular, al tocarlo sube a la parte de arriba: lo de debajo queda sobre el teclado. */
  subirAlEnfocar?: () => void
}) {
  return (
    // scroll-mt deja libre la barra de arriba cuando el casillero sube.
    <label className="flex min-w-0 scroll-mt-16 items-center gap-2.5">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[15px] leading-tight text-tinta">
          {etiqueta}
          {sufijo && <span className="text-tenue"> {sufijo}</span>}
        </span>
        {ayuda && <span className="mt-0.5 text-[13px] leading-snug text-tenue">{ayuda}</span>}
      </span>
      <input
        type="text"
        inputMode={modo}
        // Nombre propio: sin él, la unidad de al lado se pegaría al nombre («Lecturam»).
        aria-label={etiqueta}
        value={valor}
        onChange={(evento) => alCambiar(evento.target.value)}
        onFocus={subirAlEnfocar ? (evento) => subirSobreElTeclado(evento.currentTarget, subirAlEnfocar) : undefined}
        className="numerico h-12 w-[150px] shrink-0 rounded-[10px] border border-borde-fuerte bg-tarjeta px-3 text-right text-lg text-tinta outline-none focus:border-marca focus:ring-2 focus:ring-marca"
      />
    </label>
  )
}

/**
 * En el celular el teclado tapa la mitad de abajo de la pantalla: al tocar
 * un casillero cuyo resultado sale debajo, se sube el casillero arriba del
 * todo para que el resultado quede entre él y el teclado, sin cerrar el
 * teclado ni desplazarse. En la laptop no hace falta y no se mueve nada.
 */
function subirSobreElTeclado(casillero: HTMLElement, hacerLugar: () => void) {
  if (typeof window.matchMedia !== 'function' || !window.matchMedia('(max-width: 639px)').matches) return
  // Si debajo queda poco, no hay a dónde subir: primero se hace lugar abajo
  // (un espacio vacío, como el que ocupará el teclado) y luego se sube.
  flushSync(hacerLugar)
  casillero.closest('label')?.scrollIntoView?.({ block: 'start' })
}

/**
 * Lo que va debajo del nombre de la AI: de qué estación es y si un cierre la
 * respalda, con su símbolo. Si ya no es la que trajo la libreta, se dice.
 */
function EstadoAi({
  estacion,
  comprobada,
  leyoElPunto,
  aMano,
}: {
  estacion: number | null
  comprobada: boolean
  leyoElPunto: boolean
  aMano: boolean
}) {
  if (aMano) return <>Escrita a mano</>
  if (estacion === null) return null
  return (
    <>
      Estación {estacion}
      {leyoElPunto && ', la que leyó el punto'} ·{' '}
      {comprobada ? (
        <span className="font-semibold text-pasa">
          <span aria-hidden="true">✓ </span>comprobada
        </span>
      ) : (
        <span className="font-semibold text-aviso">
          <span aria-hidden="true">△ </span>sin comprobar
        </span>
      )}
    </>
  )
}

interface Estado {
  simbolo: '✓' | '△' | '✗'
  texto: string
}

const TONO_ESTADO = { '✓': 'pasa', '△': 'aviso', '✗': 'falla' } as const

function Marca({ estado }: { estado: Estado }) {
  return (
    <AvisoLinea tono={TONO_ESTADO[estado.simbolo]} simbolo={estado.simbolo}>
      {estado.texto}
    </AvisoLinea>
  )
}

function Avisos({ avisos }: { avisos: string[] }) {
  if (avisos.length === 0) return null
  return (
    <ul className="flex flex-col gap-2">
      {avisos.map((aviso) => (
        <li key={aviso}>
          <AvisoLinea tono="aviso">{aviso}</AvisoLinea>
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
  /**
   * Datos que acompañan al número grande, en la misma tarjeta: «Objetivo
   * 2.065 m · mira 2.056 m». Así un cálculo con dos respuestas sigue siendo
   * una sola tarjeta con un solo par de botones.
   */
  secundarios?: { nombre: string; valor: string }[]
  /** Lo que se guarda en la nota si no basta con «título: valor». */
  nota?: string
  estados?: Estado[]
  avisos?: string[]
  /** Por qué no hay resultado, en palabras. */
  falta?: string
}

/**
 * Por qué un resultado no está comprobado (diseño §3), o null si lo está:
 * - 'libreta': usa datos de la libreta que ningún cierre respalda todavía;
 * - 'aMano': la AI se escribió a mano o salió de un punto conocido con una
 *   sola vista atrás. Ningún cierre la respalda, aunque la nivelación de la
 *   calle sí haya cerrado: el ✓ de la cabecera habla de la AI de la libreta.
 */
type Motivo = 'libreta' | 'aMano' | null

const NO_COMPROBADO: Record<Exclude<Motivo, null>, Estado> = {
  libreta: {
    simbolo: '△',
    texto: 'No comprobado: usa datos de la libreta que ningún cierre respalda todavía.',
  },
  aMano: {
    simbolo: '△',
    texto: 'No comprobado: AI escrita a mano o sacada de un punto conocido, ningún cierre la respalda.',
  },
}

/** Lo que se añade a la nota guardada para que el «no comprobado» no se pierda. */
const NOTA_NO_COMPROBADO: Record<Exclude<Motivo, null>, string> = {
  libreta: 'no comprobado, ningún cierre lo respalda',
  aMano: 'no comprobado, AI escrita a mano sin cierre que la respalde',
}

/**
 * La tarjeta oscura del resultado, como en el lienzo: el número grande en
 * naranja claro sobre la cabecera. Debajo, sus avisos con símbolo y, solo si
 * hay resultado, «Copiar resultado» y «Guardar como nota».
 *
 * La nota se guarda en la progresiva del punto de donde salieron los datos.
 * Si no hay punto, la progresiva se pide al pulsar «Guardar como nota». La
 * tarjeta se monta de nuevo cada vez que se traen datos (su key lleva la
 * generación de la foto), así que lo pedido no se arrastra a otro punto.
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
  noComprobado: Motivo
  /** La calle activa ahora: si ya no es la de la foto, no se guarda una nota en la calle equivocada. */
  calleViva: string | null
}) {
  const agregarNota = useAlmacen((s) => s.agregarNota)
  // Sin punto elegido, la progresiva se escribe; con punto, ni se ve.
  const [pidiendoProgresiva, setPidiendoProgresiva] = useState(false)
  const [progresivaEscrita, setProgresivaEscrita] = useState('')
  const [mensaje, setMensaje] = useState<string | null>(null)
  // «Copiado: X» o «Nota guardada» hablan del resultado de antes: si el
  // resultado cambia, el mensaje se va (patrón de estado previo de React).
  const [copiablePrevio, setCopiablePrevio] = useState(calculo.copiable)
  if (copiablePrevio !== calculo.copiable) {
    setCopiablePrevio(calculo.copiable)
    setMensaje(null)
  }
  const idTitulo = useId()

  const estados = [...(calculo.estados ?? []), ...(noComprobado && calculo.valor ? [NO_COMPROBADO[noComprobado]] : [])]
  const progresiva = ctx.progresiva ?? parsearProgresiva(progresivaEscrita)
  const mismaCalle = ctx.calleId !== null && ctx.calleId === calleViva
  const hayResultado = calculo.valor !== null

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
    if (!hayResultado || !mismaCalle || ctx.calleId === null) return
    if (progresiva === null) {
      setPidiendoProgresiva(true)
      setMensaje(progresivaEscrita.trim() === '' ? null : 'Escriba la progresiva como 0+020.')
      return
    }
    const partes = [calculo.nota ?? `${calculo.titulo}: ${calculo.valor}`]
    if (calculo.detalle) partes.push(calculo.detalle)
    if (noComprobado) partes.push(NOTA_NO_COMPROBADO[noComprobado])
    agregarNota(ctx.calleId, { progresiva, texto: partes.join(' · '), fecha: new Date().toISOString() })
    setPidiendoProgresiva(false)
    setProgresivaEscrita('')
    setMensaje(`Nota guardada en ${formatearProgresiva(progresiva)}.`)
  }

  return (
    <section aria-labelledby={idTitulo} className="flex flex-col gap-2">
      {/* En modo sol la cabecera es negra como el fondo: un borde blanco la recorta. */}
      <div className="flex flex-col gap-1 rounded-[14px] bg-cabecera p-4 [.sol_&]:border [.sol_&]:border-white">
        <h3 id={idTitulo} className={CEJA.replace('text-tenue', 'text-cabecera-tenue')}>
          Resultado · {calculo.titulo}
        </h3>
        <output
          aria-live="polite"
          className="numerico block text-[40px] leading-tight md:text-[34px] font-semibold break-words text-[#FDBA74]"
        >
          {calculo.valor ?? '—'}
        </output>
        {calculo.valor === null && calculo.falta && <p className="text-sm text-cabecera-texto">{calculo.falta}</p>}
        {calculo.valor !== null && calculo.secundarios && calculo.secundarios.length > 0 && (
          <p className="text-[15px] text-cabecera-texto">
            {calculo.secundarios.map((dato, i) => (
              <span key={dato.nombre}>
                {i > 0 && ' · '}
                {dato.nombre}{' '}
                <span className="numerico font-semibold text-white">{dato.valor}</span>
              </span>
            ))}
          </p>
        )}
        {calculo.valor !== null && calculo.detalle && (
          <p className="text-sm text-cabecera-texto">{calculo.detalle}</p>
        )}
      </div>
      {estados.map((estado) => (
        <Marca key={estado.texto} estado={estado} />
      ))}
      <Avisos avisos={calculo.avisos ?? []} />

      {hayResultado && (
        <>
          {pidiendoProgresiva && ctx.progresiva === null && (
            <label className="flex items-center gap-3">
              <span className="flex-1 text-[15px] text-tinta">Progresiva de la nota</span>
              <input
                type="text"
                inputMode="decimal"
                autoFocus
                value={progresivaEscrita}
                placeholder="0+020"
                onChange={(evento) => setProgresivaEscrita(evento.target.value)}
                onKeyDown={(evento) => {
                  if (evento.key === 'Enter') guardarNota()
                }}
                className="numerico h-12 w-[150px] shrink-0 rounded-[10px] border border-borde-fuerte bg-tarjeta px-3 text-right text-lg text-tinta outline-none focus:border-marca focus:ring-2 focus:ring-marca"
              />
            </label>
          )}
          {/* Menos relleno a los lados: en el panel de 384 px «Guardar como nota» cabe en una línea. */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={copiar}
              disabled={!calculo.copiable}
              className={BOTON_SECUNDARIO.replace('px-4', 'px-2')}
            >
              Copiar resultado
            </button>
            <button
              type="button"
              onClick={guardarNota}
              disabled={!mismaCalle}
              className={BOTON_PRINCIPAL.replace('px-4', 'px-2')}
            >
              Guardar como nota
            </button>
          </div>
          {calleViva === null ? (
            <p className="text-[13px] text-tenue">Elija una calle para poder guardar notas.</p>
          ) : (
            !mismaCalle && (
              <p className="text-[13px] text-tenue">
                Estos datos son de otra calle: toque «cambiar» arriba para guardar la nota en la calle activa.
              </p>
            )
          )}
        </>
      )}
      <p role="status" className="min-h-5 text-sm text-tinta">
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

/**
 * Lectura objetivo (AI − cota de proyecto) y, si se escribió lo que marca la
 * mira, si corta o rellena. Es UNA sola respuesta: con lectura de mira, lo
 * grande es «Cortar 9 mm» y el objetivo va al lado como dato; sin ella, lo
 * grande es el objetivo. Un solo par de botones y un solo «no comprobado».
 */
function calculoObjetivo(
  v: Valores,
  reglas: ReglasMira | null,
  alturaComprobada: boolean,
  tarjetaMarcaNoComprobado: boolean,
  sinRepartir: boolean,
): Calculo {
  const ai = numero(v.ai)
  const cotaProyecto = numero(v.cotaProyecto)
  const objetivo = lecturaObjetivo(ai, cotaProyecto)
  const avisos: string[] = []
  if (objetivo !== null) {
    const aviso = avisoDeMira(objetivo, reglas)
    if (aviso) avisos.push(`Objetivo: ${aviso}`)
  }
  const soloObjetivo: Calculo = {
    titulo: 'Lectura objetivo',
    valor: objetivo !== null ? `${m3(objetivo)} m` : null,
    copiable: objetivo !== null ? m3(objetivo) : null,
    detalle: objetivo !== null ? `AI ${m3(ai)} − cota de proyecto ${m3(cotaProyecto)}` : undefined,
    avisos,
    falta: 'Escriba la altura instrumental y la cota de proyecto.',
  }

  if ((v.lecturaMira ?? '').trim() === '' || objetivo === null) return soloObjetivo

  const lecturaMira = numero(v.lecturaMira)
  const evaluado = evaluarLectura({
    alturaInstrumental: ai,
    lectura: lecturaMira,
    cotaProyecto,
    toleranciaMm: numero(v.tolerancia),
    alturaComprobada,
    mira: reglas ?? undefined,
  })
  const estado = estadoDeAvisoLectura(evaluado.estado, evaluado.diferenciaMm)
  const estados = estado ? [estado] : []
  // La tarjeta ya pone el «no comprobado» con su símbolo y su motivo: el
  // aviso genérico del motor («nivelación sin cerrar») no se repite, y
  // confundiría si la AI se escribió a mano en una calle que sí cerró.
  const avisosMira = tarjetaMarcaNoComprobado
    ? evaluado.avisos.filter((a) => a !== AVISO_SIN_COMPROBAR)
    : evaluado.avisos
  const accion = evaluado.accion ? textoAccion(evaluado.accion.tipo, evaluado.accion.mm) : null
  // La mira no se puede juzgar (no cabe, no es un número…): lo grande sigue
  // siendo el objetivo y el aviso dice por qué no hay corte ni relleno.
  if (accion === null) return { ...soloObjetivo, estados, avisos: [...avisos, ...avisosMira] }

  const textoObjetivo = `${m3(objetivo)} m`
  const textoMira = `${m3(lecturaMira)} m`
  // Con la AI de la libreta tal cual (sin compensar), Revisar puede dar
  // unos milímetros distintos cuando la nivelación cerró: se dice.
  const cotaMedida =
    evaluado.cota !== null
      ? `Cota medida ${m3(evaluado.cota)} m${sinRepartir ? ', sin repartir el error de cierre' : ''}`
      : null
  return {
    titulo: 'Lectura objetivo',
    valor: accion,
    copiable: evaluado.diferenciaMm !== null ? String(evaluado.diferenciaMm) : null,
    secundarios: [
      { nombre: 'Objetivo', valor: textoObjetivo },
      { nombre: 'mira', valor: textoMira },
    ],
    detalle: cotaMedida ?? undefined,
    nota: `Lectura objetivo ${textoObjetivo}, mira ${textoMira}: ${accion}`,
    estados,
    avisos: [...avisos, ...avisosMira],
    falta: soloObjetivo.falta,
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
 * Los casilleros son una foto de la libreta al abrir (o al pulsar «cambiar»
 * junto a «Con datos de…»): en la laptop el panel queda abierto mientras se
 * tocan otros puntos, y lo que se escribió no se borra solo. Si el punto
 * seleccionado cambia, se avisa en vez de mezclar datos de dos puntos.
 */
export default function PanelCalculadora() {
  const ctx = useContextoCalculadora()
  const [foto, setFoto] = useState<Foto>(() => tomarFoto(ctx, 0))
  const [valores, setValores] = useState<Valores>(() => foto.valores)
  const [pestana, setPestana] = useState<IdPestana>('cota')
  const [unidad, setUnidad] = useState<UnidadPendiente>('porcentaje')
  /**
   * En el celular, al tocar la lectura en la mira se deja un espacio vacío al
   * final (lo que tapa el teclado) para que su casillero pueda subir arriba
   * del todo. Se queda puesto: quitarlo al soltar el casillero movería los
   * botones justo cuando se van a tocar.
   */
  const [lugarTeclado, setLugarTeclado] = useState(false)
  const hacerLugarAlTeclado = () => setLugarTeclado(true)
  const idBase = useId()
  const refPestanas = useRef<Partial<Record<IdPestana, HTMLButtonElement | null>>>({})

  const reglas = reglasDeMira(ctx.instrumento)
  const cambiar = (clave: string) => (valor: string) => setValores((x) => ({ ...x, [clave]: valor }))
  // Las puestas y los BMs del proyecto: la misma base de datos que Niveles, el plano y Replantear.
  const proyecto = useAlmacen((s) => s.proyecto)
  const agregarPuesta = useAlmacen((s) => s.agregarPuesta)
  const [bmDelPunto, setBmDelPunto] = useState<string | null>(null)
  const [puestaGuardada, setPuestaGuardada] = useState(false)
  const puestasDelProyecto = puestasDe(proyecto)
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
  /**
   * Motivo para marcar un resultado que usa la AI del casillero `claveAi`:
   * una AI que no es la que trajo la libreta nunca está comprobada.
   */
  const motivo = (claveAi: string, otras: string[] = []): Motivo => {
    if (v(claveAi) !== '' && !deLaLibreta(claveAi)) return 'aMano'
    return noComprobado([claveAi, ...otras]) ? 'libreta' : null
  }
  const motivoLibreta = (claves: string[]): Motivo => (noComprobado(claves) ? 'libreta' : null)
  const llave = (nombre: string) => `${nombre}-${foto.generacion}`
  const tarjeta = (nombre: string, calculo: Calculo, marcar: Motivo) => (
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
        // La AI de la cota es la de la estación que leyó el punto, que no
        // siempre es la activa: se dice cuál es y si un cierre la respalda.
        const estacionAiCota = datos.lectura !== null ? datos.estacionLectura : datos.numeroEstacion
        const leyoOtra = datos.lectura !== null && estacionAiCota !== null && estacionAiCota !== datos.numeroEstacion
        return (
          <>
            <div className={FILAS}>
              <Casillero
                etiqueta="Altura instrumental"
                sufijo="m"
                valor={v('aiCota')}
                alCambiar={cambiar('aiCota')}
                ayuda={
                  v('aiCota') !== '' && (
                    <EstadoAi
                      estacion={estacionAiCota}
                      comprobada={foto.comprobados.aiCota === true}
                      leyoElPunto={leyoOtra}
                      aMano={!deLaLibreta('aiCota')}
                    />
                  )
                }
              />
              <Casillero etiqueta="Lectura" sufijo="m" valor={v('lectura')} alCambiar={cambiar('lectura')} />
            </div>
            {tarjeta('cota', calculoCota(valores, ctx, reglas), motivo('aiCota', ['lectura']))}
            {puestasDelProyecto.length > 0 && (
              <label className="flex flex-col gap-1 text-[13px] text-tenue">
                <span>AI de una puesta del proyecto</span>
                <select
                  aria-label="AI de una puesta del proyecto"
                  value=""
                  onChange={(e) => {
                    const p = puestasDelProyecto.find((x) => x.id === e.target.value)
                    const ai = p ? alturaDe(p, proyecto) : null
                    if (ai !== null) setValores((x) => ({ ...x, aiCota: m3(ai), ai: m3(ai) }))
                  }}
                  className="min-h-11 rounded-[10px] border border-borde-fuerte bg-tarjeta px-2 text-[15px] text-tinta"
                >
                  <option value="">Elegir puesta…</option>
                  {puestasDelProyecto.map((p) => (
                    <option key={p.id} value={p.id}>
                      {textoDePuesta(p, alturaDe(p, proyecto))}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <Plegable titulo="Altura instrumental desde un punto conocido">
              {proyecto.bms.length > 0 && (
                <label className="mb-2 flex flex-col gap-1 text-[13px] text-tenue">
                  <span>El punto conocido es un BM</span>
                  <select
                    aria-label="El punto conocido es un BM"
                    value={bmDelPunto ?? ''}
                    onChange={(e) => {
                      const bm = proyecto.bms.find((b) => b.id === e.target.value)
                      setBmDelPunto(bm?.id ?? null)
                      setPuestaGuardada(false)
                      if (bm) setValores((x) => ({ ...x, cotaConocida: m3(bm.cota) }))
                    }}
                    className="min-h-11 rounded-[10px] border border-borde-fuerte bg-tarjeta px-2 text-[15px] text-tinta"
                  >
                    <option value="">Otro punto (escribe su cota)</option>
                    {proyecto.bms.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.nombre} · {m3(b.cota)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className={FILAS}>
                <Casillero
                  etiqueta="Cota del punto conocido"
                  sufijo="m"
                  valor={v('cotaConocida')}
                  alCambiar={cambiar('cotaConocida')}
                />
                <Casillero etiqueta="Vista atrás" sufijo="m" valor={v('vistaAtras')} alCambiar={cambiar('vistaAtras')} />
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <p className="numerico text-lg font-semibold">AI = {aiPunto !== null ? `${m3(aiPunto)} m` : '—'}</p>
                <button
                  type="button"
                  disabled={aiPunto === null}
                  // Sirve para las dos pestañas que usan AI: la cota y la lectura objetivo.
                  onClick={() => aiPunto !== null && setValores((x) => ({ ...x, aiCota: m3(aiPunto), ai: m3(aiPunto) }))}
                  className={BOTON_SECUNDARIO}
                >
                  Usar esta altura instrumental
                </button>
                <button
                  type="button"
                  disabled={aiPunto === null}
                  onClick={() => {
                    const bm = proyecto.bms.find((b) => b.id === bmDelPunto)
                    agregarPuesta({
                      nombre: `${bm ? bm.nombre : 'Punto'} · ${v('vistaAtras').trim()}`,
                      cotaBM: numero(v('cotaConocida')),
                      lecturaAtras: numero(v('vistaAtras')),
                      bmId: bm && m3(bm.cota) === m3(numero(v('cotaConocida'))) ? bm.id : null,
                    })
                    setPuestaGuardada(true)
                  }}
                  className={BOTON_SECUNDARIO}
                >
                  Guardar como puesta
                </button>
              </div>
              {puestaGuardada && (
                <p className="mt-1 text-[13px] text-pasa">✓ Guardada: ya sirve en Niveles, el plano, Replantear y la hoja de estacas.</p>
              )}
            </Plegable>
          </>
        )
      }
      case 'objetivo': {
        const hayMira = v('lecturaMira').trim() !== ''
        const marcar = hayMira ? motivo('ai', ['lecturaMira']) : motivo('ai')
        // La cota que sale de AI − lectura no reparte el error de cierre;
        // Revisar sí. Solo importa si la nivelación cerró y la AI es la suya.
        const sinRepartir = deLaLibreta('ai') && foto.comprobados.ai === true
        const calculo = calculoObjetivo(
          valores,
          reglas,
          alturaComprobada,
          marcar !== null,
          sinRepartir,
        )
        const lecturaDeOtra =
          datos.lectura !== null && datos.estacionLectura !== null && !lecturaDeLaActiva(datos)
        // Los cuatro casilleros van juntos arriba y la única tarjeta sale
        // justo debajo: en el celular, con el teclado abierto al escribir la
        // lectura, el corte/relleno sigue a la vista sin desplazarse.
        return (
          <>
            <div className={FILAS}>
              <Casillero
                etiqueta="Altura instrumental"
                sufijo="m"
                valor={v('ai')}
                alCambiar={cambiar('ai')}
                ayuda={
                  v('ai') !== '' && (
                    <EstadoAi
                      estacion={datos.numeroEstacion}
                      comprobada={foto.comprobados.ai === true}
                      leyoElPunto={false}
                      aMano={!deLaLibreta('ai')}
                    />
                  )
                }
              />
              <Casillero
                etiqueta="Cota de proyecto"
                sufijo="m"
                valor={v('cotaProyecto')}
                alCambiar={cambiar('cotaProyecto')}
              />
              <Casillero
                etiqueta="Lectura en la mira"
                sufijo="m"
                valor={v('lecturaMira')}
                alCambiar={cambiar('lecturaMira')}
                subirAlEnfocar={hacerLugarAlTeclado}
              />
              <Casillero
                etiqueta="Tolerancia"
                sufijo="mm"
                valor={v('tolerancia')}
                alCambiar={cambiar('tolerancia')}
                subirAlEnfocar={hacerLugarAlTeclado}
              />
            </div>
            <p className="-mt-1 text-[13px] text-tenue">
              {lecturaDeOtra
                ? `La lectura anotada en este punto es de la estación ${datos.estacionLectura}, no de la activa: lea la mira ahora.`
                : 'La lectura en la mira es opcional: dice si corta o rellena.'}
            </p>
            {tarjeta('objetivo', calculo, marcar)}
          </>
        )
      }
      case 'pendiente':
        return (
          <>
            <div className={FILAS}>
              <Casillero etiqueta="Cota inicial" sufijo="m" valor={v('pendInicial')} alCambiar={cambiar('pendInicial')} />
              <Casillero etiqueta="Cota final" sufijo="m" valor={v('pendFinal')} alCambiar={cambiar('pendFinal')} />
              <Casillero etiqueta="Distancia" sufijo="m" valor={v('pendDist')} alCambiar={cambiar('pendDist')} />
            </div>
            {tarjeta('pendiente', calculoPendiente(valores), motivoLibreta(['pendInicial', 'pendFinal']))}
          </>
        )
      case 'interpolar':
        return (
          <>
            <div className={FILAS}>
              <Casillero etiqueta="Progresiva A" modo="text" valor={v('progA')} alCambiar={cambiar('progA')} />
              <Casillero etiqueta="Cota A" sufijo="m" valor={v('cotaA')} alCambiar={cambiar('cotaA')} />
              <Casillero etiqueta="Progresiva B" modo="text" valor={v('progB')} alCambiar={cambiar('progB')} />
              <Casillero etiqueta="Cota B" sufijo="m" valor={v('cotaB')} alCambiar={cambiar('cotaB')} />
              <Casillero etiqueta="Progresiva buscada" modo="text" valor={v('progX')} alCambiar={cambiar('progX')} />
            </div>
            {tarjeta('interpolar', calculoInterpolar(valores), motivoLibreta(['cotaA', 'cotaB']))}
          </>
        )
      case 'volumen':
        return (
          <>
            <div className={FILAS}>
              <Casillero etiqueta="Área inicial" sufijo="m²" valor={v('areaA')} alCambiar={cambiar('areaA')} />
              <Casillero etiqueta="Área final" sufijo="m²" valor={v('areaB')} alCambiar={cambiar('areaB')} />
              <Casillero
                etiqueta="Distancia entre secciones"
                sufijo="m"
                valor={v('volDist')}
                alCambiar={cambiar('volDist')}
              />
            </div>
            {tarjeta('volumen', calculoVolumen(valores), null)}
          </>
        )
      case 'conversion':
        return (
          <>
            <fieldset className="flex flex-col gap-2">
              <legend className={`${CEJA} mb-2`}>Convertir desde</legend>
              <div className="flex flex-wrap gap-2">
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
                    className={claseChip(unidad === id)}
                  >
                    {texto}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className={FILAS}>
              <Casillero
                etiqueta="Pendiente a convertir"
                modo={unidad === 'relacion' ? 'text' : 'decimal'}
                sufijo={unidad === 'porcentaje' ? '%' : unidad === 'grados' ? '°' : undefined}
                valor={v('convValor')}
                alCambiar={cambiar('convValor')}
              />
            </div>
            {tarjeta('conversion', calculoConversion(valores, unidad), null)}
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
  const hayAlgoQueTraer = hayLibreta || ctx.alturaInstrumental !== null

  /**
   * La línea de debajo del título: de dónde son los datos y «cambiar». Si en
   * la calle se eligió otro punto (u otra estación) desde que se trajeron,
   * lo dice en ámbar en vez de mezclar datos de dos puntos.
   */
  function lineaDeDatos(): ReactNode {
    if (otroPunto && hayAlgoQueTraer) {
      const mismoPunto =
        datos.calleId === ctx.calleId && datos.progresiva === ctx.progresiva && datos.nombrePunto === ctx.nombrePunto
      const otraCalle = datos.calleId !== ctx.calleId
      let texto: string
      if (!mismoPunto) {
        texto = `Con datos de ${describirDatos(datos, true)} · ahora tienes ${describirDatos(ctx, otraCalle)} elegido`
      } else if (datos.numeroEstacion !== ctx.numeroEstacion) {
        // El punto se sigue diciendo: la nota se guarda en él, y se tiene
        // que ver dónde va a caer antes de pulsar «Guardar como nota».
        const punto = textoPunto(datos) ? `${describirDatos(datos, true)} · ` : ''
        const de = `Con datos de ${punto}estación ${datos.numeroEstacion ?? '—'}`
        texto =
          ctx.numeroEstacion !== null
            ? `${de} · ahora tienes la estación ${ctx.numeroEstacion} activa`
            : `${de} · ahora no hay estación activa`
      } else {
        texto = `Con datos de ${describirDatos(datos, true)} · la libreta cambió desde entonces`
      }
      return (
        <p className="text-sm font-medium text-aviso">
          <span aria-hidden="true">△ </span>
          {texto} ·{' '}
          <button type="button" onClick={traerDeLaLibreta} className={`${ENLACE} -my-3 align-middle`}>
            cambiar
          </button>
        </p>
      )
    }
    if (!hayLibreta) return <p className="text-sm text-tenue">Sin estación activa: escriba los datos a mano.</p>
    return (
      <p className="text-sm text-tenue">
        Con datos de <b className="font-semibold text-tinta">{describirDatos(datos, true)}</b> ·{' '}
        <button type="button" onClick={traerDeLaLibreta} className={`${ENLACE} -my-3 align-middle`}>
          cambiar
        </button>
      </p>
    )
  }

  return (
    <section aria-labelledby={`${idBase}-titulo`} className="flex flex-col gap-3 px-4 pt-4 pb-6">
      {/* pr-14: la ✕ de cerrar va arriba a la derecha y no se pisa con el título. */}
      <header className="flex flex-col pr-14">
        <h2 id={`${idBase}-titulo`} className="text-[26px] leading-tight font-bold">
          Calcular
        </h2>
        {lineaDeDatos()}
      </header>

      <div role="tablist" aria-label="Cálculos" onKeyDown={alTeclaEnPestanas} className="flex flex-wrap gap-2">
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
            className={claseChip(pestana === p.id)}
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
      {lugarTeclado && pestana === 'objetivo' && <div aria-hidden="true" className="h-[50vh] shrink-0 sm:hidden" />}
    </section>
  )
}
