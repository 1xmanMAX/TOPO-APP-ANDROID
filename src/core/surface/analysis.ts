/**
 * Análisis sobre TIN: curvas de nivel, volúmenes, perfiles y pendientes.
 */
import { elevationAt, triangleAt, triangleCount, type Tin } from './tin';

/* ----------------------------- Curvas de nivel ----------------------------- */

export interface ContourLevel {
  elevation: number;
  /** Curva maestra (índice múltiplo de `masterEvery`). */
  master: boolean;
  /** Polilíneas [x,y]; una cerrada repite el primer vértice al final. */
  lines: [number, number][][];
}

/**
 * Curvas de nivel cada `interval` m a partir de `base`. Los vértices con cota
 * exactamente igual al nivel se tratan como "por encima" para evitar
 * segmentos degenerados.
 */
export function contours(tin: Tin, interval: number, base = 0, masterEvery = 5): ContourLevel[] {
  if (interval <= 0) throw new Error('El intervalo debe ser positivo');
  const nt = triangleCount(tin);
  if (nt === 0) return [];
  const { minZ, maxZ } = tin.bbox;
  const k0 = Math.ceil((minZ - base) / interval - 1e-9);
  const k1 = Math.floor((maxZ - base) / interval + 1e-9);
  const out: ContourLevel[] = [];
  const tr = tin.triangles;
  for (let k = k0; k <= k1; k++) {
    const level = base + k * interval;
    // Segmentos: cada uno une dos aristas (clave "i-j").
    const segs: [string, string][] = [];
    const pos = new Map<string, [number, number]>();
    for (let t = 0; t < nt; t++) {
      const idx = [tr[3 * t], tr[3 * t + 1], tr[3 * t + 2]];
      const keys: string[] = [];
      for (let e = 0; e < 3; e++) {
        const i = idx[e], j = idx[(e + 1) % 3];
        const pi = tin.points[i], pj = tin.points[j];
        const ai = pi.z >= level, aj = pj.z >= level;
        if (ai === aj) continue;
        const key = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (!pos.has(key)) {
          const u = (level - pi.z) / (pj.z - pi.z);
          pos.set(key, [pi.x + u * (pj.x - pi.x), pi.y + u * (pj.y - pi.y)]);
        }
        keys.push(key);
      }
      if (keys.length === 2) segs.push([keys[0], keys[1]]);
    }
    const lines = segs.length ? joinSegments(segs, pos) : [];
    if (lines.length === 0) continue;
    out.push({ elevation: level, master: ((k % masterEvery) + masterEvery) % masterEvery === 0, lines });
  }
  return out;
}

function joinSegments(segs: [string, string][], pos: Map<string, [number, number]>): [number, number][][] {
  const byKey = new Map<string, number[]>();
  segs.forEach(([a, b], i) => {
    for (const k of [a, b]) {
      const l = byKey.get(k);
      if (l) l.push(i); else byKey.set(k, [i]);
    }
  });
  const used = new Uint8Array(segs.length);
  const next = (key: string): number => (byKey.get(key) ?? []).find((s) => !used[s]) ?? -1;
  const lines: [number, number][][] = [];
  for (let s0 = 0; s0 < segs.length; s0++) {
    if (used[s0]) continue;
    used[s0] = 1;
    const chain = [segs[s0][0], segs[s0][1]];
    // Hacia adelante
    for (let s = next(chain[chain.length - 1]); s >= 0; s = next(chain[chain.length - 1])) {
      used[s] = 1;
      const [a, b] = segs[s];
      chain.push(a === chain[chain.length - 1] ? b : a);
    }
    // Hacia atrás
    for (let s = next(chain[0]); s >= 0; s = next(chain[0])) {
      used[s] = 1;
      const [a, b] = segs[s];
      chain.unshift(a === chain[0] ? b : a);
    }
    const line = chain.map((k) => [...(pos.get(k) as [number, number])] as [number, number]);
    // Descarta líneas degeneradas (p. ej. un pico exactamente en la cota del nivel).
    let len = 0;
    for (let i = 1; i < line.length; i++) len += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
    if (len > 1e-9) lines.push(line);
  }
  return lines;
}

/* -------------------------------- Volúmenes -------------------------------- */

export interface VolumeResult {
  /** Volumen donde la superficie A está por encima de la referencia (m³). */
  cut: number;
  /** Volumen donde A está por debajo (m³). */
  fill: number;
  /** cut − fill. */
  net: number;
  /** Área en planta evaluada (m²). */
  area: number;
  method: 'prism' | 'grid';
}

type P3 = [number, number, number]; // x, y, h (h = z − referencia)

/** Integral de max(h,0) sobre un triángulo con h lineal (recorte exacto). */
function positivePart(tri: P3[]): { vol: number; area: number } {
  const poly: P3[] = [];
  for (let i = 0; i < 3; i++) {
    const p = tri[i], q = tri[(i + 1) % 3];
    if (p[2] >= 0) poly.push(p);
    if ((p[2] >= 0) !== (q[2] >= 0)) {
      const u = p[2] / (p[2] - q[2]);
      poly.push([p[0] + u * (q[0] - p[0]), p[1] + u * (q[1] - p[1]), 0]);
    }
  }
  let vol = 0;
  let area = 0;
  for (let i = 1; i + 1 < poly.length; i++) {
    const a = poly[0], b = poly[i], c = poly[i + 1];
    const ar = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
    area += ar;
    vol += (ar * (a[2] + b[2] + c[2])) / 3;
  }
  return { vol, area };
}

/**
 * Volumen entre la superficie `tinA` (p. ej. terreno) y una referencia: otro
 * TIN o un plano horizontal de cota `ref`. Contra un plano y sin `gridStep`
 * usa prismas triangulares exactos; en otro caso, malla de celdas cuadradas
 * evaluadas en su centro (solo donde ambas superficies existen).
 */
export function volumeBetween(tinA: Tin, ref: Tin | number, gridStep?: number): VolumeResult {
  if (typeof ref === 'number' && gridStep === undefined) {
    let cut = 0, fill = 0, area = 0;
    for (let t = 0; t < triangleCount(tinA); t++) {
      const v = triangleAt(tinA, t);
      const up = positivePart(v.map((p) => [p.x, p.y, p.z - ref] as P3));
      const dn = positivePart(v.map((p) => [p.x, p.y, ref - p.z] as P3));
      cut += up.vol;
      fill += dn.vol;
      area += Math.abs((v[1].x - v[0].x) * (v[2].y - v[0].y) - (v[2].x - v[0].x) * (v[1].y - v[0].y)) / 2;
    }
    return { cut, fill, net: cut - fill, area, method: 'prism' };
  }
  const b = tinA.bbox;
  const w = b.maxX - b.minX, h = b.maxY - b.minY;
  const step = gridStep ?? Math.max(w, h) / 200;
  if (!(step > 0)) return { cut: 0, fill: 0, net: 0, area: 0, method: 'grid' };
  const nx = Math.ceil(w / step - 1e-9), ny = Math.ceil(h / step - 1e-9);
  const cellA = step * step;
  let cut = 0, fill = 0, area = 0;
  for (let j = 0; j < ny; j++) {
    const y = b.minY + (j + 0.5) * step;
    for (let i = 0; i < nx; i++) {
      const x = b.minX + (i + 0.5) * step;
      const za = elevationAt(tinA, x, y);
      if (za === undefined) continue;
      const zb = typeof ref === 'number' ? ref : elevationAt(ref, x, y);
      if (zb === undefined) continue;
      const dz = za - zb;
      if (dz > 0) cut += dz * cellA; else fill -= dz * cellA;
      area += cellA;
    }
  }
  return { cut, fill, net: cut - fill, area, method: 'grid' };
}

export interface CrossSection {
  station: number;
  cutArea: number;
  fillArea: number;
}

export interface SectionVolumes {
  cut: number;
  fill: number;
  net: number;
  segments: { from: number; to: number; cut: number; fill: number }[];
}

const sortSections = (s: CrossSection[]): CrossSection[] => [...s].sort((a, b) => a.station - b.station);

/** Áreas extremas promediadas: V = (A1 + A2)/2 · L. */
export function volumeAverageEndArea(sections: CrossSection[]): SectionVolumes {
  const s = sortSections(sections);
  const segments: SectionVolumes['segments'] = [];
  for (let i = 0; i + 1 < s.length; i++) {
    const L = s[i + 1].station - s[i].station;
    segments.push({
      from: s[i].station,
      to: s[i + 1].station,
      cut: ((s[i].cutArea + s[i + 1].cutArea) / 2) * L,
      fill: ((s[i].fillArea + s[i + 1].fillArea) / 2) * L,
    });
  }
  return totals(segments);
}

/**
 * Prismoidal (Simpson) tomando las secciones de tres en tres: la central hace
 * de sección media. Admite separaciones desiguales (Simpson no uniforme). Si
 * sobra un tramo final se calcula por áreas extremas.
 */
export function volumePrismoidal(sections: CrossSection[]): SectionVolumes {
  const s = sortSections(sections);
  const segments: SectionVolumes['segments'] = [];
  const simpson = (a0: number, a1: number, a2: number, h0: number, h1: number): number =>
    ((h0 + h1) / 6) * ((2 - h1 / h0) * a0 + ((h0 + h1) ** 2 / (h0 * h1)) * a1 + (2 - h0 / h1) * a2);
  let i = 0;
  for (; i + 2 < s.length; i += 2) {
    const h0 = s[i + 1].station - s[i].station;
    const h1 = s[i + 2].station - s[i + 1].station;
    segments.push({
      from: s[i].station,
      to: s[i + 2].station,
      cut: simpson(s[i].cutArea, s[i + 1].cutArea, s[i + 2].cutArea, h0, h1),
      fill: simpson(s[i].fillArea, s[i + 1].fillArea, s[i + 2].fillArea, h0, h1),
    });
  }
  if (i + 1 < s.length) segments.push(...volumeAverageEndArea([s[i], s[i + 1]]).segments);
  return totals(segments);
}

function totals(segments: SectionVolumes['segments']): SectionVolumes {
  const cut = segments.reduce((a, v) => a + v.cut, 0);
  const fill = segments.reduce((a, v) => a + v.fill, 0);
  return { cut, fill, net: cut - fill, segments };
}

/* --------------------------------- Perfil ---------------------------------- */

export interface ProfilePoint {
  /** Distancia acumulada sobre la polilínea (m). */
  dist: number;
  x: number;
  y: number;
  /** undefined fuera del TIN. */
  z?: number;
}

/** Perfil longitudinal cada `step` m, incluyendo los vértices de la polilínea. */
export function profileAlong(tin: Tin, polyline: { x: number; y: number }[], step: number): ProfilePoint[] {
  if (step <= 0) throw new Error('El paso debe ser positivo');
  const out: ProfilePoint[] = [];
  const push = (dist: number, x: number, y: number): void => {
    const z = elevationAt(tin, x, y);
    out.push(z === undefined ? { dist, x, y } : { dist, x, y, z });
  };
  if (polyline.length === 0) return out;
  let acc = 0;
  let nextD = 0;
  for (let i = 0; i + 1 < polyline.length; i++) {
    const a = polyline[i], b = polyline[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (i === 0) { push(0, a.x, a.y); nextD = step; }
    while (nextD < acc + len - 1e-9) {
      const u = (nextD - acc) / len;
      push(nextD, a.x + u * (b.x - a.x), a.y + u * (b.y - a.y));
      nextD += step;
    }
    acc += len;
    push(acc, b.x, b.y);
    if (Math.abs(nextD - acc) < 1e-9) nextD += step;
  }
  if (polyline.length === 1) push(0, polyline[0].x, polyline[0].y);
  return out;
}

/* ------------------------------- Pendientes -------------------------------- */

export interface SlopeStats {
  /** Pendiente (%) de cada triángulo (NaN si es degenerado en planta). */
  slopes: number[];
  min: number;
  max: number;
  mean: number;
  /** Media ponderada por área en planta. */
  areaWeightedMean: number;
  /** Índices de triángulos con pendiente < umbral (zonas planas / encharcamiento). */
  flat: number[];
  threshold: number;
}

export function slopeStats(tin: Tin, flatThresholdPct = 0.5): SlopeStats {
  const slopes: number[] = [];
  const flat: number[] = [];
  let min = Infinity, max = -Infinity, sum = 0, cnt = 0, wsum = 0, asum = 0;
  for (let t = 0; t < triangleCount(tin); t++) {
    const [a, b, c] = triangleAt(tin, t);
    const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
    const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nz === 0) { slopes.push(NaN); continue; }
    const s = (Math.hypot(nx, ny) / Math.abs(nz)) * 100;
    slopes.push(s);
    const area = Math.abs(nz) / 2;
    min = Math.min(min, s); max = Math.max(max, s);
    sum += s; cnt++; wsum += s * area; asum += area;
    if (s < flatThresholdPct) flat.push(t);
  }
  return {
    slopes,
    min: cnt ? min : NaN,
    max: cnt ? max : NaN,
    mean: cnt ? sum / cnt : NaN,
    areaWeightedMean: asum ? wsum / asum : NaN,
    flat,
    threshold: flatThresholdPct,
  };
}
