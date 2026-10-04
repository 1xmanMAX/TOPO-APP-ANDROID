import { useMemo, useState, type ReactNode } from 'react';
import {
  Archive,
  BookOpenCheck,
  Box,
  Check,
  FileDown,
  FileSpreadsheet,
  Globe2,
  MapPinned,
  Mountain,
  PenTool,
  Radio,
  Sheet as SheetIcon,
  Triangle,
} from 'lucide-react';
import { useProject } from '@/app/store';
import { saveFile } from '@/app/platform';
import type { Project, SurveyPoint } from '@/core/types';
import { computeLevelRun } from '@/core/leveling';
import { buildTin } from '@/core/surface';
import { Chips, EmptyState, Field, Segmented, Select, Toggle, toast } from '@/ui/kit';
import { slug } from '@/ui/format';
import {
  exportDxf,
  exportGsi16Points,
  exportKml,
  exportLandXml,
  exportLevelRunCsv,
  exportPointsCsv,
  projectToJson,
} from '@/io';
import { levelRunXlsx, pointsXlsx } from '@/report';
import { errorText, MIME, reportHeaderNow } from './shared';
import { Spinner } from './Spinner';
import { Page } from './Page';

type What = 'points' | 'bms' | 'runs';
type Fmt = 'csv' | 'xlsx' | 'dxf' | 'kml' | 'landxml' | 'gsi' | 'json';
type CsvOrder = 'PENZD' | 'PNEZD';
type Delim = ',' | ';' | '\t';

interface FmtDef {
  id: Fmt;
  title: string;
  sub: string;
  icon: ReactNode;
  ext: string;
}

const FORMATS: Record<Fmt, FmtDef> = {
  csv: { id: 'csv', title: 'CSV', sub: 'Texto para Excel, Civil 3D o cualquier equipo', icon: <SheetIcon size={22} />, ext: 'csv' },
  xlsx: { id: 'xlsx', title: 'Excel', sub: 'Libro .xlsx con formato', icon: <FileSpreadsheet size={22} />, ext: 'xlsx' },
  dxf: { id: 'dxf', title: 'DXF', sub: 'AutoCAD / Civil 3D (puntos, nombres y cotas)', icon: <PenTool size={22} />, ext: 'dxf' },
  kml: { id: 'kml', title: 'KML', sub: 'Google Earth / Google Maps', icon: <Globe2 size={22} />, ext: 'kml' },
  landxml: { id: 'landxml', title: 'LandXML', sub: 'Civil 3D, con superficie TIN opcional', icon: <Mountain size={22} />, ext: 'xml' },
  gsi: { id: 'gsi', title: 'GSI-16', sub: 'Cargar coordenadas a estación Leica', icon: <Radio size={22} />, ext: 'gsi' },
  json: { id: 'json', title: 'Respaldo', sub: 'Proyecto completo .topo.json', icon: <Archive size={22} />, ext: 'topo.json' },
};

const FORMATS_FOR: Record<What, Fmt[]> = {
  points: ['csv', 'xlsx', 'dxf', 'kml', 'landxml', 'gsi', 'json'],
  bms: ['csv', 'xlsx', 'dxf', 'kml', 'gsi', 'json'],
  runs: ['csv', 'xlsx', 'json'],
};

const ALL = '__all__';

function bmPoints(p: Project): SurveyPoint[] {
  return p.benchmarks
    .filter((b) => Number.isFinite(b.x) && Number.isFinite(b.y))
    .map((b) => ({
      id: b.id,
      name: b.name,
      code: 'BM',
      x: b.x as number,
      y: b.y as number,
      z: b.elevation,
      source: 'manual' as const,
      note: b.description,
      createdAt: p.createdAt,
    }));
}

export function ExportScreen() {
  const project = useProject();
  const [what, setWhat] = useState<What>('points');
  const [code, setCode] = useState<string>(ALL);
  const [runId, setRunId] = useState<string>('');
  const [fmt, setFmt] = useState<Fmt>('csv');
  const [order, setOrder] = useState<CsvOrder>('PENZD');
  const [delim, setDelim] = useState<Delim>(',');
  const [withTin, setWithTin] = useState(true);
  const [busy, setBusy] = useState(false);

  const codes = useMemo(() => {
    const m = new Map<string, number>();
    for (const pt of project?.points ?? []) {
      const c = pt.code?.trim() || '';
      m.set(c, (m.get(c) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [project]);

  if (!project) {
    return (
      <Page title="Exportar" back>
        <EmptyState icon={<FileDown size={34} />} title="Sin proyecto activo" text="Abre un proyecto para exportar sus datos." />
      </Page>
    );
  }

  const run = project.levelRuns.find((r) => r.id === runId) ?? project.levelRuns[0];
  const selPoints: SurveyPoint[] =
    what === 'points'
      ? project.points.filter((p) => code === ALL || (p.code?.trim() || '') === code)
      : what === 'bms'
        ? bmPoints(project)
        : [];
  const bmsNoCoords = project.benchmarks.length - bmPoints(project).length;
  const available = FORMATS_FOR[what];
  const curFmt = available.includes(fmt) ? fmt : available[0];
  const withZ = selPoints.filter((p) => Number.isFinite(p.z)).length;

  const count =
    curFmt === 'json'
      ? 'proyecto completo'
      : what === 'runs'
        ? run
          ? `libreta «${run.name}»`
          : 'sin libretas'
        : what === 'bms' && curFmt === 'xlsx'
          ? `${project.benchmarks.length} BM`
          : `${selPoints.length} ${what === 'bms' ? 'BM' : selPoints.length === 1 ? 'punto' : 'puntos'}`;

  const empty =
    curFmt !== 'json' &&
    (what === 'runs' ? !run : what === 'bms' && curFmt === 'xlsx' ? project.benchmarks.length === 0 : selPoints.length === 0);

  /** Proyecto reducido a la selección (para exportadores que reciben Project). */
  const subProject = (): Project => ({
    ...project,
    points: what === 'points' ? selPoints : [],
    benchmarks: what === 'bms' ? project.benchmarks : [],
    levelRuns: [],
    layerControls: [],
  });

  const doExport = async () => {
    setBusy(true);
    await new Promise((r) => setTimeout(r, 30));
    const base = slug(project.name);
    const tipo =
      what === 'runs' ? `libreta-${slug(run?.name ?? '')}` : what === 'bms' ? 'bms' : code === ALL ? 'puntos' : `puntos-${slug(code || 'sin-codigo')}`;
    try {
      let data: Blob | string;
      let mime: string;
      let name = `${base}_${tipo}.${FORMATS[curFmt].ext}`;
      switch (curFmt) {
        case 'csv':
          if (what === 'runs' && run) {
            data = exportLevelRunCsv(run, computeLevelRun(run));
          } else {
            data = exportPointsCsv(selPoints, order, delim);
          }
          mime = MIME.csv;
          break;
        case 'xlsx':
          data =
            what === 'runs' && run
              ? await levelRunXlsx(project, run.id, reportHeaderNow())
              : await pointsXlsx(subProject(), reportHeaderNow());
          mime = MIME.xlsx;
          break;
        case 'dxf':
          data = exportDxf(subProject());
          mime = MIME.dxf;
          break;
        case 'kml':
          data = exportKml(selPoints, project.crs, project.name);
          mime = MIME.kml;
          break;
        case 'landxml': {
          const tinPts = selPoints.filter((p) => Number.isFinite(p.z)).map((p) => ({ x: p.x, y: p.y, z: p.z as number }));
          const tin = withTin && tinPts.length >= 3 ? buildTin(tinPts) : undefined;
          const surface = tin && tin.triangles.length ? { points: tin.points, triangles: Array.from(tin.triangles) } : undefined;
          data = exportLandXml(subProject(), { surface });
          mime = MIME.xml;
          break;
        }
        case 'gsi':
          data = exportGsi16Points(selPoints);
          mime = MIME.gsi;
          break;
        default:
          data = projectToJson(project);
          mime = MIME.json;
          name = `${base}.topo.json`;
      }
      await saveFile(name, data, mime);
      toast(`Exportado: ${name}`);
    } catch (e) {
      toast(`No se pudo exportar: ${errorText(e)}`, 'fail');
    } finally {
      setBusy(false);
    }
  };

  const options = (
    <>
        {curFmt === 'csv' && what !== 'runs' && (
          <div className="card stack">
            <Field label="Orden de columnas" hint={order === 'PENZD' ? 'Punto, Este, Norte, Cota, Descripción' : 'Punto, Norte, Este, Cota, Descripción (Civil 3D)'}>
              <Chips
                value={order}
                onChange={setOrder}
                options={[
                  { value: 'PENZD', label: 'PENZD' },
                  { value: 'PNEZD', label: 'PNEZD' },
                ]}
              />
            </Field>
            <Field label="Separador" hint={delim === ';' ? 'Excel en español suele usar punto y coma' : undefined}>
              <Chips
                value={delim}
                onChange={setDelim}
                options={[
                  { value: ',', label: 'Coma ,' },
                  { value: ';', label: 'Punto y coma ;' },
                  { value: '\t', label: 'Tabulador' },
                ]}
              />
            </Field>
          </div>
        )}

        {curFmt === 'landxml' && (
          <div className="card stack">
            <Toggle checked={withTin} onChange={setWithTin} label="Incluir superficie TIN" />
            <p className="small muted">
              <Triangle size={14} /> Triangulación de {withZ} puntos con cota
              {withZ < 3 ? ' (se necesitan al menos 3)' : ''}.
            </p>
          </div>
        )}
        {curFmt === 'kml' && (
          <p className="small muted">
            <Box size={14} /> Coordenadas UTM {project.crs.zone}
            {project.crs.hemisphere} convertidas a WGS84 geográficas.
          </p>
        )}
    </>
  );

  return (
    <Page title="Exportar" subtitle={project.name} back>
      <section className="stack">
        <h2 className="section-title">1 · ¿Qué exportar?</h2>
        <Segmented
          value={what}
          onChange={setWhat}
          options={[
            { value: 'points', label: `Puntos (${project.points.length})` },
            { value: 'bms', label: `BMs (${project.benchmarks.length})` },
            { value: 'runs', label: `Libretas (${project.levelRuns.length})` },
          ]}
        />
        {what === 'points' && codes.length > 1 && (
          <Field label="Filtrar por código">
            <Chips
              value={code}
              onChange={setCode}
              options={[
                { value: ALL, label: `Todos · ${project.points.length}` },
                ...codes.map(([c, n]) => ({ value: c, label: `${c || 'Sin código'} · ${n}` })),
              ]}
            />
          </Field>
        )}
        {what === 'bms' && bmsNoCoords > 0 && (
          <p className="small muted">
            {bmsNoCoords} BM sin coordenadas: solo se incluyen en Excel y en el respaldo.
          </p>
        )}
        {what === 'runs' && project.levelRuns.length > 0 && (
          <Select
            label="Libreta"
            value={run?.id ?? ''}
            onChange={setRunId}
            options={project.levelRuns.map((r) => ({ value: r.id, label: r.name }))}
          />
        )}
      </section>

      <section className="stack">
        <h2 className="section-title">2 · Formato</h2>
        <div className="rp-fmt-grid" role="radiogroup">
          {available.map((id) => {
            const d = FORMATS[id];
            const on = id === curFmt;
            return [
              <button
                key={id}
                role="radio"
                aria-checked={on}
                className={`rp-fmt${on ? ' on' : ''}`}
                onClick={() => setFmt(id)}
              >
                <span className="rp-fmt-icon">{d.icon}</span>
                <span className="rp-fmt-body">
                  <strong>{d.title}</strong>
                  <span>{d.sub}</span>
                </span>
                {on && (
                  <span className="rp-fmt-check">
                    <Check size={16} strokeWidth={3} />
                  </span>
                )}
              </button>,
              on ? <div key={`${id}-opts`} className="rp-fmt-opts">{options}</div> : null,
            ];
          })}
        </div>

      </section>

      <div className="rp-sticky">
        <button className="btn primary lg grow" disabled={busy || empty} onClick={doExport}>
          {busy ? <Spinner /> : what === 'runs' ? <BookOpenCheck size={20} /> : <MapPinned size={20} />}
          {empty ? 'Nada que exportar' : `Exportar ${count} · ${FORMATS[curFmt].title}`}
        </button>
      </div>
    </Page>
  );
}
