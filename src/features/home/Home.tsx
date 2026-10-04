import { useMemo, useState, type ReactNode } from 'react';
import {
  Calculator,
  Check,
  ChevronDown,
  ChevronRight,
  FileDown,
  FileText,
  FolderOpen,
  Layers,
  MapPin,
  Mountain,
  Plus,
  Ruler,
  Search,
  Settings as SettingsIcon,
  Sparkles,
  Triangle,
  Upload,
  WifiOff,
  Zap,
} from 'lucide-react';
import { go, useNav } from '@/app/nav';
import { useProject, useStore } from '@/app/store';
import type { ComplianceStatus, Project } from '@/core/types';
import { TopoLines } from '@/ui/brand';
import { BrandMark } from './BrandMark';
import { ListItem, QuickAction, Screen, Sheet, StatusBadge } from '@/ui/kit';
import { dateShort, fs, relative } from '@/ui/format';
import { controlStatus, dayToIso, runStatus, sortedRuns, type RunStatus } from './stats';

const STATUS_COLOR: Record<ComplianceStatus, string> = {
  ok: 'var(--ok)',
  warn: 'var(--warn)',
  fail: 'var(--fail)',
  pending: 'var(--text-3)',
};

const TONE: Record<ComplianceStatus, 'ok' | 'warn' | 'fail' | 'info'> = {
  ok: 'ok',
  warn: 'warn',
  fail: 'fail',
  pending: 'info',
};

/* ------------------------------------------------------------------ */
/* Bienvenida (primer uso)                                             */
/* ------------------------------------------------------------------ */

function Welcome() {
  const loadDemo = useStore((s) => s.loadDemo);
  const hasProjects = useStore((s) => s.projects.length > 0);
  const benefits: Array<{ icon: ReactNode; tone: string; title: string; text: string }> = [
    {
      icon: <Ruler size={22} />,
      tone: 'brand',
      title: 'Libreta de nivelación inteligente',
      text: 'Cotas, cierre y tolerancia al instante, con teclado grande para campo.',
    },
    {
      icon: <Upload size={22} />,
      tone: 'accent',
      title: 'Importa directo de tu equipo',
      text: 'Leica GSI, Trimble DiNi, Sokkia, Topcon, NMEA y CSV.',
    },
    {
      icon: <FileText size={22} />,
      tone: 'info',
      title: 'Informes listos para entregar',
      text: 'PDF y Excel con tu membrete, cierres y control de capas.',
    },
  ];
  return (
    <main className="content hm-welcome">
      <section className="hero hm-welcome-hero">
        <TopoLines />
        <div className="hm-welcome-logo">
          <BrandMark size={72} />
        </div>
        <h1 className="hm-welcome-title">TOPO APP</h1>
        <p className="hm-welcome-sub">Nivelación, levantamiento e informes en campo — sin internet</p>
        <div className="hm-welcome-pills">
          <span>
            <WifiOff size={14} /> 100 % offline
          </span>
          <span>
            <MapPin size={14} /> UTM Perú 17–19 S
          </span>
        </div>
      </section>

      <div className="hm-benefits">
        {benefits.map((b) => (
          <div key={b.title} className="hm-benefit">
            <div className={`hm-benefit-icon tone-${b.tone}`}>{b.icon}</div>
            <div>
              <strong>{b.title}</strong>
              <p>{b.text}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="stack hm-welcome-cta">
        <button className="btn primary lg block" onClick={() => go('project-edit', {}, 'home')}>
          <Plus size={20} /> Crear proyecto
        </button>
        <button className="btn ghost lg block" onClick={() => loadDemo()}>
          <Sparkles size={20} /> Explorar con proyecto de ejemplo
        </button>
        {hasProjects && (
          <button className="btn sm block" onClick={() => go('projects', {}, 'home')}>
            <FolderOpen size={16} /> Abrir un proyecto guardado
          </button>
        )}
        <p className="faint xs hm-center">Tus datos se guardan solo en este dispositivo.</p>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* Selector de proyecto                                                */
/* ------------------------------------------------------------------ */

function ProjectSwitcher({ open, onClose }: { open: boolean; onClose: () => void }) {
  const projects = useStore((s) => s.projects);
  const activeId = useStore((s) => s.activeProjectId);
  const setActive = useStore((s) => s.setActiveProject);
  const list = [...projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8);
  return (
    <Sheet open={open} title="Cambiar de proyecto" onClose={onClose}>
      <div className="card flush">
        <div className="list">
          {list.map((p) => (
            <ListItem
              key={p.id}
              icon={<Mountain size={20} />}
              tone={p.id === activeId ? 'brand' : 'info'}
              title={p.name}
              sub={[p.client || p.location, `editado ${relative(p.updatedAt)}`].filter(Boolean).join(' · ')}
              right={p.id === activeId ? <Check size={20} className="c-brand" /> : undefined}
              onClick={() => {
                setActive(p.id);
                onClose();
              }}
            />
          ))}
        </div>
      </div>
      <div className="grid-2" style={{ marginTop: 12 }}>
        <button
          className="btn ghost lg"
          onClick={() => {
            onClose();
            go('projects', {}, 'home');
          }}
        >
          <FolderOpen size={18} /> Ver todos
        </button>
        <button
          className="btn primary lg"
          onClick={() => {
            onClose();
            go('project-edit', {}, 'home');
          }}
        >
          <Plus size={18} /> Nuevo proyecto
        </button>
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Bloques de Inicio                                                   */
/* ------------------------------------------------------------------ */

function HeroProject({ p }: { p: Project }) {
  const setTab = useNav((s) => s.setTab);
  const official = p.benchmarks.filter((b) => b.official).length;
  const sub = [p.client, p.location].filter(Boolean).join(' · ');
  return (
    <section className="hero hm-hero">
      <TopoLines />
      <div className="hm-hero-meta">
        <span className="hm-hero-chip">
          <Triangle size={12} strokeWidth={2.6} /> UTM {p.crs.zone}
          {p.crs.hemisphere} · {p.crs.datum}
        </span>
        <span className="hm-hero-updated">Editado {relative(p.updatedAt)}</span>
      </div>
      <h2 className="hm-hero-title">{p.name}</h2>
      {sub && (
        <p className="hm-hero-sub">
          <MapPin size={15} /> <span>{sub}</span>
        </p>
      )}
      <div className="hm-hero-kpis">
        <button className="hm-hk" onClick={() => setTab('leveling')}>
          <span className="hm-hk-value">{p.levelRuns.length}</span>
          <span className="hm-hk-label">Libretas</span>
        </button>
        <button className="hm-hk" onClick={() => setTab('points')}>
          <span className="hm-hk-value">{p.points.length}</span>
          <span className="hm-hk-label">Puntos</span>
        </button>
        <button className="hm-hk" onClick={() => go('benchmarks', {}, 'home')}>
          <span className="hm-hk-value">{p.benchmarks.length}</span>
          <span className="hm-hk-label">BMs{official ? ` · ${official} of.` : ''}</span>
        </button>
      </div>
    </section>
  );
}

/** Barra de cierre: |e| frente a la tolerancia, con marcas en 0,8·T y T. */
function ClosureBar({ rs }: { rs: RunStatus }) {
  const max = 1.25;
  const w = Math.min(rs.ratio ?? 0, max) / max;
  return (
    <div className="hm-cbar" aria-hidden="true">
      <span className="hm-cbar-fill" style={{ width: `${w * 100}%`, background: STATUS_COLOR[rs.status] }} />
      <i style={{ left: `${(0.8 / max) * 100}%` }} />
      <i className="hm-cbar-t" style={{ left: `${(1 / max) * 100}%` }} />
    </div>
  );
}

function ProjectStatus({ p }: { p: Project }) {
  const runs = useMemo(() => sortedRuns(p).map(runStatus), [p]);
  const lastClosed = runs.find((r) => r.status !== 'pending') ?? runs[0];
  const controls = useMemo(() => p.layerControls.map(controlStatus), [p]);
  const agg = controls.reduce(
    (a, c) => ({ measured: a.measured + c.measured, ok: a.ok + c.ok, warn: a.warn + c.warn, fail: a.fail + c.fail }),
    { measured: 0, ok: 0, warn: 0, fail: 0 },
  );
  const pct = agg.measured ? (agg.ok / agg.measured) * 100 : 0;
  const ctrlStatus: ComplianceStatus =
    agg.measured === 0 ? 'pending' : agg.fail > 0 ? 'fail' : agg.warn > 0 ? 'warn' : 'ok';
  const official = p.benchmarks.filter((b) => b.official).length;
  const passCount = runs.filter((r) => r.status === 'ok' || r.status === 'warn').length;
  const closedCount = runs.filter((r) => r.status !== 'pending').length;

  return (
    <div className="card flush hm-status">
      {/* Nivelación */}
      <button
        className="hm-status-row"
        onClick={() =>
          lastClosed ? go('level-run', { runId: lastClosed.run.id }, 'leveling') : go('level-new', {}, 'leveling')
        }
      >
        <div className="hm-status-head">
          <div className={`hm-status-icon tone-${lastClosed ? TONE[lastClosed.status] : 'info'}`}>
            <Ruler size={20} />
          </div>
          <div className="grow">
            <div className="hm-status-label">Último cierre de nivelación</div>
            <div className="hm-status-title">{lastClosed ? lastClosed.run.name : 'Sin libretas todavía'}</div>
          </div>
          {lastClosed ? (
            <StatusBadge
              status={lastClosed.status}
              label={
                lastClosed.status === 'ok'
                  ? 'Cumple'
                  : lastClosed.status === 'warn'
                    ? 'Al límite'
                    : lastClosed.status === 'fail'
                      ? 'Repetir'
                      : 'Sin cierre'
              }
            />
          ) : (
            <ChevronRight size={20} className="faint" />
          )}
        </div>
        {lastClosed && lastClosed.status !== 'pending' && (
          <>
            <div className="hm-status-figs">
              <span>
                <small>Error</small>
                <b className="mono" style={{ color: STATUS_COLOR[lastClosed.status] }}>
                  {fs(lastClosed.summary.misclosureMm, 1)}
                  <em>mm</em>
                </b>
              </span>
              <span>
                <small>Tolerancia</small>
                <b className="mono">
                  ±{lastClosed.summary.toleranceMm?.toFixed(1)}
                  <em>mm</em>
                </b>
              </span>
              <span>
                <small>Longitud</small>
                <b className="mono">
                  {(lastClosed.summary.lengthM / 1000).toFixed(2)}
                  <em>km</em>
                </b>
              </span>
            </div>
            <ClosureBar rs={lastClosed} />
            <div className="hm-cbar-legend xs faint">
              <span>0</span>
              <span>0,8 T</span>
              <span>T</span>
            </div>
          </>
        )}
        {lastClosed && lastClosed.status === 'pending' && (
          <p className="small muted">{lastClosed.summary.verdict}</p>
        )}
        {closedCount > 1 && (
          <p className="xs faint">
            {passCount} de {closedCount} libretas con cierre dentro de tolerancia
          </p>
        )}
      </button>

      {/* Control de capas */}
      <button
        className="hm-status-row"
        onClick={() =>
          controls[0] ? go('layer-control', { id: controls[0].control.id }, 'leveling') : go('layer-new', {}, 'leveling')
        }
      >
        <div className="hm-status-head">
          <div className={`hm-status-icon tone-${TONE[ctrlStatus]}`}>
            <Layers size={20} />
          </div>
          <div className="grow">
            <div className="hm-status-label">Control de capas</div>
            <div className="hm-status-title">
              {controls.length === 0
                ? 'Sin controles todavía'
                : controls.length === 1
                  ? controls[0].control.name
                  : `${controls.length} controles`}
            </div>
          </div>
          {agg.measured > 0 ? (
            <span className="hm-pct mono" style={{ color: STATUS_COLOR[ctrlStatus] }}>
              {Math.round(pct)}
              <em>%</em>
            </span>
          ) : (
            <ChevronRight size={20} className="faint" />
          )}
        </div>
        {agg.measured > 0 && (
          <>
            <div className="meter" role="meter" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
              <span style={{ width: `${pct}%`, background: STATUS_COLOR[ctrlStatus] }} />
            </div>
            <div className="row wrap hm-status-counts">
              <span className="badge ok">{agg.ok} conformes</span>
              {agg.warn > 0 && <span className="badge warn">{agg.warn} al límite</span>}
              {agg.fail > 0 && <span className="badge fail">{agg.fail} fuera</span>}
              <span className="xs faint">{agg.measured} mediciones</span>
            </div>
          </>
        )}
      </button>

      {/* BMs */}
      <button className="hm-status-row" onClick={() => go('benchmarks', {}, 'home')}>
        <div className="hm-status-head">
          <div className="hm-status-icon tone-accent">
            <Triangle size={20} />
          </div>
          <div className="grow">
            <div className="hm-status-label">Bancos de nivel</div>
            <div className="hm-status-title">
              {p.benchmarks.length === 0
                ? 'Agrega tus BMs de referencia'
                : `${p.benchmarks.length} BM${p.benchmarks.length > 1 ? 's' : ''} · ${official} oficial${official === 1 ? '' : 'es'}`}
            </div>
          </div>
          <ChevronRight size={20} className="faint" />
        </div>
        {p.benchmarks.length > 0 && (
          <div className="row wrap hm-bm-chips">
            {p.benchmarks.slice(0, 4).map((b) => (
              <span key={b.id} className="hm-bm-chip">
                <b>{b.name}</b>
                <span className="mono">{b.elevation.toFixed(3)}</span>
              </span>
            ))}
          </div>
        )}
      </button>
    </div>
  );
}

function RecentActivity({ p }: { p: Project }) {
  const items = useMemo(() => {
    const runs = sortedRuns(p)
      .slice(0, 4)
      .map((r) => ({ kind: 'run' as const, rs: runStatus(r) }));
    const ctrls = p.layerControls.slice(0, 2).map((c) => ({ kind: 'ctrl' as const, cs: controlStatus(c) }));
    return [...runs, ...ctrls].slice(0, 6);
  }, [p]);

  if (items.length === 0) {
    return (
      <div className="card hm-center">
        <p className="muted small">Aún no hay libretas ni controles en este proyecto.</p>
        <button
          className="btn primary"
          style={{ marginTop: 12 }}
          onClick={() => go('level-new', { quick: true }, 'leveling')}
        >
          <Plus size={18} /> Empezar una nivelación
        </button>
      </div>
    );
  }

  return (
    <div className="card flush">
      <div className="list">
        {items.map((it) =>
          it.kind === 'run' ? (
            <ListItem
              key={it.rs.run.id}
              icon={<Ruler size={20} />}
              tone={TONE[it.rs.status]}
              title={it.rs.run.name}
              sub={`${relative(dayToIso(it.rs.run.date))} · ${it.rs.run.observations.length} lecturas · ${it.rs.summary.nSetups} est.`}
              right={
                it.rs.status === 'pending' ? (
                  <span className="badge neutral">Abierta</span>
                ) : (
                  <span className={`hm-mm mono c-${it.rs.status}`}>{fs(it.rs.summary.misclosureMm, 1)} mm</span>
                )
              }
              onClick={() => go('level-run', { runId: it.rs.run.id }, 'leveling')}
            />
          ) : (
            <ListItem
              key={it.cs.control.id}
              icon={<Layers size={20} />}
              tone={TONE[it.cs.status]}
              title={it.cs.control.name}
              sub={`Control de capas · ${it.cs.control.points.length} puntos · ${it.cs.control.layers.length} capas`}
              right={
                it.cs.measured > 0 ? (
                  <span className={`hm-mm mono c-${it.cs.status}`}>{Math.round(it.cs.pctOk)} %</span>
                ) : (
                  <span className="badge neutral">Pendiente</span>
                )
              }
              onClick={() => go('layer-control', { id: it.cs.control.id }, 'leveling')}
            />
          ),
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Raíz                                                                */
/* ------------------------------------------------------------------ */

export default function HomeRoot() {
  const p = useProject();
  const [switcher, setSwitcher] = useState(false);
  if (!p) return <Welcome />;

  return (
    <Screen
      wide
      title={
        <button className="hm-switch" onClick={() => setSwitcher(true)} aria-label="Cambiar de proyecto">
          <BrandMark size={30} />
          <span className="hm-switch-text">
            <small>Proyecto activo</small>
            <span>
              {p.name} <ChevronDown size={16} />
            </span>
          </span>
        </button>
      }
      actions={
        <>
          <button className="icon-btn" aria-label="Buscar" onClick={() => go('search', {}, 'home')}>
            <Search size={22} />
          </button>
          <button className="icon-btn" aria-label="Ajustes" onClick={() => go('settings', {}, 'home')}>
            <SettingsIcon size={22} />
          </button>
        </>
      }
    >
      <div className="stack-l hm-home">
        <HeroProject p={p} />

        <section className="stack">
          <h2 className="section-title">Acciones rápidas</h2>
          <div className="hm-quick">
            <QuickAction
              icon={<Zap size={22} />}
              title="Nivelación rápida"
              sub="Libreta nueva en 1 toque"
              onClick={() => go('level-new', { quick: true }, 'leveling')}
            />
            <QuickAction
              icon={<Upload size={22} />}
              tone="accent"
              title="Importar datos"
              sub="GSI, DiNi, SDR, CSV…"
              onClick={() => go('import', {}, 'reports')}
            />
            <QuickAction
              icon={<MapPin size={22} />}
              tone="info"
              title="Nuevo punto"
              sub="Coordenadas y cota"
              onClick={() => go('point-edit', {}, 'points')}
            />
            <QuickAction
              icon={<Layers size={22} />}
              tone="ok"
              title="Control de capas"
              sub="Pavimento y veredas"
              onClick={() => go('layer-new', {}, 'leveling')}
            />
            <QuickAction
              icon={<Calculator size={22} />}
              tone="warn"
              title="Calcular cota"
              sub="Lectura para estacar"
              onClick={() => go('tool', { id: 'grade-stake' }, 'tools')}
            />
            <QuickAction
              icon={<FileDown size={22} />}
              tone="fail"
              title="Informe PDF"
              sub="Resumen del proyecto"
              onClick={() => go('report', { kind: 'summary' }, 'reports')}
            />
          </div>
        </section>

        <div className="md-grid-2 hm-cols">
          <section className="stack">
            <h2 className="section-title">Estado del proyecto</h2>
            <ProjectStatus p={p} />
          </section>
          <section className="stack">
            <div className="row-between">
              <h2 className="section-title">Actividad reciente</h2>
              <span className="xs faint hm-today">{dateShort(new Date().toISOString())}</span>
            </div>
            <RecentActivity p={p} />
          </section>
        </div>
      </div>
      <ProjectSwitcher open={switcher} onClose={() => setSwitcher(false)} />
    </Screen>
  );
}
