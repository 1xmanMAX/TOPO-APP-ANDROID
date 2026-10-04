/**
 * Utilidades compartidas por importadores y exportadores (funciones puras).
 */
import type { PointSource, SurveyPoint } from '@/core/types';
import { uid } from '@/core/id';

/** Pie internacional (m). */
export const FOOT_M = 0.3048;

/** Divide en líneas (CRLF, LF o CR), quita BOM y EOF de DOS (\x1A). */
export function splitLines(text: string): string[] {
  return String(text ?? '')
    .replace(/^﻿/, '')
    .replace(/\x1A/g, '')
    .split(/\r\n|\n|\r/);
}

/** Líneas no vacías y sin comentarios (#, //, ;;), con su número (1-based). */
export function contentLines(text: string): { line: string; n: number }[] {
  const out: { line: string; n: number }[] = [];
  splitLines(text).forEach((raw, i) => {
    const t = raw.trim();
    if (!t || t.startsWith('#') || t.startsWith('//')) return;
    out.push({ line: raw.replace(/\s+$/, ''), n: i + 1 });
  });
  return out;
}

/** Número tolerante: acepta coma decimal si no hay punto. NaN si no es número. */
export function parseNum(s: string | undefined | null): number {
  if (s === undefined || s === null) return NaN;
  let t = String(s).trim().replace(/^"|"$/g, '').trim();
  if (!t) return NaN;
  if (t.includes(',') && !t.includes('.')) t = t.replace(',', '.');
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) return NaN;
  return Number(t);
}

export const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export const nowIso = (): string => new Date().toISOString();
/** Fecha local (AAAA-MM-DD). No usa UTC: en Perú (UTC−5) desde las 19:00 daría el día siguiente. */
export function todayIso(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Nombre base de archivo sin extensión. */
export function baseName(filename?: string): string {
  if (!filename) return '';
  const b = filename.split(/[\\/]/).pop() ?? '';
  return b.replace(/\.[^.]+$/, '');
}

export function extOf(filename?: string): string {
  const m = /\.([^.\\/]+)$/.exec(filename ?? '');
  return m ? m[1].toLowerCase() : '';
}

/** Quita ceros a la izquierda de identificadores (GSI/SDR), dejando al menos un carácter. */
export function stripZeros(id: string): string {
  return id.trim().replace(/^0+(?=.)/, '');
}

export function makePoint(
  name: string,
  x: number,
  y: number,
  z: number | undefined,
  source: PointSource,
  extra: Partial<SurveyPoint> = {},
): SurveyPoint {
  const p: SurveyPoint = {
    id: uid('pt_'),
    name,
    x,
    y,
    source,
    createdAt: nowIso(),
    ...extra,
  };
  if (isNum(z)) p.z = z;
  return p;
}

/** Advierte (una vez por nombre) sobre puntos con nombre repetido. */
export function warnDuplicates(points: SurveyPoint[], warnings: string[]): void {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const p of points) {
    if (seen.has(p.name)) dup.add(p.name);
    seen.add(p.name);
  }
  if (dup.size) {
    const list = [...dup].slice(0, 10).join(', ');
    warnings.push(`Puntos con nombre repetido: ${list}${dup.size > 10 ? '…' : ''}`);
  }
}

/** Escapa texto para XML. */
export function xmlEscape(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Normaliza un encabezado: minúsculas, sin tildes ni símbolos. */
export function normHeader(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Formatea número fijo; cadena vacía si no es finito. */
export const fx = (v: number | undefined, d = 3): string => (isNum(v) ? v.toFixed(d) : '');
