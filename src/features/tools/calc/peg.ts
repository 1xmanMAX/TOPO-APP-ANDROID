import { twoPegTest, type TwoPegResult } from '@/core/leveling';

export type PegCriterion = 'arc20' | 'wsdot';

export interface PegEval extends TwoPegResult {
  /** Distancia efectiva (diferencia de visuales en la 2ª puesta), m. */
  effectiveDistance: number;
  /** Error equivalente en mm por cada 60 m. */
  errorMmPer60m: number;
  /** Límite del criterio en segundos de arco (equivalente). */
  limitSec: number;
  passes: boolean;
}

/** 2 mm en 60 m expresado en segundos de arco (≈ 6,9″). */
export const WSDOT_LIMIT_SEC = Math.atan(0.002 / 60) * 206264.806;

/**
 * Prueba de dos estacas con el instrumento al centro (a1, b1) y luego junto a A
 * (a2, b2) a `nearDist` m de A. La diferencia de visuales en la 2ª puesta es
 * L − nearDist; sobre ella se reparte el error.
 */
export function pegTestEval(p: {
  a1: number;
  b1: number;
  a2: number;
  b2: number;
  distance: number;
  nearDist?: number;
  criterion: PegCriterion;
}): PegEval {
  const eff = p.distance - (p.nearDist ?? 0);
  const limitSec = p.criterion === 'wsdot' ? WSDOT_LIMIT_SEC : 20;
  const r = twoPegTest({ a1: p.a1, b1: p.b1, a2: p.a2, b2: p.b2, distance: eff, maxArcSec: limitSec });
  const errorMmPer60m = eff > 0 ? (r.errorM * 1000 * 60) / eff : NaN;
  const passes =
    p.criterion === 'wsdot' ? Number.isFinite(errorMmPer60m) && Math.abs(errorMmPer60m) <= 2 + 1e-9 : r.passes;
  return { ...r, effectiveDistance: eff, errorMmPer60m, limitSec, passes };
}
