/**
 * Conversión de pendientes. Representación canónica: r = ΔV/ΔH (m/m, con signo).
 */

export type SlopeUnit = 'percent' | 'permil' | 'degrees' | 'ratio' | 'hv';

/** r (m/m) a partir de un valor en la unidad dada. 1:n y H:V llevan n = H/V (> 0). */
export function slopeToRatio(unit: SlopeUnit, v: number): number {
  switch (unit) {
    case 'percent':
      return v / 100;
    case 'permil':
      return v / 1000;
    case 'degrees':
      if (Math.abs(v) >= 90) return NaN;
      return Math.tan((v * Math.PI) / 180);
    case 'ratio':
    case 'hv':
      if (v === 0) return NaN;
      return 1 / v;
  }
}

/** Valor en la unidad pedida a partir de r. n = H/V = 1/|r| (∞ si r = 0). */
export function ratioToSlope(unit: SlopeUnit, r: number): number {
  switch (unit) {
    case 'percent':
      return r * 100;
    case 'permil':
      return r * 1000;
    case 'degrees':
      return (Math.atan(r) * 180) / Math.PI;
    case 'ratio':
    case 'hv':
      return r === 0 ? Infinity : 1 / Math.abs(r);
  }
}

/** Todas las representaciones de r. */
export function allSlopes(r: number): Record<SlopeUnit, number> {
  return {
    percent: ratioToSlope('percent', r),
    permil: ratioToSlope('permil', r),
    degrees: ratioToSlope('degrees', r),
    ratio: ratioToSlope('ratio', r),
    hv: ratioToSlope('hv', r),
  };
}
