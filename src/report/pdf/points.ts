/**
 * Cuadro de BMs y cuadro de puntos (PDF).
 */
import type { Project } from '@/core/types';
import { C, ReportDoc } from './base';
import { pointsByCode } from '../data';
import { crsText, nf, type ReportHeader } from '../format';

const SOURCE: Record<string, string> = {
  manual: 'Manual',
  'total-station': 'Estación total',
  gnss: 'GNSS',
  'phone-gps': 'GPS móvil',
  import: 'Importado',
  level: 'Nivelación',
  calc: 'Cálculo',
};

/** Tabla de BMs (reutilizada por el resumen de proyecto). */
export function bmTable(r: ReportDoc, project: Project): void {
  const d = r.dec;
  if (project.benchmarks.length === 0) {
    r.paragraph('No hay BMs registrados.', 8.5, C.muted);
    return;
  }
  r.table({
    head: [['BM', 'Este (m)', 'Norte (m)', 'Cota (m)', 'Tipo', 'Descripción']],
    body: project.benchmarks.map((b) => [b.name, nf(b.x, d), nf(b.y, d), nf(b.elevation, d), b.official ? 'Oficial' : 'Auxiliar', b.description ?? '']),
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 18 },
      1: { halign: 'right', cellWidth: 26 },
      2: { halign: 'right', cellWidth: 28 },
      3: { halign: 'right', fontStyle: 'bold', cellWidth: 22 },
      4: { halign: 'center', cellWidth: 18 },
    },
  });
}

export async function pointsPdf(project: Project, h: ReportHeader): Promise<Blob> {
  const r = await ReportDoc.create('Cuadro de BMs y puntos', project, h);
  const d = r.dec;
  const withZ = project.points.filter((p) => typeof p.z === 'number');
  r.section('Sistema de referencia');
  r.dataGrid(
    [
      ['Sistema', crsText(project)],
      ['Proyección', `UTM zona ${project.crs.zone} ${project.crs.hemisphere === 'S' ? 'Sur' : 'Norte'}`],
      ['Cotas', 'Ortométricas (m)'],
      ['Responsable', project.surveyor],
      ['N° de BMs', String(project.benchmarks.length)],
      ['N° de puntos', `${project.points.length} (${withZ.length} con cota)`],
    ],
    2,
  );

  r.section('Cuadro de BMs');
  bmTable(r, project);

  r.section('Resumen por código');
  const codes = pointsByCode(project);
  r.table({
    head: [['Código', 'N° puntos', 'Cota mín. (m)', 'Cota máx. (m)']],
    body: codes.map((c) => [c.code, String(c.count), nf(c.zMin, d), nf(c.zMax, d)]),
    columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
  });

  r.section('Cuadro de puntos', `${project.points.length} puntos`);
  if (project.points.length === 0) r.paragraph('No hay puntos registrados.', 8.5, C.muted);
  else
    r.table({
      head: [['N°', 'Punto', 'Este (m)', 'Norte (m)', 'Cota (m)', 'Código', 'Origen']],
      body: project.points.map((p, i) => [String(i + 1), p.name, nf(p.x, d), nf(p.y, d), nf(p.z, d), p.code ?? '', SOURCE[p.source] ?? p.source]),
      fontSize: 7.5,
      columnStyles: {
        0: { halign: 'right', cellWidth: 11, textColor: C.muted },
        1: { fontStyle: 'bold' },
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right', fontStyle: 'bold' },
        5: { halign: 'center' },
        6: { halign: 'center' },
      },
    });
  return r.finish();
}
