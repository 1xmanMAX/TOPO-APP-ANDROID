/**
 * CSV de libreta de nivelación: Punto, VA, VI, VAd, (Dist), (CotaProy)…
 * En una fila de punto de cambio van la VAd (cierra la estación) y la VA
 * (abre la siguiente). Encabezados tolerantes en español/inglés.
 */
import type { ImportResult, LevelObservation, LevelRun } from '@/core/types';
import { uid } from '@/core/id';
import { contentLines, isNum, normHeader, parseNum, todayIso } from './common';
import { detectDelimiter, splitRow } from './csv';

type Col = 'P' | 'BS' | 'IS' | 'FS' | 'DIST' | 'DBS' | 'DIS' | 'DFS' | 'DESIGN' | 'ELEV' | 'HS' | 'HM' | 'HI' | 'NOTE';

const SYN: Record<string, Col> = {};
const add = (k: Col, names: string[]) => names.forEach((n) => (SYN[n] = k));
add('P', ['punto', 'pto', 'pv', 'point', 'pointname', 'estacion', 'station', 'nombre', 'name', 'id', 'p', 'pt']);
add('BS', ['va', 'vatras', 'vistaatras', 'atras', 'bs', 'backsight', 'back', 'lecturaatras', 'latras', 'vmas', 'lectatras']);
add('IS', ['vi', 'vinterm', 'vintermedia', 'vistaintermedia', 'intermedia', 'is', 'intermediate', 'int', 'radiacion', 'lecturaintermedia', 'ss']);
add('FS', ['vad', 'vadelante', 'vade', 'vistaadelante', 'adelante', 'fs', 'foresight', 'fore', 'lecturaadelante', 'ladelante', 'vmenos', 'lectadelante']);
add('DIST', ['dist', 'distancia', 'd', 'distance', 'dh', 'hd']);
add('DBS', ['distva', 'distatras', 'dbs', 'da', 'distbs', 'distanciaatras']);
add('DIS', ['distvi', 'distintermedia', 'dis', 'distis', 'distanciaintermedia']);
add('DFS', ['distvad', 'distadelante', 'dfs', 'dad', 'distfs', 'distanciaadelante']);
add('DESIGN', ['cotaproy', 'cotaproyecto', 'cotadeproyecto', 'cotadiseno', 'proyecto', 'design', 'designelevation', 'rasante', 'cp', 'cotap']);
add('ELEV', ['cota', 'elevacion', 'elevation', 'z', 'cotaconocida', 'cotabm', 'elev']);
add('HS', ['hs', 'hilosuperior', 'upper', 'superior']);
add('HM', ['hm', 'hilomedio', 'middle']);
add('HI', ['hi', 'hiloinferior', 'lower', 'inferior']);
add('NOTE', ['observacion', 'observaciones', 'obs', 'nota', 'notas', 'note', 'notes', 'descripcion', 'description', 'comentario']);

function headerKey(raw: string): Col | undefined {
  const t = raw.trim().toLowerCase();
  if (t === 'v+') return 'BS';
  if (t === 'v-' || t === 'v−') return 'FS';
  return SYN[normHeader(raw)];
}

/** ¿El encabezado corresponde a una libreta de nivelación? */
export function isLevelingHeader(cells: string[]): boolean {
  const keys = new Set(cells.map(headerKey));
  return keys.has('P') && (keys.has('BS') || keys.has('FS')) && (keys.has('FS') || keys.has('IS'));
}

/** Importa una libreta CSV. Nunca lanza. */
export function parseCsvLeveling(text: string, filename?: string): ImportResult {
  const warnings: string[] = [];
  const result: ImportResult = { format: 'csv-leveling', points: [], levelRuns: [], warnings };
  const lines = contentLines(text).map((l) => l.line);
  if (!lines.length) {
    warnings.push('El archivo está vacío');
    return result;
  }
  const delim = detectDelimiter(lines);
  // Busca la fila de encabezado (las primeras 10 líneas pueden ser títulos).
  let hIdx = -1;
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    if (isLevelingHeader(splitRow(lines[i], delim))) {
      hIdx = i;
      break;
    }
  }
  const cols: Partial<Record<Col, number>> = {};
  if (hIdx < 0) {
    warnings.push('Encabezado de libreta no encontrado; se asumen columnas Punto, VA, VI, VAd, Dist, CotaProy');
    (['P', 'BS', 'IS', 'FS', 'DIST', 'DESIGN'] as Col[]).forEach((k, i) => (cols[k] = i));
  } else {
    splitRow(lines[hIdx], delim).forEach((c, i) => {
      const k = headerKey(c);
      if (k && cols[k] === undefined) cols[k] = i;
    });
    // "hi" sin "hs" es más probablemente altura instrumental: se ignora.
    if (cols.HI !== undefined && cols.HS === undefined) delete cols.HI;
  }

  const observations: LevelObservation[] = [];
  let startElevation: number | undefined;
  let distAmbiguous = 0;
  const get = (r: string[], k: Col) => (cols[k] !== undefined ? (r[cols[k]!] ?? '').trim() : '');
  const val = (r: string[], k: Col) => parseNum(get(r, k));

  for (let i = hIdx + 1; i < lines.length; i++) {
    const r = splitRow(lines[i], delim);
    // Filas de resumen (Σ, totales) o en blanco: fin de la libreta.
    const name = get(r, 'P');
    if (!name) continue;
    if (/^(Σ|suma|total|error|tolerancia|cierre|nivelaci|fecha|bm inicio|desnivel|comprobaci|distancia total|estaciones|cumple)/i.test(name)) break;
    const bs = val(r, 'BS');
    const is = val(r, 'IS');
    const fs = val(r, 'FS');
    const readings: LevelObservation[] = [];
    const mk = (kind: LevelObservation['kind'], reading: number, d: number): LevelObservation => {
      const o: LevelObservation = { id: uid('ob_'), kind, pointName: name, reading };
      if (isNum(d)) o.distance = d;
      return o;
    };
    if (isNum(fs)) readings.push(mk('FS', fs, val(r, 'DFS')));
    if (isNum(bs)) readings.push(mk('BS', bs, val(r, 'DBS')));
    if (isNum(is)) readings.push(mk('IS', is, val(r, 'DIS')));
    if (!readings.length) {
      warnings.push(`Fila ${i + 1} (${name}): sin lecturas, se omite`);
      continue;
    }
    // Distancia genérica: sólo si la fila tiene una única lectura.
    const d = val(r, 'DIST');
    if (isNum(d)) {
      if (readings.length === 1) readings[0].distance ??= d;
      else distAmbiguous++;
    }
    // Hilos estadimétricos: a la única lectura o a la que coincide con el hilo medio.
    const hs = val(r, 'HS');
    const hi = val(r, 'HI');
    if (isNum(hs) && isNum(hi)) {
      const hm = val(r, 'HM');
      const target =
        readings.length === 1 ? readings[0] : isNum(hm) ? readings.find((o) => Math.abs(o.reading - hm) < 0.0015) : undefined;
      if (target) {
        target.upper = hs;
        target.lower = hi;
      }
    }
    const design = val(r, 'DESIGN');
    if (isNum(design)) {
      const t = readings.find((o) => o.kind === 'IS') ?? readings.find((o) => o.kind === 'FS') ?? readings[0];
      t.designElevation = design;
    }
    const note = get(r, 'NOTE');
    if (note) readings[0].note = note;

    if (!observations.length) {
      // Cota inicial: columna Cota de la 1.ª fila o "cota 100.000" en la observación.
      const z = val(r, 'ELEV');
      if (isNum(z)) startElevation = z;
      else {
        const m = /cota\s*[:=]?\s*(-?\d+(?:[.,]\d+)?)/i.exec(note);
        if (m) startElevation = parseNum(m[1]);
      }
    }
    observations.push(...readings);
  }
  if (distAmbiguous) {
    warnings.push(`${distAmbiguous} filas con dos lecturas y una sola distancia: use columnas DistVA/DistVAd`);
  }
  if (!observations.length) {
    warnings.push('La libreta no contiene lecturas');
    return result;
  }
  if (observations[0].kind !== 'BS') warnings.push('La primera lectura no es una vista atrás (VA)');
  if (!isNum(startElevation)) {
    startElevation = 100;
    warnings.push('Cota inicial no encontrada; se asumió 100.000');
  }
  const first = observations[0];
  const lastFs = [...observations].reverse().find((o) => o.kind === 'FS');
  const base = filename ? filename.split(/[\\/]/).pop()!.replace(/\.[^.]+$/, '') : '';
  const run: LevelRun = {
    id: uid('lr_'),
    name: base || `Nivelación ${todayIso()}`,
    date: todayIso(),
    method: 'RF',
    closure: lastFs && lastFs.pointName === first.pointName ? 'loop' : 'open',
    order: 'third',
    startBM: { name: first.pointName, elevation: startElevation },
    observations,
    source: 'csv',
  };
  result.levelRuns.push(run);
  return result;
}
