/**
 * Utilidades locales del módulo Puntos (sin efectos secundarios).
 */
import type { PointSource, Project, SurveyPoint } from '@/core/types';
import { areaPerimeter, type XY } from '@/core/cogo';
import type { PlanPoint } from '@/ui/charts/PlanView';

export const SOURCE_LABEL: Record<PointSource, string> = {
  manual: 'Manual',
  'total-station': 'Estación total',
  gnss: 'GNSS',
  'phone-gps': 'GPS teléfono',
  import: 'Importado',
  level: 'Nivelación',
  calc: 'Calculado',
};

/** Códigos que se sugieren siempre (además de los usados en el proyecto). */
export const DEFAULT_CODES = ['BM', 'EJE', 'BORDE', 'TN', 'EST', 'VER', 'BZ', 'POSTE'];

export const hasZ = (p: { z?: number }): p is { z: number } => typeof p.z === 'number' && Number.isFinite(p.z);

/** Conteo de códigos presentes (ordenado por frecuencia). */
export function codeCounts(points: SurveyPoint[]): Array<{ code: string; n: number }> {
  const m = new Map<string, number>();
  for (const p of points) {
    const c = (p.code ?? '').trim().toUpperCase() || '—';
    m.set(c, (m.get(c) ?? 0) + 1);
  }
  return [...m.entries()].map(([code, n]) => ({ code, n })).sort((a, b) => b.n - a.n || a.code.localeCompare(b.code));
}

/** Códigos frecuentes para los chips del editor. */
export function frequentCodes(points: SurveyPoint[], max = 8): string[] {
  const used = codeCounts(points)
    .map((c) => c.code)
    .filter((c) => c !== '—');
  const out: string[] = [];
  for (const c of [...used, ...DEFAULT_CODES]) if (!out.includes(c)) out.push(c);
  return out.slice(0, max);
}

/**
 * Siguiente nombre automático: toma el último punto con patrón
 * "prefijo + número" e incrementa (P-9 → P-10, 85 → 86).
 */
export function nextPointName(points: SurveyPoint[]): string {
  const names = new Set(points.map((p) => p.name));
  let prefix = '';
  let num = 0;
  let width = 0;
  for (let i = points.length - 1; i >= 0; i--) {
    const m = /^(.*?)(\d+)$/.exec(points[i].name);
    if (m && !/^BM/i.test(m[1])) {
      prefix = m[1];
      num = Number(m[2]);
      width = m[2].startsWith('0') ? m[2].length : 0;
      break;
    }
  }
  // Busca el mayor número con ese prefijo.
  for (const p of points) {
    const m = /^(.*?)(\d+)$/.exec(p.name);
    if (m && m[1] === prefix) num = Math.max(num, Number(m[2]));
  }
  let n = num + 1;
  const make = (k: number) => prefix + String(k).padStart(width, '0');
  while (names.has(make(n))) n++;
  return make(n);
}

/** Envolvente convexa (cadena monótona). */
export function convexHull(pts: XY[]): XY[] {
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const cross = (o: XY, a: XY, b: XY) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: XY[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: XY[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

export function hullArea(pts: XY[]): number {
  const h = convexHull(pts);
  if (h.length < 3) return 0;
  return areaPerimeter(h).area;
}

/** Intervalo automático de curvas según el rango de cotas. */
export function autoContourInterval(range: number): number {
  if (!(range > 0)) return 0.5;
  if (range <= 2) return 0.1;
  if (range <= 5) return 0.25;
  if (range <= 12) return 0.5;
  if (range <= 40) return 1;
  if (range <= 100) return 2;
  return 5;
}

export function zRange(points: Array<{ z?: number }>): { min: number; max: number; mean: number; n: number } | null {
  let min = Infinity;
  let max = -Infinity;
  let s = 0;
  let n = 0;
  for (const p of points) {
    if (!hasZ(p)) continue;
    min = Math.min(min, p.z);
    max = Math.max(max, p.z);
    s += p.z;
    n++;
  }
  return n ? { min, max, mean: s / n, n } : null;
}

/** CSV simple de puntos (Nombre,Este,Norte,Cota,Código,Fuente). */
export function pointsCsv(points: SurveyPoint[]): string {
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const rows = ['Nombre,Este,Norte,Cota,Codigo,Fuente,Nota'];
  for (const p of points) {
    rows.push(
      [
        esc(p.name),
        p.x.toFixed(3),
        p.y.toFixed(3),
        hasZ(p) ? p.z.toFixed(3) : '',
        esc(p.code ?? ''),
        p.source,
        esc(p.note ?? ''),
      ].join(','),
    );
  }
  return rows.join('\n') + '\n';
}

/** Puntos para PlanView a partir del proyecto. */
export function planPoints(points: SurveyPoint[]): PlanPoint[] {
  return points.map((p) => ({ id: p.id, name: p.name, x: p.x, y: p.y, z: p.z, code: p.code }));
}

/** BMs del proyecto con coordenadas que no estén ya como punto con el mismo nombre. */
export function planBenchmarks(project: Project): PlanPoint[] {
  const names = new Set(project.points.map((p) => p.name));
  return project.benchmarks
    .filter((b) => typeof b.x === 'number' && typeof b.y === 'number' && !names.has(b.name))
    .map((b) => ({ id: `bm:${b.id}`, name: b.name, x: b.x as number, y: b.y as number, z: b.elevation, code: 'BM' }));
}
