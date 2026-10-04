/**
 * Informe de control topográfico: resumen de todo el proyecto (PDF).
 */
import type { Project } from '@/core/types';
import { ORDER_LABEL, toleranceLengthKm } from '@/core/leveling';
import { C, ReportDoc, statusCell, type RGB } from './base';
import { TONE } from './layers';
import { bmTable } from './points';
import { layerReports, layerVerdict, projectKpis, runReport, STATUS_TEXT, VERDICT_TEXT } from '../data';
import { CLOSURE_LABEL, crsText, dmy, isNum, nf, nfs, type ReportHeader } from '../format';

/** K con el que se evaluó T (supuesto a 100 m por estación si no hay distancias). */
const kText = (lengthKm: number, setups: number): string => {
  const K = toleranceLengthKm(lengthKm, setups);
  return K.assumed ? `${nf(K.km, 3)} (sup.)` : nf(K.km, 3);
};

const pct = (v: number | undefined) => (isNum(v) ? `${nf(v, 0)} %` : '—');
const toneFor = (v: number | undefined): RGB => (!isNum(v) ? C.grey : v >= 99.95 ? C.ok : v >= 80 ? C.warn : C.fail);

export async function projectSummaryPdf(project: Project, h: ReportHeader): Promise<Blob> {
  const r = await ReportDoc.create('Informe de control topográfico', project, h);
  const k = projectKpis(project);
  const runs = project.levelRuns.map(runReport);
  const dates = runs.map((x) => x.run.date).filter(Boolean).sort();

  r.section('Generalidades');
  r.dataGrid(
    [
      ['Obra', project.name],
      ['Cliente', project.client],
      ['Ubicación', project.location],
      ['Sistema', crsText(project)],
      ['Responsable', h.engineer || project.surveyor],
      ['CIP', h.cip],
      ['Equipos', project.instrument],
      ['Periodo', dates.length ? `${dmy(dates[0])} al ${dmy(dates[dates.length - 1])}` : undefined],
    ],
    2,
  );

  r.kpis([
    { label: 'Libretas', value: String(k.nRuns), sub: `${k.nClosed} con control de cierre` },
    { label: 'Cierres en tolerancia', value: pct(k.pctRunsOk), sub: `${k.nPass} de ${k.nClosed}`, tone: toneFor(k.pctRunsOk) },
    { label: 'Puntos levantados', value: String(k.nPoints), sub: `${k.nBMs} BMs` },
    { label: 'Capas conformes', value: pct(k.pctLayersOk), sub: `${k.nLayersOk} de ${k.nLayersMeasured} capas medidas`, tone: toneFor(k.pctLayersOk) },
  ]);

  r.section('Nivelaciones: cierres', 'tolerancia T = e·raíz(K)');
  if (runs.length === 0) r.paragraph('No hay libretas de nivelación.', 8.5, C.muted);
  else
    r.table({
      head: [['Libreta', 'Fecha', 'Clase', 'Cierre', 'K (km)', 'Error (mm)', 'T (mm)', 'Estado']],
      body: runs.map((x) => [
        x.run.name,
        dmy(x.run.date),
        `${ORDER_LABEL[x.run.order].split(' (')[0]} · e=${nf(x.result.closure.k, 0)}`,
        CLOSURE_LABEL[x.run.closure],
        kText(x.result.closure.lengthKm, x.result.closure.setups),
        nfs(x.summary.misclosureMm, 1),
        nf(x.summary.toleranceMm, 1),
        VERDICT_TEXT[x.verdict],
      ]),
      fontSize: 7.6,
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 46 },
        1: { halign: 'center' },
        4: { halign: 'right' },
        5: { halign: 'right', fontStyle: 'bold' },
        6: { halign: 'right' },
        7: { cellWidth: 22 },
      },
      didParseCell: (c) => {
        if (c.section !== 'body' || c.column.index !== 7) return;
        const v = runs[c.row.index].verdict;
        statusCell(c, v === 'pass' ? C.ok : v === 'fail' ? C.fail : C.grey, v === 'pass' ? C.okSoft : v === 'fail' ? C.failSoft : C.greySoft);
      },
    });

  r.section('Control de obra por capas');
  const layerRows = project.layerControls.flatMap((c) => layerReports(c).map((lr) => ({ c, lr, v: layerVerdict(lr.summary) })));
  if (layerRows.length === 0) r.paragraph('No hay controles de capas.', 8.5, C.muted);
  else
    r.table({
      head: [['Control', 'Capa', 'T (±mm)', 'Medidos', '% conforme', 'Máx. + (mm)', 'Máx. − (mm)', 'Estado']],
      body: layerRows.map(({ c, lr, v }) => [
        c.name,
        lr.layer.name,
        nf(lr.layer.tolerance * 1000, 0),
        `${lr.summary.measured} / ${lr.summary.total}`,
        lr.summary.measured ? `${nf(lr.summary.pctOk, 1)} %` : '—',
        lr.summary.measured ? nfs(lr.summary.maxHigh * 1000, 1) : '',
        lr.summary.measured ? nfs(lr.summary.maxLow * 1000, 1) : '',
        STATUS_TEXT[v],
      ]),
      fontSize: 7.6,
      columnStyles: {
        0: { cellWidth: 40 },
        1: { fontStyle: 'bold' },
        2: { halign: 'right' },
        3: { halign: 'center' },
        4: { halign: 'right', fontStyle: 'bold' },
        5: { halign: 'right' },
        6: { halign: 'right' },
        7: { cellWidth: 24 },
      },
      didParseCell: (cell) => {
        if (cell.section === 'body' && cell.column.index === 7) statusCell(cell, ...TONE[layerRows[cell.row.index].v]);
      },
    });

  r.section('Puntos de control vertical (BMs)');
  bmTable(r, project);

  // Conclusiones automáticas.
  r.section('Conclusiones');
  const out: string[] = [];
  const failRuns = runs.filter((x) => x.verdict === 'fail');
  if (k.nClosed) {
    out.push(
      failRuns.length
        ? `${failRuns.length} de ${k.nClosed} nivelaciones exceden la tolerancia y deben repetirse: ${failRuns.map((x) => x.run.name).join('; ')}.`
        : `Las ${k.nClosed} nivelaciones con control de cierre cumplen la tolerancia especificada.`,
    );
  }
  const open = runs.filter((x) => x.verdict === 'open').length;
  if (open) out.push(`${open} nivelación(es) abierta(s) sin control de cierre: se recomienda cerrar a un BM conocido.`);
  for (const { c, lr, v } of layerRows) {
    if (v === 'fail' || v === 'warn')
      out.push(`${c.name} — ${lr.layer.name}: ${lr.summary.fail} punto(s) no conforme(s) y ${lr.summary.warn} al límite; corregir y volver a controlar antes de liberar la capa.`);
    else if (v === 'ok' && lr.summary.pending === 0) out.push(`${c.name} — ${lr.layer.name}: capa conforme en todos sus puntos; apta para liberación.`);
  }
  const pend = layerRows.filter(({ lr }) => lr.summary.measured > 0 && lr.summary.pending > 0);
  if (pend.length) out.push(`Capas con puntos pendientes de medición: ${pend.map(({ lr }) => lr.layer.name).join(', ')}.`);
  if (!out.length) out.push('Sin observaciones.');
  r.bullets(out);
  if (project.notes) r.paragraph(`Notas del proyecto: ${project.notes}`, 8, C.muted);

  r.signatures();
  return r.finish();
}
