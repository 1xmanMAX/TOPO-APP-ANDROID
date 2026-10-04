/**
 * Leica GSI-8 / GSI-16: puntos (81/82/83, estación 84/85/86) y nivelación
 * de niveles digitales DNA/LS/Sprinter (330–336, 32 distancia, 83 cota).
 * Ver docs/estudio/03-formatos-de-datos-equipos.md §1–2.
 */
import type { ImportResult, SurveyPoint } from '@/core/types';
import { FOOT_M, baseName, contentLines, isNum, makePoint, stripZeros, todayIso, warnDuplicates } from './common';
import { buildLevelRun, type LevelEvent } from './levelBuilder';

export interface GsiWord {
  wi: string;
  unit: string;
  sign: 1 | -1;
  data: string;
  /** Valor numérico en metros (longitudes) o en la unidad nativa; NaN si texto. */
  value: number;
  text: string;
}

const TEXT_WI = new Set(['11', '12', '13', '41', '42', '43', '44', '45', '46', '47', '48', '49', '71', '72', '73', '74', '75', '76', '77', '78', '79']);
const DIVISOR: Record<string, number> = { '0': 1e3, '1': 1e3, '2': 1e5, '3': 1e5, '5': 1e4, '6': 1e4, '7': 1e4, '8': 1e5 };
const FEET_UNITS = new Set(['1', '7']);
const LEVEL_WI = new Set(['330', '331', '332', '333', '334', '335', '336']);
const METHODS: Record<string, string> = { '1': 'BF', '2': 'BFFB', '3': 'aBF', '4': 'aBFFB', '10': 'Check & Adjust' };

/** Interpreta una palabra GSI (sin el espacio final). null si es inválida. */
export function parseGsiWord(tok: string): GsiWord | null {
  if (tok.length < 8) return null;
  const head = tok.slice(0, 6);
  const signCh = tok[6];
  if (!/^\d{2}/.test(head) || (signCh !== '+' && signCh !== '-')) return null;
  const two = head.slice(0, 2);
  const wi = two === '11' || two === '41' || !/\d/.test(head[2]) ? two : head.slice(0, 3);
  const unit = /\d/.test(head[5]) ? head[5] : '0';
  const data = tok.slice(7);
  const sign: 1 | -1 = signCh === '-' ? -1 : 1;
  let value = NaN;
  if (!TEXT_WI.has(wi) && /^\d+$/.test(data)) {
    if (unit === '4') {
      // DDDMMSSs → grados decimales.
      const n = parseInt(data, 10);
      value = sign * (Math.floor(n / 100000) + (Math.floor(n / 1000) % 100) / 60 + ((Math.floor(n / 10) % 100) + (n % 10) / 10) / 3600);
    } else {
      value = (sign * parseInt(data, 10)) / (DIVISOR[unit] ?? 1e3);
      if (FEET_UNITS.has(unit)) value *= FOOT_M;
    }
  }
  return { wi, unit, sign, data, value, text: stripZeros(data) };
}

interface GsiBlock {
  n: number;
  words: Map<string, GsiWord>;
  is16: boolean;
  /** Método de nivelación si es un bloque especial 41 '?'. */
  method?: string;
}

function parseBlocks(text: string, warnings: string[]): GsiBlock[] {
  const blocks: GsiBlock[] = [];
  let badWords = 0;
  let feet = false;
  for (const { line, n } of contentLines(text)) {
    let s = line.trim();
    const is16 = s.startsWith('*');
    if (is16) s = s.slice(1);
    // Bloque especial de método: 41nnnn+?......d
    const mm = /^41[0-9.]{4}\+\?\.*(\d{1,2})\b/.exec(s);
    if (mm) {
      blocks.push({ n, words: new Map(), is16, method: METHODS[String(Number(mm[1]))] ?? `método ${mm[1]}` });
      continue;
    }
    const words = new Map<string, GsiWord>();
    for (const tok of s.split(/\s+/)) {
      if (!tok) continue;
      const w = parseGsiWord(tok);
      if (!w) {
        badWords++;
        continue;
      }
      if (FEET_UNITS.has(w.unit) && !TEXT_WI.has(w.wi)) feet = true;
      if (!words.has(w.wi)) words.set(w.wi, w);
    }
    if (words.size) blocks.push({ n, words, is16 });
  }
  if (badWords) warnings.push(`Se ignoraron ${badWords} palabras GSI no válidas`);
  if (feet) warnings.push('Valores en pies convertidos a metros (pie internacional 0.3048 m)');
  return blocks;
}

const num = (b: GsiBlock, wi: string): number | undefined => {
  const v = b.words.get(wi)?.value;
  return isNum(v) ? v : undefined;
};

/** Importa un archivo GSI (8 o 16). Nunca lanza. */
export function parseLeicaGsi(text: string, filename?: string): ImportResult {
  const warnings: string[] = [];
  const blocks = parseBlocks(text, warnings);
  const n16 = blocks.filter((b) => b.is16).length;
  const format = n16 > blocks.length / 2 ? 'leica-gsi16' : 'leica-gsi8';
  const result: ImportResult = { format, points: [], levelRuns: [], warnings };
  if (!blocks.length) {
    warnings.push('El archivo no contiene bloques GSI válidos');
    return result;
  }

  // --- Puntos (coordenadas) ---
  const points: SurveyPoint[] = [];
  let stations = 0;
  for (const b of blocks) {
    const name = b.words.get('11')?.text || `B${b.n}`;
    const e = num(b, '81');
    const nn = num(b, '82');
    if (isNum(e) && isNum(nn)) {
      const code = b.words.get('71')?.text;
      points.push(makePoint(name, e, nn, num(b, '83'), 'total-station', code && code !== '0' ? { code } : {}));
      continue;
    }
    const se = num(b, '84');
    const sn = num(b, '85');
    if (isNum(se) && isNum(sn)) {
      stations++;
      points.push(makePoint(name, se, sn, num(b, '86'), 'total-station', { note: 'Estación' }));
    }
  }
  if (stations) warnings.push(`${stations} estación(es) de instrumento importada(s) como punto`);
  warnDuplicates(points, warnings);
  result.points = points;

  // --- Nivelación ---
  if (!blocks.some((b) => [...b.words.keys()].some((k) => LEVEL_WI.has(k)))) {
    if (!points.length) warnings.push('No se encontraron coordenadas (81/82) ni lecturas de nivelación (331/332)');
    return result;
  }
  // Segmenta por bloques de método (una línea de nivelación cada uno).
  const segments: { method?: string; blocks: GsiBlock[] }[] = [];
  let seg: { method?: string; blocks: GsiBlock[] } = { blocks: [] };
  for (const b of blocks) {
    if (b.method) {
      if (seg.blocks.length) segments.push(seg);
      seg = { method: b.method, blocks: [] };
    } else seg.blocks.push(b);
  }
  if (seg.blocks.length) segments.push(seg);

  const base = baseName(filename) || `Nivelación ${todayIso()}`;
  const runSegments = segments.filter((s) => s.blocks.some((b) => [...b.words.keys()].some((k) => LEVEL_WI.has(k))));
  runSegments.forEach((sg, idx) => {
    const events: LevelEvent[] = [];
    const inst = new Map<string, number>();
    let startElevation: number | undefined;
    let has335 = false;
    let started = false;
    let skipped330 = 0;
    let open = false; // hay lectura atrás en la estación en curso
    for (const b of sg.blocks) {
      const name = b.words.get('11')?.text || `B${b.n}`;
      const dist = num(b, '32');
      const reading = (['331', '335', '332', '336', '333', '334', '330'] as const).find((k) => b.words.has(k));
      const z = num(b, '83');
      if (!reading) {
        if (isNum(z)) {
          if (!started && startElevation === undefined) startElevation = z;
          else if (started) inst.set(name, z);
        }
        continue;
      }
      const r = num(b, reading);
      if (!isNum(r)) {
        warnings.push(`Bloque ${b.n}: lectura ${reading} no numérica`);
        continue;
      }
      started = true;
      if (reading === '335' || reading === '336') has335 = true;
      if (reading === '331' || reading === '335') {
        events.push({ kind: 'B', name, reading: r, distance: dist });
        open = true;
      } else if (reading === '332' || reading === '336') {
        events.push({ kind: 'F', name, reading: r, distance: dist });
      } else if (reading === '330' && !open) {
        skipped330++;
      } else {
        // 333 intermedia, 334 replanteo y 330 "sólo medir" dentro de una línea.
        events.push({ kind: 'I', name, reading: r, distance: dist });
      }
    }
    if (skipped330) warnings.push(`Se omitieron ${skipped330} lecturas "sólo medir" (330) fuera de una línea de nivelación`);
    const double = sg.method ? /FFB/.test(sg.method) : has335 ? true : undefined;
    const run = buildLevelRun(events, {
      double,
      startElevation,
      instrumentElevations: inst,
      name: runSegments.length > 1 ? `${base} (${idx + 1})` : base,
      source: 'leica-gsi',
      method: sg.method,
      warnings,
    });
    if (run) result.levelRuns.push(run);
  });
  return result;
}
