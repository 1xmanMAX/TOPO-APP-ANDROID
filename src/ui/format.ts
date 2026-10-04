/** Formateadores de presentación (punto decimal, estilo de libreta). */

export function f(n: number | undefined | null, dec = 3): string {
  if (n === undefined || n === null || !Number.isFinite(n)) return '—';
  return n.toFixed(dec);
}

/** Con signo explícito: +0.012 / −0.008. */
export function fs(n: number | undefined | null, dec = 3): string {
  if (n === undefined || n === null || !Number.isFinite(n)) return '—';
  const s = Math.abs(n).toFixed(dec);
  if (Number(s) === 0) return s;
  return (n > 0 ? '+' : '−') + s;
}

/** Milímetros con signo desde metros. */
export function mm(m: number | undefined | null, dec = 1): string {
  if (m === undefined || m === null || !Number.isFinite(m)) return '—';
  return `${fs(m * 1000, dec)} mm`;
}

export function thousands(n: number, dec = 3): string {
  if (!Number.isFinite(n)) return '—';
  const [i, d] = n.toFixed(dec).split('.');
  const neg = i.startsWith('-');
  const digits = neg ? i.slice(1) : i;
  const withSep = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${neg ? '−' : ''}${withSep}${d ? '.' + d : ''}`;
}

export function station(m: number, dec = 2): string {
  if (!Number.isFinite(m)) return '—';
  const sign = m < 0 ? '−' : '';
  const a = Math.abs(m);
  const km = Math.floor(a / 1000);
  const rest = a - km * 1000;
  return `${sign}${km}+${rest.toFixed(dec).padStart(dec ? 4 + dec : 3, '0')}`;
}

export function dateShort(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function relative(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = (Date.now() - d) / 1000;
  if (diff < 60) return 'hace un momento';
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  if (diff < 86400 * 7) return `hace ${Math.floor(diff / 86400)} d`;
  return dateShort(iso);
}

/** Fecha local de hoy (AAAA-MM-DD); toISOString() daría el día UTC (en Perú, el siguiente desde las 19:00). */
export const todayISO = (d = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Convierte texto de usuario a número aceptando coma decimal. */
export function parseNum(s: string | number | undefined | null): number | undefined {
  if (s === undefined || s === null) return undefined;
  if (typeof s === 'number') return Number.isFinite(s) ? s : undefined;
  const t = s.trim().replace(/\s/g, '').replace(',', '.');
  if (t === '' || t === '-' || t === '.') return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

export function slug(s: string): string {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase() || 'archivo'
  );
}
