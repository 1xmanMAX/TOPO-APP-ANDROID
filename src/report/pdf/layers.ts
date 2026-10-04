/**
 * Protocolo de control de cotas por capas (PDF).
 */
import type { ID, Project } from '@/core/types';
import { C, CONTENT_W, PAGE, ReportDoc, statusCell, type RGB } from './base';
import { drawHistogram } from './charts';
import { findControl, layerReports, layerVerdict, STATUS_TEXT, type LayerReport, type LayerVerdict } from '../data';
import { isNum, nf, nfs, offsetLabel, station, type ReportHeader } from '../format';

export const TONE: Record<LayerVerdict, [RGB, RGB]> = {
  ok: [C.ok, C.okSoft],
  warn: [C.warn, C.warnSoft],
  fail: [C.fail, C.failSoft],
  pending: [C.grey, C.greySoft],
};

function layerSection(r: ReportDoc, lr: LayerReport, pointLabels: Map<string, string>): void {
  const d = r.dec;
  const tolMm = lr.layer.tolerance * 1000;
  r.section(`Capa: ${lr.layer.name}`, `Tolerancia ±${nf(tolMm, 0)} mm · espesor ${nf(lr.layer.thickness, 3)} m · ${lr.summary.measured}/${lr.summary.total} puntos medidos`, 50);
  const checks = lr.checks;
  r.table({
    head: [['Progresiva', 'Ubicación', 'Desplaz. (m)', 'Cota diseño', 'Cota medida', 'Dif. (mm)', 'Estado']],
    body: checks.map((c) => [
      station(c.station),
      pointLabels.get(c.pointId) || offsetLabel(c.offset),
      nfs(c.offset, 2),
      nf(c.design, d),
      nf(c.measured, d),
      isNum(c.deviation) ? nfs(c.deviation * 1000, 1) : '',
      STATUS_TEXT[c.status],
    ]),
    fontSize: 7.6,
    columnStyles: {
      0: { halign: 'center', fontStyle: 'bold' },
      1: { halign: 'center' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right', fontStyle: 'bold' },
      6: { halign: 'center', cellWidth: 28 },
    },
    didParseCell: (cell) => {
      if (cell.section !== 'body') return;
      const c = checks[cell.row.index];
      const [tone, soft] = TONE[c.status];
      if (cell.column.index === 6) statusCell(cell, tone, soft);
      if (cell.column.index === 5 && c.status !== 'pending') cell.cell.styles.textColor = tone;
    },
  });

  // Resumen estadístico (izquierda) + histograma (derecha).
  const s = lr.summary;
  const blockH = 66;
  r.ensure(blockH + 4);
  const y0 = r.y;
  const leftW = CONTENT_W * 0.5;
  const v = layerVerdict(s);
  r.table({
    startY: y0,
    head: [['Resumen estadístico', 'Valor']],
    body: [
      ['Puntos de control / medidos', `${s.total} / ${s.measured}`],
      ['Conformes', String(s.ok)],
      ['Al límite (hasta 1.5·T)', String(s.warn)],
      ['No conformes', String(s.fail)],
      ['Pendientes', String(s.pending)],
      ['Desviación máx. alta (+)', `${nfs(s.maxHigh * 1000, 1)} mm`],
      ['Desviación máx. baja (−)', `${nfs(s.maxLow * 1000, 1)} mm`],
      ['Media / desv. estándar', `${nfs(s.meanDev * 1000, 1)} / ${nf(s.stdDev * 1000, 1)} mm`],
      ['% conforme', s.measured ? `${nf(s.pctOk, 1)} %` : '—'],
      ['Estado de la capa', STATUS_TEXT[v]],
    ],
    fontSize: 7.6,
    tableWidth: leftW,
    margin: { left: PAGE.m, right: PAGE.w - PAGE.m - leftW },
    columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
    didParseCell: (cell) => {
      if (cell.section === 'body' && cell.row.index === 9 && cell.column.index === 1) statusCell(cell, ...TONE[v]);
    },
  });
  const endY = r.y;
  const devs = checks.filter((c) => isNum(c.deviation)).map((c) => (c.deviation as number) * 1000);
  drawHistogram(r, devs, tolMm, { x: PAGE.m + leftW + 6, y: y0 + 4, w: CONTENT_W - leftW - 6, h: blockH - 10 });
  r.y = Math.max(endY, y0 + blockH) + 2;
}

export async function layerControlPdf(project: Project, controlId: ID, h: ReportHeader, layerId?: ID): Promise<Blob> {
  const control = findControl(project, controlId);
  const reps = layerReports(control);
  const r = await ReportDoc.create('Protocolo de control de capas', project, h);
  const g = control.grade;
  const stations = control.points.map((p) => p.station);
  const tramo = stations.length ? `${station(Math.min(...stations))} a ${station(Math.max(...stations))}` : '—';
  const officialBM = project.benchmarks.find((b) => b.official) ?? project.benchmarks[0];

  r.section('Datos del control', control.name);
  r.dataGrid(
    [
      ['Tramo', tramo],
      ['Puntos de control', String(control.points.length)],
      ['Progresiva inicial', station(g.startStation)],
      ['Cota inicial rasante', `${nf(g.startElevation, r.dec)} m`],
      ['Pendiente long.', `${nfs(g.longSlope, 2)} %`],
      ['Bombeo', `${nf(g.crossSlope, 2)} % (${g.crossType === 'crown' ? 'dos aguas' : 'una caída'})`],
      ['BM de referencia', officialBM ? `${officialBM.name} (${nf(officialBM.elevation, r.dec)} m)` : undefined],
      ['Instrumento', project.instrument],
    ],
    2,
  );

  r.section('Paquete estructural', 'capas de arriba hacia abajo');
  r.table({
    head: [['N°', 'Capa', 'Espesor (m)', 'Prof. bajo rasante (m)', 'Tolerancia (±mm)', 'Medidos', '% conforme', 'Estado']],
    body: reps.map((lr, i) => [
      String(i + 1),
      lr.layer.name,
      nf(lr.layer.thickness, 3),
      nf(lr.depth, 3),
      nf(lr.layer.tolerance * 1000, 0),
      `${lr.summary.measured} / ${lr.summary.total}`,
      lr.summary.measured ? `${nf(lr.summary.pctOk, 1)} %` : '—',
      STATUS_TEXT[layerVerdict(lr.summary)],
    ]),
    fontSize: 8,
    columnStyles: {
      0: { halign: 'center', cellWidth: 9 },
      1: { fontStyle: 'bold' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'center' },
      6: { halign: 'right' },
      7: { cellWidth: 26 },
    },
    didParseCell: (cell) => {
      if (cell.section === 'body' && cell.column.index === 7) statusCell(cell, ...TONE[layerVerdict(reps[cell.row.index].summary)]);
    },
  });

  const labels = new Map(control.points.map((p) => [p.id, p.label ?? '']));
  const selected = layerId ? reps.filter((x) => x.layer.id === layerId) : reps.filter((x) => x.summary.measured > 0);
  if (layerId && selected.length === 0) throw new Error(`Capa no encontrada: ${layerId}`);
  if (selected.length === 0) r.paragraph('No hay capas con mediciones registradas.', 9, C.muted);
  selected.forEach((lr, i) => {
    if (i > 0) r.newPage();
    layerSection(r, lr, labels);
  });

  r.font(7.2, 'italic', C.muted);
  r.ensure(10);
  r.paragraph(
    'Criterio: Dif. = cota medida − cota de diseño (+ alto / cortar, − bajo / rellenar). CONFORME si |Dif.| <= T; AL LÍMITE si |Dif.| <= 1.5·T; NO CONFORME en otro caso. Tolerancias según especificaciones técnicas del proyecto (referencia MTC EG-2013).',
    7.2,
    C.muted,
  );
  r.signatures('Fecha de liberación de capa: ____ / ____ / ________');
  return r.finish();
}
