/**
 * Libreta de nivelación geométrica (PDF).
 */
import type { CellHookData, RowInput } from 'jspdf-autotable';
import type { ID, Project } from '@/core/types';
import { ORDER_LABEL, profileFromRun } from '@/core/leveling';
import { C, CONTENT_W, PAGE, ReportDoc, type RGB } from './base';
import { drawProfile } from './charts';
import { bookRows, findRun, runReport, VERDICT_TEXT, type RunReport } from '../data';
import {
  CLOSURE_LABEL,
  METHOD_LABEL,
  SOURCE_LABEL,
  cutFillText,
  dmy,
  isNum,
  nf,
  nfs,
  type ReportHeader,
} from '../format';

/** Caja grande con el cierre y el veredicto. */
export function closureBox(r: ReportDoc, rep: RunReport): void {
  const { closure } = rep.result;
  const { doc } = r;
  const h = 34;
  r.ensure(h + 6);
  const y = r.y;
  const tone: RGB = rep.verdict === 'pass' ? C.ok : rep.verdict === 'fail' ? C.fail : C.grey;
  const soft: RGB = rep.verdict === 'pass' ? C.okSoft : rep.verdict === 'fail' ? C.failSoft : C.greySoft;
  r.color(tone, 'draw');
  doc.setLineWidth(0.6);
  r.color(C.white, 'fill');
  doc.roundedRect(PAGE.m, y, CONTENT_W, h, 2, 2, 'FD');

  // Veredicto (derecha).
  const vw = 54;
  const vx = PAGE.m + CONTENT_W - vw;
  r.color(soft, 'fill');
  doc.roundedRect(vx + 2, y + 2, vw - 4, h - 4, 1.5, 1.5, 'F');
  r.font(7.5, 'bold', tone);
  r.text('VEREDICTO DE CIERRE', vx + vw / 2, y + 9, { align: 'center' });
  r.font(rep.verdict === 'fail' ? 17 : 20, 'bold', tone);
  r.text(VERDICT_TEXT[rep.verdict], vx + vw / 2, y + 20, { align: 'center' });
  r.font(7, 'normal', C.ink);
  const ratio = closure.ratio;
  r.text(
    rep.verdict === 'open' ? 'Nivelación abierta' : isNum(ratio) ? `|error| = ${nf(ratio * 100, 0)} % de T` : '',
    vx + vw / 2,
    y + 27,
    { align: 'center', maxWidth: vw - 6 },
  );

  // Métricas (izquierda).
  const cells: [string, string, string][] = [
    ['ERROR DE CIERRE', isNum(closure.misclosureMm) ? nfs(closure.misclosureMm, 1) : '—', 'mm'],
    ['TOLERANCIA T', isNum(closure.toleranceMm) ? nf(closure.toleranceMm, 1) : '—', 'mm'],
    ['LONGITUD (K)', nf(closure.lengthKm, 3), 'km'],
    ['ESTACIONES', String(closure.setups), ''],
  ];
  const cw = (CONTENT_W - vw - 4) / cells.length;
  cells.forEach(([label, value, unit], i) => {
    const x = PAGE.m + 4 + i * cw;
    r.font(6.8, 'bold', C.muted);
    r.text(label, x, y + 9, { maxWidth: cw - 2 });
    r.font(i === 0 ? 20 : 16, 'bold', i === 0 ? tone : C.ink);
    r.text(value, x, y + 20);
    const vwid = doc.getTextWidth(value);
    r.font(8, 'normal', C.muted);
    r.text(unit, x + vwid + 1.2, y + 20);
  });
  r.font(7.5, 'normal', C.ink);
  const known = closure.knownEnd;
  const formula = isNum(closure.toleranceMm)
    ? `T = ${nf(closure.k, 0)} mm · raíz(${nf(closure.lengthKm, 3)} km) = ${nf(closure.toleranceMm, 1)} mm   ·   Cota calculada ${nf(closure.computedEnd, r.dec)} m` +
      (isNum(known) ? `   ·   Cota conocida ${nf(known, r.dec)} m` : '')
    : `Cota final calculada ${nf(closure.computedEnd, r.dec)} m (sin cota conocida de llegada)`;
  r.text(formula, PAGE.m + 4, y + 29, { maxWidth: CONTENT_W - vw - 6 });
  r.y = y + h + 6;
}

export async function levelRunPdf(project: Project, runId: ID, h: ReportHeader): Promise<Blob> {
  const run = findRun(project, runId);
  const rep = runReport(run);
  const r = await ReportDoc.create('Libreta de nivelación', project, h);
  const d = r.dec;
  const { result } = rep;

  r.section('Datos de la nivelación', run.name);
  r.dataGrid(
    [
      ['Fecha', dmy(run.date)],
      ['Instrumento', run.instrument || project.instrument],
      ['Operador', run.operator || project.surveyor],
      ['Clima', run.weather],
      ['Método', METHOD_LABEL[run.method]],
      ['Tipo de cierre', CLOSURE_LABEL[run.closure]],
      ['Clase / orden', `${ORDER_LABEL[run.order]} · e = ${nf(result.closure.k, 0)} mm`],
      ['Origen de datos', SOURCE_LABEL[run.source]],
      ['BM inicial', `${run.startBM.name}  (${nf(run.startBM.elevation, d)} m)`],
      [
        'BM final',
        run.closure === 'loop'
          ? `${run.startBM.name}  (${nf(run.startBM.elevation, d)} m)`
          : run.endBM
            ? `${run.endBM.name}  (${nf(run.endBM.elevation, d)} m)`
            : 'Sin BM de llegada',
      ],
    ],
    2,
  );

  // Libreta.
  r.section('Registro de campo y cálculo', `${result.closure.setups} estaciones · ${rep.summary.nPoints} puntos`);
  const rows = bookRows(run, result);
  const dist = (row: (typeof rows)[number]) =>
    row.turning && isNum(row.distBack) ? `${nf(row.dist, 1)} / ${nf(row.distBack, 1)}` : nf(row.dist, 2);
  const body: RowInput[] = rows.map((row) => [
    row.point,
    nf(row.bs, d),
    nf(row.hi, d),
    nf(row.is, d),
    nf(row.fs, d),
    dist(row),
    nf(row.elevation, d),
    isNum(row.correction) && Math.abs(row.correction) > 0 ? nfs(row.correction, d + 1) : nf(row.correction, d),
    nf(row.adjusted, d),
    nf(row.design, d),
    cutFillText(row.cutFill, d),
  ]);
  const num = { halign: 'right' as const };
  r.table({
    head: [['Pto', 'VA (+)', 'AI / HI', 'VI', 'VAd (−)', 'Dist. (m)', 'Cota', 'Corr.', 'Cota comp.', 'Cota proy.', 'C / R']],
    body,
    fontSize: 7.4,
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 20 },
      1: num, 2: num, 3: num, 4: num, 5: num, 6: num, 7: num,
      8: { halign: 'right', fontStyle: 'bold' },
      9: num,
      10: { halign: 'center' },
    },
    didParseCell: (c: CellHookData) => {
      if (c.section !== 'body') return;
      const row = rows[c.row.index];
      if (row.turning) {
        c.cell.styles.fillColor = C.accentSoft;
        if (c.column.index === 0) c.cell.styles.textColor = C.accent;
      }
      if (row.isBM && c.column.index === 0) c.cell.styles.textColor = C.accent;
      if (c.column.index === 10 && isNum(row.cutFill)) {
        c.cell.styles.textColor = row.cutFill > 0 ? C.fail : row.cutFill < 0 ? C.ok : C.ink;
        c.cell.styles.fontStyle = 'bold';
      }
    },
  });
  r.font(7, 'italic', C.muted);
  r.text(
    'Filas sombreadas: puntos de cambio (VAd de la estación y VA de la siguiente; distancia adelante / atrás). C = cortar, R = rellenar.',
    PAGE.m,
    r.y - 3,
    { maxWidth: CONTENT_W },
  );
  r.gap(2);

  // Comprobación aritmética.
  const ch = result.checks;
  const dH = result.closure.computedEnd - run.startBM.elevation;
  r.section('Comprobación aritmética');
  r.table({
    head: [['Concepto', 'Valor (m)', 'Concepto', 'Valor (m)']],
    body: [
      ['Suma vistas atrás  SVA', nf(ch.sumBS, d), 'Suma de subidas  SS', nf(ch.sumRise, d)],
      ['Suma vistas adelante  SVAd', nf(ch.sumFS, d), 'Suma de bajadas  SB', nf(ch.sumFall, d)],
      ['SVA − SVAd', nfs(ch.sumBS - ch.sumFS, d), 'SS − SB', nfs(ch.sumRise - ch.sumFall, d)],
      ['Cota final − cota inicial', nfs(dH, d), 'Diferencia (SVA − SVAd) − DH', nfs(ch.sumBS - ch.sumFS - dH, d + 1)],
      ['Distancia atrás total', nf(ch.sumBackDist, 2), 'Distancia adelante total', nf(ch.sumForeDist, 2)],
      ['Desbalance atrás − adelante', nfs(ch.distanceImbalance, 2), 'Comprobación', ch.arithmeticOk ? 'CORRECTA' : 'REVISAR'],
    ],
    fontSize: 8,
    columnStyles: { 0: { cellWidth: 52 }, 1: { halign: 'right' }, 2: { cellWidth: 52 }, 3: { halign: 'right' } },
    didParseCell: (c) => {
      if (c.section === 'body' && c.row.index === 5 && c.column.index === 3) {
        c.cell.styles.textColor = ch.arithmeticOk ? C.ok : C.fail;
        c.cell.styles.fontStyle = 'bold';
      }
    },
  });

  // Cierre.
  r.section('Cierre y tolerancia', undefined, 48);
  closureBox(r, rep);

  // Perfil.
  const prof = profileFromRun(result);
  if (prof.length > 1) {
    r.section('Perfil longitudinal', 'cota compensada vs. cota de proyecto', 86);
    const hasDist = result.rows.some((x) => x.kind !== 'IS' && isNum(x.distance) && (x.distance ?? 0) > 0);
    drawProfile(r, prof, hasDist);
  }

  // Incidencias.
  r.section('Incidencias y observaciones');
  const notes = [...result.issues];
  if (Math.abs(ch.distanceImbalance) > 10) notes.push(`Desbalance de distancias atrás/adelante de ${nf(ch.distanceImbalance, 1)} m: revisar el error de colimación.`);
  if (notes.length) r.bullets(notes, C.fail);
  else r.paragraph('Sin incidencias: estructura de la libreta y comprobación aritmética correctas.', 8.5, C.ok);
  if (run.notes) r.paragraph(`Notas: ${run.notes}`, 8.5, C.ink);
  r.gap(2);

  r.signatures();
  return r.finish();
}
