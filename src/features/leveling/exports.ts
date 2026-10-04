/** Exportaciones (PDF, Excel, CSV) de nivelaciones y controles de capas. */
import { useStore } from '@/app/store';
import { saveFile } from '@/app/platform';
import type { ID, Project } from '@/core/types';
import { computeLevelRun } from '@/core/leveling';
import { toast } from '@/ui/kit';
import { exportLevelRunCsv } from '@/io';
import { layerControlPdf, layerControlXlsx, levelRunPdf, levelRunXlsx, reportFileName } from '@/report';
import { slug } from '@/ui/format';

function header() {
  const s = useStore.getState().settings;
  return { company: s.company, engineer: s.engineer, cip: s.cip, decimals: s.decimals };
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

async function run(label: string, fn: () => Promise<void>): Promise<void> {
  toast(`Generando ${label}…`, 'info');
  try {
    await fn();
    toast(`${label} listo`);
  } catch (e) {
    console.error(e);
    toast(`No se pudo generar ${label}: ${e instanceof Error ? e.message : String(e)}`, 'fail');
  }
}

export function exportRunPdf(project: Project, runId: ID) {
  return run('PDF', async () => {
    const name = project.levelRuns.find((r) => r.id === runId)?.name ?? 'nivelacion';
    const blob = await levelRunPdf(project, runId, header());
    await saveFile(reportFileName(project, name, 'pdf'), blob, 'application/pdf');
  });
}

export function exportRunXlsx(project: Project, runId: ID) {
  return run('Excel', async () => {
    const name = project.levelRuns.find((r) => r.id === runId)?.name ?? 'nivelacion';
    const blob = await levelRunXlsx(project, runId, header());
    await saveFile(reportFileName(project, name, 'xlsx'), blob, XLSX_MIME);
  });
}

export function exportRunCsv(project: Project, runId: ID) {
  return run('CSV', async () => {
    const r = project.levelRuns.find((x) => x.id === runId);
    if (!r) throw new Error('Nivelación no encontrada');
    const text = exportLevelRunCsv(r, computeLevelRun(r));
    await saveFile(`${slug(project.name)}_${slug(r.name)}.csv`, text, 'text/csv');
  });
}

export function exportLayerPdf(project: Project, controlId: ID, layerId?: ID) {
  return run('PDF', async () => {
    const name = project.layerControls.find((c) => c.id === controlId)?.name ?? 'control-capas';
    const blob = await layerControlPdf(project, controlId, header(), layerId);
    await saveFile(reportFileName(project, name, 'pdf'), blob, 'application/pdf');
  });
}

export function exportLayerXlsx(project: Project, controlId: ID) {
  return run('Excel', async () => {
    const name = project.layerControls.find((c) => c.id === controlId)?.name ?? 'control-capas';
    const blob = await layerControlXlsx(project, controlId, header());
    await saveFile(reportFileName(project, name, 'xlsx'), blob, XLSX_MIME);
  });
}
