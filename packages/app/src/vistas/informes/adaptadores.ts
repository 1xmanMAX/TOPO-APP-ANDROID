import {
  aMilimetros,
  alturaInstrumental as alturaInstrumentalDe,
  areasEntreSuperficies,
  calcularCampania,
  calcularCotas,
  claveDestino,
  compararCapas,
  compensarPuntos,
  correccionesDeLaToma,
  esLecturaUsable,
  espesoresPorEncimaDe,
  evaluarContraRasante,
  formatearProgresiva,
  hojaDeReplanteo,
  instrumentoCompleto,
  progresivasDeLaToma,
  redondear3,
  volumenesPorAreasMedias,
  type BM,
  type Calle,
  type Capa,
  type DestinoLectura,
  type Id,
  type Instrumento,
  type Nivelacion,
  type Proyecto,
  type ResultadoCampania,
  type SeccionConAreas,
  type Toma,
  type TramoComprobado,
} from '@topo/core'
import {
  controlContraProyecto,
  datosDeEstacasDesdeHoja,
  espesores,
  hojaDeEstacas,
  libretaConCierre,
  metrado,
  protocoloNivelacion,
  type BaseInforme,
  type CierreLibreta,
  type DatosControl,
  type DatosEspesores,
  type DatosEstacas,
  type DatosLibreta,
  type DatosMetrado,
  type DatosProtocolo,
  type Encabezado,
  type FilaEspesor,
  type FilaLibreta,
  type FilaProtocolo,
} from '../../informes'

/*
 * Del proyecto a los datos de cada informe PDF. Aquí no se hace ninguna
 * cuenta propia: las cotas, el cierre, las diferencias, los espesores, las
 * áreas, los volúmenes y la hoja de replanteo salen del motor (@topo/core).
 * Lo único que se hace es elegir qué toma, qué tramo y qué textos van en el
 * encabezado, y decir por qué un informe no se puede armar todavía.
 *
 * Regla dura (diseño §3): `comprobado` sale SIEMPRE del cierre real que
 * calcula el motor, nunca de lo que diga la pantalla.
 */

export type TipoInforme = 'protocolo' | 'libreta' | 'control' | 'espesores' | 'metrado' | 'estacas'

export interface FichaInforme {
  tipo: TipoInforme
  titulo: string
  descripcion: string
}

/** Una tarjeta por informe, en el orden en que se usan en obra. */
export const FICHAS: readonly FichaInforme[] = [
  {
    tipo: 'protocolo',
    titulo: 'Protocolo de nivelación',
    descripcion: 'Cada punto medido contra la cota de proyecto, con su semáforo. El que firma la supervisión.',
  },
  {
    tipo: 'libreta',
    titulo: 'Libreta con cierre',
    descripcion: 'Las lecturas como se tomaron, la comprobación aritmética y el error de cierre.',
  },
  {
    tipo: 'control',
    titulo: 'Control contra proyecto',
    descripcion: 'Solo lo que hay que corregir: dónde cortar y dónde rellenar, en mm.',
  },
  {
    tipo: 'espesores',
    titulo: 'Control de espesores',
    descripcion: 'Espesor colocado entre dos capas contra el espesor de proyecto.',
  },
  {
    tipo: 'metrado',
    titulo: 'Metrado',
    descripcion: 'Áreas de corte y relleno por sección y volúmenes por áreas medias.',
  },
  {
    tipo: 'estacas',
    titulo: 'Hoja de estacas',
    descripcion: 'La lectura que debe marcar la mira en cada punto para replantear una capa.',
  },
]

export function fichaDe(tipo: TipoInforme): FichaInforme {
  return FICHAS.find((f) => f.tipo === tipo)!
}

/** Qué informe se arma y sobre qué parte de la obra. */
export interface Alcance {
  calleId: Id | null
  /** La jornada (toma) de donde salen las cotas. En espesores, la de la capa de arriba. */
  tomaId: Id | null
  /** Espesores: la jornada de la capa de abajo. Si falta, la más cercana por debajo. */
  tomaAbajoId?: Id | null
  /** Hoja de estacas: la capa que se va a replantear. Si falta, la de la jornada. */
  capaReplanteoId?: Id | null
  /** Hoja de estacas: el BM donde se planta el nivel. Si falta, el de arranque de la jornada. */
  bmId?: Id | null
  /** Hoja de estacas: vista atrás sobre ese BM (m). Sin ella no hay lectura objetivo. */
  vistaAtrasBm?: number | null
  /** Hoja de estacas: progresiva donde está el nivel, para comprobar el largo de las visuales. */
  progresivaEstacion?: number | null
  /** Tramo, en metros. Sin límite si falta. */
  desde?: number | null
  hasta?: number | null
}

export interface OpcionesInforme {
  /** Imprimir las notas de campo de la calle que caen en el tramo. */
  notas: boolean
  /** Cuadros de firma al final. */
  firmas: boolean
  supervisor?: string
  /** dataURL PNG o JPEG. */
  logo?: string
  /** Para la fecha de la hoja de estacas; las pruebas la fijan. */
  hoy?: Date
}

export type DatosDeInforme =
  | { tipo: 'protocolo'; datos: DatosProtocolo }
  | { tipo: 'libreta'; datos: DatosLibreta }
  | { tipo: 'control'; datos: DatosControl }
  | { tipo: 'espesores'; datos: DatosEspesores }
  | { tipo: 'metrado'; datos: DatosMetrado }
  | { tipo: 'estacas'; datos: DatosEstacas }

/**
 * Lo que la pantalla dice encima del PDF: si está comprobado y por qué, con
 * las palabras de ESE informe (en la hoja de estacas no hay nivelación que
 * cierre; en espesores son dos). `falla` es un cierre fuera de tolerancia
 * (✗); `sinCerrar`, que todavía no hay con qué comprobarlo (△).
 */
export type EstadoVeredicto = 'comprobado' | 'falla' | 'sinCerrar'

export interface Veredicto {
  estado: EstadoVeredicto
  /** Frase completa; empieza por «Comprobado:» o por «No comprobado:». */
  texto: string
}

export type Preparado<T> =
  | {
      listo: true
      datos: T
      /** Lo que conviene saber antes de imprimir (los avisos del motor), en palabras. */
      avisos: string[]
      veredicto: Veredicto
    }
  | { listo: false; motivo: string }

export type Preparacion =
  | { listo: true; informe: DatosDeInforme; avisos: string[]; veredicto: Veredicto; nombreArchivo: string }
  | { listo: false; motivo: string }

/** Sin calles no hay nada que elegir: se dice dónde se crean. */
export const SIN_CALLES = 'El proyecto todavía no tiene calles: créalas en Obra.'

// ---------------------------------------------------------------------------
// Tomas de una calle
// ---------------------------------------------------------------------------

export interface TomaDeCalle {
  toma: Toma
  nivelacion: Nivelacion
  capa: Capa | undefined
}

/** Todas las jornadas de una calle, de la más antigua a la más nueva. */
export function tomasDeCalle(proyecto: Proyecto, calleId: Id | null): TomaDeCalle[] {
  const calle = proyecto.calles.find((c) => c.id === calleId)
  if (!calle) return []
  return calle.nivelaciones
    .flatMap((nivelacion) =>
      nivelacion.tomas.map((toma) => ({ toma, nivelacion, capa: proyecto.capas.find((c) => c.id === toma.capaId) })),
    )
    .sort((a, b) => a.toma.fecha.localeCompare(b.toma.fecha))
}

/** La jornada con que arranca el alcance: la activa si es de esta calle; si no, la última. */
export function tomaPorDefecto(proyecto: Proyecto, calleId: Id | null, tomaActivaId: Id | null): Id | null {
  const tomas = tomasDeCalle(proyecto, calleId)
  if (tomas.some((t) => t.toma.id === tomaActivaId)) return tomaActivaId
  return tomas[tomas.length - 1]?.toma.id ?? null
}

/**
 * Jornadas que pueden ser la capa de abajo de un control de espesores: de la
 * misma calle y de una capa más baja en el paquete. La primera de la lista
 * es la que se usa si no se elige: la capa inmediatamente inferior y, de
 * ella, la jornada más nueva.
 */
export function tomasDeAbajo(proyecto: Proyecto, calleId: Id | null, tomaArribaId: Id | null): TomaDeCalle[] {
  const tomas = tomasDeCalle(proyecto, calleId)
  const arriba = tomas.find((t) => t.toma.id === tomaArribaId)
  if (!arriba?.capa) return []
  const ordenArriba = arriba.capa.orden
  return tomas
    .filter((t) => t.capa !== undefined && t.capa.orden < ordenArriba)
    .sort((a, b) => b.capa!.orden - a.capa!.orden || b.toma.fecha.localeCompare(a.toma.fecha))
}

/** «Subrasante · 19/08/2026 · Terreno existente»: cómo se nombra una jornada en las listas. */
export function nombreDeToma(t: TomaDeCalle): string {
  return `${t.capa?.nombre ?? 'Capa sin nombre'} · ${fechaImpresa(t.toma.fecha)} · ${t.nivelacion.nombre}`
}

// ---------------------------------------------------------------------------
// Textos comunes
// ---------------------------------------------------------------------------

/** «2026-08-19» → «19/08/2026». Lo que no viene en ISO se imprime tal cual. */
export function fechaImpresa(fecha: string): string {
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha)
  return iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : fecha
}

function fechaDeHoy(hoy: Date): string {
  const dos = (n: number) => String(n).padStart(2, '0')
  return `${dos(hoy.getDate())}/${dos(hoy.getMonth() + 1)}/${hoy.getFullYear()}`
}

function enTramo(progresiva: number, alcance: Pick<Alcance, 'desde' | 'hasta'>): boolean {
  const { desde, hasta } = alcance
  if (typeof desde === 'number' && Number.isFinite(desde) && progresiva < desde - 1e-9) return false
  if (typeof hasta === 'number' && Number.isFinite(hasta) && progresiva > hasta + 1e-9) return false
  return true
}

/** «0+000 a 0+080» con las progresivas que de verdad entraron; «—» si ninguna. */
function textoTramo(progresivas: number[]): string {
  const validas = progresivas.filter((p) => Number.isFinite(p))
  if (validas.length === 0) return '—'
  const min = Math.min(...validas)
  const max = Math.max(...validas)
  return min === max ? formatearProgresiva(min) : `${formatearProgresiva(min)} a ${formatearProgresiva(max)}`
}

/** Las notas de campo de la calle que caen en el tramo, ordenadas por progresiva. */
export function notasDeCalle(calle: Calle, alcance: Pick<Alcance, 'desde' | 'hasta'>): string[] {
  return [...(calle.notas ?? [])]
    .filter((n) => enTramo(n.progresiva, alcance))
    .sort((a, b) => a.progresiva - b.progresiva)
    .map((n) => `${formatearProgresiva(n.progresiva)}: ${n.texto}`)
}

function nombreDeArchivo(...partes: (string | undefined)[]): string {
  return partes
    .filter((p): p is string => p !== undefined && p.trim() !== '')
    .join(' — ')
    .replace(/[\\/:*?"<>|]+/g, '-')
}

function encabezadoDe(
  proyecto: Proyecto,
  campos: Pick<Encabezado, 'calle' | 'capa' | 'fecha' | 'tramo' | 'bm' | 'toleranciaMm'>,
  opciones: OpcionesInforme,
): Encabezado {
  const obra = proyecto.meta.obra.trim() || proyecto.meta.nombre
  const topografo = proyecto.meta.responsable.trim()
  const supervisor = opciones.supervisor?.trim() ?? ''
  return {
    obra,
    ...campos,
    ...(topografo ? { topografo } : {}),
    ...(supervisor ? { supervisor } : {}),
    ...(opciones.logo ? { logo: opciones.logo } : {}),
  }
}

function baseDe(
  encabezado: Encabezado,
  comprobado: boolean,
  calle: Calle,
  alcance: Alcance,
  opciones: OpcionesInforme,
  notasExtra: string[] = [],
): BaseInforme {
  const notas = [...(opciones.notas ? notasDeCalle(calle, alcance) : []), ...notasExtra]
  return {
    encabezado,
    comprobado,
    ...(notas.length > 0 ? { notas } : {}),
    firmas: opciones.firmas,
  }
}

// ---------------------------------------------------------------------------
// Contexto de una jornada: calle, capa, BM y el resultado del motor
// ---------------------------------------------------------------------------

interface ContextoToma {
  calle: Calle
  toma: Toma
  capa: Capa
  bmInicial: BM
  resultado: ResultadoCampania
  instrumento: Instrumento
}

function contextoDe(proyecto: Proyecto, calleId: Id | null, tomaId: Id | null): ContextoToma | string {
  if (proyecto.calles.length === 0) return SIN_CALLES
  const calle = proyecto.calles.find((c) => c.id === calleId)
  if (!calle) return 'Elige una calle.'
  const toma = calle.nivelaciones.flatMap((n) => n.tomas).find((t) => t.id === tomaId)
  if (!toma) return `La calle «${calle.nombre}» no tiene una jornada medida que usar.`
  const capa = proyecto.capas.find((c) => c.id === toma.capaId)
  if (!capa) return 'La capa de esta jornada ya no está en el paquete de capas.'
  const bmInicial = proyecto.bms.find((bm) => bm.id === toma.bmInicialId)
  if (!bmInicial) return 'El banco de nivel de arranque de esta jornada ya no existe en el proyecto.'
  const instrumento = instrumentoCompleto(proyecto.instrumento)
  const resultado = calcularCampania({ campania: toma, calle, bms: proyecto.bms, largoMira: instrumento.largoMira })
  if (resultado.error !== null) return `No se pudo calcular la jornada: ${resultado.error}`
  return { calle, toma, capa, bmInicial, resultado, instrumento }
}

/** Avisos del motor que importan antes de imprimir (las informaciones se callan). */
function avisosDe(resultado: ResultadoCampania): string[] {
  return resultado.avisos.filter((a) => a.nivel !== 'informacion').map((a) => a.mensaje)
}

/** «+1.3», «−2.0»: milímetros con un decimal y su signo. */
function mmConSigno(mm: number): string {
  const r = Math.round(mm * 10) / 10
  if (r === 0) return '0.0'
  return `${r > 0 ? '+' : '−'}${Math.abs(r).toFixed(1)}`
}

interface MotivoToma {
  estado: EstadoVeredicto
  /** Oración que sigue a «la nivelación …». */
  motivo: string
}

/**
 * Por qué una jornada está (o no) comprobada, en palabras y con qué hacer.
 * Todo sale del cierre que calcula el motor. Ojo con el tramo: si la toma
 * vuelve a arrancar en un BM a mitad de camino, el cierre solo respalda
 * desde ahí, y lo leído antes NO está comprobado aunque el cierre pase
 * (calcularCampania lo avisa: «sin compensar y NO COMPROBADAS»).
 */
function motivoDeToma(resultado: ResultadoCampania, toma: Toma, proyecto: Proyecto): MotivoToma {
  const { cierre } = resultado
  const tramo: TramoComprobado | null | undefined = resultado.tramoComprobado
  const cifras =
    cierre.errorMm !== null && cierre.toleranciaMm !== null
      ? ` (error ${mmConSigno(cierre.errorMm)} mm, tolerancia ±${cierre.toleranciaMm.toFixed(1)} mm)`
      : ''
  if (cierre.pasa === false) {
    return { estado: 'falla', motivo: `cerró fuera de tolerancia${cifras}: hay que volver a nivelarla` }
  }
  if (cierre.pasa === true) {
    const primera = tramo?.primeraEstacion ?? 0
    if (primera > 0) {
      const antes = primera === 1 ? 'la estación 1 queda' : `las estaciones 1 a ${primera} quedan`
      return {
        estado: 'sinCerrar',
        motivo:
          `vuelve a arrancar en un BM en la estación ${primera + 1} y el cierre solo comprueba desde ahí: ` +
          `${antes} fuera del circuito, sin compensar`,
      }
    }
    return { estado: 'comprobado', motivo: `cerró dentro de tolerancia${cifras}` }
  }
  if (cierre.tipo === 'abierto') {
    return { estado: 'sinCerrar', motivo: 'es un circuito abierto: no se cerró en un BM, así que nada la comprueba' }
  }
  const bmFinal = proyecto.bms.find((bm) => bm.id === toma.cierre.bmFinalId)
  return {
    estado: 'sinCerrar',
    motivo: bmFinal
      ? `todavía no cierra: falta la vista adelante a ${bmFinal.nombre}, el BM de cierre`
      : 'todavía no cierra: no tiene un BM de cierre elegido',
  }
}

function veredictoDeToma(motivo: MotivoToma): Veredicto {
  return {
    estado: motivo.estado,
    texto: `${motivo.estado === 'comprobado' ? 'Comprobado' : 'No comprobado'}: la nivelación ${motivo.motivo}.`,
  }
}

/**
 * Notas que el PDF lleva cuando lo impreso no está comprobado (diseño §3:
 * se dice también en el archivo, no solo en la pantalla).
 */
function notasDeVeredicto(veredicto: Veredicto): string[] {
  return veredicto.estado === 'comprobado' ? [] : [veredicto.texto]
}

function nombreDePunto(calle: Calle, elementoClave: string): string {
  return calle.seccion.puntos.find((p) => p.id === elementoClave)?.nombre ?? 'punto fuera de la sección'
}

// ---------------------------------------------------------------------------
// Protocolo y control contra proyecto (mismas filas)
// ---------------------------------------------------------------------------

function filasContraProyecto(ctx: ContextoToma, proyecto: Proyecto, alcance: Alcance): FilaProtocolo[] | string {
  const { calle, toma, resultado } = ctx
  if (!calle.rasante) return `La calle «${calle.nombre}» no tiene rasante de proyecto: no hay contra qué comparar.`
  const evaluacion = evaluarContraRasante({
    resultado,
    calle,
    toma,
    rasante: calle.rasante,
    capas: proyecto.capas,
    capaId: toma.capaId,
  })
  const filas = [...evaluacion.celdas.values()]
    .filter((c) => enTramo(c.progresiva, alcance))
    .sort((a, b) => a.progresiva - b.progresiva || a.offset - b.offset)
    .map((c) => ({
      progresiva: c.progresiva,
      punto: nombreDePunto(calle, c.elementoClave),
      cotaProyecto: c.cotaTeorica,
      cotaMedida: c.cotaReal,
    }))
  if (filas.length === 0) return 'No hay puntos en el tramo elegido.'
  return filas
}

function datosContraProyecto(
  proyecto: Proyecto,
  alcance: Alcance,
  opciones: OpcionesInforme,
): Preparado<DatosProtocolo> {
  const ctx = contextoDe(proyecto, alcance.calleId, alcance.tomaId)
  if (typeof ctx === 'string') return { listo: false, motivo: ctx }
  const filas = filasContraProyecto(ctx, proyecto, alcance)
  if (typeof filas === 'string') return { listo: false, motivo: filas }
  const encabezado = encabezadoDe(
    proyecto,
    {
      calle: ctx.calle.nombre,
      capa: ctx.capa.nombre,
      fecha: fechaImpresa(ctx.toma.fecha),
      tramo: textoTramo(filas.map((f) => f.progresiva)),
      bm: { nombre: ctx.bmInicial.nombre, cota: ctx.bmInicial.cota },
      toleranciaMm: ctx.capa.toleranciaMm,
    },
    opciones,
  )
  const veredicto = veredictoDeToma(motivoDeToma(ctx.resultado, ctx.toma, proyecto))
  const comprobado = veredicto.estado === 'comprobado'
  return {
    listo: true,
    datos: { ...baseDe(encabezado, comprobado, ctx.calle, alcance, opciones, notasDeVeredicto(veredicto)), filas },
    avisos: avisosDe(ctx.resultado),
    veredicto,
  }
}

export function datosProtocolo(proyecto: Proyecto, alcance: Alcance, opciones: OpcionesInforme): Preparado<DatosProtocolo> {
  return datosContraProyecto(proyecto, alcance, opciones)
}

export function datosControl(proyecto: Proyecto, alcance: Alcance, opciones: OpcionesInforme): Preparado<DatosControl> {
  return datosContraProyecto(proyecto, alcance, opciones)
}

// ---------------------------------------------------------------------------
// Libreta con cierre
// ---------------------------------------------------------------------------

function nombrarDestino(destino: DestinoLectura, proyecto: Proyecto, calle: Calle): string {
  switch (destino.tipo) {
    case 'bm':
      return proyecto.bms.find((bm) => bm.id === destino.bmId)?.nombre ?? 'BM borrado'
    case 'cambio':
      return destino.nombre
    case 'celda':
      return `${formatearProgresiva(destino.celda.progresiva)} ${nombreDePunto(calle, destino.celda.elementoClave)}`
    case 'suelto':
      return destino.punto.etiqueta
  }
}

/** Milímetros con un decimal: «+1.3». */
function mm1(metros: number): number {
  const valor = Math.round(aMilimetros(metros) * 10) / 10
  return valor === 0 ? 0 : valor
}

/**
 * Filas de la libreta como se escribe a mano: el punto de cambio va en una
 * sola fila con su vista adelante (de una estación) y su vista atrás (de la
 * siguiente). Las cotas son las de `calcularCotas` y la compensación la de
 * `correccionesDeLaToma` —la misma regla que usan la pantalla y el Excel—;
 * aquí solo se reparten en filas.
 */
function filasDeLibreta(proyecto: Proyecto, ctx: ContextoToma): FilaLibreta[] | string {
  const { calle, toma, resultado, instrumento } = ctx
  let cotas
  try {
    cotas = calcularCotas(toma, proyecto.bms, { largoMira: instrumento.largoMira })
  } catch (fallo) {
    return `No se pudo calcular la libreta: ${(fallo as Error).message}`
  }
  const { cierre } = resultado
  const acumuladas =
    cierre.pasa === true && cierre.errorMm !== null ? correccionesDeLaToma(cierre.errorMm, toma) : []
  const compensados = compensarPuntos(cotas.puntos, acumuladas)
  const porEstacion = (indice: number) => compensados.filter((p) => p.estacionIndice === indice)
  const usable = (valor: number) => esLecturaUsable(valor, instrumento.largoMira)

  const filas: FilaLibreta[] = []
  /** La fila de la última vista adelante: si la estación siguiente arranca ahí, comparten fila. */
  let filaDeLlegada: { fila: FilaLibreta; destino: string } | null = null

  toma.estaciones.forEach((estacion, indice) => {
    const ai = cotas.cotasInstrumento[indice]
    const aiValida = ai !== undefined && Number.isFinite(ai)
    const puntos = porEstacion(indice)
    let siguiente = 0
    const tomarPunto = (valor: number) => (aiValida && usable(valor) ? (puntos[siguiente++] ?? null) : null)
    const conCompensacion = (punto: ReturnType<typeof tomarPunto>) =>
      punto === null
        ? { cota: null, correccionMm: null, cotaCompensada: null }
        : {
            cota: redondear3(punto.cotaCruda),
            correccionMm: acumuladas.length > 0 ? mm1(punto.correccion) : null,
            cotaCompensada: acumuladas.length > 0 ? redondear3(punto.cota) : null,
          }

    // Vista atrás.
    const destinoAtras = estacion.vistaAtras.destino
    // El mismo punto se reconoce como lo reconoce el motor (claveDestino), no
    // por su JSON: un destino migrado puede traer las claves en otro orden.
    const claveAtras = claveDestino(destinoAtras)
    if (filaDeLlegada !== null && filaDeLlegada.destino === claveAtras) {
      filaDeLlegada.fila.atras = estacion.vistaAtras.valor
      filaDeLlegada.fila.alturaInstrumental = aiValida ? redondear3(ai) : null
    } else {
      const bm = destinoAtras.tipo === 'bm' ? proyecto.bms.find((b) => b.id === destinoAtras.bmId) : undefined
      filas.push({
        punto: nombrarDestino(destinoAtras, proyecto, calle),
        atras: estacion.vistaAtras.valor,
        intermedia: null,
        adelante: null,
        alturaInstrumental: aiValida ? redondear3(ai) : null,
        // La cota de un BM es la conocida: no se corrige.
        cota: bm ? bm.cota : null,
        correccionMm: null,
        cotaCompensada: bm && acumuladas.length > 0 ? bm.cota : null,
      })
    }
    filaDeLlegada = null

    for (const lectura of estacion.intermedias) {
      filas.push({
        punto: nombrarDestino(lectura.destino, proyecto, calle),
        atras: null,
        intermedia: lectura.valor,
        adelante: null,
        alturaInstrumental: null,
        ...conCompensacion(tomarPunto(lectura.valor)),
      })
    }

    if (estacion.vistaAdelante) {
      const fila: FilaLibreta = {
        punto: nombrarDestino(estacion.vistaAdelante.destino, proyecto, calle),
        atras: null,
        intermedia: null,
        adelante: estacion.vistaAdelante.valor,
        alturaInstrumental: null,
        ...conCompensacion(tomarPunto(estacion.vistaAdelante.valor)),
      }
      filas.push(fila)
      filaDeLlegada = { fila, destino: claveDestino(estacion.vistaAdelante.destino) }
    }
  })

  if (filas.length === 0) return 'La jornada no tiene lecturas todavía.'
  return filas
}

function cierreDeLibreta(proyecto: Proyecto, ctx: ContextoToma): CierreLibreta | null {
  const { cierre } = ctx.resultado
  if (
    cierre.tipo === 'abierto' ||
    cierre.errorMm === null ||
    cierre.toleranciaMm === null ||
    cierre.cotaLlegadaCalculada === null ||
    cierre.cotaLlegadaConocida === null
  )
    return null
  const bmFinal = proyecto.bms.find((bm) => bm.id === ctx.toma.cierre.bmFinalId)
  const tramo = ctx.resultado.tramoComprobado
  const estaciones = tramo ? tramo.ultimaEstacion - tramo.primeraEstacion + 1 : ctx.toma.estaciones.length
  return {
    puntoDeCierre: bmFinal?.nombre ?? 'BM de cierre',
    cotaCalculada: cierre.cotaLlegadaCalculada,
    cotaConocida: cierre.cotaLlegadaConocida,
    toleranciaMm: cierre.toleranciaMm,
    distanciaKm: cierre.longitudKKm,
    compensacion: `repartida en partes iguales por estación entre las ${estaciones} ${
      estaciones === 1 ? 'estación' : 'estaciones'
    } del circuito que cierra.`,
  }
}

export function datosLibreta(proyecto: Proyecto, alcance: Alcance, opciones: OpcionesInforme): Preparado<DatosLibreta> {
  const ctx = contextoDe(proyecto, alcance.calleId, alcance.tomaId)
  if (typeof ctx === 'string') return { listo: false, motivo: ctx }
  const filas = filasDeLibreta(proyecto, ctx)
  if (typeof filas === 'string') return { listo: false, motivo: filas }

  // La libreta es la jornada entera: el tramo no la recorta (sus sumas
  // dejarían de cuadrar), ni a sus filas ni a las notas de campo.
  const entera: Alcance = { ...alcance, desde: null, hasta: null }
  const veredicto = veredictoDeToma(motivoDeToma(ctx.resultado, ctx.toma, proyecto))
  const extra = notasDeVeredicto(veredicto)
  const tramo = ctx.resultado.tramoComprobado
  if (tramo && tramo.primeraEstacion > 0 && ctx.resultado.cierre.pasa === false) {
    // Fuera de tolerancia Y con estaciones antes del último arranque: que se sepan las dos cosas.
    extra.push(
      `Las estaciones 1 a ${tramo.primeraEstacion} van antes del último arranque en un BM: ` +
        'el cierre no las comprueba ni las compensa.',
    )
  }
  const encabezado = encabezadoDe(
    proyecto,
    {
      calle: ctx.calle.nombre,
      capa: ctx.capa.nombre,
      fecha: fechaImpresa(ctx.toma.fecha),
      tramo: textoTramo(progresivasDeLaToma(ctx.toma)),
      bm: { nombre: ctx.bmInicial.nombre, cota: ctx.bmInicial.cota },
      toleranciaMm: ctx.capa.toleranciaMm,
    },
    opciones,
  )
  return {
    listo: true,
    datos: {
      ...baseDe(encabezado, veredicto.estado === 'comprobado', ctx.calle, entera, opciones, extra),
      filas,
      cierre: cierreDeLibreta(proyecto, ctx),
    },
    avisos: avisosDe(ctx.resultado),
    veredicto,
  }
}

// ---------------------------------------------------------------------------
// Espesores
// ---------------------------------------------------------------------------

/**
 * Un espesor sale de restar dos capas: está comprobado solo si las DOS
 * nivelaciones lo están, y si no, se dice cuál falla (de eso depende qué
 * jornada hay que volver a nivelar).
 */
function veredictoDeEspesores(proyecto: Proyecto, abajo: ContextoToma, arriba: ContextoToma): Veredicto {
  const capas = [
    { quien: 'la capa de abajo', ctx: abajo },
    { quien: 'la capa de arriba', ctx: arriba },
  ].map(({ quien, ctx }) => ({
    nombre: `${quien} (${ctx.capa.nombre}, ${fechaImpresa(ctx.toma.fecha)})`,
    ...motivoDeToma(ctx.resultado, ctx.toma, proyecto),
  }))
  const malas = capas.filter((c) => c.estado !== 'comprobado')
  if (malas.length === 0) {
    return {
      estado: 'comprobado',
      texto: `Comprobado: las dos nivelaciones cerraron dentro de tolerancia (${abajo.capa.nombre} y ${arriba.capa.nombre}).`,
    }
  }
  return {
    estado: malas.some((c) => c.estado === 'falla') ? 'falla' : 'sinCerrar',
    texto: `No comprobado: ${malas.map((c) => `${c.nombre} ${c.motivo}`).join('; ')}.`,
  }
}

export function datosEspesores(
  proyecto: Proyecto,
  alcance: Alcance,
  opciones: OpcionesInforme,
): Preparado<DatosEspesores> {
  const arriba = contextoDe(proyecto, alcance.calleId, alcance.tomaId)
  if (typeof arriba === 'string') return { listo: false, motivo: arriba }
  const candidatas = tomasDeAbajo(proyecto, alcance.calleId, alcance.tomaId)
  const elegida = candidatas.find((t) => t.toma.id === alcance.tomaAbajoId) ?? candidatas[0]
  if (!elegida) {
    return {
      listo: false,
      motivo: `No hay ninguna capa medida debajo de ${arriba.capa.nombre} en «${arriba.calle.nombre}»: el espesor sale de comparar dos capas.`,
    }
  }
  const abajo = contextoDe(proyecto, alcance.calleId, elegida.toma.id)
  if (typeof abajo === 'string') return { listo: false, motivo: abajo }

  const comparacion = compararCapas(abajo.resultado, arriba.resultado)
  // Lo que el proyecto pone entre las dos capas: lo que va encima de la de
  // abajo menos lo que va encima de la de arriba.
  const espesorProyecto = redondear3(
    espesoresPorEncimaDe(proyecto.capas, abajo.capa.id) - espesoresPorEncimaDe(proyecto.capas, arriba.capa.id),
  )
  const filas: FilaEspesor[] = [...comparacion.celdas.values()]
    .filter((c) => enTramo(c.progresiva, alcance))
    .sort((a, b) => a.progresiva - b.progresiva || a.offset - b.offset)
    .map((c) => ({
      progresiva: c.progresiva,
      punto: c.elementoNombre,
      cotaAbajo: c.cotaInferior,
      cotaArriba: c.cotaSuperior,
      espesorProyecto,
    }))
  if (filas.length === 0) return { listo: false, motivo: 'No hay puntos en el tramo elegido.' }

  const encabezado = encabezadoDe(
    proyecto,
    {
      calle: arriba.calle.nombre,
      capa: `${arriba.capa.nombre} sobre ${abajo.capa.nombre}`,
      fecha: fechaImpresa(arriba.toma.fecha),
      tramo: textoTramo(filas.map((f) => f.progresiva)),
      bm: { nombre: arriba.bmInicial.nombre, cota: arriba.bmInicial.cota },
      toleranciaMm: arriba.capa.toleranciaMm,
    },
    opciones,
  )
  const veredicto = veredictoDeEspesores(proyecto, abajo, arriba)
  const notasExtra = notasDeVeredicto(veredicto)
  // Cada aviso dice de qué capa es, y el mismo aviso no se repite.
  const avisos = [
    ...new Set([
      ...avisosDe(abajo.resultado).map((a) => `${abajo.capa.nombre}: ${a}`),
      ...avisosDe(arriba.resultado).map((a) => `${arriba.capa.nombre}: ${a}`),
      ...comparacion.avisos.map((a) => a.mensaje),
    ]),
  ]
  return {
    listo: true,
    datos: {
      ...baseDe(encabezado, veredicto.estado === 'comprobado', arriba.calle, alcance, opciones, notasExtra),
      capaAbajo: `${abajo.capa.nombre} (${fechaImpresa(abajo.toma.fecha)})`,
      capaArriba: `${arriba.capa.nombre} (${fechaImpresa(arriba.toma.fecha)})`,
      filas,
    },
    avisos,
    veredicto,
  }
}

// ---------------------------------------------------------------------------
// Metrado: lo medido contra la cota de proyecto de la misma capa
// ---------------------------------------------------------------------------

export function datosMetrado(proyecto: Proyecto, alcance: Alcance, opciones: OpcionesInforme): Preparado<DatosMetrado> {
  const ctx = contextoDe(proyecto, alcance.calleId, alcance.tomaId)
  if (typeof ctx === 'string') return { listo: false, motivo: ctx }
  const { calle, toma, capa, resultado } = ctx
  if (!calle.rasante) {
    return { listo: false, motivo: `La calle «${calle.nombre}» no tiene rasante de proyecto: no hay contra qué medir volúmenes.` }
  }
  const evaluacion = evaluarContraRasante({
    resultado,
    calle,
    toma,
    rasante: calle.rasante,
    capas: proyecto.capas,
    capaId: toma.capaId,
  })

  const celdas = [...evaluacion.celdas.values()].filter((c) => enTramo(c.progresiva, alcance))
  const porProgresiva = new Map<number, typeof celdas>()
  for (const c of celdas) porProgresiva.set(c.progresiva, [...(porProgresiva.get(c.progresiva) ?? []), c])

  // Arriba lo medido y abajo el proyecto: donde lo medido queda encima, sobra
  // y se corta (diseño §3). Un punto sin medir o fuera de sección entra como
  // «sin número» para que el motor cuente la sección como incompleta.
  const secciones: SeccionConAreas[] = []
  for (const [progresiva, puntos] of [...porProgresiva].sort((a, b) => a[0] - b[0])) {
    if (!puntos.some((p) => p.cotaReal !== null)) continue
    const areas = areasEntreSuperficies(
      puntos.map((p) => ({
        offset: p.offset,
        cotaArriba: p.cotaReal ?? Number.NaN,
        cotaAbajo: p.cotaTeorica ?? Number.NaN,
      })),
    )
    // Con menos de dos puntos el área no se pudo calcular: va como dato
    // roto, y el motor la descarta y marca el tramo como dudoso.
    secciones.push(
      areas.sinDatos
        ? { progresiva, corte: Number.NaN, relleno: Number.NaN }
        : { progresiva, corte: areas.corte, relleno: areas.relleno, descartados: areas.descartados },
    )
  }
  if (secciones.length === 0) return { listo: false, motivo: 'No hay secciones medidas en el tramo elegido.' }

  const veredicto = veredictoDeToma(motivoDeToma(resultado, toma, proyecto))
  const comprobado = veredicto.estado === 'comprobado'
  const volumenes = volumenesPorAreasMedias(secciones, { comprobado })
  const encabezado = encabezadoDe(
    proyecto,
    {
      calle: calle.nombre,
      capa: capa.nombre,
      fecha: fechaImpresa(toma.fecha),
      tramo: textoTramo(secciones.map((s) => s.progresiva)),
      bm: { nombre: ctx.bmInicial.nombre, cota: ctx.bmInicial.cota },
      toleranciaMm: capa.toleranciaMm,
    },
    opciones,
  )
  const explicacion = `Corte y relleno de ${capa.nombre} medida contra su cota de proyecto.`
  return {
    listo: true,
    datos: {
      ...baseDe(encabezado, comprobado, calle, alcance, opciones, [explicacion, ...notasDeVeredicto(veredicto)]),
      secciones: secciones.map(({ progresiva, corte, relleno }) => ({ progresiva, corte, relleno })),
      ...volumenes,
    },
    avisos: avisosDe(resultado),
    veredicto,
  }
}

// ---------------------------------------------------------------------------
// Hoja de estacas
// ---------------------------------------------------------------------------

const AVISO_AI_NO_NUMERO = 'La altura instrumental no es un número: no hay lecturas objetivo.'

/** Lo que la hoja de estacas propone si no se elige otra cosa, y de dónde sale. */
export interface ReplanteoPorDefecto {
  capaId: Id | null
  bmId: Id | null
  /** En palabras: por qué esa capa y ese BM. */
  razon: string
}

/**
 * Se replantea lo que TODAVÍA no está construido: la capa que va justo
 * encima de la más alta ya medida en la calle, con el BM de arranque de esa
 * jornada (el que se usó la última vez en esa zona). Proponer la capa de la
 * última jornada sería replantear algo que ya está hecho.
 */
export function replanteoPorDefecto(proyecto: Proyecto, calleId: Id | null): ReplanteoPorDefecto {
  const capas = [...proyecto.capas].sort((a, b) => a.orden - b.orden)
  const bmCualquiera = (proyecto.bms.find((b) => b.tipo === 'oficial') ?? proyecto.bms[0])?.id ?? null
  const medidas = tomasDeCalle(proyecto, calleId).filter((t) => t.capa !== undefined)
  if (medidas.length === 0) {
    return {
      capaId: capas[0]?.id ?? null,
      bmId: bmCualquiera,
      razon: 'La calle no tiene jornadas: se propone la primera capa del paquete.',
    }
  }
  // La más alta del paquete y, de ella, la jornada más nueva.
  const ultima = [...medidas].sort(
    (a, b) => b.capa!.orden - a.capa!.orden || b.toma.fecha.localeCompare(a.toma.fecha),
  )[0]!
  const bmId = proyecto.bms.some((b) => b.id === ultima.toma.bmInicialId) ? ultima.toma.bmInicialId : bmCualquiera
  const siguiente = capas.find((c) => c.orden > ultima.capa!.orden)
  const deDonde = `${ultima.capa!.nombre}, medida el ${fechaImpresa(ultima.toma.fecha)}`
  if (!siguiente) {
    return {
      capaId: ultima.capa!.id,
      bmId,
      razon: `Todas las capas ya tienen jornada: se propone la última (${deDonde}) y el BM de esa jornada.`,
    }
  }
  return {
    capaId: siguiente.id,
    bmId,
    razon: `Se propone la capa que sigue a ${deDonde}, y el BM de arranque de esa jornada.`,
  }
}

export function datosEstacas(proyecto: Proyecto, alcance: Alcance, opciones: OpcionesInforme): Preparado<DatosEstacas> {
  if (proyecto.calles.length === 0) return { listo: false, motivo: SIN_CALLES }
  const calle = proyecto.calles.find((c) => c.id === alcance.calleId)
  if (!calle) return { listo: false, motivo: 'Elige una calle.' }
  const tomas = tomasDeCalle(proyecto, calle.id)
  const porDefecto = replanteoPorDefecto(proyecto, calle.id)
  const capa = proyecto.capas.find((c) => c.id === (alcance.capaReplanteoId ?? porDefecto.capaId))
  if (!capa) return { listo: false, motivo: 'Elige la capa que vas a replantear.' }
  const bm = proyecto.bms.find((b) => b.id === (alcance.bmId ?? porDefecto.bmId))
  if (!bm) {
    return {
      listo: false,
      motivo:
        proyecto.bms.length === 0
          ? 'El proyecto no tiene ningún banco de nivel: créalo en Obra.'
          : 'Elige el banco de nivel donde vas a plantar el nivel.',
    }
  }

  // Las progresivas de todas las jornadas de la calle: las estacas van donde se nivela.
  const progresivas = [...new Set(tomas.flatMap((t) => progresivasDeLaToma(t.toma)))]
    .filter((p) => enTramo(p, alcance))
    .sort((a, b) => a - b)
  if (progresivas.length === 0) {
    return { listo: false, motivo: 'No hay progresivas en el tramo: declara las progresivas de la calle en una jornada.' }
  }

  const instrumento = instrumentoCompleto(proyecto.instrumento)
  const vista = alcance.vistaAtrasBm
  const ai =
    typeof vista === 'number' ? alturaInstrumentalDe(bm.cota, vista, instrumento.largoMira) : null
  // La AI está comprobada si sale de un BM oficial; uno auxiliar no basta.
  const alturaComprobada = ai !== null && bm.tipo === 'oficial'
  const estacion = alcance.progresivaEstacion
  const hoja = hojaDeReplanteo({
    calle,
    capas: proyecto.capas,
    capaId: capa.id,
    progresivas,
    alturaInstrumental: ai ?? Number.NaN,
    alturaComprobada,
    mira: { largoMira: instrumento.largoMira, lecturaMin: instrumento.lecturaMin, margenSuperior: instrumento.margenSuperior },
    visualMax: instrumento.visualMax,
    ...(typeof estacion === 'number' && Number.isFinite(estacion) ? { progresivaEstacion: estacion } : {}),
  })
  const desdeHoja = datosDeEstacasDesdeHoja(hoja)
  const avisos = desdeHoja.avisos!.filter((a) => a !== AVISO_AI_NO_NUMERO)
  if (ai === null) {
    avisos.unshift(
      typeof vista === 'number'
        ? `La vista atrás ${vista} no puede ser de una mira de ${instrumento.largoMira} m: no hay lecturas objetivo.`
        : 'Sin vista atrás al BM: la lectura objetivo se calcula en campo al plantar el nivel.',
    )
  }

  // Aquí no se cierra ninguna nivelación: «comprobado» es que la altura
  // instrumental sale de un BM oficial, y así se dice.
  const veredicto: Veredicto =
    ai === null
      ? {
          estado: 'sinCerrar',
          texto:
            typeof vista === 'number'
              ? `No comprobado: la vista atrás ${vista} no cabe en la mira de ${instrumento.largoMira} m, así que no hay altura instrumental.`
              : 'No comprobado: sin vista atrás al BM no hay altura instrumental; la lectura objetivo se calcula en campo.',
        }
      : alturaComprobada
        ? {
            estado: 'comprobado',
            texto: `Comprobado: la altura instrumental (${ai.toFixed(3)}) sale del BM oficial ${bm.nombre}.`,
          }
        : {
            estado: 'sinCerrar',
            texto: `No comprobado: la altura instrumental sale de ${bm.nombre}, un BM auxiliar; plántala desde un BM oficial.`,
          }

  const encabezado = encabezadoDe(
    proyecto,
    {
      calle: calle.nombre,
      capa: capa.nombre,
      fecha: fechaDeHoy(opciones.hoy ?? new Date()),
      tramo: textoTramo(progresivas),
      bm: { nombre: bm.nombre, cota: bm.cota },
      toleranciaMm: capa.toleranciaMm,
    },
    opciones,
  )
  // Sin vista atrás el motivo ya va en los avisos de la hoja; con un BM auxiliar, se añade.
  const notasExtra = ai !== null && !alturaComprobada ? [veredicto.texto] : []
  return {
    listo: true,
    datos: {
      ...baseDe(encabezado, alturaComprobada, calle, alcance, opciones, notasExtra),
      alturaInstrumental: ai,
      filas: desdeHoja.filas,
      avisos,
      mira: { largoMira: instrumento.largoMira, lecturaMin: instrumento.lecturaMin, margenSuperior: instrumento.margenSuperior },
    },
    avisos,
    veredicto,
  }
}

// ---------------------------------------------------------------------------
// Todo junto
// ---------------------------------------------------------------------------

export function prepararInforme(
  tipo: TipoInforme,
  proyecto: Proyecto,
  alcance: Alcance,
  opciones: OpcionesInforme,
): Preparacion {
  const ficha = fichaDe(tipo)
  const envolver = <T>(p: Preparado<T>, informe: (d: T) => DatosDeInforme): Preparacion => {
    if (!p.listo) return p
    const d = informe(p.datos)
    const e = (d.datos as BaseInforme).encabezado
    return {
      listo: true,
      informe: d,
      // El motor puede repetir un aviso (dos lecturas con el mismo problema): uno basta.
      avisos: [...new Set(p.avisos)],
      veredicto: p.veredicto,
      nombreArchivo: nombreDeArchivo(ficha.titulo, e.calle, e.capa, e.fecha.replace(/\//g, '-')),
    }
  }
  switch (tipo) {
    case 'protocolo':
      return envolver(datosProtocolo(proyecto, alcance, opciones), (datos) => ({ tipo, datos }))
    case 'libreta':
      return envolver(datosLibreta(proyecto, alcance, opciones), (datos) => ({ tipo, datos }))
    case 'control':
      return envolver(datosControl(proyecto, alcance, opciones), (datos) => ({ tipo, datos }))
    case 'espesores':
      return envolver(datosEspesores(proyecto, alcance, opciones), (datos) => ({ tipo, datos }))
    case 'metrado':
      return envolver(datosMetrado(proyecto, alcance, opciones), (datos) => ({ tipo, datos }))
    case 'estacas':
      return envolver(datosEstacas(proyecto, alcance, opciones), (datos) => ({ tipo, datos }))
  }
}

/** El PDF de un informe ya preparado, con el generador de `informes/`. */
export function generarPdf(informe: DatosDeInforme): Uint8Array {
  switch (informe.tipo) {
    case 'protocolo':
      return protocoloNivelacion(informe.datos)
    case 'libreta':
      return libretaConCierre(informe.datos)
    case 'control':
      return controlContraProyecto(informe.datos)
    case 'espesores':
      return espesores(informe.datos)
    case 'metrado':
      return metrado(informe.datos)
    case 'estacas':
      return hojaDeEstacas(informe.datos)
  }
}

/** Si el informe preparado está comprobado contra el cierre real. */
export function estaComprobado(informe: DatosDeInforme): boolean {
  return (informe.datos as BaseInforme).comprobado
}
