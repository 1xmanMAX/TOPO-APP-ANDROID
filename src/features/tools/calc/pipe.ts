/**
 * Pendiente de tuberías (alcantarillado / drenaje). Funciones puras.
 * Convención: la tubería BAJA desde el buzón aguas arriba; S > 0 = cae.
 */

export interface PipeRow {
  /** Distancia horizontal desde el buzón inicial (m). */
  x: number;
  /** Cota de fondo (invert) a la distancia x. */
  invert: number;
  /** Lectura de mira esperada sobre el fondo = AI − cota (si hay AI). */
  reading?: number;
}

/** Cota de fondo a la distancia x: Cf(x) = Cf0 − S·x (S en m/m). */
export function pipeInvertAt(startInvert: number, slopeMM: number, x: number): number {
  return startInvert - slopeMM * x;
}

/** Pendiente (m/m) entre dos cotas de fondo separadas L (horizontal). */
export function pipeSlopeFrom(startInvert: number, endInvert: number, length: number): number {
  if (!(length > 0)) return NaN;
  return (startInvert - endInvert) / length;
}

/**
 * Tabla cada `step` m desde 0 hasta `length` (incluye siempre el final).
 * Con `hi` (altura de instrumento) añade la lectura de mira esperada.
 */
export function pipeTable(p: {
  startInvert: number;
  slopeMM: number;
  length: number;
  step: number;
  hi?: number;
  maxRows?: number;
}): PipeRow[] {
  const { startInvert, slopeMM, length, step, hi } = p;
  const maxRows = p.maxRows ?? 500;
  if (!(length > 0) || !(step > 0)) return [];
  const xs: number[] = [];
  for (let i = 0; i * step < length - 1e-9 && xs.length < maxRows; i++) xs.push(i * step);
  xs.push(length);
  return xs.map((x) => {
    const invert = pipeInvertAt(startInvert, slopeMM, x);
    const row: PipeRow = { x, invert };
    if (hi !== undefined) row.reading = hi - invert;
    return row;
  });
}

/** Profundidad de buzón = cota de tapa − cota de fondo. */
export function manholeDepth(coverElevation: number, invert: number): number {
  return coverElevation - invert;
}

/** Caudal mínimo de cálculo según OS.070 (L/s). */
export const OS070_MIN_FLOW = 1.5;

/**
 * Pendiente mínima RNE OS.070 por tensión tractiva (τ ≥ 1,0 Pa, n = 0,013):
 * S₀min = 0,0055 · Qi^(−0,47), S en m/m, Qi en L/s (Qi ≥ 1,5 L/s).
 */
export function os070MinSlope(qiLps: number): number {
  const q = Math.max(OS070_MIN_FLOW, qiLps);
  return 0.0055 * q ** -0.47;
}
