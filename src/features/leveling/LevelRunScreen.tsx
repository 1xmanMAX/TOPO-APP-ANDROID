/** 'level-run' — resultado de una nivelación: cierre, libreta, perfil y comprobación. */
import { useMemo, useState, type ReactNode } from 'react';
import { Copy, FileDown, FileSpreadsheet, FileText, MoreVertical, PenLine, Pencil, Trash2, AlertTriangle, CircleCheck, CircleX, Info } from 'lucide-react';
import type { ScreenProps } from '@/app/feature';
import { go, useNav } from '@/app/nav';
import { useStore } from '@/app/store';
import type { LevelRow, LevelRun, LevelRunResult, Project } from '@/core/types';
import { ORDER_LABEL, computeLevelRun, levelRunSummary, profileFromRun, toleranceLengthKm } from '@/core/leveling';
import { Kpi, ListItem, Screen, Segmented, Sheet, StatusBadge, confirmDialog, toast } from '@/ui/kit';
import { dateShort, f, fs } from '@/ui/format';
import { ProfileChart, type ProfileDatum } from '@/ui/charts/ProfileChart';
import {
  CLOSURE_LABEL,
  ClosureMeter,
  KV,
  METHOD_LABEL,
  NoProject,
  NotFound,
  STATUS_ICON,
  STATUS_TITLE,
  closureStatus,
  statusColor,
  toleranceFormula,
  useRun,
} from './shared';
import { exportRunCsv, exportRunPdf, exportRunXlsx } from './exports';

type Tab = 'book' | 'profile' | 'check';

export function LevelRunScreen({ params }: ScreenProps) {
  const { project, run } = useRun(params.runId as string);
  if (!project) return <NoProject back />;
  if (!run) return <NotFound />;
  return <RunView project={project} run={run} />;
}

function RunView({ project, run }: { project: Project; run: LevelRun }) {
  const result = useMemo(() => computeLevelRun(run), [run]);
  const summary = useMemo(() => levelRunSummary(run, result), [run, result]);
  const [tab, setTab] = useState<Tab>(() => {
    try {
      return (localStorage.getItem('lv-run-tab') as Tab) || 'book';
    } catch {
      return 'book';
    }
  });
  const [more, setMore] = useState(false);
  const status = closureStatus(result);
  const { closure } = result;
  const Icon = STATUS_ICON[status];

  const pickTab = (t: Tab) => {
    setTab(t);
    try {
      localStorage.setItem('lv-run-tab', t);
    } catch {
      /* sin almacenamiento */
    }
  };

  const del = async () => {
    setMore(false);
    const ok = await confirmDialog({
      title: 'Eliminar nivelación',
      text: `Se eliminará "${run.name}" con sus ${run.observations.length} lecturas. Esta acción no se puede deshacer.`,
      okLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    useStore.getState().deleteLevelRun(run.id);
    useNav.getState().back();
    toast('Nivelación eliminada');
  };

  const verdictTitle = run.observations.length === 0 ? 'Sin observaciones' : status === 'pending' ? (run.closure === 'open' ? 'Nivelación abierta' : 'Cierre pendiente') : STATUS_TITLE[status];
  const verdictSub =
    status === 'pending'
      ? run.closure === 'open'
        ? 'Sin control de cierre: las cotas no se compensan.'
        : run.observations.length === 0
          ? 'Empieza la captura para ver el cierre.'
          : `Falta llegar a ${run.closure === 'loop' ? run.startBM.name : run.endBM?.name ?? 'BM'} con una vista adelante.`
      : null;

  return (
    <Screen
      title={run.name}
      subtitle={`${dateShort(run.date)} · ${METHOD_LABEL[run.method]} · ${CLOSURE_LABEL[run.closure]}`}
      back
      wide
      actions={
        <>
          <button className="icon-btn" aria-label="Continuar captura" title="Continuar captura" onClick={() => go('level-entry', { runId: run.id })}>
            <PenLine size={21} />
          </button>
          <button className="icon-btn" aria-label="Informe PDF" title="Informe PDF" onClick={() => exportRunPdf(project, run.id)}>
            <FileDown size={21} />
          </button>
          <button className="icon-btn" aria-label="Más acciones" onClick={() => setMore(true)}>
            <MoreVertical size={21} />
          </button>
        </>
      }
    >
      <div className="stack-l">
        <div className={`lv-verdict s-${status}`}>
          <div className="lv-verdict-icon">
            <Icon size={30} strokeWidth={2.2} />
          </div>
          <div className="grow stack" style={{ gap: 6 }}>
            <h2>{verdictTitle}</h2>
            {closure.misclosureMm !== undefined && closure.toleranceMm !== undefined ? (
              <>
                <div className="lv-verdict-nums">
                  <span>
                    Error <b className="num">{fs(closure.misclosureMm, 1)} mm</b>
                  </span>
                  <span>
                    Tolerancia <b className="num">±{f(closure.toleranceMm, 1)} mm</b>
                  </span>
                  <span className="faint">{closure.ratio !== undefined ? `${(closure.ratio * 100).toFixed(0)} % de T` : ''}</span>
                </div>
                <ClosureMeter ratio={closure.ratio} status={status} />
              </>
            ) : (
              verdictSub && <p className="small muted">{verdictSub}</p>
            )}
          </div>
        </div>

        <div className="grid-auto lv-kpis">
          <Kpi label="Longitud" value={summary.lengthM > 0 ? summary.lengthM.toFixed(1) : '—'} unit="m" sub={summary.lengthM > 0 ? `${(summary.lengthM / 1000).toFixed(3)} km` : 'sin distancias'} />
          <Kpi label="Estaciones" value={summary.nSetups} sub={`${run.observations.length} lecturas`} />
          <Kpi label="Puntos" value={summary.nPoints} sub={summary.minElevation !== undefined ? `${f(summary.minElevation, 2)} – ${f(summary.maxElevation, 2)} m` : undefined} />
          <Kpi
            label="Desbalance"
            value={summary.lengthM > 0 ? fs(summary.distanceImbalanceM, 1) : '—'}
            unit="m"
            tone={Math.abs(summary.distanceImbalanceM) > 10 ? 'warn' : undefined}
            sub="atrás − adelante"
          />
        </div>

        <Segmented<Tab>
          value={tab}
          onChange={pickTab}
          options={[
            { value: 'book', label: 'Libreta' },
            { value: 'profile', label: 'Perfil' },
            { value: 'check', label: 'Comprobación' },
          ]}
        />

        {tab === 'book' && <Book run={run} result={result} />}
        {tab === 'profile' && <Profile run={run} result={result} />}
        {tab === 'check' && <Check run={run} result={result} status={status} />}

        {run.observations.length > 0 && tab !== 'check' && result.issues.length > 0 && (
          <button className="lv-issues-link" onClick={() => pickTab('check')}>
            <AlertTriangle size={16} /> {result.issues.length} {result.issues.length === 1 ? 'incidencia' : 'incidencias'} en los datos · ver comprobación
          </button>
        )}

        <div className="grid-2">
          <button className="btn ghost lg" onClick={() => go('level-entry', { runId: run.id })}>
            <PenLine size={20} /> Continuar captura
          </button>
          <button className="btn primary lg" onClick={() => exportRunPdf(project, run.id)}>
            <FileDown size={20} /> Informe PDF
          </button>
        </div>
      </div>

      <Sheet open={more} title="Acciones" onClose={() => setMore(false)}>
        <div className="card flush">
          <div className="list">
            <ListItem icon={<PenLine size={20} />} title="Continuar captura" sub="Añadir lecturas a esta libreta" onClick={() => { setMore(false); go('level-entry', { runId: run.id }); }} />
            <ListItem icon={<Pencil size={20} />} title="Editar datos" sub="Nombre, BM, cierre, clase, método" onClick={() => { setMore(false); go('level-edit', { runId: run.id }); }} />
            <ListItem icon={<FileText size={20} />} tone="fail" title="Informe PDF" sub="Libreta, cierre, perfil y firma" onClick={() => { setMore(false); exportRunPdf(project, run.id); }} />
            <ListItem icon={<FileSpreadsheet size={20} />} tone="ok" title="Excel (.xlsx)" sub="Libreta calculada con fórmulas" onClick={() => { setMore(false); exportRunXlsx(project, run.id); }} />
            <ListItem icon={<FileDown size={20} />} tone="info" title="CSV" sub="Observaciones en texto plano" onClick={() => { setMore(false); exportRunCsv(project, run.id); }} />
            <ListItem
              icon={<Copy size={20} />}
              tone="accent"
              title="Duplicar"
              sub="Copia con todas las lecturas"
              onClick={() => {
                setMore(false);
                const id = useStore.getState().duplicateLevelRun(run.id);
                if (id) {
                  toast('Nivelación duplicada');
                  useNav.getState().replace({ name: 'level-run', params: { runId: id } });
                }
              }}
            />
            <ListItem icon={<Trash2 size={20} />} tone="fail" title="Eliminar" sub="No se puede deshacer" onClick={del} />
          </div>
        </div>
      </Sheet>
    </Screen>
  );
}

/* ------------------------------------------------------------------ */
/* Libreta                                                             */
/* ------------------------------------------------------------------ */

interface BookLine {
  key: string;
  name: string;
  bs?: LevelRow;
  main?: LevelRow; // IS o FS
  tp: boolean;
}

function bookLines(rows: LevelRow[]): BookLine[] {
  const out: BookLine[] = [];
  rows.forEach((r) => {
    const prev = out[out.length - 1];
    if (r.kind === 'BS' && prev && prev.main?.kind === 'FS' && !prev.bs) {
      prev.bs = r;
      prev.tp = true;
      if (prev.name !== r.pointName) prev.name = `${prev.name} / ${r.pointName}`;
      return;
    }
    out.push(r.kind === 'BS' ? { key: r.obsId, name: r.pointName, bs: r, tp: false } : { key: r.obsId, name: r.pointName, main: r, tp: false });
  });
  return out;
}

function Book({ run, result }: { run: LevelRun; result: LevelRunResult }) {
  const lines = useMemo(() => bookLines(result.rows), [result.rows]);
  const hi = run.method === 'HI';
  const anyDesign = result.rows.some((r) => r.designElevation !== undefined);
  const anyDist = result.rows.some((r) => r.distance !== undefined);
  const adjusted = result.closure.misclosureMm !== undefined;
  const { checks } = result;
  if (lines.length === 0) {
    return <p className="muted small lv-empty-tab">Aún no hay lecturas.</p>;
  }
  const cell = (v: number | undefined, d = 3) => (v === undefined || !Number.isFinite(v) ? '' : v.toFixed(d));
  return (
    <div className="card flush">
      <div className="table-wrap lv-book">
        <table className="table">
          <thead>
            <tr>
              <th>Pto</th>
              <th>VA</th>
              {hi ? <th>AI</th> : null}
              <th>VI</th>
              <th>VAd</th>
              {!hi && <th>S (+)</th>}
              {!hi && <th>B (−)</th>}
              {anyDist && <th>Dist</th>}
              <th>Cota</th>
              {adjusted && <th>Corr mm</th>}
              {adjusted && <th>Cota comp.</th>}
              {anyDesign && <th>Proy.</th>}
              {anyDesign && <th>C/R</th>}
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const m = l.main;
              const elev = m ? m.elevation : l.bs?.elevation;
              const adj = m ? m.adjustedElevation : l.bs?.adjustedElevation;
              const corr = m ? m.correction : l.bs?.correction;
              const dist = [l.bs?.distance, m?.distance].filter((x): x is number => x !== undefined);
              const cf = m?.cutFill;
              return (
                <tr key={l.key} className={l.tp ? 'tp' : m?.kind === 'IS' ? 'lv-is' : ''}>
                  <td className="text">
                    <b>{l.name}</b>
                    {l.tp && <span className="lv-tp-tag">PC</span>}
                  </td>
                  <td>{cell(l.bs?.reading)}</td>
                  {hi ? <td className="faint">{cell(l.bs?.hi)}</td> : null}
                  <td>{m?.kind === 'IS' ? cell(m.reading) : ''}</td>
                  <td>{m?.kind === 'FS' ? cell(m.reading) : ''}</td>
                  {!hi && <td className="c-ok">{cell(m?.rise)}</td>}
                  {!hi && <td className="c-fail">{cell(m?.fall)}</td>}
                  {anyDist && <td className="faint">{dist.map((x) => x.toFixed(1)).join(' / ')}</td>}
                  <td>
                    <b>{cell(elev)}</b>
                  </td>
                  {adjusted && <td className="faint">{corr !== undefined && Math.abs(corr) > 1e-9 ? fs(corr * 1000, 1) : '0.0'}</td>}
                  {adjusted && (
                    <td>
                      <b className="c-brand">{cell(adj)}</b>
                    </td>
                  )}
                  {anyDesign && <td className="faint">{cell(m?.designElevation)}</td>}
                  {anyDesign && (
                    <td className={cf === undefined ? '' : Math.abs(cf) < 0.0005 ? 'c-ok' : cf > 0 ? 'c-cut' : 'c-fill'}>
                      {cf === undefined ? '' : Math.abs(cf) < 0.0005 ? '0.000' : `${cf > 0 ? 'C' : 'R'} ${Math.abs(cf).toFixed(3)}`}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td className="text">Σ</td>
              <td>{checks.sumBS.toFixed(3)}</td>
              {hi ? <td /> : null}
              <td />
              <td>{checks.sumFS.toFixed(3)}</td>
              {!hi && <td>{checks.sumRise.toFixed(3)}</td>}
              {!hi && <td>{checks.sumFall.toFixed(3)}</td>}
              {anyDist && <td>{(checks.sumBackDist + checks.sumForeDist).toFixed(1)}</td>}
              <td />
              {adjusted && <td />}
              {adjusted && <td />}
              {anyDesign && <td />}
              {anyDesign && <td />}
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="lv-book-legend xs faint">
        <span>
          <i className="lv-sw tp" /> Punto de cambio (VAd + VA)
        </span>
        {anyDesign && (
          <span>
            <b className="c-cut">C</b> cortar · <b className="c-fill">R</b> rellenar (cota comp. − proyecto)
          </span>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Perfil                                                              */
/* ------------------------------------------------------------------ */

function Profile({ run, result }: { run: LevelRun; result: LevelRunResult }) {
  const data = useMemo<ProfileDatum[]>(() => {
    const tps = new Set<string>();
    result.rows.forEach((r, i) => {
      if (r.kind === 'FS' && result.rows[i + 1]?.kind === 'BS') tps.add(r.pointName);
    });
    const bms = new Set([run.startBM.name, run.endBM?.name].filter(Boolean) as string[]);
    return profileFromRun(result).map((p) => ({
      x: p.distAcum,
      y: Number.isFinite(p.adjusted) ? p.adjusted : Number.isFinite(p.elevation) ? p.elevation : undefined,
      design: p.design,
      label: p.name,
      marker: bms.has(p.name) ? 'bm' : tps.has(p.name) ? 'tp' : 'point',
    }));
  }, [run, result]);
  const hasDist = result.rows.some((r) => r.kind !== 'IS' && (r.distance ?? 0) > 0);
  const cf = result.rows.filter((r) => r.cutFill !== undefined);
  return (
    <div className="stack">
      <div className="card">
        <ProfileChart
          data={data}
          height={300}
          xTitle={hasDist ? 'Distancia acumulada (m)' : 'N° de punto'}
          seriesLabel={result.closure.misclosureMm !== undefined ? 'Cota compensada' : 'Cota'}
          designLabel="Cota de proyecto"
        />
      </div>
      {cf.length > 0 && (
        <div className="card flush">
          <div className="card-header lv-pad">
            <h3>Corte / relleno</h3>
            <span className="xs faint">{cf.length} puntos con cota de proyecto</span>
          </div>
          <div className="lv-cf-grid">
            {cf.map((r) => {
              const v = r.cutFill!;
              const ok = Math.abs(v) < 0.0005;
              return (
                <div key={r.obsId} className="lv-cf">
                  <span className="small">
                    <b>{r.pointName}</b>
                  </span>
                  <b className={`num ${ok ? 'c-ok' : v > 0 ? 'c-cut' : 'c-fill'}`}>{ok ? 'En rasante' : `${v > 0 ? 'Cortar' : 'Rellenar'} ${Math.abs(v).toFixed(3)}`}</b>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Comprobación                                                        */
/* ------------------------------------------------------------------ */

function Check({ run, result, status }: { run: LevelRun; result: LevelRunResult; status: ReturnType<typeof closureStatus> }) {
  const { checks, closure, issues } = result;
  const startElev = run.startBM.elevation;
  const dH = closure.computedEnd - startElev;
  const kLen = toleranceLengthKm(closure.lengthKm, closure.setups);
  // computeLevelRun compensa por distancia solo si todas las VA/VAd la tienen.
  const byDist = closure.lengthKm > 0 && result.rows.every((r) => r.kind === 'IS' || r.distance !== undefined);
  const Row = ({ ok, children }: { ok: boolean; children: ReactNode }) => (
    <div className={`lv-check-row ${ok ? 'c-ok' : 'c-fail'}`}>
      {ok ? <CircleCheck size={18} /> : <CircleX size={18} />}
      <span>{children}</span>
    </div>
  );
  const close = (a: number, b: number) => Math.abs(a - b) < 1e-6;
  return (
    <div className="stack">
      <div className="md-grid-2 lv-check-cols">
        <div className="card stack">
          <div className="row-between">
            <h3 className="lv-h3">Comprobación aritmética</h3>
            <StatusBadge status={checks.arithmeticOk ? 'ok' : 'fail'} label={checks.arithmeticOk ? 'Correcta' : 'Revisar'} />
          </div>
          <KV k="Σ vistas atrás (VA)" v={checks.sumBS.toFixed(3)} />
          <KV k="Σ vistas adelante (VAd)" v={checks.sumFS.toFixed(3)} />
          <KV k="ΣVA − ΣVAd" v={fs(checks.sumBS - checks.sumFS, 3)} />
          <div className="divider" />
          <KV k="Σ subidas (S)" v={checks.sumRise.toFixed(3)} />
          <KV k="Σ bajadas (B)" v={checks.sumFall.toFixed(3)} />
          <KV k="ΣS − ΣB" v={fs(checks.sumRise - checks.sumFall, 3)} />
          <div className="divider" />
          <KV k={`Cota final − cota inicial (Cf − Ci)`} v={Number.isFinite(dH) ? fs(dH, 3) : '—'} />
          <Row ok={Number.isFinite(dH) && close(checks.sumBS - checks.sumFS, dH)}>ΣVA − ΣVAd = Cf − Ci</Row>
          <p className="xs faint">
            ΣS − ΣB coincide con la diferencia entre la última cota de la libreta y la inicial (incluye intermedias).
          </p>
        </div>

        <div className="card stack">
          <div className="row-between">
            <h3 className="lv-h3">Cierre y tolerancia</h3>
            <StatusBadge status={status} />
          </div>
          <KV k="Clase" v={<span className="lv-kv-text">{ORDER_LABEL[run.order]}</span>} />
          <KV k="Coeficiente e" v={`${closure.k} mm`} />
          <KV k="Longitud K" v={`${kLen.km.toFixed(3)} km${kLen.assumed ? ' (supuesta)' : ''}`} />
          <KV k="Cota calculada de llegada" v={f(closure.computedEnd)} />
          <KV k="Cota conocida de llegada" v={closure.knownEnd !== undefined ? f(closure.knownEnd) : '—'} />
          <KV k="Error de cierre" v={closure.misclosureMm !== undefined ? `${fs(closure.misclosureMm, 1)} mm` : '—'} tone={status === 'pending' ? '' : `c-${status}`} />
          <div className="lv-formula num">{toleranceFormula(closure.k, closure.lengthKm, closure.setups, closure.toleranceMm)}</div>
          {closure.misclosureMm !== undefined && closure.toleranceMm !== undefined && (
            <p className="small" style={{ color: statusColor(status) }}>
              |e| = {Math.abs(closure.misclosureMm).toFixed(1)} mm {closure.passes ? '≤' : '>'} T = {closure.toleranceMm.toFixed(1)} mm
              {closure.passes ? ` → se compensa proporcional ${byDist ? 'a la distancia' : 'al número de estaciones'}.` : ' → repetir la nivelación.'}
            </p>
          )}
        </div>
      </div>

      <div className="card stack">
        <h3 className="lv-h3">Distancias</h3>
        <KV k="Σ distancias atrás" v={`${checks.sumBackDist.toFixed(1)} m`} />
        <KV k="Σ distancias adelante" v={`${checks.sumForeDist.toFixed(1)} m`} />
        <KV k="Desbalance (atrás − adelante)" v={`${fs(checks.distanceImbalance, 1)} m`} tone={Math.abs(checks.distanceImbalance) > 10 ? 'c-warn' : ''} />
        <p className="xs faint">Distancias atrás y adelante equilibradas anulan el error de colimación y de curvatura.</p>
      </div>

      <div className="card stack">
        <div className="row-between">
          <h3 className="lv-h3">Incidencias</h3>
          <span className={`badge ${issues.length ? 'warn' : 'ok'}`}>{issues.length}</span>
        </div>
        {issues.length === 0 ? (
          <p className="small c-ok row">
            <CircleCheck size={16} /> Sin incidencias en la estructura de datos.
          </p>
        ) : (
          <ul className="lv-issues">
            {issues.map((t, i) => (
              <li key={i}>
                <AlertTriangle size={16} />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        )}
        {run.notes && (
          <p className="small muted row">
            <Info size={15} /> {run.notes}
          </p>
        )}
      </div>
    </div>
  );
}
