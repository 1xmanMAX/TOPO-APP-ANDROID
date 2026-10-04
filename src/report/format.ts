/**
 * Utilidades de formato compartidas por los informes PDF y Excel.
 */
import type { LevelClosure, LevelMethod, LevelSource, Project } from '@/core/types';
import { stationFormat } from '@/core/cogo';

export interface ReportHeader {
  company?: string;
  engineer?: string;
  cip?: string;
  /** Decimales para cotas, lecturas y coordenadas (default 3). */
  decimals?: number;
  /** Logo (PNG/JPEG) como data URL. */
  logoDataUrl?: string;
}

export const DEFAULT_DECIMALS = 3;

export const decimalsOf = (h?: ReportHeader): number => {
  const d = h?.decimals;
  return typeof d === 'number' && Number.isFinite(d) && d >= 0 && d <= 6 ? Math.round(d) : DEFAULT_DECIMALS;
};

export const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Número fijo; '' si no es válido. Evita "-0.000". */
export function nf(v: number | undefined | null, dec = DEFAULT_DECIMALS): string {
  if (!isNum(v)) return '';
  const s = v.toFixed(dec);
  return /^-0\.?0*$/.test(s) ? s.slice(1) : s;
}

/** Con signo explícito (+/−). */
export function nfs(v: number | undefined | null, dec = DEFAULT_DECIMALS): string {
  const s = nf(v, dec);
  if (!s) return '';
  return s.startsWith('-') || /^0\.?0*$/.test(s) ? s : `+${s}`;
}

/** Redondeo numérico para Excel (sin ruido de coma flotante). */
export const round = (v: number, dec = 6): number => Math.round(v * 10 ** dec) / 10 ** dec;

export const station = (m: number): string => stationFormat(m, 2);

/** Etiqueta de desplazamiento: "Eje", "Izq 3.60", "Der 3.60". */
export function offsetLabel(off: number): string {
  if (Math.abs(off) < 1e-9) return 'Eje';
  return `${off < 0 ? 'Izq' : 'Der'} ${Math.abs(off).toFixed(2)}`;
}

/** Corte/relleno: "C 0.023" (cortar), "R 0.015" (rellenar), "OK". */
export function cutFillText(cf: number | undefined, dec = DEFAULT_DECIMALS): string {
  if (!isNum(cf)) return '';
  if (Math.abs(cf) < 0.5 * 10 ** -dec) return 'OK';
  return `${cf > 0 ? 'C' : 'R'} ${Math.abs(cf).toFixed(dec)}`;
}

export const METHOD_LABEL: Record<LevelMethod, string> = {
  HI: 'Altura de instrumento (AI)',
  RF: 'Ascensos y descensos',
};

export const CLOSURE_LABEL: Record<LevelClosure, string> = {
  loop: 'Circuito cerrado',
  'known-bm': 'Cierre a BM conocido',
  open: 'Abierta (sin cierre)',
};

export const SOURCE_LABEL: Record<LevelSource, string> = {
  manual: 'Registro manual',
  'leica-gsi': 'Importado Leica GSI',
  'trimble-dini': 'Importado Trimble DiNi',
  topcon: 'Importado Topcon',
  sokkia: 'Importado Sokkia',
  csv: 'Importado CSV',
};

/** Fecha local YYYY-MM-DD. */
export function isoDay(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** "2026-09-29" → "29/09/2026" (formato usual en Perú). */
export function dmy(iso: string | undefined): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

export function slug(s: string, max = 40): string {
  const out = s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
  return out || 'informe';
}

export function reportFileName(project: Project, kind: string, ext: 'pdf' | 'xlsx'): string {
  return `${slug(project.name)}_${slug(kind, 50)}_${isoDay()}.${ext}`;
}

/** Texto de CRS: "WGS84 / UTM 18S". */
export const crsText = (p: Project): string => `${p.crs.datum} / UTM ${p.crs.zone}${p.crs.hemisphere}`;

/* Caracteres que la fuente estándar Helvetica (WinAnsi) puede dibujar fuera de Latin-1. */
const WINANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
const REPLACE: Record<string, string> = {
  'Σ': 'S',
  '√': 'raíz',
  '→': '->',
  '←': '<-',
  '↔': '<->',
  'Δ': 'Dif.',
  '≤': '<=',
  '≥': '>=',
  '≈': '~',
  '−': '-',
  '∞': 'inf',
  '·': '·',
};

/** Adapta un texto a la codificación de la fuente estándar de jsPDF. */
export function pdfText(s: string | undefined | null): string {
  if (!s) return '';
  let out = '';
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 256 || WINANSI_EXTRA.has(ch)) out += ch;
    else if (REPLACE[ch] !== undefined) out += REPLACE[ch];
    else {
      const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
      out += base && (base.codePointAt(0) ?? 999) < 256 ? base : '?';
    }
  }
  return out;
}
