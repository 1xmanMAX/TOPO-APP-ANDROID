/**
 * COGO básico: inverso, radiación, intersecciones, áreas.
 * Convención: x = Este, y = Norte; azimut en grados desde el Norte, horario.
 */
import { degToRad, formatDms, normalizeDeg, radToDeg } from '@/core/units';

export interface XY {
  x: number;
  y: number;
}
export interface XYZ extends XY {
  z?: number;
}

/** Azimut A→B en grados [0, 360). */
export function azimuth(a: XY, b: XY): number {
  return normalizeDeg(radToDeg(Math.atan2(b.x - a.x, b.y - a.y)));
}

/** Rumbo "N 45°30'00\" E" a partir de un azimut. */
export function bearing(azDeg: number, secDecimals = 0): string {
  const az = normalizeDeg(azDeg);
  let ns: 'N' | 'S';
  let ew: 'E' | 'W';
  let ang: number;
  if (az <= 90) { ns = 'N'; ew = 'E'; ang = az; }
  else if (az <= 180) { ns = 'S'; ew = 'E'; ang = 180 - az; }
  else if (az <= 270) { ns = 'S'; ew = 'W'; ang = az - 180; }
  else { ns = 'N'; ew = 'W'; ang = 360 - az; }
  return `${ns} ${formatDms(ang, secDecimals)} ${ew}`;
}

export interface InverseResult {
  /** Distancia horizontal (m). */
  dh: number;
  azimuth: number;
  bearing: string;
  dx: number;
  dy: number;
  /** Solo si ambos puntos tienen z. */
  dz?: number;
  slopeDist?: number;
  /** Pendiente (%) = dz/dh·100. */
  slopePercent?: number;
}

export function inverse(a: XYZ, b: XYZ): InverseResult {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dh = Math.hypot(dx, dy);
  const az = azimuth(a, b);
  const r: InverseResult = { dh, azimuth: az, bearing: bearing(az), dx, dy };
  if (a.z !== undefined && b.z !== undefined) {
    const dz = b.z - a.z;
    r.dz = dz;
    r.slopeDist = Math.hypot(dh, dz);
    r.slopePercent = dh === 0 ? undefined : (dz / dh) * 100;
  }
  return r;
}

/** Radiación: punto a `distance` (horizontal) con azimut dado. */
export function polar(from: XYZ, azimuthDeg: number, distance: number, dz?: number): XYZ {
  const a = degToRad(azimuthDeg);
  const p: XYZ = { x: from.x + distance * Math.sin(a), y: from.y + distance * Math.cos(a) };
  if (from.z !== undefined && dz !== undefined) p.z = from.z + dz;
  return p;
}

export interface StationObservation {
  station: XYZ;
  /** Punto de orientación (vista atrás) o azimut a él. */
  backsight?: XY;
  backAzimuthDeg?: number;
  /** Lectura horizontal en la vista atrás (por defecto 0°). */
  hzBacksight?: number;
  /** Altura de instrumento (m). */
  hiInstr: number;
  /** Lectura horizontal al punto (grados, horario). */
  hz: number;
  /** Ángulo cenital (grados): 90° = horizontal. */
  vz: number;
  /** Distancia inclinada (m). */
  slopeDist: number;
  /** Altura de prisma / jalón (m). */
  targetHeight: number;
  /** Corrección por curvatura y refracción (k = 0.13). Por defecto false. */
  curvatureRefraction?: boolean;
}

export interface StationShot extends XYZ {
  azimuth: number;
  horizontalDist: number;
  /** Desnivel estación (terreno) → punto (terreno). */
  dz: number;
}

const EARTH_R = 6371000;

/** Estación total: coordenadas de un punto radiado. */
export function radiateFromStation(o: StationObservation): StationShot {
  let back: number;
  if (o.backsight) back = azimuth(o.station, o.backsight);
  else if (o.backAzimuthDeg !== undefined) back = o.backAzimuthDeg;
  else throw new Error('Falta vista atrás o azimut de orientación');
  const az = normalizeDeg(back + o.hz - (o.hzBacksight ?? 0));
  const v = degToRad(o.vz);
  const dhz = o.slopeDist * Math.sin(v);
  let dv = o.slopeDist * Math.cos(v);
  if (o.curvatureRefraction) dv += ((1 - 0.13) * dhz * dhz) / (2 * EARTH_R);
  const dz = o.hiInstr + dv - o.targetHeight;
  const p = polar(o.station, az, dhz);
  const shot: StationShot = { x: p.x, y: p.y, azimuth: az, horizontalDist: dhz, dz };
  if (o.station.z !== undefined) shot.z = o.station.z + dz;
  return shot;
}

/** Intersección de dos visuales (azimuts). null si son paralelas. */
export function intersectionByAzimuths(p1: XY, az1: number, p2: XY, az2: number): XY | null {
  const a1 = degToRad(az1);
  const a2 = degToRad(az2);
  const u = { x: Math.sin(a1), y: Math.cos(a1) };
  const v = { x: Math.sin(a2), y: Math.cos(a2) };
  const den = u.x * v.y - u.y * v.x;
  if (Math.abs(den) < 1e-12) return null;
  const wx = p2.x - p1.x;
  const wy = p2.y - p1.y;
  const t = (wx * v.y - wy * v.x) / den;
  return { x: p1.x + t * u.x, y: p1.y + t * u.y };
}

/**
 * Intersección de dos distancias (circunferencias). Devuelve 0, 1 o 2 puntos;
 * el primero queda a la DERECHA de la línea p1→p2 y el segundo a la izquierda.
 */
export function intersectionByDistances(p1: XY, r1: number, p2: XY, r2: number): XY[] {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const d = Math.hypot(dx, dy);
  if (d === 0 || d > r1 + r2 + 1e-9 || d < Math.abs(r1 - r2) - 1e-9) return [];
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
  const mx = p1.x + (a * dx) / d;
  const my = p1.y + (a * dy) / d;
  if (h < 1e-9) return [{ x: mx, y: my }];
  // Normal derecha de (dx,dy) = (dy, −dx)
  const ox = (h * dy) / d;
  const oy = (-h * dx) / d;
  return [
    { x: mx + ox, y: my + oy },
    { x: mx - ox, y: my - oy },
  ];
}

export interface AreaResult {
  /** Área (m²), siempre positiva. */
  area: number;
  hectares: number;
  perimeter: number;
  /** Área con signo (Gauss): positiva = antihorario. */
  signedArea: number;
  clockwise: boolean;
}

/** Área (fórmula de Gauss) y perímetro de un polígono (cierre implícito). */
export function areaPerimeter(points: XY[]): AreaResult {
  const n = points.length;
  let s = 0;
  let per = 0;
  if (n >= 2) {
    // Referir a un origen local para no perder precisión con coordenadas UTM.
    const ox = points[0].x;
    const oy = points[0].y;
    for (let i = 0; i < n; i++) {
      const a = points[i];
      const b = points[(i + 1) % n];
      s += (a.x - ox) * (b.y - oy) - (b.x - ox) * (a.y - oy);
      if (n > 2 || i === 0) per += Math.hypot(b.x - a.x, b.y - a.y);
    }
  }
  const signed = n >= 3 ? s / 2 : 0;
  const area = Math.abs(signed);
  return { area, hectares: area / 10000, perimeter: per, signedArea: signed, clockwise: signed < 0 };
}
