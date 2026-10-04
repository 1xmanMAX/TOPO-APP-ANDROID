/**
 * Unidades: ángulos (sexagesimal, centesimal, radianes), pendientes y
 * formateo numérico. Funciones puras, sin DOM.
 */

export interface Dms {
  d: number;
  m: number;
  s: number;
  /** 1 o −1. */
  sign: 1 | -1;
}

export interface Slope {
  percent: number;
  permil: number;
  degrees: number;
  /** Talud "1:n" (n = horizontal por unidad vertical). "1:∞" si dz = 0. */
  ratio: string;
}

const RAD = Math.PI / 180;

export function dmsToDeg(d: number, m = 0, s = 0): number {
  // El signo lo manda el primer componente no nulo (permite −0°30').
  const neg = d < 0 || Object.is(d, -0) || (d === 0 && (m < 0 || (m === 0 && s < 0)));
  const v = Math.abs(d) + Math.abs(m) / 60 + Math.abs(s) / 3600;
  return neg ? -v : v;
}

/**
 * Grados decimales → G/M/S. `secDecimals` redondea los segundos con acarreo
 * (evita 59.99999 → 60.0). Sin redondeo si se omite.
 */
export function degToDms(deg: number, secDecimals?: number): Dms {
  const sign: 1 | -1 = deg < 0 ? -1 : 1;
  let total = Math.abs(deg) * 3600;
  if (secDecimals !== undefined) {
    const f = 10 ** secDecimals;
    total = Math.round(total * f) / f;
  }
  let d = Math.floor(total / 3600 + 1e-12);
  let rest = total - d * 3600;
  let m = Math.floor(rest / 60 + 1e-12);
  let s = rest - m * 60;
  if (s < 0) s = 0;
  if (secDecimals !== undefined) s = Math.round(s * 10 ** secDecimals) / 10 ** secDecimals;
  if (s >= 60) { s -= 60; m += 1; }
  if (m >= 60) { m -= 60; d += 1; }
  return { d, m, s, sign };
}

/** 12°34'56.7" (con signo − si es negativo). */
export function formatDms(deg: number, decimals = 1): string {
  const { d, m, s, sign } = degToDms(deg, decimals);
  const ss = s.toFixed(decimals).padStart(decimals > 0 ? 3 + decimals : 2, '0');
  return `${sign < 0 ? '-' : ''}${d}°${String(m).padStart(2, '0')}'${ss}"`;
}

export interface ParseAngleOptions {
  /** Interpreta "12.3015" como 12°30'15" (formato calculadora DD.MMSS). */
  calculator?: boolean;
}

/**
 * Lee un ángulo en grados. Acepta "12.5", "12°30'15\"", "12 30 15",
 * "12°30.5'", "-12 30", "12d30m15s" y, con `calculator`, "12.3015".
 * Devuelve null si no se puede interpretar.
 */
export function parseAngle(str: string, opts: ParseAngleOptions = {}): number | null {
  const t = str.trim().replace(/,/g, '.');
  if (!t) return null;
  const neg = t.startsWith('-');
  const body = neg ? t.slice(1).trim() : t.replace(/^\+/, '');
  const parts = body
    .split(/[°ºd'’′m"”″s\s]+/i)
    .filter((p) => p.length > 0);
  if (parts.length === 0 || parts.length > 3) return null;
  if (!parts.every((p) => /^\d*\.?\d+$|^\d+\.$/.test(p))) return null;
  const nums = parts.map(Number);
  let v: number;
  if (nums.length === 1 && opts.calculator && !/[°ºd'"]/i.test(body)) {
    // DD.MMSSss
    const [ip, fp = ''] = parts[0].split('.');
    const frac = (fp + '0000').slice(0, 4);
    const mm = Number(frac.slice(0, 2));
    const ss = Number(frac.slice(2, 4) + '.' + (fp.slice(4) || '0'));
    if (mm >= 60 || ss >= 60) return null;
    v = Number(ip) + mm / 60 + ss / 3600;
  } else {
    const [d, m = 0, s = 0] = nums;
    if (nums.length > 1 && (m >= 60 || s >= 60)) return null;
    v = d + m / 60 + s / 3600;
  }
  return neg ? -v : v;
}

export const degToGon = (deg: number): number => (deg * 400) / 360;
export const gonToDeg = (gon: number): number => (gon * 360) / 400;
export const degToRad = (deg: number): number => deg * RAD;
export const radToDeg = (rad: number): number => rad / RAD;

/** Normaliza un azimut a [0, 360). */
export function normalizeDeg(deg: number): number {
  const r = deg % 360;
  const v = r < 0 ? r + 360 : r;
  return v >= 360 - 1e-12 ? 0 : v;
}

/** Normaliza una diferencia angular a (−180, 180]. */
export function normalizeDiffDeg(deg: number): number {
  let v = normalizeDeg(deg);
  if (v > 180) v -= 360;
  return v;
}

/** Pendiente a partir de desnivel y distancia horizontal. */
export function slopeFrom(dz: number, dh: number): Slope {
  const r = dh === 0 ? (dz === 0 ? 0 : Math.sign(dz) * Infinity) : dz / dh;
  const n = dz === 0 ? Infinity : Math.abs(dh / dz);
  return {
    percent: r * 100,
    permil: r * 1000,
    degrees: radToDeg(Math.atan2(dz, Math.abs(dh))),
    ratio: Number.isFinite(n) ? `1:${trimNum(n, 2)}` : '1:∞',
  };
}

/** Número con `dec` decimales, punto decimal y sin "-0.000". */
export function fmt(n: number | undefined | null, dec = 3): string {
  if (n === undefined || n === null || !Number.isFinite(n)) return '—';
  const s = n.toFixed(dec);
  return /^-0\.?0*$/.test(s) ? s.slice(1) : s;
}

/** Con signo explícito: "+0.012" / "-0.005". */
export function fmtSigned(n: number, dec = 3): string {
  const s = fmt(n, dec);
  return s.startsWith('-') || s === '—' ? s : `+${s}`;
}

/** Hasta `dec` decimales, sin ceros finales. */
export function trimNum(n: number, dec = 3): string {
  return fmt(n, dec).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}
