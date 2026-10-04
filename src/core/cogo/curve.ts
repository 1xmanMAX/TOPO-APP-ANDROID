/**
 * Curva circular simple, progresivas y referencia a un eje recto.
 */
import { degToRad, formatDms, radToDeg } from '@/core/units';
import type { XY } from './basic';

export interface CurveElements {
  R: number;
  deltaDeg: number;
  /** Tangente PI–PC. */
  T: number;
  /** Longitud de arco. */
  L: number;
  /** Cuerda larga PC–PT. */
  LC: number;
  /** Externa PI–punto medio de la curva. */
  E: number;
  /** Ordenada media (flecha). */
  M: number;
}

export function horizontalCurve({ R, deltaDeg }: { R: number; deltaDeg: number }): CurveElements {
  const h = degToRad(Math.abs(deltaDeg)) / 2;
  return {
    R,
    deltaDeg,
    T: R * Math.tan(h),
    L: R * 2 * h,
    LC: 2 * R * Math.sin(h),
    E: R * (1 / Math.cos(h) - 1),
    M: R * (1 - Math.cos(h)),
  };
}

export interface StakeoutRow {
  station: number;
  label: string;
  /** Arco acumulado desde el PC (m). */
  arc: number;
  /** Ángulo de deflexión desde la tangente en el PC (grados). */
  deflection: number;
  deflectionDms: string;
  /** Cuerda desde el PC. */
  chordFromPC: number;
  /** Cuerda desde el punto anterior. */
  chord: number;
}

/**
 * Tabla de replanteo por deflexiones: PC, progresivas múltiplo de `interval`
 * y PT. deflexión = arco/(2R); cuerda = 2R·sen(deflexión).
 */
export function curveStakeout(p: { R: number; deltaDeg: number; pcStation: number; interval: number }): StakeoutRow[] {
  const { R, pcStation, interval } = p;
  if (interval <= 0) throw new Error('El intervalo debe ser positivo');
  const { L } = horizontalCurve(p);
  const pt = pcStation + L;
  const stations = [pcStation];
  let s = Math.floor(pcStation / interval + 1e-9) * interval + interval;
  while (s < pt - 1e-9) {
    if (s > pcStation + 1e-9) stations.push(s);
    s += interval;
  }
  stations.push(pt);
  let prevArc = 0;
  return stations.map((st, i) => {
    const arc = st - pcStation;
    const defl = arc / (2 * R);
    const row: StakeoutRow = {
      station: st,
      label: i === 0 ? 'PC' : i === stations.length - 1 ? 'PT' : '',
      arc,
      deflection: radToDeg(defl),
      deflectionDms: formatDms(radToDeg(defl), 1),
      chordFromPC: 2 * R * Math.sin(defl),
      chord: 2 * R * Math.sin((arc - prevArc) / (2 * R)),
    };
    prevArc = arc;
    return row;
  });
}

/** 1120.5 → "1+120.50". */
export function stationFormat(m: number, decimals = 2): string {
  const neg = m < 0;
  const f = 10 ** decimals;
  const abs = Math.round(Math.abs(m) * f) / f;
  const km = Math.floor(abs / 1000 + 1e-12);
  const rest = abs - km * 1000;
  const restStr = rest.toFixed(decimals).padStart(decimals > 0 ? 4 + decimals : 3, '0');
  return `${neg && abs > 0 ? '-' : ''}${km}+${restStr}`;
}

/** "1+120.50" → 1120.5; también acepta "1120.5". null si no es válida. */
export function parseStation(str: string): number | null {
  const t = str.trim().replace(/,/g, '.').replace(/\s+/g, '');
  let m = /^([+-]?)(\d+)\+(\d+(?:\.\d*)?)$/.exec(t);
  if (m) {
    const v = Number(m[2]) * 1000 + Number(m[3]);
    return m[1] === '-' ? -v : v;
  }
  m = /^[+-]?\d*\.?\d+$/.exec(t);
  return m ? Number(t) : null;
}

export interface AlignmentRef {
  /** Progresiva sobre el eje (desde A, + startStation). */
  station: number;
  /** Desplazamiento: + derecha, − izquierda (mirando de A a B). */
  offset: number;
  /** Pie de la perpendicular. */
  foot: XY;
  /** true si la proyección cae entre A y B. */
  within: boolean;
}

export function pointToAlignment(p: XY, a: XY, b: XY, startStation = 0): AlignmentRef {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) throw new Error('Eje de longitud nula');
  const ux = dx / len;
  const uy = dy / len;
  const wx = p.x - a.x;
  const wy = p.y - a.y;
  const along = wx * ux + wy * uy;
  const offset = wx * uy - wy * ux;
  return {
    station: startStation + along,
    offset,
    foot: { x: a.x + along * ux, y: a.y + along * uy },
    within: along >= -1e-9 && along <= len + 1e-9,
  };
}
