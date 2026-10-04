/**
 * Autodetección de formato por contenido (la extensión sólo desempata) y
 * despacho al importador correspondiente.
 */
import type { DataFormat, ImportResult } from '@/core/types';
import { contentLines, extOf } from './common';
import { parseCsvPoints, detectDelimiter, splitRow, type CsvOptions } from './csv';
import { isLevelingHeader, parseCsvLeveling } from './csvLeveling';
import { parseTrimbleDini } from './dini';
import { parseLeicaGsi } from './gsi';
import { parseNmea } from './nmea';
import { parseSokkiaSdr } from './sdr';
import { looksLikeGts7, parseTopconGts } from './topcon';

const ratio = (ls: string[], f: (l: string) => boolean) => (ls.length ? ls.filter(f).length / ls.length : 0);

export function detectFormat(text: string, filename?: string): DataFormat {
  const lines = contentLines(text)
    .slice(0, 200)
    .map((l) => l.line.trim());
  if (!lines.length) return 'unknown';
  const ext = extOf(filename);

  if (ratio(lines, (l) => /^For\s+(M5|R5|R4)\s*\|\s*Adr/i.test(l)) >= 0.5) return 'trimble-dini';

  const gsi = (l: string) => /^\*?\d{2}[0-9.]{4}[+-][0-9A-Za-z?.\-_]{4,}(\s|$)/.test(l);
  if (ratio(lines, gsi) >= 0.6 || (ext === 'gsi' && ratio(lines, gsi) >= 0.3)) {
    const star = ratio(lines.filter(gsi), (l) => l.startsWith('*'));
    return star > 0.5 ? 'leica-gsi16' : 'leica-gsi8';
  }

  if (ratio(lines, (l) => /^\$[A-Z]{2}[A-Z]{3},/.test(l)) >= 0.5) return 'nmea';

  const sdrRec = (l: string) => /^\d{2}[A-Z0-9]{2}/.test(l);
  if (/^00NM/.test(lines[0]) || (ext === 'sdr' && ratio(lines, sdrRec) >= 0.5)) return 'sokkia-sdr';

  if (looksLikeGts7(lines) || (ext === 'gt7' && lines.length)) return 'topcon-gts';

  // CSV: libreta o puntos.
  const delim = detectDelimiter(lines);
  for (const l of lines.slice(0, 10)) {
    if (isLevelingHeader(splitRow(l, delim))) return 'csv-leveling';
  }
  const rows = lines.map((l) => splitRow(l, delim));
  const numericRows = ratio(
    rows.map((r) => String(r.filter((c) => Number.isFinite(Number(c.replace(',', '.'))) && c !== '').length)),
    (n) => Number(n) >= 2,
  );
  if (numericRows >= 0.6) return 'csv-points';
  return 'unknown';
}

export interface ImportOptions {
  format?: DataFormat;
  csv?: CsvOptions;
  runName?: string;
}

/** Importa un texto detectando (o forzando) el formato. Nunca lanza. */
export function importText(text: string, filename?: string, opts: ImportOptions = {}): ImportResult {
  const format = opts.format ?? detectFormat(text, filename);
  let res: ImportResult;
  try {
    switch (format) {
      case 'leica-gsi8':
      case 'leica-gsi16':
        res = parseLeicaGsi(text, filename);
        break;
      case 'trimble-dini':
        res = parseTrimbleDini(text, filename);
        break;
      case 'sokkia-sdr':
        res = parseSokkiaSdr(text);
        break;
      case 'topcon-gts':
        res = parseTopconGts(text);
        break;
      case 'nmea':
        res = parseNmea(text);
        break;
      case 'csv-leveling':
        res = parseCsvLeveling(text, filename);
        break;
      case 'csv-points': {
        const c = parseCsvPoints(text, opts.csv);
        res = { format: 'csv-points', points: c.points, levelRuns: [], warnings: [...c.warnings, `Orden de columnas: ${c.order}`] };
        break;
      }
      default: {
        const c = parseCsvPoints(text, opts.csv);
        res = c.points.length
          ? { format: 'csv-points', points: c.points, levelRuns: [], warnings: [...c.warnings, `Orden de columnas: ${c.order}`] }
          : { format: 'unknown', points: [], levelRuns: [], warnings: ['Formato de archivo no reconocido'] };
      }
    }
  } catch (e) {
    // Red de seguridad: los importadores no deberían lanzar.
    res = { format, points: [], levelRuns: [], warnings: [`Error al leer el archivo: ${(e as Error).message}`] };
  }
  if (opts.runName) {
    const n = res.levelRuns.length;
    res.levelRuns.forEach((r, i) => (r.name = n > 1 ? `${opts.runName} (${i + 1})` : opts.runName!));
  }
  return res;
}
