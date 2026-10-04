// @vitest-environment node
import * as XLSX from 'xlsx';
import { createDemoProject } from '@/app/demo';
import {
  layerControlPdf,
  layerControlXlsx,
  levelRunPdf,
  levelRunXlsx,
  pointsPdf,
  pointsXlsx,
  projectSummaryPdf,
  projectXlsx,
  reportFileName,
  type ReportHeader,
} from '@/report';
import { pdfText } from '@/report/format';

const project = createDemoProject();
const h: ReportHeader = { company: 'Consorcio Vial Lima', engineer: 'Ing. Max Antony', cip: '123456', decimals: 3 };

async function expectPdf(blob: Blob) {
  expect(blob.size).toBeGreaterThan(2048);
  const head = new TextDecoder().decode(new Uint8Array(await blob.arrayBuffer()).slice(0, 5));
  expect(head).toBe('%PDF-');
}

async function readXlsx(blob: Blob) {
  expect(blob.size).toBeGreaterThan(2048);
  return XLSX.read(new Uint8Array(await blob.arrayBuffer()), { type: 'array' });
}

describe('PDF', () => {
  it('libreta de nivelación (todas las libretas del demo)', async () => {
    for (const run of project.levelRuns) await expectPdf(await levelRunPdf(project, run.id, h));
  });

  it('protocolo de capas: todas las capas medidas y una capa concreta', async () => {
    const c = project.layerControls[0];
    await expectPdf(await layerControlPdf(project, c.id, h));
    await expectPdf(await layerControlPdf(project, c.id, {}, c.layers[1].id));
  });

  it('cuadro de puntos y resumen de proyecto', async () => {
    await expectPdf(await pointsPdf(project, h));
    await expectPdf(await projectSummaryPdf(project, { decimals: 2 }));
  });

  it('proyecto vacío no falla', async () => {
    const empty = { ...project, points: [], benchmarks: [], levelRuns: [], layerControls: [] };
    await expectPdf(await pointsPdf(empty, {}));
    await expectPdf(await projectSummaryPdf(empty, {}));
  });

  it('ids inexistentes lanzan error', async () => {
    await expect(levelRunPdf(project, 'nope', h)).rejects.toThrow();
    expect(() => layerControlXlsx(project, 'nope')).toThrow();
  });
});

describe('Excel', () => {
  it('libreta: números como números', async () => {
    const wb = await readXlsx(levelRunXlsx(project, project.levelRuns[0].id));
    expect(wb.SheetNames).toEqual(['Libreta']);
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets.Libreta, { header: 1 });
    const hdr = rows.findIndex((r) => r[0] === 'Punto');
    expect(hdr).toBeGreaterThan(0);
    expect(rows[hdr + 1][0]).toBe('BM-1');
    expect(rows[hdr + 1][1]).toBe(1.425);
  });

  it('control de capas: hoja de paquete + una por capa', async () => {
    const c = project.layerControls[0];
    const wb = await readXlsx(layerControlXlsx(project, c.id));
    expect(wb.SheetNames).toEqual(['Capas', ...c.layers.map((l) => l.name)]);
  });

  it('puntos', async () => {
    const wb = await readXlsx(pointsXlsx(project));
    expect(wb.SheetNames).toEqual(['BMs', 'Puntos', 'Códigos']);
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets.Puntos, { range: 6 });
    expect(rows).toHaveLength(project.points.length);
    expect(typeof rows[0]['Este (m)']).toBe('number');
  });

  it('proyecto: Resumen, BMs, Puntos, una hoja por libreta y por control', async () => {
    const wb = await readXlsx(projectXlsx(project));
    expect(wb.SheetNames.slice(0, 3)).toEqual(['Resumen', 'BMs', 'Puntos']);
    expect(wb.SheetNames).toHaveLength(3 + project.levelRuns.length + project.layerControls.length);
    for (const n of wb.SheetNames) expect(n.length).toBeLessThanOrEqual(31);
  });
});

describe('utilidades', () => {
  it('reportFileName', () => {
    const f = reportFileName({ ...project, name: 'Av. Los Álamos' }, 'Libreta Circuito BM-1', 'pdf');
    expect(f).toMatch(/^av-los-alamos_libreta-circuito-bm-1_\d{4}-\d{2}-\d{2}\.pdf$/);
  });

  it('pdfText reemplaza caracteres fuera de WinAnsi', () => {
    expect(pdfText('ΣVA → √K — ±5 mm')).toBe('SVA -> raízK — ±5 mm');
  });
});
