import { useMemo, useRef, useState } from 'react';
import { create } from 'zustand';
import {
  Calculator,
  CheckSquare,
  Crosshair,
  Download,
  FileDown,
  FileUp,
  FolderPlus,
  Layers,
  List,
  Map as MapIcon,
  MapPin,
  Mountain,
  PenLine,
  Plus,
  Ruler,
  Satellite,
  Search,
  Smartphone,
  Sparkles,
  Trash2,
  Triangle,
  X,
} from 'lucide-react';
import { go } from '@/app/nav';
import { useProject, useStore } from '@/app/store';
import { saveFile } from '@/app/platform';
import type { PointSource, SurveyPoint } from '@/core/types';
import { buildTin, contours as buildContours, type ContourLevel, type Tin } from '@/core/surface';
import { inverse } from '@/core/cogo';
import { formatDms } from '@/core/units';
import { Chips, EmptyState, Fab, Screen, Segmented, Sheet, confirmDialog, toast } from '@/ui/kit';
import { PlanView, type PlanTriangle } from '@/ui/charts/PlanView';
import { f, fs, slug, thousands } from '@/ui/format';
import {
  SOURCE_LABEL,
  autoContourInterval,
  codeCounts,
  hasZ,
  hullArea,
  planBenchmarks,
  planPoints,
  pointsCsv,
  zRange,
} from './util';

/* Estado de interfaz que sobrevive a la navegación. */
interface PointsUi {
  mode: 'list' | 'plan';
  code: string;
  q: string;
  showContours: boolean;
  showTin: boolean;
  set: (p: Partial<Omit<PointsUi, 'set'>>) => void;
}
export const usePointsUi = create<PointsUi>((set) => ({
  mode: 'list',
  code: '*',
  q: '',
  showContours: true,
  showTin: false,
  set: (p) => set(p),
}));

export const SOURCE_ICON: Record<PointSource, typeof MapPin> = {
  manual: PenLine,
  'total-station': Crosshair,
  gnss: Satellite,
  'phone-gps': Smartphone,
  import: FileDown,
  level: Ruler,
  calc: Calculator,
};

const PAGE = 300;

export default function PointsRoot() {
  const project = useProject();
  const ui = usePointsUi();
  const [sheet, setSheet] = useState(false);

  if (!project) {
    return (
      <Screen title="Puntos">
        <EmptyState
          icon={<MapPin size={30} />}
          title="Sin proyecto activo"
          text="Crea un proyecto o carga el ejemplo para registrar puntos."
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

  const points = project.points;

  return (
    <Screen
      title="Puntos"
      subtitle={`${project.name} · UTM ${project.crs.zone}${project.crs.hemisphere}`}
      wide={ui.mode === 'plan'}
      actions={
        <>
          <button className="icon-btn" aria-label="Superficie y volúmenes" title="Superficie y volúmenes" onClick={() => go('surface')}>
            <Mountain size={22} />
          </button>
          <button className="icon-btn" aria-label="Bancos de nivel" title="Bancos de nivel (BM)" onClick={() => go('benchmarks', {}, 'home')}>
            <Triangle size={20} />
          </button>
        </>
      }
      fab={<Fab icon={<Plus size={22} />} label="Punto" onClick={() => setSheet(true)} />}
    >
      <div className="stack">
        <PointKpis points={points} />
        <Segmented
          value={ui.mode}
          onChange={(mode) => ui.set({ mode })}
          options={[
            { value: 'list', label: <span className="pt-seg"><List size={17} /> Lista</span> },
            { value: 'plan', label: <span className="pt-seg"><MapIcon size={17} /> Planta</span> },
          ]}
        />
        {points.length === 0 ? (
          <EmptyState
            icon={<MapPin size={30} />}
            title="Aún no hay puntos"
            text="Agrega puntos a mano, con el GPS del teléfono, por radiación desde una estación o importando un archivo."
            action={
              <button className="btn primary lg" onClick={() => setSheet(true)}>
                <Plus size={20} /> Agregar punto
              </button>
            }
          />
        ) : ui.mode === 'list' ? (
          <PointList points={points} projectName={project.name} />
        ) : (
          <PlanPanel />
        )}
      </div>

      <Sheet open={sheet} title="Nuevo punto" onClose={() => setSheet(false)}>
        <div className="list">
          <SheetOption icon={<PenLine size={22} />} tone="brand" title="Manual" sub="Escribir Este, Norte y Cota" onClick={() => { setSheet(false); go('point-edit'); }} />
          <SheetOption icon={<Crosshair size={22} />} tone="accent" title="Radiación desde estación" sub="Hz, cenital y distancia inclinada" onClick={() => { setSheet(false); go('point-edit', { mode: 'radiation' }); }} />
          <SheetOption icon={<Smartphone size={22} />} tone="info" title="GPS del teléfono" sub="Precisión de metros, para croquis" onClick={() => { setSheet(false); go('phone-gps'); }} />
          <SheetOption icon={<FileUp size={22} />} tone="ok" title="Importar archivo" sub="CSV, TXT, GSI, SDR…" onClick={() => { setSheet(false); go('import', {}, 'reports'); }} />
        </div>
      </Sheet>
    </Screen>
  );
}

function SheetOption({
  icon,
  tone,
  title,
  sub,
  onClick,
}: {
  icon: React.ReactNode;
  tone: 'brand' | 'accent' | 'info' | 'ok';
  title: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button className="list-item" onClick={onClick}>
      <div className={`li-icon tone-${tone}`}>{icon}</div>
      <div className="li-body">
        <div className="li-title">{title}</div>
        <div className="li-sub">{sub}</div>
      </div>
    </button>
  );
}

function PointKpis({ points }: { points: SurveyPoint[] }) {
  const stats = useMemo(() => {
    const zr = zRange(points);
    const area = hullArea(points);
    return { zr, area };
  }, [points]);
  return (
    <div className="pt-kpis">
      <div className="pt-kpi">
        <span>Puntos</span>
        <strong className="num">{points.length}</strong>
      </div>
      <div className="pt-kpi">
        <span>Cotas (m)</span>
        <strong className="num">{stats.zr ? `${f(stats.zr.min, 2)}–${f(stats.zr.max, 2)}` : '—'}</strong>
      </div>
      <div className="pt-kpi">
        <span>Envolvente</span>
        <strong className="num">
          {stats.area > 0 ? (stats.area >= 10000 ? `${f(stats.area / 10000, 2)} ha` : `${thousands(stats.area, 0)} m²`) : '—'}
        </strong>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Lista                                                               */
/* ------------------------------------------------------------------ */

function useFiltered(points: SurveyPoint[]) {
  const { q, code } = usePointsUi();
  return useMemo(() => {
    const qq = q.trim().toLowerCase();
    return points.filter((p) => {
      const c = (p.code ?? '').trim().toUpperCase() || '—';
      if (code !== '*' && c !== code) return false;
      if (!qq) return true;
      return p.name.toLowerCase().includes(qq) || (p.code ?? '').toLowerCase().includes(qq) || (p.note ?? '').toLowerCase().includes(qq);
    });
  }, [points, q, code]);
}

function FilterBar({ points }: { points: SurveyPoint[] }) {
  const { q, code, set } = usePointsUi();
  const counts = useMemo(() => codeCounts(points), [points]);
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="pt-search">
        <Search size={18} />
        <input
          className="input"
          value={q}
          placeholder="Buscar por nombre o código"
          aria-label="Buscar puntos"
          onChange={(e) => set({ q: e.target.value })}
        />
        {q && (
          <button className="icon-btn" aria-label="Limpiar búsqueda" onClick={() => set({ q: '' })}>
            <X size={18} />
          </button>
        )}
      </div>
      <Chips
        value={code}
        onChange={(v) => set({ code: v })}
        options={[
          { value: '*', label: <>Todos <span className="pt-chip-n">{points.length}</span></> },
          ...counts.map((c) => ({
            value: c.code,
            label: (
              <>
                {c.code === '—' ? 'Sin código' : c.code} <span className="pt-chip-n">{c.n}</span>
              </>
            ),
          })),
        ]}
      />
    </div>
  );
}

function PointList({ points, projectName }: { points: SurveyPoint[]; projectName: string }) {
  const filtered = useFiltered(points);
  const [limit, setLimit] = useState(PAGE);
  const [sel, setSel] = useState<Set<string> | null>(null);
  const longPress = useRef<{ t: number; id: string; fired: boolean } | null>(null);

  const toggle = (id: string) =>
    setSel((s) => {
      const n = new Set(s ?? []);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const startPress = (id: string) => {
    if (sel) return;
    const t = window.setTimeout(() => {
      if (longPress.current?.id === id) {
        longPress.current.fired = true;
        navigator.vibrate?.(15);
        setSel(new Set([id]));
      }
    }, 480);
    longPress.current = { t, id, fired: false };
  };
  const cancelPress = () => {
    if (longPress.current) clearTimeout(longPress.current.t);
  };

  const onRowClick = (id: string) => {
    if (longPress.current?.fired) {
      longPress.current = null;
      return;
    }
    if (sel) toggle(id);
    else go('point-edit', { id });
  };

  const selected = sel ? points.filter((p) => sel.has(p.id)) : [];

  const del = async () => {
    if (!sel || sel.size === 0) return;
    const ok = await confirmDialog({
      title: `Eliminar ${sel.size} punto${sel.size === 1 ? '' : 's'}`,
      text: 'Se quitarán del proyecto. Esta acción se puede deshacer desde el aviso.',
      okLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    const removed = selected;
    useStore.getState().deletePoints([...sel]);
    setSel(null);
    toast(`${removed.length} punto(s) eliminados`, 'ok', {
      label: 'Deshacer',
      run: () => useStore.getState().addPoints(removed),
    });
  };

  const exportSel = async () => {
    const list = sel && sel.size ? selected : filtered;
    await saveFile(`${slug(projectName)}-puntos.csv`, pointsCsv(list), 'text/csv');
    toast(`${list.length} punto(s) exportados (CSV)`);
  };

  return (
    <>
      <FilterBar points={points} />
      {sel ? (
        <div className="pt-selbar">
          <button className="icon-btn" aria-label="Salir de selección" onClick={() => setSel(null)}>
            <X size={20} />
          </button>
          <strong className="grow">{sel.size} seleccionado{sel.size === 1 ? '' : 's'}</strong>
          <button
            className="btn ghost sm"
            onClick={() => setSel(sel.size === filtered.length ? new Set() : new Set(filtered.map((p) => p.id)))}
          >
            {sel.size === filtered.length ? 'Ninguno' : 'Todos'}
          </button>
          <button className="icon-btn" aria-label="Exportar seleccionados" disabled={!sel.size} onClick={exportSel}>
            <Download size={20} />
          </button>
          <button className="icon-btn pt-danger" aria-label="Eliminar seleccionados" disabled={!sel.size} onClick={del}>
            <Trash2 size={20} />
          </button>
        </div>
      ) : (
        <div className="row-between">
          <span className="muted small">
            {filtered.length === points.length ? `${points.length} puntos` : `${filtered.length} de ${points.length} puntos`}
          </span>
          <div className="row" style={{ gap: 4 }}>
            <button className="btn ghost sm" onClick={exportSel} disabled={!filtered.length}>
              <Download size={16} /> CSV
            </button>
            <button className="btn ghost sm" onClick={() => setSel(new Set())} disabled={!filtered.length}>
              <CheckSquare size={16} /> Seleccionar
            </button>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="muted" style={{ textAlign: 'center', padding: 24 }}>
          Ningún punto coincide con el filtro.
        </p>
      ) : (
        <div className="list pt-list">
          {filtered.slice(0, limit).map((p) => {
            const Icon = SOURCE_ICON[p.source] ?? MapPin;
            const on = sel?.has(p.id) ?? false;
            return (
              <button
                key={p.id}
                className={`pt-row${on ? ' selected' : ''}`}
                onClick={() => onRowClick(p.id)}
                onPointerDown={() => startPress(p.id)}
                onPointerUp={cancelPress}
                onPointerLeave={cancelPress}
                onPointerCancel={cancelPress}
                onContextMenu={(e) => e.preventDefault()}
              >
                {sel ? (
                  <span className={`pt-check${on ? ' on' : ''}`} aria-hidden>
                    {on && <CheckSquare size={18} />}
                  </span>
                ) : (
                  <span className="pt-src" title={SOURCE_LABEL[p.source]} aria-label={SOURCE_LABEL[p.source]}>
                    <Icon size={17} />
                  </span>
                )}
                <span className="pt-main">
                  <span className="pt-name">
                    <strong>{p.name}</strong>
                    {p.code && <span className={`badge ${/^(BM|PR)/i.test(p.code) ? 'info' : 'neutral'} pt-code`}>{p.code}</span>}
                  </span>
                  <span className="pt-en num">
                    E {f(p.x, 3)} · N {f(p.y, 3)}
                  </span>
                </span>
                <span className="pt-z num">
                  {hasZ(p) ? f(p.z, 3) : '—'}
                  <small>Z</small>
                </span>
              </button>
            );
          })}
        </div>
      )}
      {filtered.length > limit && (
        <button className="btn ghost block" onClick={() => setLimit((l) => l + PAGE)}>
          Ver más ({filtered.length - limit} restantes)
        </button>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Planta                                                              */
/* ------------------------------------------------------------------ */

function triList(tin: Tin): PlanTriangle[] {
  const out: PlanTriangle[] = [];
  const tr = tin.triangles;
  for (let t = 0; t < tr.length / 3; t++) {
    const a = tin.points[tr[3 * t]], b = tin.points[tr[3 * t + 1]], c = tin.points[tr[3 * t + 2]];
    out.push({ x: [a.x, b.x, c.x], y: [a.y, b.y, c.y], z: (a.z + b.z + c.z) / 3 });
  }
  return out;
}

export function useTin(points: SurveyPoint[]): Tin | null {
  return useMemo(() => {
    const zp = points.filter(hasZ).map((p) => ({ x: p.x, y: p.y, z: p.z as number }));
    if (zp.length < 3) return null;
    const tin = buildTin(zp);
    return tin.triangles.length ? tin : null;
  }, [points]);
}

function PlanPanel() {
  const project = useProject();
  const ui = usePointsUi();
  const points = project?.points ?? [];
  const filtered = useFiltered(points);
  const tin = useTin(points);
  const [selId, setSelId] = useState<string | null>(null);
  const [measureFrom, setMeasureFrom] = useState<string | null>(null);
  const [measureTo, setMeasureTo] = useState<string | null>(null);

  const pp = useMemo(() => planPoints(filtered), [filtered]);
  const bms = useMemo(() => (project ? planBenchmarks(project) : []), [project]);
  const interval = tin ? autoContourInterval(tin.bbox.maxZ - tin.bbox.minZ) : 0.5;
  const cont: ContourLevel[] | undefined = useMemo(
    () => (tin && ui.showContours ? buildContours(tin, interval, 0, 5) : undefined),
    [tin, interval, ui.showContours],
  );
  const tris = useMemo(() => (tin && ui.showTin ? triList(tin) : undefined), [tin, ui.showTin]);

  const all = useMemo(() => [...pp, ...bms], [pp, bms]);
  const byId = (id: string | null) => (id ? all.find((p) => p.id === id) : undefined);
  const sel = byId(selId);
  const from = byId(measureFrom);
  const to = byId(measureTo);
  const inv = from && to ? inverse(from, to) : null;

  const onTap = (id: string | null) => {
    if (measureFrom) {
      if (id && id !== measureFrom) setMeasureTo(id);
      return;
    }
    setSelId(id);
  };

  const highlight = [selId, measureFrom, measureTo].filter((x): x is string => !!x);
  const realPoint = sel && !sel.id.startsWith('bm:') ? points.find((p) => p.id === sel.id) : undefined;

  return (
    <>
      <FilterBar points={points} />
      <div className="pt-toggles">
        <button
          className={`chip${ui.showContours ? ' active' : ''}`}
          aria-pressed={ui.showContours}
          disabled={!tin}
          onClick={() => ui.set({ showContours: !ui.showContours })}
        >
          <Layers size={15} /> Curvas {tin ? `· ${interval} m` : ''}
        </button>
        <button
          className={`chip${ui.showTin ? ' active' : ''}`}
          aria-pressed={ui.showTin}
          disabled={!tin}
          onClick={() => ui.set({ showTin: !ui.showTin })}
        >
          <Triangle size={15} /> Triángulos TIN
        </button>
        {!tin && <span className="xs faint">Se necesitan ≥ 3 puntos con cota</span>}
      </div>
      <PlanView
        points={pp}
        benchmarks={bms}
        contours={cont}
        triangles={tris}
        triangleEdges
        lines={from && to ? [{ x1: from.x, y1: from.y, x2: to.x, y2: to.y }] : undefined}
        highlightIds={highlight}
        onPointTap={onTap}
        height="max(340px, calc(100dvh - var(--nav-h) - 445px))"
      >
        {measureFrom && from && (
          <div className="pv-card pt-measure" role="status">
            <div className="row-between">
              <strong>
                <Ruler size={16} /> Medir desde {from.name}
              </strong>
              <button
                className="icon-btn"
                aria-label="Terminar medición"
                onClick={() => {
                  setMeasureFrom(null);
                  setMeasureTo(null);
                }}
              >
                <X size={20} />
              </button>
            </div>
            {inv && to ? (
              <div className="pt-measure-grid">
                <span>Hasta</span>
                <strong>{to.name}</strong>
                <span>Distancia H</span>
                <strong className="num">{f(inv.dh, 3)} m</strong>
                <span>Azimut</span>
                <strong className="num">{formatDms(inv.azimuth, 0)}</strong>
                <span>Desnivel</span>
                <strong className="num">{inv.dz !== undefined ? `${fs(inv.dz, 3)} m` : '—'}</strong>
                <span>Pendiente</span>
                <strong className="num">{inv.slopePercent !== undefined ? `${fs(inv.slopePercent, 2)} %` : '—'}</strong>
              </div>
            ) : (
              <p className="muted small">Toca un segundo punto en la planta.</p>
            )}
          </div>
        )}
        {!measureFrom && sel && (
          <div className="pv-card" role="dialog" aria-label={`Punto ${sel.name}`}>
            <div className="row-between">
              <div className="row" style={{ gap: 8 }}>
                <strong style={{ fontSize: 17 }}>{sel.name}</strong>
                {sel.code && <span className="badge neutral">{sel.code}</span>}
                {sel.id.startsWith('bm:') && <span className="badge info">BM</span>}
              </div>
              <button className="icon-btn" aria-label="Cerrar" onClick={() => setSelId(null)}>
                <X size={20} />
              </button>
            </div>
            <div className="pt-card-coords num">
              <span>E {f(sel.x, 3)}</span>
              <span>N {f(sel.y, 3)}</span>
              <span>Z {sel.z !== undefined ? f(sel.z, 3) : '—'}</span>
            </div>
            {realPoint && (
              <div className="xs muted">
                {SOURCE_LABEL[realPoint.source]}
                {realPoint.precision !== undefined ? ` · ±${f(realPoint.precision, 1)} m` : ''}
                {realPoint.note ? ` · ${realPoint.note}` : ''}
              </div>
            )}
            <div className="grid-2">
              <button
                className="btn ghost"
                disabled={!realPoint}
                onClick={() => realPoint && go('point-edit', { id: realPoint.id })}
              >
                <PenLine size={18} /> Editar
              </button>
              <button
                className="btn primary"
                onClick={() => {
                  setMeasureFrom(sel.id);
                  setMeasureTo(null);
                  setSelId(null);
                }}
              >
                <Ruler size={18} /> Medir desde aquí
              </button>
            </div>
          </div>
        )}
      </PlanView>

    </>
  );
}
