/**
 * Reconstrucción de una nivelación (LevelRun) a partir de una secuencia de
 * lecturas de un nivel digital (GSI, DiNi). Agrupa lecturas en estaciones,
 * promedia dobles lecturas (BFFB) y compara con las cotas del equipo.
 */
import type { LevelObservation, LevelRun, LevelSource } from '@/core/types';
import { computeLevelRun } from '@/core/leveling';
import { uid } from '@/core/id';
import { isNum, todayIso } from './common';

export type LevelEvent =
  | { kind: 'B' | 'F' | 'I'; name: string; reading: number; distance?: number }
  /** Anula la última lectura ("Measurement repeated"). */
  | { kind: 'undo' }
  /** Reinicia la estación en curso ("Station repeated"). */
  | { kind: 'reset' };

export type ReadingEvent = Extract<LevelEvent, { kind: 'B' | 'F' | 'I' }>;

export interface BuildOptions {
  /** true = método de doble lectura (BFFB / aBFFB). undefined = autodetectar. */
  double?: boolean;
  startElevation?: number;
  /** Cotas registradas por el equipo (nombre → cota) para control. */
  instrumentElevations?: Map<string, number>;
  name: string;
  source: LevelSource;
  method?: string;
  warnings: string[];
}

interface Station {
  backs: ReadingEvent[];
  fores: ReadingEvent[];
  ints: ReadingEvent[];
}

/** Método textual → doble lectura. */
export function isDoubleMethod(method?: string): boolean | undefined {
  if (!method) return undefined;
  const m = method.toUpperCase();
  if (/BFFB|FBBF|BFBF|BBFF/.test(m)) return true;
  if (/BF|FB/.test(m)) return false;
  return undefined;
}

/**
 * Heurística: en BFFB las lecturas consecutivas del mismo tipo caen sobre el
 * mismo punto (F1/F2); en aBF (BF|FB) caen sobre puntos distintos.
 */
function guessDouble(events: ReadingEvent[]): boolean {
  let same = 0;
  let diff = 0;
  for (let i = 1; i < events.length; i++) {
    const a = events[i - 1];
    const b = events[i];
    if (a.kind === b.kind && a.kind !== 'I') {
      if (a.name === b.name) same++;
      else diff++;
    }
  }
  return same > 0 && same >= diff;
}

const mean = (xs: number[]): number => xs.reduce((s, v) => s + v, 0) / xs.length;

function meanDist(evs: ReadingEvent[]): number | undefined {
  const ds = evs.map((e) => e.distance).filter(isNum);
  return ds.length ? mean(ds) : undefined;
}

/** Agrupa las lecturas en estaciones según el número esperado de lecturas atrás/adelante. */
function groupStations(events: LevelEvent[], double: boolean, warnings: string[]): Station[] {
  const per = double ? 2 : 1;
  const stations: Station[] = [];
  let cur: Station = { backs: [], fores: [], ints: [] };
  let lastList: ReadingEvent[] | null = null;
  const flush = () => {
    if (cur.backs.length || cur.fores.length || cur.ints.length) stations.push(cur);
    cur = { backs: [], fores: [], ints: [] };
    lastList = null;
  };
  for (const ev of events) {
    if (ev.kind === 'undo') {
      if (lastList && lastList.length) lastList.pop();
      continue;
    }
    if (ev.kind === 'reset') {
      cur = { backs: [], fores: [], ints: [] };
      lastList = null;
      warnings.push('Estación repetida en el archivo: se descartaron sus lecturas anteriores');
      continue;
    }
    if (ev.kind === 'B') {
      if (cur.backs.length >= per) flush();
      cur.backs.push(ev);
      lastList = cur.backs;
    } else if (ev.kind === 'F') {
      if (cur.fores.length >= per) flush();
      cur.fores.push(ev);
      lastList = cur.fores;
    } else {
      cur.ints.push(ev);
      lastList = cur.ints;
    }
  }
  flush();
  return stations;
}

/** Construye el LevelRun. Devuelve null si no hay lecturas. */
export function buildLevelRun(events: LevelEvent[], opts: BuildOptions): LevelRun | null {
  const { warnings } = opts;
  const readings = events.filter((e): e is ReadingEvent => e.kind === 'B' || e.kind === 'F' || e.kind === 'I');
  if (!readings.some((e) => e.kind === 'B' || e.kind === 'F')) return null;

  const double = opts.double ?? guessDouble(readings);
  const stations = groupStations(events, double, warnings);
  const observations: LevelObservation[] = [];

  stations.forEach((st, i) => {
    const n = i + 1;
    if (!st.backs.length) {
      warnings.push(`Estación ${n}: sin lectura atrás; se omite`);
      return;
    }
    if (double && (st.backs.length < 2 || st.fores.length < 2) && st.fores.length > 0) {
      warnings.push(`Estación ${n}: doble lectura incompleta (${st.backs.length} atrás, ${st.fores.length} adelante)`);
    }
    const bName = st.backs[0].name;
    if (st.backs.some((b) => b.name !== bName)) {
      warnings.push(`Estación ${n}: las lecturas atrás no son sobre el mismo punto (${st.backs.map((b) => b.name).join(', ')})`);
    }
    observations.push({
      id: uid('ob_'),
      kind: 'BS',
      pointName: bName,
      reading: mean(st.backs.map((b) => b.reading)),
      distance: meanDist(st.backs),
    });
    // Intermedias de la estación (aunque se midan tras la adelante, usan su HI).
    for (const it of st.ints) {
      observations.push({ id: uid('ob_'), kind: 'IS', pointName: it.name, reading: it.reading, distance: it.distance });
    }
    if (st.fores.length) {
      const fName = st.fores[0].name;
      if (st.fores.some((f) => f.name !== fName)) {
        warnings.push(`Estación ${n}: las lecturas adelante no son sobre el mismo punto (${st.fores.map((f) => f.name).join(', ')})`);
      }
      observations.push({
        id: uid('ob_'),
        kind: 'FS',
        pointName: fName,
        reading: mean(st.fores.map((f) => f.reading)),
        distance: meanDist(st.fores),
      });
    } else {
      warnings.push(`Estación ${n}: sin lectura adelante`);
    }
  });

  if (!observations.length) return null;
  // Limpia distancias indefinidas para no ensuciar el modelo.
  for (const o of observations) if (o.distance === undefined) delete o.distance;

  const first = observations[0];
  let startElevation = opts.startElevation;
  if (!isNum(startElevation)) {
    startElevation = 100;
    warnings.push('Cota inicial no encontrada; se asumió 100.000');
  }
  const lastFs = [...observations].reverse().find((o) => o.kind === 'FS');
  const run: LevelRun = {
    id: uid('lr_'),
    name: opts.name,
    date: todayIso(),
    method: 'RF',
    closure: lastFs && lastFs.pointName === first.pointName ? 'loop' : 'open',
    order: 'third',
    startBM: { name: first.pointName, elevation: startElevation },
    observations,
    source: opts.source,
  };
  if (opts.method) run.notes = `Método: ${opts.method}${double ? ' (doble lectura promediada)' : ''}`;
  else if (double) run.notes = 'Doble lectura promediada';

  // Control contra las cotas que calculó el equipo.
  const inst = opts.instrumentElevations;
  if (inst && inst.size) {
    const res = computeLevelRun(run);
    const lastByName = new Map<string, number>();
    for (const r of res.rows) if (r.kind !== 'BS') lastByName.set(r.pointName, r.elevation);
    let bad = 0;
    for (const [name, z] of inst) {
      const c = lastByName.get(name);
      if (isNum(c) && Math.abs(c - z) > 0.0002) {
        bad++;
        if (bad <= 5) {
          warnings.push(`Cota de ${name}: equipo ${z.toFixed(5)} m, recalculada ${c.toFixed(5)} m`);
        }
      }
    }
    if (bad > 5) warnings.push(`… y ${bad - 5} diferencias más entre cotas del equipo y recalculadas`);
  }
  return run;
}
