/**
 * Exportadores de texto: CSV de puntos, CSV de libreta y GSI-16 de puntos.
 */
import type { LevelRun, LevelRunResult, SurveyPoint } from '@/core/types';
import { fx, isNum } from './common';

function csvCell(v: string, delimiter: string): string {
  return v.includes(delimiter) || v.includes('"') || /[\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Puntos a CSV sin encabezado (compatible con Civil 3D). */
export function exportPointsCsv(points: SurveyPoint[], order: 'PNEZD' | 'PENZD' = 'PNEZD', delimiter = ','): string {
  return points
    .map((p) => {
      const ne = order === 'PNEZD' ? [fx(p.y), fx(p.x)] : [fx(p.x), fx(p.y)];
      return [csvCell(p.name, delimiter), ...ne, fx(p.z), csvCell(p.code ?? '', delimiter)].join(delimiter);
    })
    .join('\r\n')
    .concat(points.length ? '\r\n' : '');
}

/**
 * Libreta de nivelación a CSV (una fila por punto; en los puntos de cambio
 * la VAd y la VA comparten fila). Reimportable con parseCsvLeveling.
 */
export function exportLevelRunCsv(run: LevelRun, result: LevelRunResult): string {
  const header = ['Punto', 'VA', 'VI', 'VAd', 'DistVA', 'DistVI', 'DistVAd', 'AI', 'Cota', 'Correccion', 'CotaCompensada', 'CotaProy', 'CorteRelleno', 'Nota'];
  const lines: string[] = [header.join(',')];
  const rows = result.rows;
  const f4 = (v: number | undefined) => fx(v, 4);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const cells: string[] = new Array(header.length).fill('');
    cells[0] = csvCell(r.pointName, ',');
    let bs = r.kind === 'BS' ? r : undefined;
    let note = r.note ?? '';
    if (r.kind === 'FS' && rows[i + 1]?.kind === 'BS' && rows[i + 1].pointName === r.pointName) {
      bs = rows[i + 1];
      if (bs.note) note = note ? `${note}; ${bs.note}` : bs.note;
      i++;
    }
    if (bs) {
      cells[1] = f4(bs.reading);
      cells[4] = fx(bs.distance, 2);
      cells[7] = f4(bs.hi);
    }
    if (r.kind === 'IS') {
      cells[2] = f4(r.reading);
      cells[5] = fx(r.distance, 2);
    }
    if (r.kind === 'FS') {
      cells[3] = f4(r.reading);
      cells[6] = fx(r.distance, 2);
    }
    cells[8] = f4(r.elevation);
    cells[9] = f4(r.correction);
    cells[10] = f4(r.adjustedElevation);
    cells[11] = f4(r.designElevation);
    cells[12] = f4(r.cutFill);
    cells[13] = csvCell(note, ',');
    lines.push(cells.join(','));
  }
  const c = result.checks;
  const cl = result.closure;
  lines.push('');
  lines.push(`Nivelación,${csvCell(run.name, ',')}`);
  lines.push(`Fecha,${run.date}`);
  lines.push(`BM inicio,${csvCell(run.startBM.name, ',')},${f4(run.startBM.elevation)}`);
  lines.push(`Suma VA,${f4(c.sumBS)}`);
  lines.push(`Suma VAd,${f4(c.sumFS)}`);
  lines.push(`Desnivel,${f4(c.sumBS - c.sumFS)}`);
  lines.push(`Comprobacion aritmetica,${c.arithmeticOk ? 'OK' : 'NO'}`);
  lines.push(`Distancia total (m),${fx(c.sumBackDist + c.sumForeDist, 2)}`);
  lines.push(`Estaciones,${cl.setups}`);
  if (isNum(cl.misclosureMm)) lines.push(`Error de cierre (mm),${fx(cl.misclosureMm, 1)}`);
  if (isNum(cl.toleranceMm)) lines.push(`Tolerancia (mm),${fx(cl.toleranceMm, 1)}`);
  if (cl.passes !== undefined) lines.push(`Cumple tolerancia,${cl.passes ? 'SI' : 'NO'}`);
  return lines.join('\r\n') + '\r\n';
}

/** Palabra GSI-16 numérica (unidad 0 = mm). */
function gsi16Num(wi: string, v: number): string {
  const mm = Math.round(v * 1000);
  return `${wi}..00${mm < 0 ? '-' : '+'}${String(Math.abs(mm)).padStart(16, '0').slice(-16)}`;
}

/** Texto GSI (sólo caracteres seguros), rellenado con ceros a la izquierda. */
const gsiText = (s: string) => s.replace(/[^A-Za-z0-9._-]/g, '_').slice(-16).padStart(16, '0');

/** Puntos a GSI-16 (11 PtID, 81 E, 82 N, 83 Z, 71 código) para cargar en una estación Leica. */
export function exportGsi16Points(points: SurveyPoint[]): string {
  return points
    .map((p, i) => {
      const words = [`*11${String((i + 1) % 10000).padStart(4, '0')}+${gsiText(p.name)}`, gsi16Num('81', p.x), gsi16Num('82', p.y)];
      if (isNum(p.z)) words.push(gsi16Num('83', p.z));
      if (p.code) words.push(`71....+${gsiText(p.code)}`);
      return words.join(' ') + ' ';
    })
    .join('\r\n')
    .concat(points.length ? '\r\n' : '');
}
