/**
 * Topcon GTS-7 / South NTS (CLAVE␣␣valores,…) y CSV de coordenadas de Topcon.
 * Registros de coordenadas soportados:
 *   PT/POS/CRD nombre,N,E,Z,código   (o PT nombre y luego NEZ/XYZ)
 *   NEZ N,E,Z                         (aplica al último punto/estación nombrado)
 *   XYZ X(E),Y(N),Z                   [VERIFICAR con archivo real el orden X/Y]
 *   STN nombre,alt.instr.,código      (estación; sus coordenadas en NEZ/XYZ)
 * Las observaciones polares (SD/HD/HV) no se reducen a coordenadas.
 */
import type { ImportResult, SurveyPoint } from '@/core/types';
import { contentLines, makePoint, parseNum, warnDuplicates } from './common';
import { parseCsvPoints } from './csv';

const KEYS = new Set(['JOB', 'INST', 'UNITS', 'STN', 'XYZ', 'NEZ', 'BKB', 'BS', 'FS', 'SS', 'SD', 'HD', 'HV', 'PT', 'POS', 'CRD', 'SCALE', 'ATMOS', 'NOTE', 'CODE']);
const KEY_LINE = /^([A-Z]{2,5})(?:\s+|,)(.*)$/;

/** ¿Las líneas tienen estructura CLAVE valores de GTS-7? */
export function looksLikeGts7(lines: string[]): boolean {
  const sample = lines.slice(0, 100);
  const hits = sample.filter((l) => {
    const m = /^([A-Z]{2,5})\s{2,}\S/.exec(l);
    return m && KEYS.has(m[1]);
  }).length;
  return sample.length > 0 && hits / sample.length >= 0.6;
}

/** Importa coordenadas de Topcon. Nunca lanza. */
export function parseTopconGts(text: string): ImportResult {
  const lines = contentLines(text).map((l) => l.line.trim());
  if (!looksLikeGts7(lines)) {
    // CSV de coordenadas de Topcon (Pt,N,E,Z,Código por defecto).
    const csv = parseCsvPoints(text);
    return { format: 'topcon-gts', points: csv.points, levelRuns: [], warnings: csv.warnings };
  }
  const warnings: string[] = [];
  const points: SurveyPoint[] = [];
  let current: { name: string; code?: string; station: boolean } | null = null;
  let polar = 0;
  let pending = false; // el nombre actual aún no tiene coordenadas
  const push = (name: string, e: number, n: number, z: number, code: string | undefined, station: boolean) => {
    const extra: Partial<SurveyPoint> = {};
    if (code) extra.code = code;
    if (station) extra.note = 'Estación';
    points.push(makePoint(name, e, n, Number.isFinite(z) ? z : undefined, 'total-station', extra));
  };
  for (const line of lines) {
    const m = KEY_LINE.exec(line);
    if (!m || !KEYS.has(m[1])) continue;
    const key = m[1];
    const v = m[2].split(',').map((s) => s.trim());
    switch (key) {
      case 'STN':
      case 'BS':
      case 'FS':
      case 'SS':
        current = { name: v[0], code: v[2] || undefined, station: key === 'STN' };
        pending = true;
        break;
      case 'PT':
      case 'POS':
      case 'CRD': {
        const n = parseNum(v[1]);
        const e = parseNum(v[2]);
        if (Number.isFinite(n) && Number.isFinite(e)) {
          push(v[0], e, n, parseNum(v[3]), v[4] || undefined, false);
          current = null;
          pending = false;
        } else {
          current = { name: v[0], code: v[1] || undefined, station: false };
          pending = true;
        }
        break;
      }
      case 'NEZ':
      case 'XYZ': {
        const a = parseNum(v[0]);
        const b = parseNum(v[1]);
        if (!current || !pending || !Number.isFinite(a) || !Number.isFinite(b)) break;
        const [e, n] = key === 'NEZ' ? [b, a] : [a, b];
        push(current.name, e, n, parseNum(v[2]), current.code || undefined, current.station);
        pending = false;
        break;
      }
      case 'SD':
      case 'HD':
      case 'HV':
        polar++;
        break;
    }
  }
  if (points.some((p) => p.note === 'Estación')) warnings.push('Estaciones importadas como punto');
  if (polar) warnings.push(`Se omitieron ${polar} observaciones polares (SD/HD/HV): sólo se importan coordenadas`);
  if (!points.length) warnings.push('No se encontraron coordenadas (PT/NEZ/XYZ) en el archivo Topcon');
  warnDuplicates(points, warnings);
  return { format: 'topcon-gts', points, levelRuns: [], warnings };
}
