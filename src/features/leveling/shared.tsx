/** Utilidades compartidas del módulo de nivelación. */
import type { ReactNode } from 'react';
import { FolderPlus, Sparkles, Ruler, CircleCheck, AlertTriangle, CircleX, Clock } from 'lucide-react';
import { go } from '@/app/nav';
import { useProject, useStore } from '@/app/store';
import type { ComplianceStatus, LayerControl, LevelClosure, LevelMethod, LevelRun, LevelRunResult, Project } from '@/core/types';
import { EmptyState, Screen } from '@/ui/kit';

export const METHOD_LABEL: Record<LevelMethod, string> = {
  HI: 'Cota instrumental',
  RF: 'Ascensos y descensos',
};

export const METHOD_SHORT: Record<LevelMethod, string> = { HI: 'AI', RF: 'S/B' };

export const CLOSURE_LABEL: Record<LevelClosure, string> = {
  loop: 'Circuito cerrado',
  'known-bm': 'A BM conocido',
  open: 'Abierta',
};

export const KIND_LABEL = { BS: 'Atrás', IS: 'Intermedia', FS: 'Adelante' } as const;
export const KIND_SHORT = { BS: 'VA', IS: 'VI', FS: 'VAd' } as const;

/** Semáforo del cierre: ok si |e| ≤ 0.8T, warn si ≤ T, fail si > T. */
export function closureStatus(result: LevelRunResult | null | undefined): ComplianceStatus {
  const c = result?.closure;
  if (!c || c.misclosureMm === undefined || c.toleranceMm === undefined || !Number.isFinite(c.misclosureMm)) {
    return 'pending';
  }
  const e = Math.abs(c.misclosureMm);
  const t = c.toleranceMm;
  if (e <= 0.8 * t + 1e-9) return 'ok';
  if (e <= t + 1e-9) return 'warn';
  return 'fail';
}

export const STATUS_ICON: Record<ComplianceStatus, typeof CircleCheck> = {
  ok: CircleCheck,
  warn: AlertTriangle,
  fail: CircleX,
  pending: Clock,
};

export const STATUS_TITLE: Record<ComplianceStatus, string> = {
  ok: 'Cierre dentro de tolerancia',
  warn: 'Cierre al límite de la tolerancia',
  fail: 'Cierre fuera de tolerancia',
  pending: 'Sin control de cierre',
};

/** Color CSS de un estado. */
export const statusColor = (s: ComplianceStatus) =>
  s === 'pending' ? 'var(--text-3)' : `var(--${s})`;

/** "12·√0.406 = 7.6 mm" */
export function toleranceFormula(k: number, lengthKm: number, setups: number, tolMm: number | undefined): string {
  if (tolMm === undefined) return '—';
  const K = lengthKm > 0 ? lengthKm : (setups * 100) / 1000;
  const kTxt = Number.isInteger(k) ? String(k) : k.toFixed(1);
  return `T = ${kTxt}·√${K.toFixed(3)} = ${tolMm.toFixed(1)} mm${lengthKm > 0 ? '' : ' (100 m/estación supuesto)'}`;
}

/** Siguiente nombre de punto: progresivas 0+020 → 0+040, PC-3 → PC-4, 12 → 13. */
export function nextName(prev: string | undefined, stepStation = 20): string {
  if (!prev) return '1';
  const st = /^(\d+)\+(\d{3})(\.\d+)?$/.exec(prev.trim());
  if (st) {
    const m = Number(st[1]) * 1000 + Number(st[2]) + stepStation;
    const km = Math.floor(m / 1000);
    return `${km}+${String(Math.round(m - km * 1000)).padStart(3, '0')}`;
  }
  const num = /^(.*?)(\d+)$/.exec(prev.trim());
  if (num) {
    const n = String(Number(num[2]) + 1).padStart(num[2].length, '0');
    return `${num[1]}${n}`;
  }
  return `${prev}-1`;
}

/** Nombre del siguiente punto de cambio (PC-n) a partir de las observaciones. */
export function nextTpName(run: LevelRun): string {
  let max = 0;
  for (const o of run.observations) {
    const m = /^PC-?(\d+)$/i.exec(o.pointName);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `PC-${max + 1}`;
}

export function defaultRunName(d = new Date()): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `Nivelación ${dd}/${mm}`;
}

/** Proyecto + nivelación por id. */
export function useRun(runId: string | undefined): { project: Project | null; run: LevelRun | null } {
  const project = useProject();
  const run = project?.levelRuns.find((r) => r.id === runId) ?? null;
  return { project, run };
}

export function useControl(id: string | undefined): { project: Project | null; control: LayerControl | null } {
  const project = useProject();
  const control = project?.layerControls.find((c) => c.id === id) ?? null;
  return { project, control };
}

/** Estado vacío cuando no hay proyecto activo. */
export function NoProject({ title = 'Nivelación', back }: { title?: string; back?: boolean }) {
  return (
    <Screen title={title} back={back}>
      <EmptyState
        icon={<FolderPlus size={30} />}
        title="No hay un proyecto activo"
        text="Crea un proyecto para empezar a nivelar o carga el proyecto de ejemplo para explorar la app."
        action={
          <div className="stack" style={{ width: '100%', maxWidth: 320 }}>
            <button className="btn primary lg block" onClick={() => go('project-edit', {}, 'home')}>
              <FolderPlus size={20} /> Crear proyecto
            </button>
            <button className="btn ghost lg block" onClick={() => useStore.getState().loadDemo()}>
              <Sparkles size={20} /> Cargar proyecto de ejemplo
            </button>
          </div>
        }
      />
    </Screen>
  );
}

export function NotFound({ what = 'La nivelación' }: { what?: string }) {
  return (
    <Screen title="No encontrado" back>
      <EmptyState icon={<Ruler size={30} />} title={`${what} ya no existe`} text="Puede que se haya eliminado." />
    </Screen>
  );
}

/** Barra de medidor |e|/T con marca en 0.8 T y T (escala hasta 1.5 T). */
export function ClosureMeter({ ratio, status }: { ratio: number | undefined; status: ComplianceStatus }) {
  const pct = ratio === undefined ? 0 : Math.min(ratio / 1.5, 1) * 100;
  return (
    <div className="lv-meter" aria-label={ratio === undefined ? 'Sin cierre' : `Error = ${(ratio * 100).toFixed(0)} % de la tolerancia`}>
      <div className="meter">
        <span style={{ width: `${pct}%`, background: statusColor(status) }} />
      </div>
      <i style={{ left: `${(0.8 / 1.5) * 100}%` }} />
      <i style={{ left: `${(1 / 1.5) * 100}%` }} className="t" />
      <div className="lv-meter-scale xs faint">
        <span>0</span>
        <span style={{ left: `${(0.8 / 1.5) * 100}%` }}>0.8T</span>
        <span style={{ left: `${(1 / 1.5) * 100}%` }}>T</span>
        <span style={{ right: 0 }}>1.5T</span>
      </div>
    </div>
  );
}

/** Fila etiqueta / valor para tarjetas de resumen. */
export function KV({ k, v, tone }: { k: ReactNode; v: ReactNode; tone?: string }) {
  return (
    <div className="lv-kv">
      <span>{k}</span>
      <b className={`num ${tone ?? ''}`}>{v}</b>
    </div>
  );
}
