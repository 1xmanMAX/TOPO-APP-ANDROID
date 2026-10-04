/**
 * Trimble/Zeiss DiNi, formato M5 (también "For R5"/"For R4").
 * Línea: For M5|Adr nnnnn|KD1 <punto> <hora> <línea>|<T valor unidad>|…|…|
 * Tipos: Rb atrás, Rf adelante, Rz intermedia, R simple, HD distancia, Z cota
 * (alias alemanes Lr/Lv/Lz/L/E). Ver docs/estudio/03 §3.
 */
import type { ImportResult } from '@/core/types';
import { FOOT_M, baseName, contentLines, isNum, todayIso } from './common';
import { buildLevelRun, isDoubleMethod, type LevelEvent } from './levelBuilder';

const M5_LINE = /^\s*For\s+(M5|R5|R4)\s*\|\s*Adr\s*(\d+)\s*\|([^|]*)\|(.*)$/i;
const VALUE_BLOCK = /^\s*([A-Za-z][A-Za-z0-9]?)\s+(-?\d+(?:\.\d+)?)\s*([A-Za-z]*)\s*$/;
const TYPE_ALIAS: Record<string, string> = { Lr: 'Rb', Lv: 'Rf', Lz: 'Rz', L: 'R', E: 'HD', sL: 'sR' };
const TIME = /^\d{1,2}:\d{2}:\d{2,3}$/;

function toMeters(v: number, unit: string): number {
  const u = unit.toLowerCase();
  if (u === 'ft') return v * FOOT_M;
  if (u === 'mm') return v / 1000;
  if (u === 'cm') return v / 100;
  return v;
}

interface Segment {
  method?: string;
  events: LevelEvent[];
  startElevation?: number;
  inst: Map<string, number>;
  started: boolean;
}

/** Importa un archivo DiNi M5. Nunca lanza. */
export function parseTrimbleDini(text: string, filename?: string): ImportResult {
  const warnings: string[] = [];
  const result: ImportResult = { format: 'trimble-dini', points: [], levelRuns: [], warnings };
  const segments: Segment[] = [];
  const newSeg = (method?: string): Segment => ({ method, events: [], inst: new Map(), started: false });
  let seg = newSeg();
  let bad = 0;
  let feet = false;
  let unnamed = 0;

  for (const { line, n } of contentLines(text)) {
    const m = M5_LINE.exec(line);
    if (!m) {
      bad++;
      continue;
    }
    const info = m[3];
    const blockType = info.slice(0, 3).trim().toUpperCase();
    const rest = info.slice(3).trim();
    if (blockType === 'TO') {
      const sl = /Start-Line\s+(\S+)/i.exec(rest);
      if (sl) {
        if (seg.events.length) segments.push(seg);
        seg = newSeg(sl[1]);
      } else if (/Measurement repeated/i.test(rest)) {
        seg.events.push({ kind: 'undo' });
        warnings.push(`Línea ${n}: medición repetida; se conserva la última`);
      } else if (/Station repeated/i.test(rest)) {
        seg.events.push({ kind: 'reset' });
      }
      continue;
    }
    // KD1/KD2: identificación de punto.
    const tokens = rest.split(/\s+/).filter(Boolean);
    let name = tokens.length && !TIME.test(tokens[0]) ? tokens[0] : '';
    const values = new Map<string, number>();
    for (const blk of m[4].split('|')) {
      const v = VALUE_BLOCK.exec(blk);
      if (!v) continue;
      const type = TYPE_ALIAS[v[1]] ?? v[1];
      if (v[3].toLowerCase() === 'ft') feet = true;
      values.set(type, toMeters(Number(v[2]), v[3]));
    }
    const readingType = (['Rb', 'Rf', 'Rz', 'R'] as const).find((t) => values.has(t));
    const z = values.get('Z');
    if (!readingType) {
      if (isNum(z)) {
        if (!seg.started && seg.startElevation === undefined) {
          seg.startElevation = z;
        } else if (seg.started && !values.has('Sh') && !values.has('Db')) {
          if (name) seg.inst.set(name, z);
        }
      }
      continue;
    }
    if (!name) {
      unnamed++;
      name = `ADR${m[2]}`;
    }
    seg.started = true;
    const reading = values.get(readingType)!;
    const distance = values.get('HD');
    const kind = readingType === 'Rb' ? 'B' : readingType === 'Rf' ? 'F' : 'I';
    seg.events.push({ kind, name, reading, distance });
    if (kind === 'I' && isNum(z)) seg.inst.set(name, z);
  }
  if (seg.events.length) segments.push(seg);
  if (bad) warnings.push(`Se ignoraron ${bad} líneas que no tienen formato M5`);
  if (feet) warnings.push('Valores en pies convertidos a metros (pie internacional 0.3048 m)');
  if (unnamed) warnings.push(`${unnamed} lecturas sin número de punto: se nombraron por su dirección (ADR…)`);

  const base = baseName(filename) || `Nivelación ${todayIso()}`;
  segments.forEach((sg, i) => {
    const run = buildLevelRun(sg.events, {
      double: isDoubleMethod(sg.method),
      startElevation: sg.startElevation,
      instrumentElevations: sg.inst,
      name: segments.length > 1 ? `${base} (${i + 1})` : base,
      source: 'trimble-dini',
      method: sg.method,
      warnings,
    });
    if (run) result.levelRuns.push(run);
  });
  if (!result.levelRuns.length) warnings.push('No se encontraron lecturas de nivelación (Rb/Rf) en el archivo');
  return result;
}
