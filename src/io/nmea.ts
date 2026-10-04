/**
 * NMEA 0183: cada GGA con posición válida → punto UTM (cota = altitud sobre el
 * geoide). GST (si existe con la misma hora) da la precisión horizontal.
 */
import type { ImportResult, SurveyPoint } from '@/core/types';
import { latLonToUtm } from '@/core/geo';
import { contentLines, makePoint } from './common';

const QUALITY: Record<string, string> = {
  '1': 'autónomo',
  '2': 'DGPS',
  '3': 'PPS',
  '4': 'RTK fijo',
  '5': 'RTK flotante',
  '6': 'estimado',
  '7': 'manual',
  '8': 'simulación',
};

/** Verifica el checksum XOR. true si no trae checksum. */
export function nmeaChecksumOk(line: string): boolean {
  const star = line.indexOf('*');
  if (star < 0) return true;
  let cs = 0;
  for (let i = 1; i < star; i++) cs ^= line.charCodeAt(i);
  return cs.toString(16).toUpperCase().padStart(2, '0') === line.slice(star + 1, star + 3).toUpperCase();
}

/** ddmm.mmmm + hemisferio → grados decimales con signo. */
export function nmeaToDeg(v: string, hemi: string): number {
  if (!v) return NaN;
  const dot = v.indexOf('.') >= 0 ? v.indexOf('.') : v.length;
  const deg = Number(v.slice(0, dot - 2));
  const min = Number(v.slice(dot - 2));
  if (!Number.isFinite(deg) || !Number.isFinite(min)) return NaN;
  return (deg + min / 60) * (hemi === 'S' || hemi === 'W' ? -1 : 1);
}

/** Importa épocas GGA. `zone` fuerza la zona UTM. Nunca lanza. */
export function parseNmea(text: string, zone?: number): ImportResult {
  const warnings: string[] = [];
  const points: SurveyPoint[] = [];
  let badCs = 0;
  let noFix = 0;
  let floatN = 0;
  // Precisión por hora UTC (GST).
  const sigma = new Map<string, number>();
  const ggas: { f: string[]; n: number }[] = [];
  for (const { line, n } of contentLines(text)) {
    const s = line.trim();
    const m = /^\$([A-Z]{2})([A-Z]{3}),/.exec(s);
    if (!m) continue;
    if (!nmeaChecksumOk(s)) {
      badCs++;
      continue;
    }
    const f = s.replace(/\*[0-9A-Fa-f]{2}\s*$/, '').split(',');
    if (m[2] === 'GST') {
      const sl = Number(f[6]);
      const so = Number(f[7]);
      if (f[1] && f[6] && f[7] && Number.isFinite(sl) && Number.isFinite(so)) sigma.set(f[1], Math.hypot(sl, so));
    } else if (m[2] === 'GGA') ggas.push({ f, n });
  }
  for (const { f, n } of ggas) {
    const q = f[6] ?? '0';
    const lat = nmeaToDeg(f[2], f[3]);
    const lon = nmeaToDeg(f[4], f[5]);
    if (q === '0' || q === '' || q === '7' || q === '8' || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      noFix++;
      continue;
    }
    if (q === '5') floatN++;
    let utm: ReturnType<typeof latLonToUtm>;
    try {
      utm = latLonToUtm(lat, lon, zone);
    } catch {
      warnings.push(`Línea ${n}: posición fuera del rango UTM`);
      continue;
    }
    const alt = f[9] !== '' ? Number(f[9]) : NaN;
    const time = f[1] ? `${f[1].slice(0, 2)}:${f[1].slice(2, 4)}:${f[1].slice(4, 6)}` : '';
    const parts = [`${QUALITY[q] ?? `calidad ${q}`}`];
    if (time) parts.push(`${time} UTC`);
    if (f[7]) parts.push(`${Number(f[7])} sat`);
    if (f[8]) parts.push(`HDOP ${f[8]}`);
    parts.push(`lat ${lat.toFixed(8)} lon ${lon.toFixed(8)}`);
    if (f[11]) parts.push(`N geoide ${f[11]}`);
    const extra: Partial<SurveyPoint> = { note: parts.join(', ') };
    const sg = sigma.get(f[1]);
    if (sg !== undefined) extra.precision = sg;
    points.push(makePoint(`G${points.length + 1}`, utm.E, utm.N, Number.isFinite(alt) ? alt : undefined, 'gnss', extra));
  }
  if (badCs) warnings.push(`Se descartaron ${badCs} sentencias con checksum incorrecto`);
  if (noFix) warnings.push(`Se omitieron ${noFix} épocas GGA sin solución válida`);
  if (floatN) warnings.push(`${floatN} punto(s) con solución RTK flotante (no fija)`);
  if (!points.length) warnings.push('No se encontraron sentencias GGA con posición');
  return { format: 'nmea', points, levelRuns: [], warnings };
}
