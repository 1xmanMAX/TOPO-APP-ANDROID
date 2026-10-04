/**
 * Utilidades comunes del módulo Informes: membrete, generación de informes
 * (PDF/Excel) y metadatos de formatos de archivo.
 */
import { useStore } from '@/app/store';
import { saveFile } from '@/app/platform';
import type { DataFormat, ID, Project } from '@/core/types';
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

export type ReportKind = 'level' | 'layer' | 'points' | 'summary' | 'project';
export type ReportFmt = 'pdf' | 'xlsx';

export const MIME = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
  dxf: 'application/dxf',
  kml: 'application/vnd.google-earth.kml+xml',
  xml: 'application/xml',
  gsi: 'text/plain',
  json: 'application/json',
} as const;

/** Membrete del informe desde los ajustes. */
export function useReportHeader(): ReportHeader {
  const s = useStore((st) => st.settings);
  return { company: s.company, engineer: s.engineer, cip: s.cip, decimals: s.decimals };
}

export function reportHeaderNow(): ReportHeader {
  const s = useStore.getState().settings;
  return { company: s.company, engineer: s.engineer, cip: s.cip, decimals: s.decimals };
}

/** Nombre corto del tipo de informe para el archivo. */
const FILE_KIND: Record<ReportKind, string> = {
  level: 'libreta-nivelacion',
  layer: 'control-capas',
  points: 'cuadro-puntos',
  summary: 'informe-control',
  project: 'proyecto',
};

export const KIND_TITLE: Record<ReportKind, string> = {
  level: 'Libreta de nivelación',
  layer: 'Protocolo de control de capas',
  points: 'Cuadro de BMs y puntos',
  summary: 'Informe de control topográfico',
  project: 'Proyecto completo',
};

export interface GenOpts {
  id?: ID;
  layerId?: ID;
}

/** Genera el informe y devuelve el archivo listo para guardar. */
export async function generateReport(
  project: Project,
  kind: ReportKind,
  fmt: ReportFmt,
  header: ReportHeader,
  opts: GenOpts = {},
): Promise<{ blob: Blob; name: string; mime: string }> {
  let blob: Blob;
  // Cede el hilo para que el spinner se pinte antes del trabajo pesado.
  await new Promise((r) => setTimeout(r, 30));
  if (fmt === 'pdf') {
    switch (kind) {
      case 'level':
        blob = await levelRunPdf(project, need(opts.id), header);
        break;
      case 'layer':
        blob = await layerControlPdf(project, need(opts.id), header, opts.layerId);
        break;
      case 'points':
        blob = await pointsPdf(project, header);
        break;
      default:
        blob = await projectSummaryPdf(project, header);
    }
  } else {
    switch (kind) {
      case 'level':
        blob = await levelRunXlsx(project, need(opts.id), header);
        break;
      case 'layer':
        blob = await layerControlXlsx(project, need(opts.id), header);
        break;
      case 'points':
        blob = await pointsXlsx(project, header);
        break;
      default:
        blob = await projectXlsx(project, header);
    }
  }
  return { blob, name: reportFileName(project, fileKind(project, kind, opts), fmt), mime: MIME[fmt] };
}

function need(id: ID | undefined): ID {
  if (!id) throw new Error('Falta elegir la libreta o el control');
  return id;
}

function fileKind(project: Project, kind: ReportKind, opts: GenOpts): string {
  const base = FILE_KIND[kind];
  if (kind === 'level' && opts.id) {
    const r = project.levelRuns.find((x) => x.id === opts.id);
    if (r) return `${base}-${r.name}`;
  }
  if (kind === 'layer' && opts.id) {
    const c = project.layerControls.find((x) => x.id === opts.id);
    if (c) return `${base}-${c.name}`;
  }
  return base;
}

export async function downloadReport(
  project: Project,
  kind: ReportKind,
  fmt: ReportFmt,
  opts: GenOpts = {},
): Promise<void> {
  const { blob, name, mime } = await generateReport(project, kind, fmt, reportHeaderNow(), opts);
  await saveFile(name, blob, mime);
}

/** Comparte con la hoja del sistema si el navegador lo permite; si no, descarga. */
export async function shareFile(name: string, blob: Blob, mime: string): Promise<void> {
  try {
    const file = new File([blob], name, { type: mime });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.share && nav.canShare?.({ files: [file] })) {
      await nav.share({ files: [file], title: name });
      return;
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return;
  }
  await saveFile(name, blob, mime);
}

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/* ------------------------------------------------------------------ */
/* Formatos de importación                                             */
/* ------------------------------------------------------------------ */

export const FORMAT_LABEL: Record<DataFormat, string> = {
  'leica-gsi8': 'Leica GSI-8',
  'leica-gsi16': 'Leica GSI-16',
  'trimble-dini': 'Trimble DiNi (M5)',
  'sokkia-sdr': 'Sokkia SDR33',
  'topcon-gts': 'Topcon GTS / South',
  nmea: 'NMEA 0183 (GNSS)',
  'csv-points': 'CSV/TXT de puntos',
  'csv-leveling': 'CSV de libreta de nivelación',
  unknown: 'No reconocido',
};

export const FORMAT_HINT: Record<DataFormat, string> = {
  'leica-gsi8': 'Nivel digital o estación total Leica',
  'leica-gsi16': 'Nivel digital o estación total Leica',
  'trimble-dini': 'Nivel digital Trimble/Zeiss DiNi',
  'sokkia-sdr': 'Estación total Sokkia / colectora SDR',
  'topcon-gts': 'Estación total Topcon GTS o South NTS',
  nmea: 'Receptor GNSS (posiciones GGA/RMC)',
  'csv-points': 'Coordenadas exportadas o de Excel',
  'csv-leveling': 'Libreta con columnas Punto, Atrás, Intermedia, Adelante',
  unknown: 'Elige el formato manualmente',
};

export const FORMAT_OPTIONS: Array<{ value: DataFormat; label: string }> = (
  Object.keys(FORMAT_LABEL) as DataFormat[]
)
  .filter((k) => k !== 'unknown')
  .map((k) => ({ value: k, label: FORMAT_LABEL[k] }));

/** Extensiones aceptadas por el selector de archivos. */
export const IMPORT_ACCEPT =
  '.gsi,.GSI,.txt,.TXT,.csv,.CSV,.dat,.DAT,.m5,.sdr,.SDR,.raw,.RAW,.nmea,.log,.gt7,.xyz,.json,.topo.json,text/plain,text/csv,application/json';
