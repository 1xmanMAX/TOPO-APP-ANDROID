import type { Project } from '@/core/types';
import type { ContourLevel } from '@/core/surface';
import { saveFile } from '@/app/platform';
import { slug } from '@/ui/format';
import { exportDxf } from '@/io';

/** Exporta DXF (R12) con puntos, BMs y curvas de nivel usando el módulo de E/S. */
export async function exportSurfaceDxf(project: Project, contours: ContourLevel[], interval: number): Promise<void> {
  const dxf = exportDxf(project, {
    includeContours: contours.map((c) => ({ elevation: c.elevation, lines: c.lines, major: c.master })),
  });
  const iv = String(interval).replace('.', '_');
  await saveFile(`${slug(project.name)}-curvas-${iv}m.dxf`, dxf, 'application/dxf');
}
