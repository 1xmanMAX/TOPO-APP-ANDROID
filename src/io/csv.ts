/**
 * CSV/TXT de puntos (PNEZD, PENZD, NEZ…) con detección de separador,
 * encabezado y orden de columnas. Ver docs/estudio/03 §5.
 */
import type { SurveyPoint } from '@/core/types';
import { contentLines, makePoint, normHeader, parseNum, warnDuplicates } from './common';

export type CsvOrder = 'PNEZD' | 'PENZD' | 'NEZ' | 'ENZ' | 'PNEZ' | 'PENZ' | 'PNE' | 'PEN';
export type CsvDelimiter = ',' | ';' | '\t' | ' ';

export interface CsvOptions {
  order?: CsvOrder;
  delimiter?: CsvDelimiter;
  hasHeader?: boolean;
}

/** Divide una fila respetando comillas dobles. ' ' = uno o más espacios. */
export function splitRow(line: string, delimiter: string): string[] {
  if (delimiter === ' ') return line.trim().split(/\s+/);
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"' && cur.trim() === '') {
      q = true;
      cur = '';
    } else if (ch === delimiter) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** Detecta el separador por consistencia del número de columnas. */
export function detectDelimiter(lines: string[]): CsvDelimiter {
  const sample = lines.slice(0, 50);
  let best: CsvDelimiter = ' ';
  let bestScore = 0;
  for (const d of ['\t', ';', ','] as const) {
    const counts = sample.map((l) => splitRow(l, d).length);
    const withSep = counts.filter((c) => c > 1);
    if (withSep.length < sample.length * 0.8) continue;
    const freq = new Map<number, number>();
    for (const c of withSep) freq.set(c, (freq.get(c) ?? 0) + 1);
    const modal = Math.max(...freq.values());
    const score = modal / sample.length;
    if (score > bestScore + 1e-9) {
      best = d;
      bestScore = score;
    }
  }
  return best;
}

const isNumCell = (s: string) => Number.isFinite(parseNum(s));

/** ¿La fila parece un encabezado? (≥ 50 % de celdas no numéricas y ninguna coordenada válida). */
export function looksLikeHeader(cells: string[]): boolean {
  const nonEmpty = cells.filter((c) => c !== '');
  if (!nonEmpty.length) return false;
  const nonNum = nonEmpty.filter((c) => !isNumCell(c)).length;
  return nonNum / nonEmpty.length >= 0.5;
}

const SYN: Record<string, 'P' | 'N' | 'E' | 'Z' | 'D'> = {};
const add = (k: 'P' | 'N' | 'E' | 'Z' | 'D', names: string[]) => names.forEach((n) => (SYN[n] = k));
add('P', ['p', 'pt', 'pto', 'punto', 'point', 'id', 'nombre', 'name', 'num', 'numero', 'no', 'nro', 'pointname', 'pointid', 'ptno', 'estacion']);
add('N', ['n', 'norte', 'north', 'northing', 'y', 'coordn', 'coordy', 'yn', 'nort']);
add('E', ['e', 'este', 'east', 'easting', 'x', 'coorde', 'coordx', 'xe', 'est']); // 'est' (abreviatura de Este)
add('Z', ['z', 'h', 'cota', 'elev', 'elevation', 'elevacion', 'altura', 'alt', 'height', 'cotaz', 'zh']);
add('D', ['d', 'desc', 'descripcion', 'description', 'code', 'codigo', 'cod', 'descriptor', 'observacion', 'obs', 'nota', 'note', 'remark']);

/** Mapea encabezados a columnas P/N/E/Z/D. */
function mapHeader(cells: string[]): Record<string, number> | null {
  const map: Record<string, number> = {};
  cells.forEach((c, i) => {
    const k = SYN[normHeader(c)];
    if (k && map[k] === undefined) map[k] = i;
  });
  return map.N !== undefined && map.E !== undefined ? map : null;
}

function inferOrder(rows: string[][], warnings: string[]): string {
  const ncol = Math.max(...rows.map((r) => r.length));
  const col = (i: number) => rows.map((r) => r[i] ?? '').filter((c) => c !== '');
  const allNum = (i: number) => col(i).length > 0 && col(i).every(isNumCell);
  const first = col(0);
  const firstInts = first.every((c) => /^[+-]?\d+$/.test(c));
  const hasP = !allNum(0) || (firstInts && new Set(first).size === first.length && ncol >= 3 && allNum(1) && allNum(2));
  let idx = hasP ? 1 : 0;
  let k = 0;
  while (idx + k < ncol && allNum(idx + k) && k < 3) k++;
  if (k < 2) return hasP ? 'PNEZD' : 'NEZ';
  const a = col(idx).map(parseNum);
  const b = col(idx + 1).map(parseNum);
  const inE = (v: number[]) => v.every((x) => x >= 100000 && x <= 900000);
  const inN = (v: number[]) => v.every((x) => x >= 1000000 && x <= 10000000);
  let ne: 'NE' | 'EN';
  if (inE(a) && inN(b)) ne = 'EN';
  else if (inN(a) && inE(b)) ne = 'NE';
  else {
    ne = 'NE';
    warnings.push('No se pudo determinar si el orden es Norte-Este o Este-Norte; se asumió Norte-Este (PNEZD). Verifique.');
  }
  let order = (hasP ? 'P' : '') + ne + (k >= 3 ? 'Z' : '');
  if (idx + k < ncol) order += 'D';
  return order;
}

/** Lee puntos de un CSV/TXT. Nunca lanza. */
export function parseCsvPoints(
  text: string,
  opts: CsvOptions = {},
): { points: SurveyPoint[]; warnings: string[]; order: string } {
  const warnings: string[] = [];
  const lines = contentLines(text).map((l) => l.line);
  if (!lines.length) {
    warnings.push('El archivo está vacío');
    return { points: [], warnings, order: opts.order ?? 'PNEZD' };
  }
  const delim = opts.delimiter ?? detectDelimiter(lines);
  let rows = lines.map((l) => splitRow(l, delim));
  let colMap: Record<string, number> | null = null;
  const header = opts.hasHeader ?? looksLikeHeader(rows[0]);
  if (header) {
    colMap = opts.order ? null : mapHeader(rows[0]);
    rows = rows.slice(1);
  }
  let order: string;
  if (colMap) {
    order = (['P', 'N', 'E', 'Z', 'D'] as const)
      .filter((k) => colMap![k] !== undefined)
      .sort((x, y) => colMap![x] - colMap![y])
      .join('');
  } else if (opts.order) {
    order = opts.order;
  } else {
    if (header) warnings.push('Encabezado no reconocido; se infiere el orden de columnas');
    order = rows.length ? inferOrder(rows, warnings) : 'PNEZD';
  }
  if (!colMap) {
    colMap = {};
    [...order].forEach((ch, i) => (colMap![ch] = i));
  }

  const points: SurveyPoint[] = [];
  let skipped = 0;
  rows.forEach((r, i) => {
    const N = parseNum(r[colMap!.N]);
    const E = parseNum(r[colMap!.E]);
    if (!Number.isFinite(N) || !Number.isFinite(E)) {
      skipped++;
      if (skipped <= 5) warnings.push(`Fila ${i + 1 + (header ? 1 : 0)}: coordenadas no válidas, se omite`);
      return;
    }
    const z = colMap!.Z !== undefined ? parseNum(r[colMap!.Z]) : NaN;
    const name = colMap!.P !== undefined && r[colMap!.P] ? r[colMap!.P] : String(points.length + 1);
    const code = colMap!.D !== undefined ? r.slice(colMap!.D).join(' ').trim() : '';
    points.push(makePoint(name, E, N, Number.isFinite(z) ? z : undefined, 'import', code ? { code } : {}));
  });
  if (skipped > 5) warnings.push(`… ${skipped} filas omitidas en total`);
  warnDuplicates(points, warnings);
  return { points, warnings, order };
}
