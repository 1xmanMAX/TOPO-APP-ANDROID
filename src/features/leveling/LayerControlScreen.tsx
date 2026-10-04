/** 'layer-control' — verificación de cotas por capa de pavimento. */
import { useMemo, useState } from 'react';
import { Crosshair, FileDown, FileSpreadsheet, MoreVertical, Pencil, Plus, Ruler, Trash2, TrendingUp } from 'lucide-react';
import type { ScreenProps } from '@/app/feature';
import { go, useNav } from '@/app/nav';
import { useStore } from '@/app/store';
import { checkLayer, gridLabel, layerDesignElevation, layerSummary } from '@/core/pavement';
import type { ControlPoint, DesignGrade, ID, LayerCheck, LayerControl, PavementLayer, Project } from '@/core/types';
import { Kpi, ListItem, NumberInput, Screen, Sheet, StatusBadge, TextInput, confirmDialog, toast } from '@/ui/kit';
import { f, fs, station } from '@/ui/format';
import { ProfileChart } from '@/ui/charts/ProfileChart';
import { GradeEditor, LayersEditor, gradeText } from './LayerParts';
import { NoProject, NotFound, useControl } from './shared';
import { exportLayerPdf, exportLayerXlsx } from './exports';

const offLabel = (o: number) => (Math.abs(o) < 1e-9 ? 'Eje' : `${o < 0 ? 'Izq' : 'Der'} ${+Math.abs(o).toFixed(2)}`);
/** Progresiva sin decimales si es entera. */
const sta = (m: number) => station(m, Math.abs(m - Math.round(m)) < 1e-6 ? 0 : 2);
const devClass = (c: LayerCheck) => (c.deviation === undefined ? '' : c.status === 'ok' ? 'c-ok' : c.status === 'warn' ? 'c-warn' : 'c-fail');

/** Capa preferida: la más alta con mediciones (capa en ejecución) o la primera. */
export function defaultLayer(c: LayerControl): ID | undefined {
  const withData = c.layers.find((l) => c.points.some((p) => Number.isFinite(p.measured[l.id])));
  return withData?.id ?? c.layers[0]?.id;
}

export function LayerControlScreen({ params }: ScreenProps) {
  const { project, control } = useControl(params.id as string);
  if (!project) return <NoProject back />;
  if (!control) return <NotFound what="El control de capas" />;
  return <ControlView project={project} control={control} initialLayer={params.layerId as string | undefined} />;
}

function ControlView({ project, control, initialLayer }: { project: Project; control: LayerControl; initialLayer?: string }) {
  const [layerId, setLayerId] = useState<ID | undefined>(() =>
    initialLayer && control.layers.some((l) => l.id === initialLayer) ? initialLayer : defaultLayer(control),
  );
  const [more, setMore] = useState(false);
  const [editDef, setEditDef] = useState(false);
  const [addPt, setAddPt] = useState(false);
  const [editPt, setEditPt] = useState<ControlPoint | null>(null);
  const layer = control.layers.find((l) => l.id === layerId) ?? control.layers[0];
  const layerIdx = control.layers.findIndex((l) => l.id === layer?.id);

  const checks = useMemo(() => (layer ? checkLayer(control, layer.id) : []), [control, layer]);
  const sum = useMemo(() => layerSummary(checks), [checks]);
  const axis = useMemo(
    () =>
      checks
        .filter((c) => Math.abs(c.offset) < 1e-9)
        .map((c) => ({ x: c.station, y: c.measured, design: c.design, label: station(c.station, 0) })),
    [checks],
  );
  const allPerLayer = useMemo(
    () => control.layers.map((l) => ({ l, s: layerSummary(checkLayer(control, l.id)) })),
    [control],
  );

  const del = async () => {
    setMore(false);
    const ok = await confirmDialog({ title: 'Eliminar control de capas', text: `Se eliminará "${control.name}" con todas sus mediciones.`, okLabel: 'Eliminar', danger: true });
    if (!ok) return;
    useStore.getState().deleteLayerControl(control.id);
    useNav.getState().back();
    toast('Control eliminado');
  };

  if (!layer) {
    return (
      <Screen title={control.name} back>
        <p className="muted">Este control no tiene capas.</p>
        <button className="btn primary" onClick={() => setEditDef(true)}>
          Editar capas
        </button>
        <DefSheet open={editDef} control={control} onClose={() => setEditDef(false)} />
      </Screen>
    );
  }

  return (
    <Screen
      title={control.name}
      subtitle={`${control.points.length} puntos · ${control.layers.length} capas`}
      back
      wide
      actions={
        <>
          <button className="icon-btn" aria-label="Informe PDF" title="Informe PDF" onClick={() => exportLayerPdf(project, control.id, layer.id)}>
            <FileDown size={21} />
          </button>
          <button className="icon-btn" aria-label="Más acciones" onClick={() => setMore(true)}>
            <MoreVertical size={21} />
          </button>
        </>
      }
    >
      <div className="stack-l">
        <button className="card lc-grade tappable" onClick={() => setEditDef(true)}>
          <TrendingUp size={20} className="c-brand" />
          <span className="grow small">
            <b>Rasante</b> · {gradeText(control.grade)}
          </span>
          <Pencil size={16} className="faint" />
        </button>

        <div className="lc-layer-chips">
          {allPerLayer.map(({ l, s }) => (
            <button key={l.id} className={`lc-lchip${l.id === layer.id ? ' active' : ''}`} onClick={() => setLayerId(l.id)}>
              <span className="lc-lchip-name">{l.name}</span>
              <span className="lc-lchip-sub num">
                {s.measured}/{s.total}
                {s.measured > 0 && ` · ${s.pctOk.toFixed(0)} %`}
              </span>
              <span className="lc-lchip-bar">
                <i style={{ width: `${s.total ? (s.measured / s.total) * 100 : 0}%` }} />
              </span>
            </button>
          ))}
        </div>

        <div className="grid-auto lv-kpis">
          <Kpi
            label="Conformes"
            value={sum.measured ? sum.pctOk.toFixed(0) : '—'}
            unit="%"
            tone={!sum.measured ? undefined : sum.pctOk >= 90 ? 'ok' : sum.pctOk >= 70 ? 'warn' : 'fail'}
            sub={`${sum.ok} ok · ${sum.warn} límite · ${sum.fail} fuera`}
          />
          <Kpi label="Máx. alto" value={sum.measured ? fs(sum.maxHigh * 1000, 0) : '—'} unit="mm" sub="medido > diseño" />
          <Kpi label="Máx. bajo" value={sum.measured ? fs(sum.maxLow * 1000, 0) : '—'} unit="mm" sub="medido < diseño" />
          <Kpi label="Pendientes" value={sum.pending} sub={`de ${sum.total} · tol. ±${(layer.tolerance * 1000).toFixed(0)} mm`} />
        </div>

        <button className="btn primary lg block lc-measure" onClick={() => go('layer-entry', { id: control.id, layerId: layer.id })}>
          <Crosshair size={22} /> Medir {layer.name}
          {sum.pending > 0 && <span className="lc-pill">{sum.pending} pendientes</span>}
        </button>

        <div className="card">
          <div className="card-header">
            <h3>Perfil del eje · {layer.name}</h3>
            <span className="xs faint">capa {layerIdx + 1} · −{control.layers.slice(0, layerIdx).reduce((a, l) => a + l.thickness, 0).toFixed(2)} m</span>
          </div>
          {axis.length ? (
            <ProfileChart data={axis} height={240} xFormat={(x) => station(x, 0)} xTitle="Progresiva" seriesLabel="Medido" designLabel="Diseño" showLabels={false} />
          ) : (
            <p className="small faint">No hay puntos en el eje (desplazamiento 0).</p>
          )}
        </div>

        <div className="card flush">
          <div className="table-wrap">
            <table className="table lc-table">
              <thead>
                <tr>
                  <th>Progresiva</th>
                  <th>Despl.</th>
                  <th>Diseño</th>
                  <th>Medida</th>
                  <th>Dif mm</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {checks.map((c) => (
                  <tr key={c.pointId} className="clickable" onClick={() => setEditPt(control.points.find((p) => p.id === c.pointId) ?? null)}>
                    <td>{sta(c.station)}</td>
                    <td className="text faint">{offLabel(c.offset)}</td>
                    <td>{f(c.design)}</td>
                    <td>
                      <b>{c.measured !== undefined ? f(c.measured) : ''}</b>
                    </td>
                    <td className={devClass(c)}>
                      <b>{c.deviation !== undefined ? fs(c.deviation * 1000, 0) : ''}</b>
                    </td>
                    <td className="text lc-st">
                      <StatusBadge status={c.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid-2">
          <button className="btn ghost lg" onClick={() => setAddPt(true)}>
            <Plus size={20} /> Punto manual
          </button>
          <button className="btn ghost lg" onClick={() => exportLayerXlsx(project, control.id)}>
            <FileSpreadsheet size={20} /> Excel
          </button>
        </div>
      </div>

      <Sheet open={more} title="Acciones" onClose={() => setMore(false)}>
        <div className="card flush">
          <div className="list">
            <ListItem icon={<Crosshair size={20} />} title={`Medir ${layer.name}`} onClick={() => { setMore(false); go('layer-entry', { id: control.id, layerId: layer.id }); }} />
            <ListItem icon={<Ruler size={20} />} tone="accent" title="Editar rasante y capas" onClick={() => { setMore(false); setEditDef(true); }} />
            <ListItem icon={<Plus size={20} />} tone="info" title="Añadir punto de control" onClick={() => { setMore(false); setAddPt(true); }} />
            <ListItem icon={<FileDown size={20} />} tone="fail" title="Informe PDF" sub={`Capa: ${layer.name}`} onClick={() => { setMore(false); exportLayerPdf(project, control.id, layer.id); }} />
            <ListItem icon={<FileSpreadsheet size={20} />} tone="ok" title="Excel (.xlsx)" sub="Todas las capas" onClick={() => { setMore(false); exportLayerXlsx(project, control.id); }} />
            <ListItem icon={<Trash2 size={20} />} tone="fail" title="Eliminar control" onClick={del} />
          </div>
        </div>
      </Sheet>

      <DefSheet open={editDef} control={control} onClose={() => setEditDef(false)} />
      <PointSheet open={addPt} control={control} layer={layer} onClose={() => setAddPt(false)} />
      <PointSheet open={!!editPt} control={control} layer={layer} point={editPt ?? undefined} onClose={() => setEditPt(null)} />
    </Screen>
  );
}

function DefSheet({ open, control, onClose }: { open: boolean; control: LayerControl; onClose: () => void }) {
  return (
    <Sheet open={open} title="Rasante y capas" onClose={onClose}>
      {open && <DefEditor control={control} onClose={onClose} />}
    </Sheet>
  );
}

function DefEditor({ control, onClose }: { control: LayerControl; onClose: () => void }) {
  const [name, setName] = useState(control.name);
  const [grade, setGrade] = useState<DesignGrade>(control.grade);
  const [layers, setLayers] = useState<PavementLayer[]>(control.layers);
  return (
    <div className="stack-l">
      <TextInput label="Nombre" value={name} onChange={setName} />
      <GradeEditor grade={grade} onChange={setGrade} />
      <LayersEditor layers={layers} onChange={setLayers} />
      <button
        className="btn primary lg block"
        disabled={!name.trim() || !layers.length}
        onClick={() => {
          useStore.getState().updateLayerControl(control.id, { name: name.trim(), grade, layers });
          toast('Control actualizado');
          onClose();
        }}
      >
        Guardar
      </button>
    </div>
  );
}

function PointSheet({ open, control, layer, point, onClose }: { open: boolean; control: LayerControl; layer: PavementLayer; point?: ControlPoint; onClose: () => void }) {
  return (
    <Sheet open={open} title={point ? `${station(point.station)} · ${offLabel(point.offset)}` : 'Nuevo punto de control'} onClose={onClose}>
      {open && <PointEditor key={point?.id ?? 'new'} control={control} layer={layer} point={point} onClose={onClose} />}
    </Sheet>
  );
}

function PointEditor({ control, layer, point, onClose }: { control: LayerControl; layer: PavementLayer; point?: ControlPoint; onClose: () => void }) {
  const st = useStore.getState;
  const [sta, setSta] = useState<number | undefined>(point?.station ?? control.points[control.points.length - 1]?.station);
  const [off, setOff] = useState<number | undefined>(point?.offset ?? 0);
  // La etiqueta automática ("0+020.00 Izq 3.6") se regenera si se mueve el punto; solo se conserva una escrita a mano.
  const [label, setLabel] = useState(point?.label && point.label !== gridLabel(point.station, point.offset) ? point.label : '');
  const [override, setOverride] = useState<number | undefined>(point?.designOverride);
  const [meas, setMeas] = useState<number | undefined>(point?.measured[layer.id]);
  const idx = control.layers.findIndex((l) => l.id === layer.id);
  const design = sta !== undefined && off !== undefined ? layerDesignElevation(control, { station: sta, offset: off, designOverride: override }, idx) : undefined;
  const dev = meas !== undefined && design !== undefined ? meas - design : undefined;
  return (
    <div className="stack">
      <div className="grid-2">
        <NumberInput label="Progresiva" suffix="m" value={sta} onChange={setSta} />
        <NumberInput label="Desplazamiento" suffix="m" value={off} onChange={setOff} hint="− izq · + der" />
      </div>
      <TextInput label="Etiqueta (opcional)" value={label} onChange={setLabel} placeholder={sta !== undefined && off !== undefined ? gridLabel(sta, off) : undefined} />
      <NumberInput label="Cota de rasante explícita (opcional)" suffix="m" value={override} onChange={setOverride} hint="Prevalece sobre la rasante por pendientes" />
      <NumberInput label={`Cota medida · ${layer.name}`} suffix="m" value={meas} onChange={setMeas} />
      <div className="lv-kv">
        <span>Diseño {layer.name}</span>
        <b className="num">{f(design)}</b>
      </div>
      {dev !== undefined && (
        <div className="lv-kv">
          <span>Diferencia</span>
          <b className={`num ${Math.abs(dev) <= layer.tolerance + 1e-9 ? 'c-ok' : 'c-fail'}`}>{fs(dev * 1000, 0)} mm</b>
        </div>
      )}
      <button
        className="btn primary lg block"
        disabled={sta === undefined || off === undefined}
        onClick={() => {
          const measured = { ...(point?.measured ?? {}) };
          if (meas === undefined) delete measured[layer.id];
          else measured[layer.id] = meas;
          st().upsertControlPoint(control.id, { id: point?.id, station: sta!, offset: off!, label: label.trim() || gridLabel(sta!, off!), designOverride: override, measured });
          toast(point ? 'Punto actualizado' : 'Punto añadido');
          onClose();
        }}
      >
        {point ? 'Guardar' : 'Añadir punto'}
      </button>
      {point && (
        <button
          className="btn danger lg block"
          onClick={() => {
            st().deleteControlPoint(control.id, point.id);
            toast('Punto eliminado', 'warn', { label: 'Deshacer', run: () => st().upsertControlPoint(control.id, point) });
            onClose();
          }}
        >
          <Trash2 size={18} /> Eliminar punto
        </button>
      )}
    </div>
  );
}
