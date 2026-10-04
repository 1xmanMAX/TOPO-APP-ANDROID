import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Download, FileSpreadsheet, RefreshCw, Share2 } from 'lucide-react';
import type { ScreenProps } from '@/app/feature';
import { useNav } from '@/app/nav';
import { useProject, useStore } from '@/app/store';
import { isNative, saveFile } from '@/app/platform';
import type { Project } from '@/core/types';
import { Chips, EmptyState, Kpi, Select, StatusBadge, toast } from '@/ui/kit';
import { dateShort, f, fs, station } from '@/ui/format';
import {
  bookRows,
  layerReports,
  layerVerdict,
  naturalCompare,
  pointsByCode,
  projectKpis,
  runReport,
  STATUS_TEXT,
  VERDICT_TEXT,
} from '@/report/data';
import { errorText, generateReport, KIND_TITLE, shareFile, useReportHeader, type ReportKind } from './shared';
import { Spinner } from './Spinner';
import { Page } from './Page';

type PreviewKind = Exclude<ReportKind, 'project'>;

function useWide() {
  const q = '(min-width: 900px)';
  const [wide, setWide] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
}

export function ReportScreen({ params }: ScreenProps) {
  const project = useProject();
  const header = useReportHeader();
  const kind = (params.kind as PreviewKind) ?? 'summary';
  const [id, setId] = useState<string | undefined>(params.id as string | undefined);
  const [layerId, setLayerId] = useState<string>('');
  const [pdf, setPdf] = useState<{ blob: Blob; name: string; url: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<'xlsx' | null>(null);
  const [nonce, setNonce] = useState(0);
  const wide = useWide();
  const showFrame = wide && !isNative();

  const list = kind === 'level' ? project?.levelRuns ?? [] : kind === 'layer' ? project?.layerControls ?? [] : [];
  const curId = kind === 'level' || kind === 'layer' ? (list.find((x) => x.id === id) ?? list[0])?.id : undefined;

  useEffect(() => {
    if (!project) return;
    let alive = true;
    let url = '';
    setPdf(null);
    setErr(null);
    generateReport(project, kind, 'pdf', header, { id: curId, layerId: layerId || undefined })
      .then((g) => {
        if (!alive) return;
        url = URL.createObjectURL(g.blob);
        setPdf({ blob: g.blob, name: g.name, url });
      })
      .catch((e) => alive && setErr(errorText(e)));
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
    // Regenera si cambia el proyecto, la selección o el membrete.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, kind, curId, layerId, header.company, header.engineer, header.cip, header.decimals, nonce]);

  if (!project) {
    return (
      <Page title="Vista previa" back>
        <EmptyState icon={<AlertTriangle size={34} />} title="Sin proyecto activo" />
      </Page>
    );
  }

  const excel = async () => {
    setBusy('xlsx');
    try {
      const g = await generateReport(project, kind, 'xlsx', header, { id: curId });
      await saveFile(g.name, g.blob, g.mime);
      toast('Excel listo');
    } catch (e) {
      toast(`No se pudo generar: ${errorText(e)}`, 'fail');
    } finally {
      setBusy(null);
    }
  };

  const control = kind === 'layer' ? project.layerControls.find((c) => c.id === curId) : undefined;

  return (
    <Page title={KIND_TITLE[kind]} subtitle={project.name} back wide={showFrame}>
      {(kind === 'level' || kind === 'layer') && list.length > 1 && (
        <Select
          label={kind === 'level' ? 'Libreta' : 'Control de capas'}
          value={curId ?? ''}
          onChange={(v) => {
            setId(v);
            setLayerId('');
            useNav.getState().replace({ name: 'report', params: { kind, id: v } });
          }}
          options={list.map((x) => ({ value: x.id, label: x.name }))}
        />
      )}
      {control && control.layers.length > 1 && (
        <Chips
          value={layerId}
          onChange={setLayerId}
          options={[{ value: '', label: 'Todas las capas' }, ...control.layers.map((l) => ({ value: l.id, label: l.name }))]}
        />
      )}

      <div className="rp-actions">
        <button className="btn primary lg" disabled={!pdf} onClick={() => pdf && saveFile(pdf.name, pdf.blob, 'application/pdf')}>
          {pdf ? <Download size={20} /> : <Spinner />} Descargar PDF
        </button>
        <button
          className="btn ghost lg"
          disabled={!pdf}
          onClick={() => pdf && void shareFile(pdf.name, pdf.blob, 'application/pdf')}
        >
          <Share2 size={20} /> Compartir
        </button>
        <button className="btn ghost lg" disabled={busy !== null} onClick={excel}>
          {busy ? <Spinner /> : <FileSpreadsheet size={20} />} Excel
        </button>
      </div>

      {err && (
        <div className="card rp-error">
          <AlertTriangle size={20} />
          <span className="grow">No se pudo generar el PDF: {err}</span>
          <button className="btn sm ghost" onClick={() => setNonce((n) => n + 1)}>
            <RefreshCw size={16} /> Reintentar
          </button>
        </div>
      )}

      <div className={showFrame ? 'rp-preview-split' : 'stack'}>
        <div className="stack" style={{ minWidth: 0 }}>
          {kind === 'level' && curId && <LevelSummary project={project} runId={curId} />}
          {kind === 'layer' && curId && <LayerSummaryView project={project} controlId={curId} layerId={layerId} />}
          {kind === 'points' && <PointsSummary project={project} />}
          {kind === 'summary' && <ProjectSummary project={project} />}
          {pdf && <p className="faint xs">Archivo: {pdf.name}</p>}
        </div>
        {showFrame && (
          <div className="rp-frame-wrap">
            {pdf ? (
              <iframe className="rp-frame" src={pdf.url} title="Vista previa del PDF" />
            ) : (
              <div className="rp-frame-loading">{err ? <AlertTriangle size={28} /> : <Spinner size={28} />}</div>
            )}
          </div>
        )}
      </div>
    </Page>
  );
}

/* ------------------------------------------------------------------ */
/* Resúmenes HTML (el visor PDF no funciona dentro del WebView)         */
/* ------------------------------------------------------------------ */

function useDec() {
  return useStore((s) => s.settings.decimals);
}

function LevelSummary({ project, runId }: { project: Project; runId: string }) {
  const dec = useDec();
  const run = project.levelRuns.find((r) => r.id === runId);
  const rep = useMemo(() => (run ? runReport(run) : null), [run]);
  if (!run || !rep) return null;
  const rows = bookRows(run, rep.result);
  const s = rep.summary;
  const tone = rep.verdict === 'pass' ? 'ok' : rep.verdict === 'fail' ? 'fail' : undefined;
  return (
    <>
      <div className="card rp-verdict">
        <div className="row-between">
          <div style={{ minWidth: 0 }}>
            <strong className="rp-ellipsis">{run.name}</strong>
            <span className="muted small">
              {dateShort(run.date)} · {s.nSetups} estaciones · {f(s.lengthM, 0)} m
            </span>
          </div>
          <StatusBadge
            status={rep.verdict === 'pass' ? 'ok' : rep.verdict === 'fail' ? 'fail' : 'pending'}
            label={VERDICT_TEXT[rep.verdict]}
          />
        </div>
        <p className="small">{s.verdict}</p>
      </div>
      <div className="grid-3">
        <Kpi label="Cierre" value={s.misclosureMm === undefined ? '—' : fs(s.misclosureMm, 1)} unit="mm" tone={tone} />
        <Kpi label="Tolerancia" value={s.toleranceMm === undefined ? '—' : `±${f(s.toleranceMm, 1)}`} unit="mm" />
        <Kpi label="Puntos" value={s.nPoints} />
      </div>
      <div className="card flush">
        <div className="table-wrap rp-table-flat">
          <table className="table">
            <thead>
              <tr>
                <th className="text left">Punto</th>
                <th>V. atrás</th>
                <th>V. inter.</th>
                <th>V. adel.</th>
                <th>Cota comp.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className={r.turning ? 'tp' : undefined}>
                  <td className="text left">
                    {r.isBM ? <strong>{r.point}</strong> : r.point}
                  </td>
                  <td>{r.bs === undefined ? '' : f(r.bs, dec)}</td>
                  <td>{r.is === undefined ? '' : f(r.is, dec)}</td>
                  <td>{r.fs === undefined ? '' : f(r.fs, dec)}</td>
                  <td>
                    <strong>{f(r.adjusted ?? r.elevation, dec)}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="small muted">
        Comprobación: ΣV.atrás − ΣV.adel. = {fs(rep.result.checks.sumBS - rep.result.checks.sumFS, dec)} m ·{' '}
        {rep.result.checks.arithmeticOk ? 'aritmética correcta' : 'revisar aritmética'}
      </p>
    </>
  );
}

function LayerSummaryView({ project, controlId, layerId }: { project: Project; controlId: string; layerId: string }) {
  const dec = useDec();
  const control = project.layerControls.find((c) => c.id === controlId);
  const reps = useMemo(() => (control ? layerReports(control) : []), [control]);
  if (!control) return null;
  const shown = layerId ? reps.filter((r) => r.layer.id === layerId) : reps;
  const detail = layerId ? shown[0] : undefined;
  return (
    <>
      <div className="card flush">
        <div className="table-wrap rp-table-flat">
          <table className="table">
            <thead>
              <tr>
                <th className="text left">Capa</th>
                <th>Medidos</th>
                <th>% conf.</th>
                <th>Desv. máx</th>
                <th className="text left">Estado</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const v = layerVerdict(r.summary);
                const mx = Math.abs(r.summary.maxHigh) > Math.abs(r.summary.maxLow) ? r.summary.maxHigh : r.summary.maxLow;
                return (
                  <tr key={r.layer.id}>
                    <td className="text left">{r.layer.name}</td>
                    <td>
                      {r.summary.measured}/{r.summary.total}
                    </td>
                    <td>{r.summary.measured ? f(r.summary.pctOk, 0) : '—'}</td>
                    <td>{r.summary.measured ? `${fs(mx * 1000, 0)} mm` : '—'}</td>
                    <td className="text left">
                      <StatusBadge status={v} label={STATUS_TEXT[v]} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {detail && (
        <div className="card flush">
          <div className="table-wrap rp-table-flat">
            <table className="table">
              <thead>
                <tr>
                  <th>Prog.</th>
                  <th>Desplaz.</th>
                  <th>Proyecto</th>
                  <th>Medida</th>
                  <th>Desv. mm</th>
                </tr>
              </thead>
              <tbody>
                {detail.checks.map((c) => (
                  <tr key={c.pointId}>
                    <td>{station(c.station)}</td>
                    <td>{fs(c.offset, 2)}</td>
                    <td>{f(c.design, dec)}</td>
                    <td>{f(c.measured, dec)}</td>
                    <td className={c.status === 'ok' ? 'c-ok' : c.status === 'warn' ? 'c-warn' : c.status === 'fail' ? 'c-fail' : ''}>
                      {c.deviation === undefined ? '—' : fs(c.deviation * 1000, 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

function PointsSummary({ project }: { project: Project }) {
  const dec = useDec();
  const bms = [...project.benchmarks].sort((a, b) => naturalCompare(a.name, b.name));
  const pts = [...project.points].sort((a, b) => naturalCompare(a.name, b.name));
  const MAX = 60;
  return (
    <>
      <div className="grid-3">
        <Kpi label="BMs" value={bms.length} />
        <Kpi label="Puntos" value={pts.length} />
        <Kpi label="Códigos" value={pointsByCode(project).length} />
      </div>
      {bms.length > 0 && (
        <div className="card flush">
          <h3 className="rp-table-title">Bancos de nivel</h3>
          <div className="table-wrap rp-table-flat">
            <table className="table">
              <thead>
                <tr>
                  <th className="text left">BM</th>
                  <th>Cota</th>
                  <th>Este</th>
                  <th>Norte</th>
                </tr>
              </thead>
              <tbody>
                {bms.map((b) => (
                  <tr key={b.id}>
                    <td className="text left">
                      <strong>{b.name}</strong>
                    </td>
                    <td>{f(b.elevation, dec)}</td>
                    <td>{f(b.x, dec)}</td>
                    <td>{f(b.y, dec)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {pts.length > 0 && (
        <div className="card flush">
          <h3 className="rp-table-title">
            Puntos {pts.length > MAX && <span className="muted small">(primeros {MAX} de {pts.length})</span>}
          </h3>
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
                {pts.slice(0, MAX).map((p) => (
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
      )}
    </>
  );
}

function ProjectSummary({ project }: { project: Project }) {
  const k = useMemo(() => projectKpis(project), [project]);
  const runs = useMemo(() => project.levelRuns.map(runReport), [project]);
  return (
    <>
      <div className="grid-2">
        <Kpi
          label="Libretas conformes"
          value={k.pctRunsOk === undefined ? '—' : `${f(k.pctRunsOk, 0)}%`}
          sub={`${k.nPass} de ${k.nClosed} con cierre`}
          tone={k.pctRunsOk === undefined ? undefined : k.pctRunsOk >= 100 ? 'ok' : 'warn'}
        />
        <Kpi
          label="Capas conformes"
          value={k.pctLayersOk === undefined ? '—' : `${f(k.pctLayersOk, 0)}%`}
          sub={`${k.nLayersOk} de ${k.nLayersMeasured} medidas`}
          tone={k.pctLayersOk === undefined ? undefined : k.pctLayersOk >= 100 ? 'ok' : 'warn'}
        />
        <Kpi label="Puntos" value={k.nPoints} sub={`${k.nBMs} BM`} />
        <Kpi
          label="Puntos de control OK"
          value={k.pctPointsOk === undefined ? '—' : `${f(k.pctPointsOk, 0)}%`}
          sub="todas las capas"
        />
      </div>
      {runs.length > 0 && (
        <div className="card flush">
          <h3 className="rp-table-title">Cierres de nivelación</h3>
          <div className="table-wrap rp-table-flat">
            <table className="table">
              <thead>
                <tr>
                  <th className="text left">Libreta</th>
                  <th>Error mm</th>
                  <th>Tol. mm</th>
                  <th className="text left">Estado</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.run.id}>
                    <td className="text left">{r.run.name}</td>
                    <td>{r.summary.misclosureMm === undefined ? '—' : fs(r.summary.misclosureMm, 1)}</td>
                    <td>{r.summary.toleranceMm === undefined ? '—' : f(r.summary.toleranceMm, 1)}</td>
                    <td className="text left">
                      <StatusBadge
                        status={r.verdict === 'pass' ? 'ok' : r.verdict === 'fail' ? 'fail' : 'pending'}
                        label={VERDICT_TEXT[r.verdict]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
