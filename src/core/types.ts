/**
 * Modelo de datos de TOPO APP.
 *
 * Principio rector: los datos crudos (lecturas, coordenadas medidas) nunca se
 * sobrescriben; las cotas, cierres y compensaciones son SIEMPRE derivadas por
 * las funciones puras de `src/core`. Unidades: metros, salvo que se indique mm.
 */

export type ID = string;

/* ------------------------------------------------------------------ */
/* Proyecto                                                            */
/* ------------------------------------------------------------------ */

export interface CRS {
  /** Zona UTM (Perú: 17, 18 o 19). */
  zone: number;
  hemisphere: 'N' | 'S';
  datum: 'WGS84';
}

export interface Project {
  id: ID;
  name: string;
  client?: string;
  location?: string;
  surveyor?: string;
  /** Equipo principal usado (texto libre: "Leica LS15", "Sokkia B40"...). */
  instrument?: string;
  crs: CRS;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  benchmarks: Benchmark[];
  points: SurveyPoint[];
  levelRuns: LevelRun[];
  layerControls: LayerControl[];
  notes?: string;
}

/** Banco de nivel (BM). */
export interface Benchmark {
  id: ID;
  name: string;
  elevation: number;
  x?: number;
  y?: number;
  description?: string;
  official: boolean;
}

/* ------------------------------------------------------------------ */
/* Puntos                                                              */
/* ------------------------------------------------------------------ */

export type PointSource = 'manual' | 'total-station' | 'gnss' | 'phone-gps' | 'import' | 'level' | 'calc';

/** Punto topográfico. x = Este, y = Norte, z = Cota. */
export interface SurveyPoint {
  id: ID;
  name: string;
  code?: string;
  x: number;
  y: number;
  z?: number;
  source: PointSource;
  /** Precisión horizontal estimada (m). */
  precision?: number;
  note?: string;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* Nivelación geométrica                                               */
/* ------------------------------------------------------------------ */

/**
 * BS = vista atrás (+), IS = vista intermedia (radiación), FS = vista adelante (−).
 * Una estación (puesta de instrumento) empieza con un BS y termina con un FS.
 * Un punto de cambio es un FS seguido por un BS sobre el mismo punto.
 */
export type ObsKind = 'BS' | 'IS' | 'FS';

export interface LevelObservation {
  id: ID;
  kind: ObsKind;
  pointName: string;
  /** Lectura del hilo medio (m). */
  reading: number;
  /** Hilos estadimétricos opcionales (m) — nivel automático. */
  upper?: number;
  lower?: number;
  /** Distancia horizontal instrumento-mira (m). Si falta y hay hilos: 100·(upper−lower). */
  distance?: number;
  /** Cota de proyecto en este punto (para corte/relleno o control). */
  designElevation?: number;
  note?: string;
}

export type LevelMethod = 'HI' | 'RF';
export type LevelClosure = 'loop' | 'known-bm' | 'open';

/** Clase de nivelación → coeficiente e (mm) de la tolerancia T = e·√K. */
export type LevelOrder = 'first' | 'second' | 'third' | 'ordinary' | 'custom';

export type LevelSource = 'manual' | 'leica-gsi' | 'trimble-dini' | 'topcon' | 'sokkia' | 'csv';

export interface LevelRun {
  id: ID;
  name: string;
  date: string; // ISO (día)
  method: LevelMethod;
  closure: LevelClosure;
  order: LevelOrder;
  /** Coeficiente e (mm) cuando order = 'custom'. */
  customK?: number;
  startBM: { name: string; elevation: number };
  /** BM de llegada cuando closure = 'known-bm'. En 'loop' se usa startBM. */
  endBM?: { name: string; elevation: number };
  observations: LevelObservation[];
  instrument?: string;
  operator?: string;
  weather?: string;
  source: LevelSource;
  notes?: string;
}

/** Fila calculada de la libreta (una por observación, en el mismo orden). */
export interface LevelRow {
  obsId: ID;
  kind: ObsKind;
  pointName: string;
  reading: number;
  distance?: number;
  /** Índice de estación (puesta) 1..n. */
  setup: number;
  /** Altura (cota) de instrumento vigente. */
  hi?: number;
  rise?: number;
  fall?: number;
  elevation: number;
  /** Cota compensada (si hay cierre). */
  adjustedElevation: number;
  /** Corrección aplicada (m). */
  correction: number;
  designElevation?: number;
  /** adjustedElevation − designElevation. >0 cortar, <0 rellenar. */
  cutFill?: number;
  note?: string;
}

export interface LevelChecks {
  sumBS: number;
  sumFS: number;
  sumRise: number;
  sumFall: number;
  /** ΣBS − ΣFS == ΣS − ΣB == cota final − cota inicial. */
  arithmeticOk: boolean;
  sumBackDist: number;
  sumForeDist: number;
  /** Desbalance de distancias atrás − adelante (m). */
  distanceImbalance: number;
}

export interface LevelClosureResult {
  /** Cota calculada de llegada. */
  computedEnd: number;
  /** Cota conocida de llegada (o la inicial en circuito). */
  knownEnd?: number;
  /** Error de cierre en mm (calculada − conocida). */
  misclosureMm?: number;
  /** Tolerancia en mm = e·√K. */
  toleranceMm?: number;
  /** Coeficiente e usado (mm). */
  k: number;
  /** Longitud total nivelada (km). */
  lengthKm: number;
  setups: number;
  passes?: boolean;
  /** Precisión relativa o calidad: |error| / tolerancia (0..∞). */
  ratio?: number;
}

export interface LevelRunResult {
  rows: LevelRow[];
  checks: LevelChecks;
  closure: LevelClosureResult;
  /** Problemas de estructura de datos (BS faltante, etc.). */
  issues: string[];
}

/* ------------------------------------------------------------------ */
/* Control de capas de pavimento / veredas                             */
/* ------------------------------------------------------------------ */

export interface PavementLayer {
  id: ID;
  name: string;
  /** Espesor (m). La última capa (subrasante) puede tener 0. */
  thickness: number;
  /** Tolerancia ± (m). */
  tolerance: number;
}

/** Rasante de proyecto definida por pendientes. */
export interface DesignGrade {
  /** Progresiva de inicio (m). */
  startStation: number;
  /** Cota del eje en la progresiva de inicio (superficie terminada). */
  startElevation: number;
  /** Pendiente longitudinal (%). Positiva sube. */
  longSlope: number;
  /** Bombeo / pendiente transversal (%). */
  crossSlope: number;
  /** 'crown' = bombeo a dos aguas desde el eje; 'one-way' = una sola caída hacia +offset. */
  crossType: 'crown' | 'one-way';
}

export interface ControlPoint {
  id: ID;
  /** Progresiva (m). */
  station: number;
  /** Desplazamiento transversal (m): negativo izquierda, positivo derecha. */
  offset: number;
  label?: string;
  /** Cota de proyecto explícita (si se da, prevalece sobre la rasante por pendientes). */
  designOverride?: number;
  /** Cotas medidas por capa: layerId → cota. */
  measured: Record<ID, number>;
}

export interface LayerControl {
  id: ID;
  name: string;
  /** Capas de ARRIBA hacia ABAJO. */
  layers: PavementLayer[];
  grade: DesignGrade;
  points: ControlPoint[];
}

export type ComplianceStatus = 'ok' | 'warn' | 'fail' | 'pending';

export interface LayerCheck {
  pointId: ID;
  layerId: ID;
  station: number;
  offset: number;
  design: number;
  measured?: number;
  /** measured − design (m). >0 alto (cortar), <0 bajo (rellenar). */
  deviation?: number;
  status: ComplianceStatus;
}

/* ------------------------------------------------------------------ */
/* Import / Export                                                     */
/* ------------------------------------------------------------------ */

export type DataFormat =
  | 'leica-gsi8'
  | 'leica-gsi16'
  | 'trimble-dini'
  | 'sokkia-sdr'
  | 'topcon-gts'
  | 'nmea'
  | 'csv-points'
  | 'csv-leveling'
  | 'unknown';

export interface ImportResult {
  format: DataFormat;
  points: SurveyPoint[];
  levelRuns: LevelRun[];
  warnings: string[];
}
