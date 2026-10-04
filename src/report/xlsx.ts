/**
 * Exportación a Excel (SheetJS). Números como números con formato, encabezados
 * en español, fila de título con el proyecto y anchos de columna razonables.
 */
import * as XLSX from 'xlsx';
import type { ID, LayerControl, LevelRun, Project } from '@/core/types';
import { ORDER_LABEL } from '@/core/leveling';
import {
  bookRows,
  findControl,
  findRun,
  layerReports,
  layerVerdict,
  pointsByCode,
  projectKpis,
  runReport,
  STATUS_TEXT,
  VERDICT_TEXT,
} from './data';
import {
  CLOSURE_LABEL,
  METHOD_LABEL,
  SOURCE_LABEL,
  crsText,
  decimalsOf,
  dmy,
  isNum,
  isoDay,
  offsetLabel,
  round,
  station,
  type ReportHeader,
} from './format';

type Cell = string | number | null | undefined | XLSX.CellObject;
type Row = Cell[];

/** Formato de cotas/lecturas/coordenadas; se ajusta a `decimals` del encabezado en cada exportación. */
let F3 = '0.000';
const zFor = (dec: number): string => (dec > 0 ? `0.${'0'.repeat(dec)}` : '0');
const F2 = '0.00';
const F1 = '0.0';
const F4 = '0.0000';
const PCT = '0.0"%"';

/** Celda numérica con formato; vacía si no es número. */
const n = (v: number | undefined | null, z = F3, dec = 6): Cell => (isNum(v) ? { t: 'n', v: round(v, dec), z } : null);

interface SheetSpec {
  name: string;
  title: string;
  rows: Row[];
  widths: number[];
  /** Puntos medidos (hojas de capa). */
  measured?: number;
}

/** Filas de título comunes. */
function titleRows(project: Project, title: string): Row[] {
  return [
    [`${title} — ${project.name}`],
    [[project.client, project.location].filter(Boolean).join(' · ') || null],
    [[company, `Generado con TOPO APP el ${dmy(isoDay())}`].filter(Boolean).join(' · ')],
    [],
  ];
}

function sheet(spec: SheetSpec): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(spec.rows.map((r) => r.map((c) => (c === undefined ? null : c))));
  ws['!cols'] = spec.widths.map((wch) => ({ wch }));
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(0, spec.widths.length - 1) } }];
  return ws;
}

const INVALID = /[\\/?*[\]:]/g;

/** Nombre de hoja válido (≤31, sin caracteres prohibidos) y único. */
function sheetName(wb: XLSX.WorkBook, base: string): string {
  const clean = base.replace(INVALID, '-').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Hoja';
  let name = clean;
  for (let i = 2; wb.SheetNames.includes(name); i++) {
    const suf = ` (${i})`;
    name = clean.slice(0, 31 - suf.length) + suf;
  }
  return name;
}

function addSheet(wb: XLSX.WorkBook, spec: SheetSpec): void {
  XLSX.utils.book_append_sheet(wb, sheet(spec), sheetName(wb, spec.name));
}

function toBlob(wb: XLSX.WorkBook): Blob {
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx', compression: true }) as ArrayBuffer;
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

let company = '';

function newBook(project: Project, title: string, h?: ReportHeader): XLSX.WorkBook {
  F3 = zFor(decimalsOf(h));
  company = h?.company ?? '';
  const wb = XLSX.utils.book_new();
  wb.Props = { Title: `${title} — ${project.name}`, Author: project.surveyor || 'TOPO APP', Company: h?.company || 'TOPO APP' };
  return wb;
}

/* --------------------------------- Hojas --------------------------------- */

function runSheet(project: Project, run: LevelRun, name?: string): SheetSpec {
  const rep = runReport(run);
  const { result, summary } = rep;
  const ch = result.checks;
  const cl = result.closure;
  const rows: Row[] = titleRows(project, `Libreta de nivelación: ${run.name}`);
  rows.push(
    ['Fecha', dmy(run.date), null, 'Método', METHOD_LABEL[run.method]],
    ['Instrumento', run.instrument ?? project.instrument ?? null, null, 'Cierre', CLOSURE_LABEL[run.closure]],
    ['Operador', run.operator ?? null, null, 'Clase', ORDER_LABEL[run.order]],
    ['Clima', run.weather ?? null, null, 'Coeficiente e (mm)', n(cl.k, '0')],
    ['BM inicial', run.startBM.name, n(run.startBM.elevation), 'Origen', SOURCE_LABEL[run.source]],
    run.closure === 'known-bm' && run.endBM
      ? ['BM final', run.endBM.name, n(run.endBM.elevation)]
      : ['BM final', run.closure === 'loop' ? run.startBM.name : '—', run.closure === 'loop' ? n(run.startBM.elevation) : null],
    [],
    ['Punto', 'VA (+)', 'AI / HI', 'VI', 'VAd (−)', 'Dist. adelante/VI (m)', 'Dist. atrás PC (m)', 'Subida', 'Bajada', 'Cota', 'Corrección', 'Cota compensada', 'Cota proyecto', 'Corte(+)/Relleno(−)', 'Punto de cambio', 'Nota'],
  );
  for (const b of bookRows(run, result)) {
    rows.push([
      b.point, n(b.bs), n(b.hi), n(b.is), n(b.fs), n(b.dist, F2), n(b.distBack, F2), n(b.rise), n(b.fall),
      n(b.elevation), n(b.correction, F4), n(b.adjusted), n(b.design), n(b.cutFill), b.turning ? 'Sí' : null, b.note ?? null,
    ]);
  }
  rows.push(
    [],
    ['COMPROBACIÓN ARITMÉTICA'],
    ['Suma VA (m)', n(ch.sumBS), null, 'Suma subidas (m)', n(ch.sumRise)],
    ['Suma VAd (m)', n(ch.sumFS), null, 'Suma bajadas (m)', n(ch.sumFall)],
    ['ΣVA − ΣVAd (m)', n(ch.sumBS - ch.sumFS), null, 'ΣS − ΣB (m)', n(ch.sumRise - ch.sumFall)],
    ['Distancia atrás (m)', n(ch.sumBackDist, F2), null, 'Distancia adelante (m)', n(ch.sumForeDist, F2)],
    ['Comprobación', ch.arithmeticOk ? 'Correcta' : 'Revisar'],
    [],
    ['CIERRE'],
    ['Cota final calculada (m)', n(cl.computedEnd)],
    ['Cota conocida (m)', n(cl.knownEnd)],
    ['Error de cierre (mm)', n(cl.misclosureMm, F1, 3)],
    ['Longitud K (km)', n(cl.lengthKm, F3)],
    ['Tolerancia T = e·√K (mm)', n(cl.toleranceMm, F1, 3)],
    ['Estaciones', cl.setups],
    ['Veredicto', VERDICT_TEXT[rep.verdict]],
    ['Resultado', summary.verdict],
  );
  if (result.issues.length) {
    rows.push([], ['INCIDENCIAS']);
    for (const i of result.issues) rows.push([i]);
  }
  return {
    name: name ?? 'Libreta',
    title: run.name,
    rows,
    widths: [24, 12, 12, 12, 18, 14, 14, 10, 10, 12, 12, 15, 13, 16, 10, 24],
  };
}

function controlSheets(project: Project, control: LayerControl, prefix = ''): SheetSpec[] {
  const reps = layerReports(control);
  const g = control.grade;
  const head: Row[] = [
    ...titleRows(project, `Control de capas: ${control.name}`),
    ['Progresiva inicial', station(g.startStation), null, 'Pendiente long. (%)', n(g.longSlope, F2)],
    ['Cota inicial rasante (m)', n(g.startElevation), null, 'Bombeo (%)', n(g.crossSlope, F2)],
    ['Tipo de bombeo', g.crossType === 'crown' ? 'Dos aguas' : 'Una caída'],
    [],
    ['N°', 'Capa', 'Espesor (m)', 'Prof. bajo rasante (m)', 'Tolerancia (± mm)', 'Puntos', 'Medidos', 'Conformes', 'Al límite', 'No conformes', '% conforme', 'Máx. + (mm)', 'Máx. − (mm)', 'Media (mm)', 'Desv. est. (mm)', 'Estado'],
  ];
  reps.forEach((lr, i) => {
    const s = lr.summary;
    const m = s.measured > 0;
    head.push([
      i + 1, lr.layer.name, n(lr.layer.thickness), n(lr.depth), n(lr.layer.tolerance * 1000, '0'), s.total, s.measured, s.ok, s.warn, s.fail,
      m ? n(s.pctOk, PCT, 2) : null, m ? n(s.maxHigh * 1000, F1, 2) : null, m ? n(s.maxLow * 1000, F1, 2) : null,
      m ? n(s.meanDev * 1000, F1, 2) : null, m ? n(s.stdDev * 1000, F1, 2) : null, STATUS_TEXT[layerVerdict(s)],
    ]);
  });
  const out: SheetSpec[] = [
    { name: `${prefix}Capas`, title: control.name, rows: head, widths: [6, 24, 12, 18, 15, 8, 9, 10, 9, 12, 11, 11, 11, 10, 13, 14] },
  ];
  const labels = new Map(control.points.map((p) => [p.id, p.label ?? '']));
  for (const lr of reps) {
    const rows: Row[] = [
      ...titleRows(project, `Protocolo de capa: ${lr.layer.name} (${control.name})`),
      ['Tolerancia (± mm)', n(lr.layer.tolerance * 1000, '0'), null, 'Espesor (m)', n(lr.layer.thickness)],
      [],
      ['Progresiva', 'Progresiva (m)', 'Ubicación', 'Desplaz. (m)', 'Cota diseño', 'Cota medida', 'Dif. (mm)', 'Estado'],
    ];
    for (const c of lr.checks) {
      rows.push([
        station(c.station), n(c.station, F2), labels.get(c.pointId) || offsetLabel(c.offset), n(c.offset, F2),
        n(c.design), n(c.measured), n(isNum(c.deviation) ? c.deviation * 1000 : undefined, F1, 2), STATUS_TEXT[c.status],
      ]);
    }
    out.push({ name: `${prefix}${lr.layer.name}`, title: lr.layer.name, rows, widths: [12, 14, 12, 12, 13, 13, 10, 14], measured: lr.summary.measured });
  }
  return out;
}

function bmsSheet(project: Project): SheetSpec {
  const rows: Row[] = [
    ...titleRows(project, 'Cuadro de BMs'),
    ['Sistema', crsText(project)],
    [],
    ['BM', 'Este (m)', 'Norte (m)', 'Cota (m)', 'Tipo', 'Descripción'],
    ...project.benchmarks.map((b) => [b.name, n(b.x), n(b.y), n(b.elevation), b.official ? 'Oficial' : 'Auxiliar', b.description ?? null]),
  ];
  return { name: 'BMs', title: 'BMs', rows, widths: [12, 14, 14, 12, 10, 48] };
}

function pointsSheet(project: Project): SheetSpec {
  const rows: Row[] = [
    ...titleRows(project, 'Cuadro de puntos'),
    ['Sistema', crsText(project)],
    [],
    ['N°', 'Punto', 'Este (m)', 'Norte (m)', 'Cota (m)', 'Código', 'Origen', 'Precisión (m)', 'Nota'],
    ...project.points.map((p, i) => [i + 1, p.name, n(p.x), n(p.y), n(p.z), p.code ?? null, p.source, n(p.precision), p.note ?? null]),
  ];
  return { name: 'Puntos', title: 'Puntos', rows, widths: [6, 12, 14, 14, 11, 10, 14, 12, 30] };
}

function codesSheet(project: Project): SheetSpec {
  const rows: Row[] = [
    ...titleRows(project, 'Resumen por código'),
    ['Código', 'N° puntos', 'Cota mín. (m)', 'Cota máx. (m)'],
    ...pointsByCode(project).map((c) => [c.code, c.count, n(c.zMin), n(c.zMax)]),
  ];
  return { name: 'Códigos', title: 'Códigos', rows, widths: [16, 10, 14, 14] };
}

function summarySheet(project: Project): SheetSpec {
  const k = projectKpis(project);
  const rows: Row[] = [
    ...titleRows(project, 'Informe de control topográfico'),
    ['Obra', project.name],
    ['Cliente', project.client ?? null],
    ['Ubicación', project.location ?? null],
    ['Responsable', project.surveyor ?? null],
    ['Sistema', crsText(project)],
    [],
    ['INDICADORES'],
    ['Libretas de nivelación', k.nRuns],
    ['Libretas con cierre', k.nClosed],
    ['Cierres dentro de tolerancia (%)', n(k.pctRunsOk, PCT, 2)],
    ['Puntos levantados', k.nPoints],
    ['BMs', k.nBMs],
    ['Capas medidas', k.nLayersMeasured],
    ['Capas conformes (%)', n(k.pctLayersOk, PCT, 2)],
    ['Puntos de control conformes (%)', n(k.pctPointsOk, PCT, 2)],
    [],
    ['NIVELACIONES'],
    ['Libreta', 'Fecha', 'Clase', 'Cierre', 'e (mm)', 'K (km)', 'Error (mm)', 'Tolerancia (mm)', 'Estado'],
  ];
  for (const x of project.levelRuns.map(runReport)) {
    rows.push([
      x.run.name, dmy(x.run.date), ORDER_LABEL[x.run.order], CLOSURE_LABEL[x.run.closure], n(x.result.closure.k, '0'),
      n(x.result.closure.lengthKm), n(x.summary.misclosureMm, F1, 3), n(x.summary.toleranceMm, F1, 3), VERDICT_TEXT[x.verdict],
    ]);
  }
  rows.push([], ['CONTROL DE CAPAS'], ['Control', 'Capa', 'Tolerancia (± mm)', 'Medidos', 'Total', '% conforme', 'Máx. + (mm)', 'Máx. − (mm)', 'Estado']);
  for (const c of project.layerControls) {
    for (const lr of layerReports(c)) {
      const s = lr.summary;
      const m = s.measured > 0;
      rows.push([
        c.name, lr.layer.name, n(lr.layer.tolerance * 1000, '0'), s.measured, s.total, m ? n(s.pctOk, PCT, 2) : null,
        m ? n(s.maxHigh * 1000, F1, 2) : null, m ? n(s.maxLow * 1000, F1, 2) : null, STATUS_TEXT[layerVerdict(s)],
      ]);
    }
  }
  return { name: 'Resumen', title: 'Resumen', rows, widths: [36, 22, 26, 22, 10, 10, 12, 15, 14] };
}

/* ---------------------------------- API ---------------------------------- */

export function levelRunXlsx(project: Project, runId: ID, h?: ReportHeader): Blob {
  const run = findRun(project, runId);
  const wb = newBook(project, 'Libreta de nivelación', h);
  addSheet(wb, runSheet(project, run));
  return toBlob(wb);
}

export function layerControlXlsx(project: Project, controlId: ID, h?: ReportHeader): Blob {
  const control = findControl(project, controlId);
  const wb = newBook(project, 'Control de capas', h);
  for (const s of controlSheets(project, control)) addSheet(wb, s);
  return toBlob(wb);
}

export function pointsXlsx(project: Project, h?: ReportHeader): Blob {
  const wb = newBook(project, 'Cuadro de puntos', h);
  addSheet(wb, bmsSheet(project));
  addSheet(wb, pointsSheet(project));
  addSheet(wb, codesSheet(project));
  return toBlob(wb);
}

export function projectXlsx(project: Project, h?: ReportHeader): Blob {
  const wb = newBook(project, 'Proyecto', h);
  addSheet(wb, summarySheet(project));
  addSheet(wb, bmsSheet(project));
  addSheet(wb, pointsSheet(project));
  for (const run of project.levelRuns) addSheet(wb, runSheet(project, run, `Niv - ${run.name}`));
  for (const c of project.layerControls) {
    // Una hoja por control: la tabla del paquete + los protocolos de cada capa uno debajo del otro.
    const [pkg, ...layers] = controlSheets(project, c);
    const rows = [...pkg.rows];
    for (const l of layers) {
      if (!l.measured) continue; // capas sin mediciones
      rows.push([], [`PROTOCOLO: ${l.title.toUpperCase()}`], ...l.rows.slice(4));
    }
    addSheet(wb, { name: `Capas - ${c.name}`, title: c.name, rows, widths: pkg.widths });
  }
  return toBlob(wb);
}
