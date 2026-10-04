import { useMemo, useState, type DragEvent } from 'react';
import {
  AlertTriangle,
  BookOpenCheck,
  CheckCircle2,
  ClipboardPaste,
  FileDown,
  FileUp,
  FolderInput,
  MapPinned,
  RotateCcw,
  Upload,
  X,
} from 'lucide-react';
import { go, useNav } from '@/app/nav';
import { useProject, useStore } from '@/app/store';
import { pickFiles, readText, saveFile } from '@/app/platform';
import type { DataFormat, ImportResult, LevelClosure, LevelRun, Project } from '@/core/types';
import { computeLevelRun } from '@/core/leveling';
import { Chips, Field, NumberInput, Select, StatusBadge, TextInput, toast } from '@/ui/kit';
import { f, fs } from '@/ui/format';
import { detectFormat, importText, projectFromJson, type CsvDelimiter, type CsvOptions, type CsvOrder as IoCsvOrder } from '@/io';
import {
  errorText,
  FORMAT_HINT,
  FORMAT_LABEL,
  FORMAT_OPTIONS,
  generateReport,
  IMPORT_ACCEPT,
  reportHeaderNow,
} from './shared';
import { FormatsHelp } from './FormatsHelp';
import { Spinner } from './Spinner';
import { Page } from './Page';

/* ------------------------------------------------------------------ */
/* Tipos locales                                                       */
/* ------------------------------------------------------------------ */

type CsvOrder = 'auto' | IoCsvOrder;
type Delim = 'auto' | CsvDelimiter;

const ORDERS: CsvOrder[] = ['auto', 'PENZD', 'PNEZD', 'PENZ', 'PNEZ', 'ENZ', 'NEZ'];
const DELIMS: Array<{ value: Delim; label: string }> = [
  { value: 'auto', label: 'Auto' },
  { value: ',', label: 'Coma ,' },
  { value: ';', label: 'Punto y coma ;' },
  { value: '\t', label: 'Tabulador' },
  { value: ' ', label: 'Espacio' },
];

interface Source {
  name: string;
  text: string;
  detected: DataFormat;
  format: DataFormat;
}

interface Parsed {
  src: Source;
  result?: ImportResult;
  error?: string;
}

interface Done {
  points: number;
  runs: LevelRun[];
}

const isProjectJson = (name: string, text: string) =>
  /\.json$/i.test(name) || (/^\s*\{/.test(text) && /"levelRuns"\s*:/.test(text));

/* ------------------------------------------------------------------ */

export function ImportScreen() {
  const project = useProject();
  const [sources, setSources] = useState<Source[]>([]);
  const [projectFile, setProjectFile] = useState<{ name: string; project?: Project; error?: string } | null>(null);
  const [over, setOver] = useState(false);
  const [paste, setPaste] = useState<string | null>(null);
  const [order, setOrder] = useState<CsvOrder>('auto');
  const [delim, setDelim] = useState<Delim>('auto');
  const [hasHeader, setHasHeader] = useState<boolean | 'auto'>('auto');
  const [runOv, setRunOv] = useState<Record<string, RunOv>>({});
  const [done, setDone] = useState<Done | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setSources([]);
    setProjectFile(null);
    setPaste(null);
    setRunOv({});
    setDone(null);
  };

  /* ---------------- lectura ---------------- */

  const loadTexts = (items: Array<{ name: string; text: string }>) => {
    const proj = items.find((i) => isProjectJson(i.name, i.text));
    if (proj) {
      try {
        setProjectFile({ name: proj.name, project: projectFromJson(proj.text) });
      } catch (e) {
        setProjectFile({ name: proj.name, error: errorText(e) });
      }
      setSources([]);
      return;
    }
    setProjectFile(null);
    setRunOv({});
    setSources(
      items.map((i) => {
        let detected: DataFormat = 'unknown';
        try {
          detected = detectFormat(i.text, i.name);
        } catch {
          /* formato no reconocido */
        }
        return { name: i.name, text: i.text, detected, format: detected === 'unknown' ? 'csv-points' : detected };
      }),
    );
  };

  const readFiles = async (files: File[]) => {
    if (!files.length) return;
    try {
      const items = await Promise.all(files.map(async (fl) => ({ name: fl.name, text: await readText(fl) })));
      loadTexts(items);
    } catch (e) {
      toast(`No se pudo leer el archivo: ${errorText(e)}`, 'fail');
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    void readFiles(Array.from(e.dataTransfer.files));
  };

  /* ---------------- interpretación ---------------- */

  const csvOpts = useMemo(() => {
    const o: CsvOptions = {};
    if (order !== 'auto') o.order = order;
    if (delim !== 'auto') o.delimiter = delim;
    if (hasHeader !== 'auto') o.hasHeader = hasHeader;
    return o;
  }, [order, delim, hasHeader]);

  const parsed: Parsed[] = useMemo(
    () =>
      sources.map((src) => {
        try {
          const runName = sources.length > 1 || src.name !== 'Texto pegado' ? src.name.replace(/\.[^.]+$/, '') : undefined;
          const result = importText(src.text, src.name, {
            format: src.format,
            csv: csvOpts,
            runName,
          });
          return { src, result };
        } catch (e) {
          return { src, error: errorText(e) };
        }
      }),
    [sources, csvOpts],
  );

  const merged: ImportResult = useMemo(() => {
    const out: ImportResult = { format: parsed[0]?.result?.format ?? 'unknown', points: [], levelRuns: [], warnings: [] };
    for (const p of parsed) {
      if (!p.result) continue;
      out.points.push(...p.result.points);
      out.levelRuns.push(
        ...p.result.levelRuns.map((r) => applyOv(r, effectiveOv(r, runOv[r.id], project))),
      );
      const prefix = parsed.length > 1 ? `${p.src.name}: ` : '';
      out.warnings.push(...p.result.warnings.map((w) => prefix + w));
    }
    return out;
  }, [parsed, runOv, project]);

  const anyCsv = sources.some((s) => s.format === 'csv-points');
  const nPts = merged.points.length;
  const nRuns = merged.levelRuns.length;

  const doImport = () => {
    const r = useStore.getState().applyImport(merged);
    toast(`Importado: ${importLabel(r.points, r.runs)}`);
    setDone({ points: r.points, runs: merged.levelRuns });
    setSources([]);
  };

  const doImportProject = () => {
    if (!projectFile?.project) return;
    useStore.getState().importProject(projectFile.project);
    toast(`Proyecto «${projectFile.project.name}» importado`);
    useNav.getState().resetTab('reports');
  };

  const reportNow = async () => {
    const p = useStore.getState().projects.find((x) => x.id === useStore.getState().activeProjectId);
    if (!p || !done) return;
    setBusy(true);
    try {
      const kind = done.runs.length === 1 ? 'level' : done.runs.length > 1 ? 'summary' : 'points';
      const g = await generateReport(p, kind, 'pdf', reportHeaderNow(), { id: done.runs[0]?.id });
      await saveFile(g.name, g.blob, g.mime);
      toast('PDF listo');
    } catch (e) {
      toast(`No se pudo generar: ${errorText(e)}`, 'fail');
    } finally {
      setBusy(false);
    }
  };

  /* ---------------- vistas ---------------- */

  if (done) {
    return (
      <Page title="Importar datos" back>
        <div className="card rp-done">
          <div className="rp-done-icon">
            <CheckCircle2 size={34} />
          </div>
          <h2>Datos importados</h2>
          <p className="muted">
            {importLabel(done.points, done.runs.length)} agregados a{' '}
            <strong>{project?.name ?? 'el proyecto'}</strong>.
          </p>
        </div>
        <div className="stack">
          {done.runs.length > 0 && (
            <button className="btn primary lg block" disabled={busy} onClick={reportNow}>
              {busy ? <Spinner /> : <FileDown size={20} />} Generar informe PDF
            </button>
          )}
          {done.runs.map((r) => (
            <button
              key={r.id}
              className="btn ghost lg block"
              onClick={() => go('level-run', { runId: r.id }, 'leveling')}
            >
              <BookOpenCheck size={20} /> Ver libreta «{r.name}»
            </button>
          ))}
          {done.points > 0 && (
            <button
              className={`btn lg block ${done.runs.length ? 'ghost' : 'primary'}`}
              onClick={() => {
                useNav.getState().resetTab('points');
                useNav.getState().setTab('points');
              }}
            >
              <MapPinned size={20} /> Ver puntos
            </button>
          )}
          {done.points > 0 && done.runs.length === 0 && (
            <button className="btn ghost lg block" disabled={busy} onClick={reportNow}>
              {busy ? <Spinner /> : <FileDown size={20} />} Cuadro de puntos en PDF
            </button>
          )}
          <button className="btn ghost lg block" onClick={reset}>
            <RotateCcw size={20} /> Importar otro archivo
          </button>
        </div>
      </Page>
    );
  }

  const reviewing = sources.length > 0 || projectFile;

  return (
    <Page title="Importar datos" subtitle={project ? `a ${project.name}` : 'Se creará un proyecto nuevo'} back>
      {!reviewing && (
        <>
          <div
            className={`drop-zone rp-drop${over ? ' over' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => void pickFiles(IMPORT_ACCEPT, true).then(readFiles)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && void pickFiles(IMPORT_ACCEPT, true).then(readFiles)}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={onDrop}
          >
            <div className="rp-drop-icon">
              <Upload size={30} />
            </div>
            <strong>Toca para elegir archivos</strong>
            <span className="muted small rp-desktop-only">o arrástralos aquí</span>
            <span className="faint xs">GSI · DiNi .dat · SDR · Topcon · NMEA · CSV/TXT · respaldo .topo.json</span>
          </div>

          {paste === null ? (
            <button className="btn ghost lg block" onClick={() => setPaste('')}>
              <ClipboardPaste size={20} /> Pegar texto (desde Excel o WhatsApp)
            </button>
          ) : (
            <div className="card stack">
              <div className="row-between">
                <strong>Pegar texto</strong>
                <button className="icon-btn" aria-label="Cerrar" onClick={() => setPaste(null)}>
                  <X size={20} />
                </button>
              </div>
              <textarea
                className="input rp-textarea"
                value={paste}
                autoFocus
                spellCheck={false}
                placeholder={'1,8667310.000,279420.000,152.400,EJE\n2,8667309.520,279420.480,152.310,TN\n…'}
                onChange={(e) => setPaste(e.target.value)}
              />
              <button
                className="btn primary lg block"
                disabled={!paste.trim()}
                onClick={() => loadTexts([{ name: 'Texto pegado', text: paste }])}
              >
                Interpretar texto
              </button>
            </div>
          )}

          <FormatsHelp />
        </>
      )}

      {projectFile && (
        <div className="card stack">
          <div className="rp-detect">
            <div className="rp-card-icon tone-info">
              <FolderInput size={22} />
            </div>
            <div className="grow" style={{ minWidth: 0 }}>
              <span className="xs faint rp-upper">Respaldo de proyecto</span>
              <strong className="rp-ellipsis">{projectFile.name}</strong>
            </div>
          </div>
          {projectFile.error ? (
            <p className="c-fail">
              <AlertTriangle size={16} /> {projectFile.error}
            </p>
          ) : (
            projectFile.project && (
              <>
                <div className="grid-3">
                  <MiniStat label="Libretas" value={projectFile.project.levelRuns.length} />
                  <MiniStat label="Puntos" value={projectFile.project.points.length} />
                  <MiniStat label="Capas" value={projectFile.project.layerControls.length} />
                </div>
                <p className="muted small">
                  Se agregará como proyecto nuevo «{projectFile.project.name}» y quedará activo. Tus proyectos actuales no
                  se modifican.
                </p>
                <button className="btn primary lg block" onClick={doImportProject}>
                  <FolderInput size={20} /> Importar proyecto
                </button>
              </>
            )
          )}
          <button className="btn ghost block" onClick={reset}>
            Elegir otro archivo
          </button>
        </div>
      )}

      {sources.length > 0 && (
        <>
          {parsed.map((p, i) => (
            <div key={i} className="card stack">
              <div className="rp-detect">
                <div className={`rp-card-icon ${p.src.detected === 'unknown' ? 'tone-warn' : 'tone-ok'}`}>
                  {p.src.detected === 'unknown' ? <AlertTriangle size={22} /> : <CheckCircle2 size={22} />}
                </div>
                <div className="grow" style={{ minWidth: 0 }}>
                  <span className="xs faint rp-upper">
                    {p.src.detected === 'unknown' ? 'Formato no reconocido' : 'Formato detectado'}
                  </span>
                  <strong>
                    {FORMAT_LABEL[p.src.detected === 'unknown' ? p.src.format : p.src.detected]}
                    <span className="muted rp-hint-inline"> ({FORMAT_HINT[p.src.format]})</span>
                  </strong>
                  <span className="faint xs rp-ellipsis">{p.src.name}</span>
                </div>
              </div>
              <Select
                label="¿No es correcto? Elige el formato"
                value={p.src.format}
                options={FORMAT_OPTIONS}
                onChange={(v) => setSources((s) => s.map((x, j) => (j === i ? { ...x, format: v } : x)))}
              />
              {p.error && (
                <p className="c-fail small">
                  <AlertTriangle size={14} /> {p.error}
                </p>
              )}
              {p.result && (
                <div className="rp-chips-row">
                  <span className="badge info">{plural(p.result.points.length, 'punto', 'puntos')}</span>
                  <span className="badge info">{plural(p.result.levelRuns.length, 'libreta', 'libretas')}</span>
                  {p.result.warnings.length > 0 && (
                    <span className="badge warn">{plural(p.result.warnings.length, 'aviso', 'avisos')}</span>
                  )}
                </div>
              )}
            </div>
          ))}

          {anyCsv && (
            <div className="card stack">
              <h3 className="rp-h3">Columnas del CSV</h3>
              <Field label="Orden de columnas" hint="P = punto, E = Este, N = Norte, Z = cota, D = descripción/código">
                <Chips
                  value={order}
                  options={ORDERS.map((o) => ({ value: o, label: o === 'auto' ? 'Auto' : o }))}
                  onChange={setOrder}
                />
              </Field>
              <Field label="Separador">
                <Chips value={delim} options={DELIMS} onChange={setDelim} />
              </Field>
              <Field label="Primera fila">
                <Chips
                  value={hasHeader === 'auto' ? 'auto' : hasHeader ? 'yes' : 'no'}
                  options={[
                    { value: 'auto', label: 'Auto' },
                    { value: 'yes', label: 'Es encabezado' },
                    { value: 'no', label: 'Son datos' },
                  ]}
                  onChange={(v) => setHasHeader(v === 'auto' ? 'auto' : v === 'yes')}
                />
              </Field>
            </div>
          )}

          {nPts > 0 && <PointsPreview result={merged} />}

          {parsed.flatMap((p) => p.result?.levelRuns ?? []).map((orig) => {
            const ov = effectiveOv(orig, runOv[orig.id], project);
            return (
              <RunPreview
                key={orig.id}
                orig={orig}
                run={applyOv(orig, ov)}
                ov={ov}
                onChange={(patch) => setRunOv((o) => ({ ...o, [orig.id]: { ...ov, ...patch } }))}
              />
            );
          })}

          {merged.warnings.length > 0 && (
            <details className="card rp-warnings" open={merged.warnings.length <= 4}>
              <summary>
                <AlertTriangle size={18} /> {plural(merged.warnings.length, 'aviso', 'avisos')} al leer el archivo
              </summary>
              <ul>
                {merged.warnings.slice(0, 60).map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
                {merged.warnings.length > 60 && <li>… y {merged.warnings.length - 60} más</li>}
              </ul>
            </details>
          )}

          <div className="rp-sticky">
            <button className="btn ghost lg" onClick={reset} aria-label="Cancelar">
              <X size={20} />
            </button>
            <button className="btn primary lg grow" disabled={nPts + nRuns === 0} onClick={doImport}>
              <FileUp size={20} />
              {nPts + nRuns === 0 ? 'Nada que importar' : `Importar ${importLabel(nPts, nRuns)}`}
            </button>
          </div>
        </>
      )}
    </Page>
  );
}

/* ------------------------------------------------------------------ */
/* Piezas                                                              */
/* ------------------------------------------------------------------ */

interface RunOv {
  startElev?: number;
  closure?: LevelClosure;
  endName?: string;
  endElev?: number;
}

function lastPoint(run: LevelRun): string {
  const fsObs = run.observations.filter((o) => o.kind === 'FS');
  return fsObs[fsObs.length - 1]?.pointName ?? '';
}

/**
 * Los archivos de nivel no indican el tipo de cierre: se sugiere circuito si
 * termina en el BM de partida, o BM conocido si termina en un BM del proyecto.
 */
function effectiveOv(run: LevelRun, ov: RunOv | undefined, project: Project | null): RunOv {
  if (ov) return ov;
  if (run.closure !== 'open') return {};
  const last = lastPoint(run).trim().toLowerCase();
  if (!last) return {};
  if (last === run.startBM.name.trim().toLowerCase()) return { closure: 'loop' };
  const bm = project?.benchmarks.find((b) => b.name.trim().toLowerCase() === last);
  if (bm) return { closure: 'known-bm', endName: bm.name, endElev: bm.elevation };
  return {};
}

function applyOv(run: LevelRun, ov: RunOv): LevelRun {
  let r = run;
  if (ov.startElev !== undefined) r = { ...r, startBM: { ...r.startBM, elevation: ov.startElev } };
  if (ov.closure === 'loop' || ov.closure === 'open') r = { ...r, closure: ov.closure, endBM: undefined };
  if (ov.closure === 'known-bm' && ov.endElev !== undefined) {
    r = { ...r, closure: 'known-bm', endBM: { name: ov.endName ?? lastPoint(run), elevation: ov.endElev } };
  }
  return r;
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

function importLabel(nPts: number, nRuns: number) {
  const parts: string[] = [];
  if (nPts) parts.push(plural(nPts, 'punto', 'puntos'));
  if (nRuns) parts.push(plural(nRuns, 'libreta', 'libretas'));
  return parts.join(' / ');
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="kpi">
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
    </div>
  );
}

function PointsPreview({ result }: { result: ImportResult }) {
  const dec = useStore((s) => s.settings.decimals);
  const rows = result.points.slice(0, 8);
  return (
    <div className="card flush">
      <div className="rp-table-head">
        <h3 className="rp-h3">
          <MapPinned size={18} /> Vista previa de puntos
        </h3>
        <span className="muted small">
          {rows.length} de {result.points.length}
        </span>
      </div>
      <div className="table-wrap rp-table-flat">
        <table className="table">
          <thead>
            <tr>
              <th className="text left">Punto</th>
              <th>Este</th>
              <th>Norte</th>
              <th>Cota</th>
              <th className="text left">Código</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td className="text left">{p.name}</td>
                <td>{f(p.x, dec)}</td>
                <td>{f(p.y, dec)}</td>
                <td>{f(p.z, dec)}</td>
                <td className="text left">{p.code ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RunPreview({
  orig,
  run,
  ov,
  onChange,
}: {
  orig: LevelRun;
  run: LevelRun;
  ov: RunOv;
  onChange: (patch: RunOv) => void;
}) {
  const res = useMemo(() => computeLevelRun(run), [run]);
  const cl = res.closure;
  const status = cl.passes === undefined ? 'pending' : cl.passes ? 'ok' : 'fail';
  const unknownBM = !Number.isFinite(orig.startBM.elevation) || orig.startBM.elevation === 0;
  const closure = ov.closure ?? orig.closure;
  const endName = ov.endName ?? lastPoint(orig);
  return (
    <div className="card stack">
      <div className="row-between" style={{ alignItems: 'flex-start' }}>
        <div className="rp-detect" style={{ minWidth: 0 }}>
          <div className="rp-card-icon tone-brand">
            <BookOpenCheck size={22} />
          </div>
          <div style={{ minWidth: 0 }}>
            <strong className="rp-ellipsis">{run.name}</strong>
            <span className="muted small">
              {run.observations.length} obs. · {cl.setups} estaciones · {f(res.checks.sumBackDist + res.checks.sumForeDist, 0)} m
            </span>
          </div>
        </div>
        <StatusBadge status={status} label={status === 'pending' ? 'Sin cierre' : undefined} />
      </div>
      <div className="grid-3">
        <div className="kpi">
          <span className="kpi-label">BM inicial</span>
          <span className="kpi-value rp-kpi-sm">{run.startBM.name || '—'}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Cierre</span>
          <span className={`kpi-value rp-kpi-sm ${status === 'ok' ? 'c-ok' : status === 'fail' ? 'c-fail' : ''}`}>
            {cl.misclosureMm === undefined ? '—' : `${fs(cl.misclosureMm, 1)}`}
            {cl.misclosureMm !== undefined && <small>mm</small>}
          </span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Tolerancia</span>
          <span className="kpi-value rp-kpi-sm">
            {cl.toleranceMm === undefined ? '—' : `±${f(cl.toleranceMm, 1)}`}
            {cl.toleranceMm !== undefined && <small>mm</small>}
          </span>
        </div>
      </div>
      {(unknownBM || ov.startElev !== undefined) && (
        <NumberInput
          label={`Cota del BM inicial ${orig.startBM.name}`}
          value={ov.startElev}
          onChange={(v) => onChange({ startElev: v })}
          suffix="m"
          placeholder="Ej. 152.315"
          hint="El archivo no trae la cota de partida; ingrésala para obtener cotas reales."
        />
      )}
      <Field label="Control de cierre">
        <Chips
          value={closure}
          onChange={(v) => onChange({ closure: v })}
          options={[
            { value: 'open', label: 'Abierta' },
            { value: 'loop', label: 'Circuito' },
            { value: 'known-bm', label: 'A BM conocido' },
          ]}
        />
      </Field>
      {closure === 'known-bm' && (
        <div className="grid-2">
          <TextInput label="BM de llegada" value={endName} onChange={(v) => onChange({ endName: v })} />
          <NumberInput
            label="Cota conocida"
            value={ov.endElev}
            onChange={(v) => onChange({ endElev: v })}
            suffix="m"
            placeholder="Ej. 154.062"
          />
        </div>
      )}
      {res.issues.length > 0 && (
        <ul className="rp-issues">
          {res.issues.slice(0, 4).map((x, i) => (
            <li key={i}>
              <AlertTriangle size={14} /> {x}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

