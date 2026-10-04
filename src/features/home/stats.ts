/** Indicadores derivados del proyecto para la pestaña Inicio. */
import type { ComplianceStatus, LayerControl, LevelRun, Project } from '@/core/types';
import { computeLevelRun, levelRunSummary, type LevelRunSummary } from '@/core/leveling';
import { checkLayer, layerSummary } from '@/core/pavement';

export interface RunStatus {
  run: LevelRun;
  summary: LevelRunSummary;
  status: ComplianceStatus;
  /** |error| / tolerancia (0..∞) o undefined si no hay control de cierre. */
  ratio?: number;
}

/** Semáforo del cierre: ok si |e| ≤ 0,8·T, warn si ≤ T, fail si > T. */
export function runStatus(run: LevelRun): RunStatus {
  let summary: LevelRunSummary;
  try {
    summary = levelRunSummary(run, computeLevelRun(run));
  } catch {
    summary = {
      nPoints: 0,
      nSetups: 0,
      lengthM: 0,
      distanceImbalanceM: 0,
      date: run.date,
      verdict: 'Datos incompletos',
    };
  }
  const e = summary.misclosureMm;
  const t = summary.toleranceMm;
  if (e === undefined || t === undefined || !(t > 0) || run.closure === 'open') {
    return { run, summary, status: 'pending' };
  }
  const ratio = Math.abs(e) / t;
  const status: ComplianceStatus = ratio <= 0.8 ? 'ok' : ratio <= 1 ? 'warn' : 'fail';
  return { run, summary, status, ratio };
}

/** Libretas ordenadas de la más reciente a la más antigua (por fecha; estable). */
export function sortedRuns(p: Project): LevelRun[] {
  return p.levelRuns
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (b.r.date || '').localeCompare(a.r.date || '') || a.i - b.i)
    .map((x) => x.r);
}

export interface ControlStatus {
  control: LayerControl;
  total: number;
  measured: number;
  ok: number;
  warn: number;
  fail: number;
  pctOk: number;
  status: ComplianceStatus;
}

/** Resumen de un control de capas (todas las capas con medidas). */
export function controlStatus(c: LayerControl): ControlStatus {
  let total = 0;
  let measured = 0;
  let ok = 0;
  let warn = 0;
  let fail = 0;
  for (const l of c.layers) {
    try {
      const s = layerSummary(checkLayer(c, l.id));
      if (s.measured === 0) continue;
      total += s.total;
      measured += s.measured;
      ok += s.ok;
      warn += s.warn;
      fail += s.fail;
    } catch {
      /* capa inválida: se ignora */
    }
  }
  const pctOk = measured ? (ok / measured) * 100 : 0;
  const status: ComplianceStatus = measured === 0 ? 'pending' : fail > 0 ? 'fail' : warn > 0 ? 'warn' : 'ok';
  return { control: c, total, measured, ok, warn, fail, pctOk, status };
}

/** Fecha ISO completa desde un día 'YYYY-MM-DD' (mediodía local). */
export function dayToIso(day: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) return new Date(day + 'T12:00:00').toISOString();
  return day;
}
