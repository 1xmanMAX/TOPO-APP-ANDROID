/** Herramientas de campo para nivelación (funciones puras). */

/** Radio medio terrestre (m). */
export const EARTH_RADIUS_M = 6371000;
/** Segundos de arco por radián. */
export const RHO_SEC = 206264.806;

/* ------------------------------------------------------------------ */
/* Prueba de dos estacas (colimación)                                  */
/* ------------------------------------------------------------------ */

export interface TwoPegInput {
  /** Instrumento al centro: lectura en A. */
  a1: number;
  /** Instrumento al centro: lectura en B. */
  b1: number;
  /** Instrumento junto a A: lectura en A. */
  a2: number;
  /** Instrumento junto a A: lectura en B. */
  b2: number;
  /** Distancia A–B (m). */
  distance: number;
  /** Ángulo máximo admisible (″). Por defecto 20″. */
  maxArcSec?: number;
}

export interface TwoPegResult {
  /** Desnivel verdadero H_B − H_A = a1 − b1 (m). */
  trueDiff: number;
  /** Desnivel aparente con el instrumento junto a A = a2 − b2 (m). */
  apparentDiff: number;
  /** Lectura correcta esperada en B = a2 − trueDiff (m). */
  expectedB2: number;
  /** Error de colimación en B: b2 − expectedB2 (m). >0 visual inclinada hacia arriba. */
  errorM: number;
  /** El mismo error en mm sobre la distancia `distance`. */
  errorMm: number;
  /** Error equivalente en mm por cada 30 m (referencia de fabricantes). */
  errorMmPer30m: number;
  /** Ángulo de colimación (″), con signo. */
  angleSec: number;
  passes: boolean;
}

/**
 * Prueba de dos estacas. Con el instrumento al centro el error de colimación
 * se cancela (a1 − b1 = desnivel verdadero). Con el instrumento junto a A se
 * supone despreciable el error en A, así que todo el error aparece en B.
 * Criterio por defecto: |ángulo| ≤ 20″ (≈ 3 mm en 30 m, práctica habitual de
 * fabricantes como Leica/Topcon para niveles automáticos de obra).
 */
export function twoPegTest(input: TwoPegInput): TwoPegResult {
  const { a1, b1, a2, b2, distance } = input;
  const maxArcSec = input.maxArcSec ?? 20;
  const trueDiff = a1 - b1;
  const apparentDiff = a2 - b2;
  const expectedB2 = a2 - trueDiff;
  const errorM = b2 - expectedB2;
  const angleRad = distance > 0 ? Math.atan(errorM / distance) : NaN;
  const angleSec = angleRad * RHO_SEC;
  return {
    trueDiff,
    apparentDiff,
    expectedB2,
    errorM,
    errorMm: errorM * 1000,
    errorMmPer30m: distance > 0 ? (errorM * 1000 * 30) / distance : NaN,
    angleSec,
    passes: Number.isFinite(angleSec) && Math.abs(angleSec) <= maxArcSec,
  };
}

/* ------------------------------------------------------------------ */
/* Taquimetría (estadía)                                               */
/* ------------------------------------------------------------------ */

export interface StadiaInput {
  upper: number;
  middle?: number;
  lower: number;
  /** Constante multiplicativa (normalmente 100). */
  k?: number;
  /** Constante aditiva (0 en instrumentos modernos). */
  c?: number;
  /** Ángulo vertical de ELEVACIÓN (0 = horizontal, + hacia arriba), grados. */
  verticalAngleDeg?: number;
  /** Altura de instrumento sobre la estación (m), para el desnivel estación→punto. */
  instrumentHeight?: number;
}

export interface StadiaResult {
  /** Intervalo de mira s = sup − inf (m). */
  intercept: number;
  /** Distancia inclinada aparente k·s + c (m). */
  slopeDistance: number;
  /** Distancia horizontal D = k·s·cos²α + c·cosα (m). */
  horizontalDistance: number;
  /** Desnivel eje del instrumento → hilo medio V = k·s·sin(2α)/2 + c·sinα (m). */
  verticalDiff: number;
  /** Desnivel estación → pie de mira = hi + V − m (si hay hi y hilo medio). */
  elevationDiff?: number;
  middleExpected: number;
  /** (medio − promedio) en mm, si se dio el hilo medio. */
  middleDiffMm?: number;
  /** |middleDiffMm| ≤ 3 mm. True si no se dio hilo medio. */
  middleOk: boolean;
}

export function stadia(input: StadiaInput): StadiaResult {
  const { upper, lower, middle } = input;
  const k = input.k ?? 100;
  const c = input.c ?? 0;
  const a = ((input.verticalAngleDeg ?? 0) * Math.PI) / 180;
  const s = Math.abs(upper - lower);
  const horizontalDistance = k * s * Math.cos(a) ** 2 + c * Math.cos(a);
  const verticalDiff = (k * s * Math.sin(2 * a)) / 2 + c * Math.sin(a);
  const middleExpected = (upper + lower) / 2;
  const middleDiffMm = middle !== undefined ? (middle - middleExpected) * 1000 : undefined;
  const res: StadiaResult = {
    intercept: s,
    slopeDistance: k * s + c,
    horizontalDistance,
    verticalDiff,
    middleExpected,
    middleDiffMm,
    middleOk: middleDiffMm === undefined || Math.abs(middleDiffMm) <= 3 + 1e-9,
  };
  if (input.instrumentHeight !== undefined) {
    res.elevationDiff = input.instrumentHeight + verticalDiff - (middle ?? middleExpected);
  }
  return res;
}

/* ------------------------------------------------------------------ */
/* Curvatura y refracción, nivelación recíproca                         */
/* ------------------------------------------------------------------ */

/**
 * Corrección combinada curvatura + refracción (m): (1 − k)·D²/(2R).
 * Es lo que la lectura de mira resulta MAYOR que la real; se resta de la lectura.
 * k = coeficiente de refracción (≈ 0,13).
 */
export function curvatureRefraction(distanceM: number, k = 0.13): number {
  return ((1 - k) * distanceM * distanceM) / (2 * EARTH_RADIUS_M);
}

export interface ReciprocalInput {
  /** Instrumento junto a A: lectura en A (cerca). */
  a1: number;
  /** Instrumento junto a A: lectura en B (lejos). */
  b1: number;
  /** Instrumento junto a B: lectura en A (lejos). */
  a2: number;
  /** Instrumento junto a B: lectura en B (cerca). */
  b2: number;
}

/**
 * Nivelación recíproca (cruce de ríos, quebradas). El promedio elimina la
 * colimación y la curvatura/refracción: ΔH_AB = ((a1−b1) + (a2−b2)) / 2.
 * `error` = semidiferencia (efecto combinado colimación + c&r sobre la visual larga).
 */
export function reciprocalLeveling(input: ReciprocalInput): { trueDiff: number; diff1: number; diff2: number; error: number } {
  const diff1 = input.a1 - input.b1;
  const diff2 = input.a2 - input.b2;
  return { trueDiff: (diff1 + diff2) / 2, diff1, diff2, error: (diff2 - diff1) / 2 };
}

/* ------------------------------------------------------------------ */
/* Replanteo y cálculos rápidos                                        */
/* ------------------------------------------------------------------ */

/** Altura de instrumento: HI = cota BM + vista atrás. */
export function quickHI(bmElevation: number, bs: number): number {
  return bmElevation + bs;
}

/** Cota de un punto: HI − lectura. */
export function elevationFromReading(hi: number, reading: number): number {
  return hi - reading;
}

/** Lectura objetivo de mira para que el pie quede en la cota de proyecto: HI − cota proyecto. */
export function gradeStake(hi: number, designElevation: number): number {
  return hi - designElevation;
}

/**
 * Inversa de gradeStake: corte/relleno a partir de la lectura real.
 * = cota terreno − cota proyecto = (HI − lectura) − proyecto = lecturaObjetivo − lectura.
 * > 0 cortar, < 0 rellenar.
 */
export function cutFill(hi: number, reading: number, designElevation: number): number {
  return hi - reading - designElevation;
}

/** Texto para la estaca: "Cortar 0.125 m", "Rellenar 0.040 m" o "En rasante". */
export function cutFillLabel(value: number, tolM = 0.0005): string {
  if (!Number.isFinite(value)) return '—';
  if (Math.abs(value) <= tolM) return 'En rasante';
  return `${value > 0 ? 'Cortar' : 'Rellenar'} ${Math.abs(value).toFixed(3)} m`;
}
