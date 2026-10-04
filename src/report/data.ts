/**
 * Datos derivados para los informes (independientes del formato de salida).
 */
import type { ID, LayerCheck, LayerControl, LevelRow, LevelRun, LevelRunResult, PavementLayer, Project } from '@/core/types';
import { computeLevelRun, levelRunSummary, type LevelRunSummary } from '@/core/leveling';
import { checkLayer, layerSummary, type LayerSummary } from '@/core/pavement';
import { isNum } from './format';

/* ------------------------------ Nivelación ------------------------------ */

/** Fila de la libreta para mostrar: un punto de cambio (VAd + VA) ocupa una sola fila. */
export interface BookRow {
  point: string;
  bs?: number;
  hi?: number;
  is?: number;
  fs?: number;
  /** Distancia de la vista adelante/intermedia (o atrás si es la primera). */
  dist?: number;
  /** Distancia de la vista atrás en un punto de cambio. */
  distBack?: number;
  elevation?: number;
  correction?: number;
  adjusted?: number;
  design?: number;
  cutFill?: number;
  rise?: number;
  fall?: number;
  turning: boolean;
  /** BM de inicio o de llegada. */
  isBM: boolean;
  note?: string;
}

const finite = (v: number | undefined): number | undefined => (isNum(v) ? v : undefined);

export function bookRows(run: LevelRun, result: LevelRunResult): BookRow[] {
  const rows = result.rows;
  const bmNames = new Set([run.startBM?.name, run.endBM?.name].filter(Boolean) as string[]);
  const out: BookRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r: LevelRow = rows[i];
    const next = rows[i + 1];
    const base: BookRow = {
      point: r.pointName,
      elevation: finite(r.elevation),
      correction: finite(r.correction),
      adjusted: finite(r.adjustedElevation),
      design: finite(r.designElevation),
      cutFill: finite(r.cutFill),
      rise: finite(r.rise),
      fall: finite(r.fall),
      turning: false,
      isBM: bmNames.has(r.pointName),
      note: r.note,
    };
    if (r.kind === 'BS') {
      out.push({ ...base, bs: r.reading, hi: finite(r.hi), dist: finite(r.distance) });
    } else if (r.kind === 'IS') {
      out.push({ ...base, is: r.reading, dist: finite(r.distance) });
    } else if (next && next.kind === 'BS' && next.pointName === r.pointName) {
      // Punto de cambio: VAd de esta estación + VA de la siguiente.
      out.push({
        ...base,
        fs: r.reading,
        bs: next.reading,
        hi: finite(next.hi),
        dist: finite(r.distance),
        distBack: finite(next.distance),
        turning: true,
        note: [r.note, next.note].filter(Boolean).join(' · ') || undefined,
      });
      i++;
    } else {
      out.push({ ...base, fs: r.reading, dist: finite(r.distance) });
    }
  }
  return out;
}

export type Verdict = 'pass' | 'fail' | 'open';

export interface RunReport {
  run: LevelRun;
  result: LevelRunResult;
  summary: LevelRunSummary;
  verdict: Verdict;
}

export function runReport(run: LevelRun): RunReport {
  const result = computeLevelRun(run);
  const summary = levelRunSummary(run, result);
  const verdict: Verdict = summary.passes === undefined ? 'open' : summary.passes ? 'pass' : 'fail';
  return { run, result, summary, verdict };
}

export const VERDICT_TEXT: Record<Verdict, string> = { pass: 'CUMPLE', fail: 'NO CUMPLE', open: 'SIN CIERRE' };

export function findRun(project: Project, runId: ID): LevelRun {
  const run = project.levelRuns.find((r) => r.id === runId);
  if (!run) throw new Error(`Libreta no encontrada: ${runId}`);
  return run;
}

/* -------------------------------- Capas -------------------------------- */

export interface LayerReport {
  layer: PavementLayer;
  index: number;
  /** Profundidad desde la rasante (m). */
  depth: number;
  checks: LayerCheck[];
  summary: LayerSummary;
}

export function findControl(project: Project, controlId: ID): LayerControl {
  const c = project.layerControls.find((x) => x.id === controlId);
  if (!c) throw new Error(`Control de capas no encontrado: ${controlId}`);
  return c;
}

export function layerReports(control: LayerControl): LayerReport[] {
  let depth = 0;
  return control.layers.map((layer, index) => {
    const checks = checkLayer(control, layer.id);
    const r: LayerReport = { layer, index, depth, checks, summary: layerSummary(checks) };
    depth += layer.thickness;
    return r;
  });
}

export type LayerVerdict = 'ok' | 'warn' | 'fail' | 'pending';

/** Estado global de una capa: no conforme si algún punto falla; al límite si alguno excede la tolerancia. */
export function layerVerdict(s: LayerSummary): LayerVerdict {
  if (s.measured === 0) return 'pending';
  if (s.fail > 0) return 'fail';
  if (s.warn > 0) return 'warn';
  return 'ok';
}

export const STATUS_TEXT: Record<LayerVerdict, string> = {
  ok: 'CONFORME',
  warn: 'AL LÍMITE',
  fail: 'NO CONFORME',
  pending: 'PENDIENTE',
};

/* ------------------------------- Proyecto ------------------------------- */

export interface ProjectKpis {
  nRuns: number;
  /** Libretas con control de cierre. */
  nClosed: number;
  nPass: number;
  pctRunsOk: number | undefined;
  nPoints: number;
  nBMs: number;
  /** Capas con mediciones. */
  nLayersMeasured: number;
  nLayersOk: number;
  pctLayersOk: number | undefined;
  /** % de puntos de control conformes (todas las capas). */
  pctPointsOk: number | undefined;
}

export function projectKpis(project: Project): ProjectKpis {
  const runs = project.levelRuns.map(runReport);
  const closed = runs.filter((r) => r.verdict !== 'open');
  const pass = closed.filter((r) => r.verdict === 'pass').length;
  let nLayersMeasured = 0;
  let nLayersOk = 0;
  let measured = 0;
  let ok = 0;
  for (const c of project.layerControls) {
    for (const lr of layerReports(c)) {
      if (lr.summary.measured === 0) continue;
      nLayersMeasured++;
      if (layerVerdict(lr.summary) === 'ok') nLayersOk++;
      measured += lr.summary.measured;
      ok += lr.summary.ok;
    }
  }
  return {
    nRuns: runs.length,
    nClosed: closed.length,
    nPass: pass,
    pctRunsOk: closed.length ? (pass / closed.length) * 100 : undefined,
    nPoints: project.points.length,
    nBMs: project.benchmarks.length,
    nLayersMeasured,
    nLayersOk,
    pctLayersOk: nLayersMeasured ? (nLayersOk / nLayersMeasured) * 100 : undefined,
    pctPointsOk: measured ? (ok / measured) * 100 : undefined,
  };
}

/** Resumen de puntos por código. */
export function pointsByCode(project: Project): { code: string; count: number; zMin?: number; zMax?: number }[] {
  const map = new Map<string, number[]>();
  const counts = new Map<string, number>();
  for (const p of project.points) {
    const code = p.code?.trim() || '(sin código)';
    counts.set(code, (counts.get(code) ?? 0) + 1);
    const arr = map.get(code) ?? [];
    if (isNum(p.z)) arr.push(p.z);
    map.set(code, arr);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([code, count]) => {
      const zs = map.get(code) ?? [];
      return { code, count, zMin: zs.length ? Math.min(...zs) : undefined, zMax: zs.length ? Math.max(...zs) : undefined };
    });
}

/** Orden natural de nombres ("2" < "10"). */
export const naturalCompare = (a: string, b: string): number =>
  a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' });
