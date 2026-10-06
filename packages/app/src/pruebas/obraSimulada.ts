import {
  INSTRUMENTO_DE_FABRICA,
  cotaTeoricaDeCapa,
  progresivasMedidas,
  type BM,
  type Calle,
  type Capa,
  type Estacion,
  type Id,
  type Lectura,
  type Nota,
  type Pista,
  type PlanoImportado,
  type Proyecto,
  type Rasante,
  type Seccion,
  type Toma,
} from '@topo/core'
import type { ArchivosDePlano } from '../archivo/topo'
import { CALLES_SIMULADAS, ORIGEN_DXF, generarDxfExpediente } from './muestras/generarDxf'
import { generarPdfPlano } from './muestras/generarPdfPlano'

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * LA OBRA SIMULADA de la ola 3: una obra completa y coherente para recorrer
 * la app en un navegador real (los guiones de packages/app/verificacion/).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pavimentación del Barrio Las Lomas, Huancayo (≈ 3244 m s. n. m.). Tres
 * calles, las mismas del expediente simulado (DXF y PDF de src/pruebas/muestras):
 *
 *   (a) Av. Sol — 0+000 a 0+120, rasante −0.35 % (3244.100 → 3243.680, como
 *       el DXF). Dos capas medidas, las dos cerradas dentro de tolerancia:
 *       SUBRASANTE (14/09/2026, error −4 mm) y BASE (28/09/2026, error +4 mm).
 *       En la subrasante hay UN punto fuera (Eje 0+080, sobra: corta) y UNO
 *       al límite (Borde derecho 0+040, falta: rellena). Tres notas.
 *   (b) Jr. Lima — tramo 0+100 a 0+200, rasante +0.20 % desde 3243.900 (el
 *       segundo tramo del DXF). Una SUBRASANTE (02/10/2026) SIN CERRAR: falta
 *       visar el BM-2 de cierre, así que todo lo calculado sale «no
 *       comprobado». El eje tiene un hundimiento en 0+140: punto bajo donde se
 *       empoza el agua (y fuera de tolerancia: rellena).
 *   (c) Psje. Las Lomas — la pista EMPINADA: 0+000 a 0+120 subiendo 7.38 %
 *       (3244.000 → 3252.856; el DXF dice 3252.860). Sin mediciones. Enlazada
 *       a la pista «PSJE. LAS LOMAS» del DXF, que viene calibrado, para el
 *       planificador de cambios y controles y la guía de campo. La rasante
 *       de la app tiene una sola pendiente; los quiebres de verdad están en
 *       el perfil del expediente que se digita a mano (ver
 *       `PERFIL_LAS_LOMAS_CON_QUIEBRES` y `ESPERADO.lasLomas`).
 *
 * Todo se guarda como lecturas de mira (nunca cotas). Las lecturas se
 * fabrican desde lo que «hay en el terreno» (la cota de proyecto de la capa
 * más una desviación en mm que se elige) y la altura instrumental de cada
 * estación, redondeadas al milímetro. Mira de 5 m: todas entre 0.30 y 4.70.
 * Las visuales están equilibradas: cada estación dice dónde se plantó el
 * nivel y dónde está cada punto; la prueba comprueba |atrás − adelante| ≤ 5 m
 * y ninguna visual de más de 50 m.
 *
 * `ESPERADO` (abajo) es lo que cada guion debe encontrar en pantalla. Está
 * escrito como constante para que los guiones `.mjs` lo copien sin
 * calcular; `obraSimulada.test.ts` lo comprueba contra el motor, así que si
 * alguien cambia la obra, la prueba dice qué número dejó de ser verdad.
 */

// ─── Identificadores fijos (los guiones pueden buscarlos) ─────────────────

export const IDS = {
  bm1: 'bm-1',
  bm2: 'bm-2',
  bm3: 'bm-3',
  capaTerreno: 'cap-terreno',
  capaSubrasante: 'cap-subrasante',
  capaBase: 'cap-base',
  avSol: 'c-av-sol',
  jrLima: 'c-jr-lima',
  lasLomas: 'c-las-lomas',
  tomaSolSub: 'toma-sol-sub',
  tomaSolBase: 'toma-sol-base',
  tomaLimaSub: 'toma-lima-sub',
  planoDxf: 'plano-dxf',
  planoPdf: 'plano-pdf',
  pistaLasLomas: 'pista-las-lomas',
  pistaJrLima: 'pista-jr-lima',
} as const

// ─── Piezas comunes ───────────────────────────────────────────────────────

/** Calzada de 7.20 m: bordes a ±3.60 m, como los sardineles del DXF. */
const MEDIA_CALZADA = 3.6

function seccionDeCalzada(): Seccion {
  return {
    puntos: [
      { id: 'p-borde-i', rol: 'bordeCalzada', nombre: 'Borde izquierdo', distancia: -MEDIA_CALZADA, distanciaDeFabrica: false, palabras: ['BI'] },
      { id: 'p-eje', rol: 'eje', nombre: 'Eje', distancia: 0, distanciaDeFabrica: false, palabras: ['EJE'] },
      { id: 'p-borde-d', rol: 'bordeCalzada', nombre: 'Borde derecho', distancia: MEDIA_CALZADA, distanciaDeFabrica: false, palabras: ['BD'] },
    ],
    palabrasProgresiva: ['PROG', 'PK', 'ABSCISA', 'EST', 'PROGRESIVA'],
    palabrasPuntoControl: ['PC', 'BM', 'PUNTO DE CONTROL'],
    palabrasReferencia: ['EXISTENTE', 'EXIST', 'REF'],
  }
}

function rasante(progresivaArranque: number, cotaArranque: number, pendienteLongitudinal: number): Rasante {
  return {
    progresivaArranque,
    cotaArranque,
    pendienteLongitudinal,
    // Bombeo de 2 % hacia los bordes: el borde queda 72 mm bajo el eje.
    tramos: [{ nombre: 'Calzada', hastaOffset: MEDIA_CALZADA, tipo: 'pendiente', valor: 2 }],
    simetrica: true,
    tramosIzquierda: null,
  }
}

const OFFSET: Record<string, number> = { 'p-borde-i': -MEDIA_CALZADA, 'p-eje': 0, 'p-borde-d': MEDIA_CALZADA }

const BMS: BM[] = [
  { id: IDS.bm1, nombre: 'BM-1', cota: 3245.18, tipo: 'oficial', descripcion: 'Clavo en vereda, esquina Av. Sol / Jr. Lima (Av. Sol 0+000)' },
  { id: IDS.bm2, nombre: 'BM-2', cota: 3244.256, tipo: 'auxiliar', descripcion: 'Clavo en sardinel, Jr. Lima 0+100' },
  { id: IDS.bm3, nombre: 'BM-3', cota: 3244.468, tipo: 'auxiliar', descripcion: 'Clavo en sardinel, inicio del Psje. Las Lomas' },
]

const CAPAS: Capa[] = [
  { id: IDS.capaTerreno, nombre: 'TERRENO EXISTENTE', orden: 0, espesor: 0, toleranciaMm: 30 },
  { id: IDS.capaSubrasante, nombre: 'SUBRASANTE', orden: 1, espesor: 0, toleranciaMm: 20 },
  // La rasante de proyecto es la cara de la base: la subrasante va 0.20 m debajo.
  { id: IDS.capaBase, nombre: 'BASE', orden: 2, espesor: 0.2, toleranciaMm: 10 },
]

// ─── Fábrica de lecturas ──────────────────────────────────────────────────

/** A qué se le apunta con la mira: un BM o una estaca de cambio, con dónde está. */
type Apunte =
  | { tipo: 'bm'; bmId: Id; en: number }
  | { tipo: 'cambio'; nombre: string; en: number; /** Cota real de la estaca. */ cota: number }

interface EstacionSimulada {
  /** Progresiva donde se plantó el nivel (para las distancias de visual). */
  en: number
  atras: Apunte
  lecturaAtras: number
  /** [progresiva, punto de la sección, desviación en mm sobre la cota de proyecto de la capa]. */
  intermedias: [number, string, number][]
  /** Ausente: la nivelación quedó sin cerrar. En un BM, `errorMm` es el error de cierre que se deja. */
  adelante?: (Apunte & { tipo: 'cambio' }) | (Apunte & { tipo: 'bm'; errorMm: number })
}

export interface TomaSimulada {
  id: Id
  fecha: string
  capaId: Id
  bmInicialId: Id
  cierre: Toma['cierre']
  estaciones: EstacionSimulada[]
}

const r3 = (n: number) => Math.round(n * 1000) / 1000

function cotaBM(bmId: Id): number {
  return BMS.find((b) => b.id === bmId)!.cota
}

/**
 * Convierte la toma «del terreno» en la libreta: lecturas de mira al
 * milímetro. AI = cota de lo visado atrás + lectura atrás; cada intermedia es
 * AI − (cota de proyecto de la capa + desviación); la adelante a una estaca
 * es AI − su cota, y la adelante al BM de cierre lleva el error que se pidió
 * (llega `errorMm` más arriba o más abajo de lo que el BM vale).
 */
function armarToma(simulada: TomaSimulada, ras: Rasante): Toma {
  let n = 0
  const lectura = (destino: Lectura['destino'], valor: number): Lectura => ({
    id: `${simulada.id}-l${++n}`,
    destino,
    valor: r3(valor),
  })
  const cotaPC = new Map<string, number>()
  const estaciones: Estacion[] = simulada.estaciones.map((e, i) => {
    const cotaAtras = e.atras.tipo === 'bm' ? cotaBM(e.atras.bmId) : cotaPC.get(e.atras.nombre)!
    const ai = r3(cotaAtras + e.lecturaAtras)
    const destinoAtras: Lectura['destino'] =
      e.atras.tipo === 'bm' ? { tipo: 'bm', bmId: e.atras.bmId } : { tipo: 'cambio', nombre: e.atras.nombre }
    const intermedias = e.intermedias.map(([progresiva, punto, desviacionMm]) => {
      const proyecto = cotaTeoricaDeCapa(ras, CAPAS, simulada.capaId, progresiva, OFFSET[punto]!)!
      return lectura({ tipo: 'celda', celda: { progresiva, elementoClave: punto } }, ai - (proyecto + desviacionMm / 1000))
    })
    const estacion: Estacion = { id: `${simulada.id}-e${i + 1}`, vistaAtras: lectura(destinoAtras, e.lecturaAtras), intermedias }
    if (e.adelante?.tipo === 'cambio') {
      cotaPC.set(e.adelante.nombre, e.adelante.cota)
      estacion.vistaAdelante = lectura({ tipo: 'cambio', nombre: e.adelante.nombre }, ai - e.adelante.cota)
    } else if (e.adelante?.tipo === 'bm') {
      // Llegar errorMm por encima del BM = leer errorMm de menos.
      const llegada = cotaBM(e.adelante.bmId) + e.adelante.errorMm / 1000
      estacion.vistaAdelante = lectura({ tipo: 'bm', bmId: e.adelante.bmId }, ai - llegada)
    }
    return estacion
  })
  return {
    id: simulada.id,
    fecha: simulada.fecha,
    capaId: simulada.capaId,
    bmInicialId: simulada.bmInicialId,
    cierre: simulada.cierre,
    estaciones,
    // Las que se declararon en campo: las mismas que se midieron (así la
    // migración del .topo no tiene nada que añadir y la ida y vuelta es exacta).
    progresivasDeclaradas: progresivasMedidas(estaciones),
  }
}

/** Las tres celdas de una progresiva: [BI, EJE, BD] en mm de desviación. */
function fila(progresiva: number, [bi, eje, bd]: [number, number, number]): [number, string, number][] {
  return [
    [progresiva, 'p-borde-i', bi],
    [progresiva, 'p-eje', eje],
    [progresiva, 'p-borde-d', bd],
  ]
}

const CIERRE_AV_SOL = (): Toma['cierre'] => ({
  tipo: 'cerrado',
  bmFinalId: IDS.bm1,
  // 120 m de ida y 120 de vuelta: K = 0.24 km, tolerancia 12·√0.24 = 5.88 mm.
  longitudK: 0.24,
  longitudKAuto: false,
  clase: 'tercerOrden',
  coeficiente: 12,
})

// ─── (a) Av. Sol ──────────────────────────────────────────────────────────

const RASANTE_AV_SOL = rasante(0, 3244.1, -0.35)

/**
 * Circuito de cuatro estaciones, ida por el eje y vuelta por la vereda:
 * E1 en 0+030 (BM-1 a 30 m, PC1 en 0+060 a 30 m), E2 en 0+090 (PC1 a 30 m,
 * PC2 en 0+120 a 30 m), E3 en 0+075 (PC2 a 45 m, PC3 en 0+030 a 45 m), E4 en
 * 0+015 (PC3 a 15 m, BM-1 a 15 m).
 */
export const TOMA_SOL_SUBRASANTE: TomaSimulada = {
  id: IDS.tomaSolSub,
  fecha: '2026-09-14',
  capaId: IDS.capaSubrasante,
  bmInicialId: IDS.bm1,
  cierre: CIERRE_AV_SOL(),
  estaciones: [
    {
      en: 30,
      atras: { tipo: 'bm', bmId: IDS.bm1, en: 0 },
      lecturaAtras: 1.452,
      intermedias: [...fila(0, [6, 4, -3]), ...fila(20, [-8, 2, 5]), ...fila(40, [3, -5, -27])],
      adelante: { tipo: 'cambio', nombre: 'PC1', en: 60, cota: 3244.215 },
    },
    {
      en: 90,
      atras: { tipo: 'cambio', nombre: 'PC1', en: 60, cota: 3244.215 },
      lecturaAtras: 1.386,
      intermedias: [...fila(60, [9, 7, 2]), ...fila(80, [12, 52, 15]), ...fila(100, [-4, -6, -2]), ...fila(120, [1, -3, 8])],
      adelante: { tipo: 'cambio', nombre: 'PC2', en: 120, cota: 3243.95 },
    },
    {
      en: 75,
      atras: { tipo: 'cambio', nombre: 'PC2', en: 120, cota: 3243.95 },
      lecturaAtras: 1.234,
      intermedias: [],
      adelante: { tipo: 'cambio', nombre: 'PC3', en: 30, cota: 3244.402 },
    },
    {
      en: 15,
      atras: { tipo: 'cambio', nombre: 'PC3', en: 30, cota: 3244.402 },
      lecturaAtras: 1.522,
      intermedias: [],
      adelante: { tipo: 'bm', bmId: IDS.bm1, en: 0, errorMm: -4 },
    },
  ],
}

/** Mismo recorrido, dos semanas después, sobre la base. Todo conforme. */
export const TOMA_SOL_BASE: TomaSimulada = {
  id: IDS.tomaSolBase,
  fecha: '2026-09-28',
  capaId: IDS.capaBase,
  bmInicialId: IDS.bm1,
  cierre: CIERRE_AV_SOL(),
  estaciones: [
    {
      en: 30,
      atras: { tipo: 'bm', bmId: IDS.bm1, en: 0 },
      lecturaAtras: 1.287,
      intermedias: [...fila(0, [3, 2, -1]), ...fila(20, [-4, 0, 3]), ...fila(40, [2, -3, -6])],
      adelante: { tipo: 'cambio', nombre: 'PC1', en: 60, cota: 3244.231 },
    },
    {
      en: 90,
      atras: { tipo: 'cambio', nombre: 'PC1', en: 60, cota: 3244.231 },
      lecturaAtras: 1.402,
      intermedias: [...fila(60, [4, 5, 1]), ...fila(80, [6, 8, 5]), ...fila(100, [-2, -3, 0]), ...fila(120, [1, -1, 3])],
      adelante: { tipo: 'cambio', nombre: 'PC2', en: 120, cota: 3243.968 },
    },
    {
      en: 75,
      atras: { tipo: 'cambio', nombre: 'PC2', en: 120, cota: 3243.968 },
      lecturaAtras: 1.311,
      intermedias: [],
      adelante: { tipo: 'cambio', nombre: 'PC3', en: 30, cota: 3244.395 },
    },
    {
      en: 15,
      atras: { tipo: 'cambio', nombre: 'PC3', en: 30, cota: 3244.395 },
      lecturaAtras: 1.498,
      intermedias: [],
      adelante: { tipo: 'bm', bmId: IDS.bm1, en: 0, errorMm: 4 },
    },
  ],
}

const NOTAS_AV_SOL: Nota[] = [
  { id: 'n-sol-1', progresiva: 40, texto: 'Buzón de desagüe: nivelar la tapa con la base', fecha: '2026-09-14T15:10:00.000Z' },
  { id: 'n-sol-2', progresiva: 80, texto: 'Subrasante alta en el eje: cortar antes de echar la base', fecha: '2026-09-14T15:40:00.000Z' },
  { id: 'n-sol-3', progresiva: 120, texto: 'Fin del tramo: empalme con el pavimento existente', fecha: '2026-09-28T16:05:00.000Z' },
]

// ─── (b) Jr. Lima ─────────────────────────────────────────────────────────

/** El segundo tramo del DXF: desde el punto bajo de 0+100 (3243.900) sube 0.20 %. */
const RASANTE_JR_LIMA = rasante(100, 3243.9, 0.2)

/**
 * E1 en 0+125 (BM-2 en 0+100 a 25 m, PC1 en 0+150 a 25 m), E2 en 0+175
 * (PC1 a 25 m). Falta la vista adelante al BM-2 para cerrar: SIN CERRAR.
 */
export const TOMA_LIMA_SUBRASANTE: TomaSimulada = {
  id: IDS.tomaLimaSub,
  fecha: '2026-10-02',
  capaId: IDS.capaSubrasante,
  bmInicialId: IDS.bm2,
  cierre: {
    tipo: 'cerrado',
    bmFinalId: IDS.bm2,
    longitudK: 0.2,
    longitudKAuto: false,
    clase: 'tercerOrden',
    coeficiente: 12,
  },
  estaciones: [
    {
      en: 125,
      atras: { tipo: 'bm', bmId: IDS.bm2, en: 100 },
      lecturaAtras: 1.318,
      intermedias: [...fila(100, [4, 2, -5]), ...fila(120, [-6, 0, 3]), ...fila(140, [-12, -60, -9])],
      adelante: { tipo: 'cambio', nombre: 'PC1', en: 150, cota: 3244.007 },
    },
    {
      en: 175,
      atras: { tipo: 'cambio', nombre: 'PC1', en: 150, cota: 3244.007 },
      lecturaAtras: 1.402,
      intermedias: [...fila(160, [5, 3, 7]), ...fila(180, [-2, 4, 1]), ...fila(200, [6, 8, 2])],
    },
  ],
}

const NOTAS_JR_LIMA: Nota[] = [
  { id: 'n-lima-1', progresiva: 140, texto: 'Agua empozada tras la lluvia: hundimiento en el eje', fecha: '2026-10-02T14:20:00.000Z' },
]

// ─── (c) Psje. Las Lomas ──────────────────────────────────────────────────

/** Una sola pendiente de 0+000 a 0+120: 3244.000 → 3252.856 (el DXF rotula 3252.860). */
const RASANTE_LAS_LOMAS = rasante(0, 3244, 7.38)

/**
 * El perfil del expediente de Las Lomas con sus quiebres, tal como Max lo
 * digitaría en Planificar › perfil digitado: 6 %, luego 9 % y 6.92 %.
 * Los quiebres de 0+030 y 0+070 (3 y 2.08 puntos de pendiente) pasan con
 * holgura del umbral de 0.5 %.
 */
export const PERFIL_LAS_LOMAS_CON_QUIEBRES = [
  { progresiva: 0, cota: 3244 },
  { progresiva: 30, cota: 3245.8 },
  { progresiva: 70, cota: 3249.4 },
  { progresiva: 120, cota: 3252.86 },
] as const

// ─── Planos y pistas ──────────────────────────────────────────────────────

/** Milímetros de papel del PDF (origen arriba a la izquierda) a puntos PDF con la Y hacia arriba. */
const PT_POR_MM = 72 / 25.4
const ALTO_PAPEL_MM = 210
function mmAPuntoPdf(xMm: number, yMm: number) {
  return { x: r3(xMm * PT_POR_MM), y: r3((ALTO_PAPEL_MM - yMm) * PT_POR_MM) }
}

const PLANOS: PlanoImportado[] = [
  // El DXF viene en metros: 1 unidad = 1 m. Calibrado.
  { id: IDS.planoDxf, nombre: 'expediente-pistas.dxf', formato: 'dxf', calibracion: { metrosPorUnidad: 1, ejeY: 'arriba' } },
  // El PDF a 1:1000 se deja SIN calibrar: la barra de escala (20 m) está para calibrarlo.
  { id: IDS.planoPdf, nombre: 'plano-expediente.pdf', formato: 'pdf', pagina: 1, calibracion: null },
]

const EJE_LAS_LOMAS = CALLES_SIMULADAS.find((c) => c.nombre === 'PSJE. LAS LOMAS')!.eje

const PISTAS: Pista[] = [
  {
    id: IDS.pistaLasLomas,
    nombre: 'PSJE. LAS LOMAS',
    planoId: IDS.planoDxf,
    // La polilínea del eje en la capa EJE_VIA, en unidades del dibujo.
    polilinea: EJE_LAS_LOMAS.map((p) => ({ x: p.x + ORIGEN_DXF.x, y: p.y + ORIGEN_DXF.y })),
    calleId: IDS.lasLomas,
    origen: 'dxf',
    progresivaInicio: 0,
  },
  {
    id: IDS.pistaJrLima,
    nombre: 'Jr. Lima (croquis)',
    planoId: IDS.planoPdf,
    // Dibujada a mano sobre el eje del PDF: de 40 mm a 240 mm de papel, en y = 110 mm.
    polilinea: [mmAPuntoPdf(40, 110), mmAPuntoPdf(140, 110), mmAPuntoPdf(240, 110)],
    calleId: IDS.jrLima,
    origen: 'croquis',
    progresivaInicio: 0,
  },
]

// ─── La obra ──────────────────────────────────────────────────────────────

export interface ObraSimulada {
  proyecto: Proyecto
  archivosDePlano: ArchivosDePlano
}

/** La obra completa, con los bytes de sus dos planos. Siempre la misma (sin azar ni fecha de hoy). */
export function construirObraSimulada(): ObraSimulada {
  const avSol: Calle = {
    id: IDS.avSol,
    nombre: 'Av. Sol',
    seccion: seccionDeCalzada(),
    rasante: RASANTE_AV_SOL,
    notas: NOTAS_AV_SOL,
    nivelaciones: [
      { id: 'niv-sol-sub', nombre: 'Subrasante', color: '#2563eb', tomas: [armarToma(TOMA_SOL_SUBRASANTE, RASANTE_AV_SOL)] },
      { id: 'niv-sol-base', nombre: 'Base', color: '#16a34a', tomas: [armarToma(TOMA_SOL_BASE, RASANTE_AV_SOL)] },
    ],
  }
  const jrLima: Calle = {
    id: IDS.jrLima,
    nombre: 'Jr. Lima',
    seccion: seccionDeCalzada(),
    rasante: RASANTE_JR_LIMA,
    notas: NOTAS_JR_LIMA,
    nivelaciones: [
      { id: 'niv-lima-sub', nombre: 'Subrasante', color: '#2563eb', tomas: [armarToma(TOMA_LIMA_SUBRASANTE, RASANTE_JR_LIMA)] },
    ],
  }
  const lasLomas: Calle = {
    id: IDS.lasLomas,
    nombre: 'Psje. Las Lomas',
    seccion: seccionDeCalzada(),
    rasante: RASANTE_LAS_LOMAS,
    nivelaciones: [],
  }

  const proyecto: Proyecto = {
    version: 1,
    meta: {
      nombre: 'Obra simulada — Barrio Las Lomas',
      obra: 'Pavimentación de pistas y veredas del Barrio Las Lomas',
      cliente: 'Municipalidad Provincial de Huancayo',
      ubicacion: 'Huancayo, Junín, Perú',
      responsable: 'Max Mamani',
      creado: '2026-09-01T13:00:00.000Z',
      modificado: '2026-10-02T21:00:00.000Z',
    },
    bms: BMS.map((b) => ({ ...b })),
    capas: CAPAS.map((c) => ({ ...c })),
    calles: [avSol, jrLima, lasLomas],
    instrumento: { ...INSTRUMENTO_DE_FABRICA },
    planos: PLANOS.map((p) => ({ ...p })),
    pistas: PISTAS.map((p) => ({ ...p, polilinea: p.polilinea.map((v) => ({ ...v })) })),
  }

  const archivosDePlano: ArchivosDePlano = {
    [IDS.planoDxf]: new TextEncoder().encode(generarDxfExpediente()),
    [IDS.planoPdf]: generarPdfPlano(),
  }
  return { proyecto, archivosDePlano }
}

/** Todas las tomas simuladas, para que la prueba recorra sus visuales. */
export const TOMAS_SIMULADAS: readonly TomaSimulada[] = [TOMA_SOL_SUBRASANTE, TOMA_SOL_BASE, TOMA_LIMA_SUBRASANTE]

// ═══════════════════════════════════════════════════════════════════════════
// ESPERADO: lo que cada guion debe encontrar. Lo comprueba obraSimulada.test.ts.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Lo que cada guion debe encontrar. Solo datos (el generador lo escribe
 * también como `verificacion/datos/obra-simulada.esperado.json` para los
 * guiones `.mjs`, que no pueden importar TypeScript).
 *
 * Diferencias en mm = medida − proyecto, ya compensadas: positivo = sobra =
 * corta; negativo = falta = rellena. Estados: 'conforme' ✓, 'alLimite' △
 * (hasta 2×tol), 'fuera' ✗. Las celdas se nombran «progresiva/punto».
 */
export const ESPERADO = {
  archivo: {
    /** Desde la raíz del repositorio. */
    ruta: 'packages/app/verificacion/datos/obra-simulada.topo',
    /** Desde un guion de packages/app/verificacion/: new URL('./datos/obra-simulada.topo', import.meta.url). */
    rutaDesdeGuion: './datos/obra-simulada.topo',
    /**
     * El campo de archivo de la barra. Está oculto: se le pasa el archivo con
     * setInputFiles, sin pulsar «Abrir» (que pide confirmación).
     */
    selectorAbrir: 'input[type="file"][aria-label="Abrir archivo .topo"]',
  },
  obra: {
    nombre: 'Obra simulada — Barrio Las Lomas',
    obra: 'Pavimentación de pistas y veredas del Barrio Las Lomas',
    cliente: 'Municipalidad Provincial de Huancayo',
    ubicacion: 'Huancayo, Junín, Perú',
    responsable: 'Max Mamani',
    /** Todo de fábrica: mira de 5 m, lecturas 0.30–4.70, visual ≤ 50 m, desequilibrio ≤ 5 m, k = 12, σ = 1 mm, ≤ 4 cambios. */
    instrumento: 'de fábrica',
  },
  /** Al abrir el .topo queda activa la primera toma de la primera calle. Al activar otra calle se activa su ÚLTIMA toma. */
  alAbrir: { calle: 'Av. Sol', toma: IDS.tomaSolSub, capa: 'SUBRASANTE' },
  nombresDeCalles: ['Av. Sol', 'Jr. Lima', 'Psje. Las Lomas'],
  bms: [
    { nombre: 'BM-1', cota: 3245.18, tipo: 'oficial' },
    { nombre: 'BM-2', cota: 3244.256, tipo: 'auxiliar' },
    { nombre: 'BM-3', cota: 3244.468, tipo: 'auxiliar' },
  ],
  capas: [
    { nombre: 'TERRENO EXISTENTE', toleranciaMm: 30, espesor: 0 },
    { nombre: 'SUBRASANTE', toleranciaMm: 20, espesor: 0 },
    { nombre: 'BASE', toleranciaMm: 10, espesor: 0.2 },
  ],
  planos: [
    { id: IDS.planoDxf, nombre: 'expediente-pistas.dxf', formato: 'dxf', calibrado: true, metrosPorUnidad: 1 },
    {
      id: IDS.planoPdf,
      nombre: 'plano-expediente.pdf',
      formato: 'pdf',
      calibrado: false,
      /**
       * Para calibrarlo: la barra de escala del PDF (1:1000) va de 40 a 60 mm
       * de papel en y = 185 mm; en puntos PDF (Y hacia arriba), de
       * (113.386, 70.866) a (170.079, 70.866), y mide 20 m: 1 punto = 0.352778 m.
       */
      barraDeEscala: { desde: { x: 113.386, y: 70.866 }, hasta: { x: 170.079, y: 70.866 }, metros: 20, metrosPorUnidad: 0.352778 },
    },
  ],
  pistas: [
    { id: IDS.pistaLasLomas, nombre: 'PSJE. LAS LOMAS', plano: 'expediente-pistas.dxf', origen: 'dxf', calle: 'Psje. Las Lomas', largoM: 120 },
    // Sobre el PDF sin calibrar: no tiene largo en metros hasta que se calibre (200 m después).
    { id: IDS.pistaJrLima, nombre: 'Jr. Lima (croquis)', plano: 'plano-expediente.pdf', origen: 'croquis', calle: 'Jr. Lima', largoM: null },
  ],
  /** Ejes del DXF (capa EJE_VIA) que todavía no son pista: sirven para crear una desde el plano. Av. Sol no tiene pista. */
  ejesDxfSinPista: ['JR. LIMA', 'AV. SOL'],

  avSol: {
    id: IDS.avSol,
    nombre: 'Av. Sol',
    rasante: { progresivaArranque: 0, cotaArranque: 3244.1, pendiente: -0.35, cotaFin: 3243.68 },
    progresivas: [0, 20, 40, 60, 80, 100, 120],
    puntos: ['Borde izquierdo', 'Eje', 'Borde derecho'],
    notas: [
      { progresiva: 40, texto: 'Buzón de desagüe: nivelar la tapa con la base' },
      { progresiva: 80, texto: 'Subrasante alta en el eje: cortar antes de echar la base' },
      { progresiva: 120, texto: 'Fin del tramo: empalme con el pavimento existente' },
    ],
    subrasante: {
      toma: IDS.tomaSolSub,
      fecha: '2026-09-14',
      cierre: { errorMm: -4, toleranciaMm: 5.88, longitudK: 0.24, pasa: true, comprobado: true },
      /** Altura instrumental de cada estación (cota del anteojo). */
      alturasInstrumentales: [3246.632, 3245.601, 3245.184, 3245.924],
      conteo: { conformes: 19, alLimite: 1, fuera: 1, sinMedir: 0 },
      /** El único fuera de tolerancia: sobra material, hay que cortar. */
      fuera: { celda: '80/p-eje', punto: 'Eje', progresiva: 80, cotaMedida: 3243.674, cotaProyecto: 3243.62, diferenciaMm: 54, accion: 'corta' },
      /** El único al límite: falta material, hay que rellenar. */
      alLimite: { celda: '40/p-borde-d', punto: 'Borde derecho', progresiva: 40, cotaMedida: 3243.662, cotaProyecto: 3243.688, diferenciaMm: -26, accion: 'rellena' },
      diferenciasMm: {
        '0/p-borde-i': 7, '0/p-eje': 5, '0/p-borde-d': -2,
        '20/p-borde-i': -7, '20/p-eje': 3, '20/p-borde-d': 6,
        '40/p-borde-i': 4, '40/p-eje': -4, '40/p-borde-d': -26,
        '60/p-borde-i': 11, '60/p-eje': 9, '60/p-borde-d': 4,
        '80/p-borde-i': 14, '80/p-eje': 54, '80/p-borde-d': 17,
        '100/p-borde-i': -2, '100/p-eje': -4, '100/p-borde-d': 0,
        '120/p-borde-i': 3, '120/p-eje': -1, '120/p-borde-d': 10,
      } as Record<string, number>,
    },
    base: {
      toma: IDS.tomaSolBase,
      fecha: '2026-09-28',
      cierre: { errorMm: 4, toleranciaMm: 5.88, longitudK: 0.24, pasa: true, comprobado: true },
      alturasInstrumentales: [3246.467, 3245.633, 3245.279, 3245.893],
      conteo: { conformes: 21, alLimite: 0, fuera: 0, sinMedir: 0 },
      /**
       * Replanteo: lectura objetivo = AI − cota de proyecto. Estación 1 de la
       * base (AI de la libreta 3246.467), Eje 0+020 (proyecto 3244.030) → 2.437.
       * La base cerró con +4 mm: la app reparte el error y en pantalla (Medir,
       * Replantear, Revisar) usa la AI compensada, 3246.466 → 2.436.
       */
      lecturaObjetivo: {
        estacion: 1,
        alturaInstrumental: 3246.467,
        progresiva: 20,
        punto: 'Eje',
        cotaProyecto: 3244.03,
        lectura: 2.437,
        alturaInstrumentalCompensada: 3246.466,
        lecturaCompensada: 2.436,
      },
    },
    /** BASE sobre SUBRASANTE: diseño 0.200 m, tolerancia de la base 10 mm. */
    espesores: {
      disenioM: 0.2,
      comparables: 21,
      minimoM: 0.152,
      maximoM: 0.219,
      fuera: [{ celda: '80/p-eje', espesorM: 0.152, diferenciaMm: -48, delgada: true }],
      alLimite: [
        { celda: '40/p-borde-d', espesorM: 0.219, diferenciaMm: 19, delgada: false },
        { celda: '80/p-borde-d', espesorM: 0.186, diferenciaMm: -14, delgada: true },
      ],
    },
  },

  jrLima: {
    id: IDS.jrLima,
    nombre: 'Jr. Lima',
    rasante: { progresivaArranque: 100, cotaArranque: 3243.9, pendiente: 0.2, cotaFin: 3244.1 },
    progresivas: [100, 120, 140, 160, 180, 200],
    puntos: ['Borde izquierdo', 'Eje', 'Borde derecho'],
    notas: [{ progresiva: 140, texto: 'Agua empozada tras la lluvia: hundimiento en el eje' }],
    subrasante: {
      toma: IDS.tomaLimaSub,
      fecha: '2026-10-02',
      /** SIN CERRAR: falta la vista adelante al BM-2. Todo lo calculado sobre esta toma es «no comprobado». */
      cierre: { errorMm: null, toleranciaMm: null, longitudK: 0.2, pasa: null, comprobado: false, bmQueFalta: 'BM-2' },
      alturasInstrumentales: [3245.574, 3245.409],
      conteo: { conformes: 17, alLimite: 0, fuera: 1, sinMedir: 0 },
      fuera: { celda: '140/p-eje', punto: 'Eje', progresiva: 140, cotaMedida: 3243.72, cotaProyecto: 3243.78, diferenciaMm: -60, accion: 'rellena' },
      diferenciasMm: {
        '100/p-borde-i': 4, '100/p-eje': 2, '100/p-borde-d': -5,
        '120/p-borde-i': -6, '120/p-eje': 0, '120/p-borde-d': 3,
        '140/p-borde-i': -12, '140/p-eje': -60, '140/p-borde-d': -9,
        '160/p-borde-i': 5, '160/p-eje': 3, '160/p-borde-d': 7,
        '180/p-borde-i': -2, '180/p-eje': 4, '180/p-borde-d': 1,
        '200/p-borde-i': 6, '200/p-eje': 8, '200/p-borde-d': 2,
      } as Record<string, number>,
    },
    /** Drenaje por el eje, sin sumideros. No comprobado: la toma no cerró. */
    drenaje: {
      comprobado: false,
      empozamiento: { progresiva: 140, cota: 3243.72, profundidadMm: 20 },
      /** El otro punto bajo es el arranque (0+100): toca el extremo, no cuenta como empozamiento. */
      puntoBajoExtremo: { progresiva: 100, cota: 3243.702 },
      contrapendiente: { desde: 120, hasta: 140 },
    },
  },

  lasLomas: {
    id: IDS.lasLomas,
    nombre: 'Psje. Las Lomas',
    rasante: { progresivaArranque: 0, cotaArranque: 3244, pendiente: 7.38, cotaFin: 3252.856 },
    sinMediciones: true,
    sinPlanGuardado: true,
    pista: { id: IDS.pistaLasLomas, largoM: 120, desde: 0, hasta: 120 },
    /**
     * Planificar abre con la fuente «rasante» (una sola pendiente): solo
     * controles de inicio y fin, un tramo de 4 estaciones (3 cambios), error
     * esperado 2.83 mm contra 5.88 mm de tolerancia: ok.
     */
    planRasante: {
      controles: [
        { progresiva: 0, cota: 3244, motivos: ['inicio'] },
        { progresiva: 120, cota: 3252.856, motivos: ['fin'] },
      ],
      tramos: [{ desde: 0, hasta: 120, estaciones: 4, cambios: 3, ok: true }],
      ok: true,
    },
    /** Fuente «plano»: las tres cotas del DXF sobre la pista. Mismo plan: el quiebre de 0+060 es de 0.03 %, bajo el umbral de 0.5 %. */
    cotasDelPlano: [
      { progresiva: 0, cota: 3244 },
      { progresiva: 60, cota: 3248.42 },
      { progresiva: 120, cota: 3252.86 },
    ],
    planPlano: {
      controles: [
        { progresiva: 0, cota: 3244, motivos: ['inicio'] },
        { progresiva: 120, cota: 3252.86, motivos: ['fin'] },
      ],
      tramos: [{ desde: 0, hasta: 120, estaciones: 4, cambios: 3, ok: true }],
      ok: true,
    },
    /**
     * Fuente «digitado» con el perfil del expediente (PERFIL_LAS_LOMAS_CON_QUIEBRES):
     * dos quiebres de pendiente con su porqué, y dos tramos marcados porque su
     * paso medio (20 y 25 m) queda bajo los 27.8 m que pide la regla del error.
     */
    perfilConQuiebres: PERFIL_LAS_LOMAS_CON_QUIEBRES.map((v) => ({ ...v })),
    planConQuiebres: {
      controles: [
        { progresiva: 0, cota: 3244, motivos: ['inicio'] },
        { progresiva: 30, cota: 3245.8, motivos: ['quiebre'], texto: 'quiebre de pendiente: de +6.00 % a +9.00 %' },
        { progresiva: 70, cota: 3249.4, motivos: ['quiebre'], texto: 'quiebre de pendiente: de +9.00 % a +6.92 %' },
        { progresiva: 120, cota: 3252.86, motivos: ['fin'] },
      ],
      tramos: [
        { desde: 0, hasta: 30, estaciones: 1, cambios: 0, ok: true },
        { desde: 30, hasta: 70, estaciones: 2, cambios: 1, ok: false },
        { desde: 70, hasta: 120, estaciones: 2, cambios: 1, ok: false },
      ],
      ok: false,
      /**
       * Para no teclear los vértices: el planificador recuerda la fuente y
       * los vértices por calle en localStorage. Escribir esto ANTES de cargar
       * la página (page.addInitScript) deja Las Lomas con el perfil digitado.
       */
      localStorage: {
        clave: 'topo:planificador',
        valor: JSON.stringify({
          state: { porCalle: { [IDS.lasLomas]: { fuente: 'digitado', digitados: PERFIL_LAS_LOMAS_CON_QUIEBRES.map((v) => ({ ...v })) } } },
          version: 1,
        }),
      },
    },
  },

  /** Textos que la app usa para decirlo (búsquese sin distinguir mayúsculas). */
  textos: {
    noComprobado: 'no comprobad',
    simbolos: { conforme: '✓', alLimite: '△', fuera: '✗', sinMedir: '·' },
  },
}

/** ESPERADO en JSON, tal cual lo escribe el generador y lo leen los guiones `.mjs`. */
export function esperadoEnJson(): string {
  return `${JSON.stringify(ESPERADO, null, 2)}\n`
}
