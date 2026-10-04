/**
 * Modelo digital de terreno por triangulación de Delaunay (TIN).
 */
import Delaunator from 'delaunator';

export interface TinPoint {
  x: number;
  y: number;
  z: number;
}

/** Índice espacial de rejilla uniforme: celda → triángulos que la tocan. */
interface TinGrid {
  x0: number;
  y0: number;
  cell: number;
  nx: number;
  ny: number;
  cells: number[][];
}

export interface Tin {
  points: TinPoint[];
  /** Triángulos como tríos de índices a `points`. */
  triangles: Uint32Array;
  bbox: { minX: number; minY: number; maxX: number; maxY: number; minZ: number; maxZ: number };
  /** Uso interno (búsqueda rápida). */
  grid?: TinGrid;
}

export function buildTin(points: TinPoint[]): Tin {
  const pts = points.map((p) => ({ x: p.x, y: p.y, z: p.z }));
  const bbox = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const p of pts) {
    bbox.minX = Math.min(bbox.minX, p.x); bbox.maxX = Math.max(bbox.maxX, p.x);
    bbox.minY = Math.min(bbox.minY, p.y); bbox.maxY = Math.max(bbox.maxY, p.y);
    bbox.minZ = Math.min(bbox.minZ, p.z); bbox.maxZ = Math.max(bbox.maxZ, p.z);
  }
  if (pts.length < 3) return { points: pts, triangles: new Uint32Array(0), bbox };
  // Coordenadas relativas para estabilidad numérica con valores UTM grandes.
  const coords = new Float64Array(pts.length * 2);
  pts.forEach((p, i) => {
    coords[2 * i] = p.x - bbox.minX;
    coords[2 * i + 1] = p.y - bbox.minY;
  });
  const d = new Delaunator(coords);
  const tin: Tin = { points: pts, triangles: d.triangles, bbox };
  tin.grid = buildGrid(tin);
  return tin;
}

function triBox(tin: Tin, t: number): [number, number, number, number] {
  const tr = tin.triangles;
  const a = tin.points[tr[3 * t]], b = tin.points[tr[3 * t + 1]], c = tin.points[tr[3 * t + 2]];
  return [Math.min(a.x, b.x, c.x), Math.min(a.y, b.y, c.y), Math.max(a.x, b.x, c.x), Math.max(a.y, b.y, c.y)];
}

function buildGrid(tin: Tin): TinGrid | undefined {
  const nt = tin.triangles.length / 3;
  if (nt === 0) return undefined;
  const { minX, minY, maxX, maxY } = tin.bbox;
  const w = Math.max(maxX - minX, 1e-9);
  const h = Math.max(maxY - minY, 1e-9);
  const cell = Math.max(Math.sqrt((w * h) / nt), Math.max(w, h) / 512);
  const nx = Math.max(1, Math.ceil(w / cell));
  const ny = Math.max(1, Math.ceil(h / cell));
  const cells: number[][] = Array.from({ length: nx * ny }, () => []);
  for (let t = 0; t < nt; t++) {
    const [x1, y1, x2, y2] = triBox(tin, t);
    const i1 = clampI(Math.floor((x1 - minX) / cell), nx), i2 = clampI(Math.floor((x2 - minX) / cell), nx);
    const j1 = clampI(Math.floor((y1 - minY) / cell), ny), j2 = clampI(Math.floor((y2 - minY) / cell), ny);
    for (let j = j1; j <= j2; j++) for (let i = i1; i <= i2; i++) cells[j * nx + i].push(t);
  }
  return { x0: minX, y0: minY, cell, nx, ny, cells };
}

const clampI = (v: number, n: number): number => Math.min(n - 1, Math.max(0, v));

/** Coordenadas baricéntricas de (x,y) en el triángulo t; null si está fuera. */
function bary(tin: Tin, t: number, x: number, y: number): [number, number, number] | null {
  const tr = tin.triangles;
  const a = tin.points[tr[3 * t]], b = tin.points[tr[3 * t + 1]], c = tin.points[tr[3 * t + 2]];
  const det = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
  if (det === 0) return null;
  const l1 = ((b.y - c.y) * (x - c.x) + (c.x - b.x) * (y - c.y)) / det;
  const l2 = ((c.y - a.y) * (x - c.x) + (a.x - c.x) * (y - c.y)) / det;
  const l3 = 1 - l1 - l2;
  const eps = -1e-9;
  return l1 >= eps && l2 >= eps && l3 >= eps ? [l1, l2, l3] : null;
}

/** Triángulo que contiene (x,y), o −1. */
export function findTriangle(tin: Tin, x: number, y: number): number {
  const g = tin.grid;
  if (!g) return -1;
  const i = Math.floor((x - g.x0) / g.cell);
  const j = Math.floor((y - g.y0) / g.cell);
  // Tolerancia en el borde de la rejilla.
  if (i < -1 || j < -1 || i > g.nx || j > g.ny) return -1;
  for (const t of g.cells[clampI(j, g.ny) * g.nx + clampI(i, g.nx)]) {
    if (bary(tin, t, x, y)) return t;
  }
  return -1;
}

/** Cota interpolada linealmente en el TIN; undefined fuera de la triangulación. */
export function elevationAt(tin: Tin, x: number, y: number): number | undefined {
  const t = findTriangle(tin, x, y);
  if (t < 0) return undefined;
  const w = bary(tin, t, x, y) as [number, number, number];
  const tr = tin.triangles;
  return w[0] * tin.points[tr[3 * t]].z + w[1] * tin.points[tr[3 * t + 1]].z + w[2] * tin.points[tr[3 * t + 2]].z;
}

/** Vértices del triángulo t. */
export function triangleAt(tin: Tin, t: number): [TinPoint, TinPoint, TinPoint] {
  const tr = tin.triangles;
  return [tin.points[tr[3 * t]], tin.points[tr[3 * t + 1]], tin.points[tr[3 * t + 2]]];
}

export function triangleCount(tin: Tin): number {
  return tin.triangles.length / 3;
}
