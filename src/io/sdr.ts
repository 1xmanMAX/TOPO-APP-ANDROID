/**
 * Sokkia SDR33: registros de coordenadas 08 (08KI ingresado, 08TP calculado…)
 * y estaciones 02. Campos de ancho fijo: ID(16) N(16) E(16) Z(16) desc,
 * con alternativa ID(4) N(10) E(10) Z(10) y separación por espacios.
 */
import type { ImportResult, SurveyPoint } from '@/core/types';
import { contentLines, makePoint, parseNum, stripZeros, warnDuplicates } from './common';

interface Rec {
  id: string;
  n: number;
  e: number;
  z: number;
  desc: string;
}

function tryWidths(body: string, idW: number, numW: number): Rec | null {
  const id = body.slice(0, idW).trim();
  const p = idW;
  const n = parseNum(body.slice(p, p + numW));
  const e = parseNum(body.slice(p + numW, p + 2 * numW));
  const z = parseNum(body.slice(p + 2 * numW, p + 3 * numW));
  if (!id || !Number.isFinite(n) || !Number.isFinite(e)) return null;
  return { id, n, e, z, desc: body.slice(p + 3 * numW).trim() };
}

function parseCoordRecord(body: string, extraNum = 0): Rec | null {
  const r = tryWidths(body, 16, 16) ?? tryWidths(body, 4, 10);
  if (r) {
    if (extraNum) {
      // 02: tras la cota viene la altura de instrumento; la descripción después.
      const rest = r.desc.split(/\s+/);
      r.desc = rest.slice(extraNum).join(' ');
    }
    return r;
  }
  const t = body.trim().split(/\s+/);
  if (t.length >= 3 && Number.isFinite(parseNum(t[1])) && Number.isFinite(parseNum(t[2]))) {
    return { id: t[0], n: parseNum(t[1]), e: parseNum(t[2]), z: parseNum(t[3]), desc: t.slice(4 + extraNum).join(' ') };
  }
  return null;
}

/** Importa coordenadas de un SDR33. Nunca lanza. */
export function parseSokkiaSdr(text: string): ImportResult {
  const warnings: string[] = [];
  const points: SurveyPoint[] = [];
  let obs = 0;
  let bad = 0;
  let stations = 0;
  for (const { line, n } of contentLines(text)) {
    const type = line.slice(0, 2);
    const body = line.slice(4);
    if (type === '08' || type === '02') {
      const r = parseCoordRecord(body, type === '02' ? 1 : 0);
      if (!r) {
        bad++;
        if (bad <= 5) warnings.push(`Línea ${n}: registro ${line.slice(0, 4)} sin coordenadas válidas`);
        continue;
      }
      const name = /^\d+$/.test(r.id) ? stripZeros(r.id) : r.id;
      const extra: Partial<SurveyPoint> = {};
      if (r.desc) extra.code = r.desc;
      if (type === '02') {
        stations++;
        extra.note = 'Estación';
      }
      points.push(makePoint(name, r.e, r.n, Number.isFinite(r.z) ? r.z : undefined, 'total-station', extra));
    } else if (type === '09' || type === '11') {
      obs++;
    }
  }
  if (stations) warnings.push(`${stations} estación(es) (registro 02) importada(s) como punto`);
  if (obs) warnings.push(`Se omitieron ${obs} observaciones polares (registros 09/11): sólo se importan coordenadas`);
  if (!points.length) warnings.push('No se encontraron registros de coordenadas (08) en el archivo SDR');
  warnDuplicates(points, warnings);
  return { format: 'sokkia-sdr', points, levelRuns: [], warnings };
}
