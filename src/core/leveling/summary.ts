import type { LevelRow, LevelRun, LevelRunResult } from '@/core/types';

export interface LevelRunSummary {
  /** Puntos distintos nivelados (por nombre). */
  nPoints: number;
  /** Número de estaciones (puestas). */
  nSetups: number;
  /** Longitud nivelada (m) = Σdist atrás + Σdist adelante. */
  lengthM: number;
  misclosureMm?: number;
  toleranceMm?: number;
  passes?: boolean;
  /** Desbalance atrás − adelante (m). */
  distanceImbalanceM: number;
  minElevation?: number;
  maxElevation?: number;
  date: string;
  /** Veredicto en español para mostrar. */
  verdict: string;
}

export function levelRunSummary(run: LevelRun, result: LevelRunResult): LevelRunSummary {
  const { closure, checks, rows } = result;
  const names = new Set(rows.map((r) => r.pointName));
  const elevs = rows
    .map((r) => (Number.isFinite(r.adjustedElevation) ? r.adjustedElevation : r.elevation))
    .filter((v) => Number.isFinite(v));
  const err = closure.misclosureMm;
  const tol = closure.toleranceMm;
  let verdict: string;
  if (rows.length === 0) verdict = 'Sin observaciones';
  else if (run.closure === 'open' || err === undefined || tol === undefined) {
    verdict = 'Nivelación abierta: sin control de cierre';
  } else if (closure.passes) {
    verdict = 'Cierre dentro de tolerancia';
  } else {
    verdict = `Repetir nivelación: error ${Math.abs(err).toFixed(1)} mm > tolerancia ${tol.toFixed(1)} mm`;
  }
  return {
    nPoints: names.size,
    nSetups: closure.setups,
    lengthM: checks.sumBackDist + checks.sumForeDist,
    misclosureMm: err,
    toleranceMm: tol,
    passes: closure.passes,
    distanceImbalanceM: checks.distanceImbalance,
    minElevation: elevs.length ? Math.min(...elevs) : undefined,
    maxElevation: elevs.length ? Math.max(...elevs) : undefined,
    date: run.date,
    verdict,
  };
}

export interface ProfilePoint {
  /** Distancia acumulada (m) o índice de punto si no hay distancias. */
  distAcum: number;
  elevation: number;
  adjusted: number;
  design?: number;
  name: string;
}

/**
 * Serie para graficar el perfil. Se omiten las BS sobre puntos de cambio
 * (duplican el FS anterior). Posiciones:
 *  - BS de la estación en x0; instrumento en x0 + dBS; FS en x0 + dBS + dFS.
 *  - IS con distancia: instrumento + dIS (acotada entre x0 y la posición del FS).
 *  - IS sin distancia: interpoladas uniformemente entre x0 y el FS.
 * Si ninguna BS/FS tiene distancia, distAcum = índice secuencial del punto.
 */
export function profileFromRun(result: LevelRunResult): ProfilePoint[] {
  const rows = result.rows;
  const hasDist = rows.some((r) => r.kind !== 'IS' && Number.isFinite(r.distance) && (r.distance ?? 0) > 0);
  const out: ProfilePoint[] = [];
  const push = (r: LevelRow, x: number) =>
    out.push({
      distAcum: x,
      elevation: r.elevation,
      adjusted: r.adjustedElevation,
      design: r.designElevation,
      name: r.pointName,
    });

  if (!hasDist) {
    rows.forEach((r, i) => {
      if (r.kind === 'BS' && i > 0 && rows[i - 1].kind === 'FS') return;
      push(r, out.length);
    });
    return out;
  }

  // Agrupa por estación.
  const stations = new Map<number, LevelRow[]>();
  for (const r of rows) {
    const arr = stations.get(r.setup) ?? [];
    arr.push(r);
    stations.set(r.setup, arr);
  }
  let x0 = 0;
  let first = true;
  for (const [, group] of [...stations.entries()].sort((a, b) => a[0] - b[0])) {
    const bs = group.find((r) => r.kind === 'BS');
    const fs = group.find((r) => r.kind === 'FS');
    const dBS = bs?.distance ?? 0;
    const inst = x0 + dBS;
    const xFS = inst + (fs?.distance ?? 0);
    if (bs && first) push(bs, x0);
    first = false;
    const iss = group.filter((r) => r.kind === 'IS');
    iss
      .map((r, j) => ({
        r,
        x: Number.isFinite(r.distance)
          ? Math.min(Math.max(inst + (r.distance ?? 0), x0), xFS)
          : x0 + ((xFS - x0) * (j + 1)) / (iss.length + 1),
      }))
      .sort((a, b) => a.x - b.x)
      .forEach(({ r, x }) => push(r, x));
    if (fs) push(fs, xFS);
    x0 = xFS;
  }
  return out;
}
