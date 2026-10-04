/** Pestaña NIVELACIÓN: libretas de nivelación y control de capas. */
import { useMemo, useState } from 'react';
import { CalendarDays, FileUp, Layers, MapPinned, Plus, Route, Ruler, Zap } from 'lucide-react';
import type { FeatureModule } from '@/app/feature';
import { go } from '@/app/nav';
import { useProject } from '@/app/store';
import type { LayerControl, LevelRun } from '@/core/types';
import { computeLevelRun, levelRunSummary } from '@/core/leveling';
import { checkLayer, layerSummary } from '@/core/pavement';
import { EmptyState, Fab, QuickAction, Screen, Segmented, StatusBadge } from '@/ui/kit';
import { dateShort, f, fs } from '@/ui/format';
import { CLOSURE_LABEL, METHOD_SHORT, NoProject, closureStatus } from './shared';
import { LevelNew, LevelEdit } from './RunForm';
import { LevelEntry } from './LevelEntry';
import { LevelRunScreen } from './LevelRunScreen';
import { LayerNew } from './LayerNew';
import { LayerControlScreen } from './LayerControlScreen';
import { LayerEntry } from './LayerEntry';
import { gradeText } from './LayerParts';

type View = 'runs' | 'layers';

function readView(): View {
  try {
    return localStorage.getItem('lv-root-view') === 'layers' ? 'layers' : 'runs';
  } catch {
    return 'runs';
  }
}

function Root() {
  const project = useProject();
  const [view, setView] = useState<View>(readView);
  if (!project) return <NoProject />;
  const pick = (v: View) => {
    setView(v);
    try {
      localStorage.setItem('lv-root-view', v);
    } catch {
      /* sin almacenamiento */
    }
  };
  return (
    <Screen
      title="Nivelación"
      subtitle={project.name}
      fab={
        view === 'runs' ? (
          <Fab icon={<Plus size={22} />} label="Nueva nivelación" onClick={() => go('level-new', {})} />
        ) : (
          <Fab icon={<Plus size={22} />} label="Nuevo control" onClick={() => go('layer-new', {})} />
        )
      }
    >
      <div className="stack-l">
        <Segmented<View>
          value={view}
          onChange={pick}
          options={[
            { value: 'runs', label: `Libretas · ${project.levelRuns.length}` },
            { value: 'layers', label: `Control de capas · ${project.layerControls.length}` },
          ]}
        />
        {view === 'runs' ? <Runs runs={project.levelRuns} /> : <Controls controls={project.layerControls} />}
      </div>
    </Screen>
  );
}

function Runs({ runs }: { runs: LevelRun[] }) {
  return (
    <div className="stack">
      <div className="grid-3 lv-quick">
        <QuickAction icon={<Zap size={22} />} title="Rápida" sub="Solo elige el BM" onClick={() => go('level-new', { quick: true })} />
        <QuickAction icon={<FileUp size={22} />} tone="info" title="Importar del nivel" sub="GSI, DiNi, CSV" onClick={() => go('import', {}, 'reports')} />
        <QuickAction icon={<MapPinned size={22} />} tone="accent" title="BMs" sub="Bancos de nivel" onClick={() => go('benchmarks', {}, 'home')} />
      </div>
      {runs.length === 0 ? (
        <EmptyState
          icon={<Ruler size={30} />}
          title="Crea tu primera nivelación"
          text="Captura lecturas de mira con cierre y tolerancia en vivo, o importa el archivo de tu nivel digital."
          action={
            <button className="btn primary lg" onClick={() => go('level-new', {})}>
              <Plus size={20} /> Nueva nivelación
            </button>
          }
        />
      ) : (
        <div className="lv-run-list">
          {runs.map((r) => (
            <RunCard key={r.id} run={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function RunCard({ run }: { run: LevelRun }) {
  const { result, summary } = useMemo(() => {
    const result = computeLevelRun(run);
    return { result, summary: levelRunSummary(run, result) };
  }, [run]);
  const status = closureStatus(result);
  const c = result.closure;
  const open = run.closure !== 'open' && status === 'pending' && run.observations.length > 0;
  return (
    <button className={`card tappable lv-run-card s-${status}`} onClick={() => go('level-run', { runId: run.id })}>
      <div className="row-between" style={{ alignItems: 'flex-start' }}>
        <div className="grow">
          <h3 className="lv-run-title">{run.name}</h3>
          <div className="lv-run-meta xs">
            <span>
              <CalendarDays size={13} /> {dateShort(run.date)}
            </span>
            <span>{METHOD_SHORT[run.method]}</span>
            <span>{CLOSURE_LABEL[run.closure]}</span>
          </div>
        </div>
        {status !== 'pending' ? (
          <StatusBadge status={status} label={`${fs(c.misclosureMm, 1)} / ±${f(c.toleranceMm, 1)} mm`} />
        ) : (
          <StatusBadge status="pending" label={run.closure === 'open' ? 'Abierta' : run.observations.length ? 'En curso' : 'Vacía'} />
        )}
      </div>
      <div className="lv-run-stats">
        <div>
          <b className="num">{run.startBM.name}</b>
          <span>BM inicio</span>
        </div>
        <div>
          <b className="num">{summary.nPoints}</b>
          <span>puntos</span>
        </div>
        <div>
          <b className="num">{summary.nSetups}</b>
          <span>estaciones</span>
        </div>
        <div>
          <b className="num">{summary.lengthM > 0 ? `${summary.lengthM.toFixed(0)} m` : '—'}</b>
          <span>longitud</span>
        </div>
      </div>
      {open && (
        <span
          className="lv-continue xs"
          role="link"
          onClick={(e) => {
            e.stopPropagation();
            go('level-entry', { runId: run.id });
          }}
        >
          Continuar captura →
        </span>
      )}
    </button>
  );
}

function Controls({ controls }: { controls: LayerControl[] }) {
  if (controls.length === 0) {
    return (
      <EmptyState
        icon={<Layers size={30} />}
        title="Sin controles de capas"
        text="Verifica las cotas de subrasante, sub-base, base y carpeta contra la rasante de proyecto, punto por punto."
        action={
          <button className="btn primary lg" onClick={() => go('layer-new', {})}>
            <Plus size={20} /> Nuevo control
          </button>
        }
      />
    );
  }
  return (
    <div className="lv-run-list">
      {controls.map((c) => (
        <ControlCard key={c.id} control={c} />
      ))}
    </div>
  );
}

function ControlCard({ control }: { control: LayerControl }) {
  const per = useMemo(() => control.layers.map((l) => ({ l, s: layerSummary(checkLayer(control, l.id)) })), [control]);
  const stations = control.points.map((p) => p.station);
  const range = stations.length ? `${Math.min(...stations).toFixed(0)}–${Math.max(...stations).toFixed(0)} m` : 'sin puntos';
  return (
    <button className="card tappable lc-card" onClick={() => go('layer-control', { id: control.id })}>
      <div className="row-between" style={{ alignItems: 'flex-start' }}>
        <div className="grow">
          <h3 className="lv-run-title">{control.name}</h3>
          <div className="lv-run-meta xs">
            <span>
              <Route size={13} /> {range}
            </span>
            <span>{control.points.length} puntos</span>
          </div>
        </div>
      </div>
      <p className="xs faint lc-card-grade">{gradeText(control.grade)}</p>
      <div className="lc-bars">
        {per.map(({ l, s }) => {
          const w = (n: number) => `${s.total ? (n / s.total) * 100 : 0}%`;
          return (
            <div key={l.id} className="lc-bar-row">
              <span className="lc-bar-name small">{l.name}</span>
              <div className="lc-bar" aria-label={`${l.name}: ${s.ok} conformes, ${s.warn} al límite, ${s.fail} fuera, ${s.pending} pendientes`}>
                <i className="ok" style={{ width: w(s.ok) }} />
                <i className="warn" style={{ width: w(s.warn) }} />
                <i className="fail" style={{ width: w(s.fail) }} />
              </div>
              <span className="lc-bar-pct num small">{s.measured ? `${s.pctOk.toFixed(0)} %` : '—'}</span>
            </div>
          );
        })}
      </div>
      <div className="lc-legend xs faint">
        <span>
          <i className="ok" /> conforme
        </span>
        <span>
          <i className="warn" /> al límite
        </span>
        <span>
          <i className="fail" /> fuera
        </span>
        <span>
          <i /> pendiente
        </span>
      </div>
    </button>
  );
}

const mod: FeatureModule = {
  Root,
  screens: {
    'level-new': LevelNew,
    'level-entry': LevelEntry,
    'level-run': LevelRunScreen,
    'level-edit': LevelEdit,
    'layer-new': LayerNew,
    'layer-control': LayerControlScreen,
    'layer-entry': LayerEntry,
  },
};
export default mod;
