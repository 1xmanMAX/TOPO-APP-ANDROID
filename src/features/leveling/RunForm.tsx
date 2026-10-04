/** Pantallas 'level-new' y 'level-edit': datos de la nivelación. */
import { useState, type ReactNode } from 'react';
import { Play, Save, Trash2, ChevronDown, MapPinned, Plus } from 'lucide-react';
import type { ScreenProps } from '@/app/feature';
import { useNav } from '@/app/nav';
import { useProject, useStore } from '@/app/store';
import type { Benchmark, LevelClosure, LevelMethod, LevelOrder, LevelRun } from '@/core/types';
import { ORDER_K, ORDER_LABEL } from '@/core/leveling';
import { Field, NumberInput, Screen, Segmented, TextInput, confirmDialog, toast } from '@/ui/kit';
import { f, todayISO } from '@/ui/format';
import { CLOSURE_LABEL, METHOD_LABEL, NoProject, NotFound, defaultRunName, useRun } from './shared';

interface BMChoice {
  /** id de BM del proyecto o 'other'. */
  pick: string;
  name: string;
  elevation: number | undefined;
}

interface Draft {
  name: string;
  date: string;
  start: BMChoice;
  closure: LevelClosure;
  end: BMChoice;
  order: LevelOrder;
  customK: number | undefined;
  method: LevelMethod;
  instrument: string;
  operator: string;
  weather: string;
  notes: string;
}

function choiceFor(bms: Benchmark[], v: { name: string; elevation: number } | undefined): BMChoice {
  if (!v) return bms[0] ? { pick: bms[0].id, name: bms[0].name, elevation: bms[0].elevation } : { pick: 'other', name: '', elevation: undefined };
  const m = bms.find((b) => b.name === v.name && Math.abs(b.elevation - v.elevation) < 1e-9);
  return m ? { pick: m.id, name: m.name, elevation: m.elevation } : { pick: 'other', name: v.name, elevation: v.elevation };
}

const ORDERS: LevelOrder[] = ['first', 'second', 'third', 'ordinary', 'custom'];
const ORDER_SHORT: Record<LevelOrder, string> = {
  first: '1er orden',
  second: '2º orden',
  third: '3er orden',
  ordinary: 'Ordinaria',
  custom: 'Personalizada',
};

function BMPicker({ bms, value, onChange, label }: { bms: Benchmark[]; value: BMChoice; onChange: (v: BMChoice) => void; label: ReactNode }) {
  return (
    <Field label={label}>
      <div className="lv-bm-grid">
        {bms.map((b) => (
          <button
            key={b.id}
            type="button"
            className={`lv-bm${value.pick === b.id ? ' active' : ''}`}
            onClick={() => onChange({ pick: b.id, name: b.name, elevation: b.elevation })}
          >
            <span className="lv-bm-name">
              <MapPinned size={15} /> {b.name}
            </span>
            <span className="num lv-bm-elev">{f(b.elevation)}</span>
          </button>
        ))}
        <button
          type="button"
          className={`lv-bm other${value.pick === 'other' ? ' active' : ''}`}
          onClick={() => onChange({ pick: 'other', name: value.pick === 'other' ? value.name : '', elevation: value.pick === 'other' ? value.elevation : undefined })}
        >
          <span className="lv-bm-name">
            <Plus size={15} /> Otro
          </span>
          <span className="xs faint">nombre y cota</span>
        </button>
      </div>
      {value.pick === 'other' && (
        <div className="grid-2" style={{ marginTop: 8 }}>
          <TextInput label="Nombre" value={value.name} placeholder="BM-3" onChange={(name) => onChange({ ...value, name })} />
          <NumberInput label="Cota" suffix="m" value={value.elevation} onChange={(elevation) => onChange({ ...value, elevation })} />
        </div>
      )}
    </Field>
  );
}

function RunForm({ initial, mode, onSubmit, onDelete, quick }: {
  initial: Draft;
  mode: 'new' | 'edit';
  quick?: boolean;
  onSubmit: (d: Draft) => void;
  onDelete?: () => void;
}) {
  const project = useProject();
  const bms = project?.benchmarks ?? [];
  const [d, setD] = useState<Draft>(initial);
  const [more, setMore] = useState(!quick);
  const [extras, setExtras] = useState(mode === 'edit');
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  const startOk = d.start.name.trim() !== '' && d.start.elevation !== undefined;
  const endOk = d.closure !== 'known-bm' || (d.end.name.trim() !== '' && d.end.elevation !== undefined);
  const kOk = d.order !== 'custom' || (d.customK !== undefined && d.customK > 0);
  const valid = startOk && endOk && kOk && (d.name.trim() !== '' || mode === 'new');
  const problem = !startOk ? 'Elige el BM de inicio (o indica nombre y cota)' : !endOk ? 'Indica el BM de llegada' : !kOk ? 'Indica el coeficiente e en mm' : null;

  return (
    <div className="stack-l lv-form">
      <BMPicker bms={bms} label="BM de inicio" value={d.start} onChange={(v) => set('start', v)} />

      {!more && (
        <button className="btn ghost block" onClick={() => setMore(true)}>
          <ChevronDown size={18} /> Ajustar nombre, cierre, clase y método
          <span className="faint small">({CLOSURE_LABEL[d.closure]} · {ORDER_SHORT[d.order]})</span>
        </button>
      )}

      {more && (
        <>
          <TextInput label="Nombre" value={d.name} onChange={(v) => set('name', v)} placeholder={defaultRunName()} />

          <Field label="Tipo de cierre">
            <Segmented<LevelClosure>
              value={d.closure}
              onChange={(v) => set('closure', v)}
              options={(['loop', 'known-bm', 'open'] as LevelClosure[]).map((v) => ({ value: v, label: CLOSURE_LABEL[v] }))}
            />
            <span className="hint">
              {d.closure === 'loop'
                ? `Se vuelve al BM de inicio (${d.start.name || '—'}).`
                : d.closure === 'known-bm'
                  ? 'Se llega a otro BM de cota conocida.'
                  : 'Sin control de cierre: úsala solo para radiaciones rápidas.'}
            </span>
          </Field>

          {d.closure === 'known-bm' && <BMPicker bms={bms} label="BM de llegada" value={d.end} onChange={(v) => set('end', v)} />}

          <Field label="Clase de nivelación · tolerancia T = e·√K">
            <div className="lv-opt-grid">
              {ORDERS.map((o) => (
                <button key={o} type="button" className={`lv-opt${d.order === o ? ' active' : ''}`} onClick={() => set('order', o)} title={ORDER_LABEL[o]}>
                  <strong>{ORDER_SHORT[o]}</strong>
                  <span className="num">{o === 'custom' ? 'e = ? mm' : `e = ${ORDER_K[o]} mm`}</span>
                </button>
              ))}
            </div>
            <span className="hint">{ORDER_LABEL[d.order]}</span>
          </Field>
          {d.order === 'custom' && (
            <NumberInput label="Coeficiente e" suffix="mm" value={d.customK} onChange={(v) => set('customK', v)} hint="T = e·√K, con K en km" />
          )}

          <Field label="Método de cálculo">
            <Segmented<LevelMethod>
              value={d.method}
              onChange={(v) => set('method', v)}
              options={(['HI', 'RF'] as LevelMethod[]).map((v) => ({ value: v, label: METHOD_LABEL[v] }))}
            />
          </Field>

          <div className="card lv-collapse">
            <button className="row-between lv-collapse-h" onClick={() => setExtras((x) => !x)} aria-expanded={extras}>
              <span>
                <strong>Datos opcionales</strong>
                <span className="faint small"> · instrumento, operador, clima</span>
              </span>
              <ChevronDown size={20} style={{ transform: extras ? 'rotate(180deg)' : undefined, transition: 'transform .2s' }} />
            </button>
            {extras && (
              <div className="stack" style={{ marginTop: 12 }}>
                <Field label="Fecha">
                  <input className="input" type="date" value={d.date} onChange={(e) => set('date', e.target.value)} />
                </Field>
                <TextInput label="Instrumento" value={d.instrument} onChange={(v) => set('instrument', v)} placeholder="Sokkia B40" />
                <TextInput label="Operador" value={d.operator} onChange={(v) => set('operator', v)} />
                <TextInput label="Clima" value={d.weather} onChange={(v) => set('weather', v)} placeholder="Soleado, viento leve" />
                <Field label="Notas">
                  <textarea className="input" value={d.notes} onChange={(e) => set('notes', e.target.value)} />
                </Field>
              </div>
            )}
          </div>
        </>
      )}

      <div className="stack">
        {problem && <p className="small c-warn">{problem}</p>}
        <button className="btn primary lg block" disabled={!valid} onClick={() => onSubmit(d)}>
          {mode === 'new' ? (
            <>
              <Play size={20} /> Empezar
            </>
          ) : (
            <>
              <Save size={20} /> Guardar cambios
            </>
          )}
        </button>
        {onDelete && (
          <button className="btn danger lg block" onClick={onDelete}>
            <Trash2 size={20} /> Eliminar nivelación
          </button>
        )}
      </div>
    </div>
  );
}

function draftToRun(d: Draft): Omit<LevelRun, 'id' | 'observations' | 'source'> {
  const opt = (s: string) => (s.trim() ? s.trim() : undefined);
  return {
    name: d.name.trim() || defaultRunName(),
    date: d.date || todayISO(),
    method: d.method,
    closure: d.closure,
    order: d.order,
    customK: d.order === 'custom' ? d.customK : undefined,
    startBM: { name: d.start.name.trim(), elevation: d.start.elevation ?? 0 },
    endBM: d.closure === 'known-bm' ? { name: d.end.name.trim(), elevation: d.end.elevation ?? 0 } : undefined,
    instrument: opt(d.instrument),
    operator: opt(d.operator),
    weather: opt(d.weather),
    notes: opt(d.notes),
  };
}

export function LevelNew({ params }: ScreenProps) {
  const project = useProject();
  const replace = useNav((s) => s.replace);
  if (!project) return <NoProject back title="Nueva nivelación" />;
  const bms = project.benchmarks;
  const last = project.levelRuns[0];
  const quick = Boolean(params.quick);
  const initial: Draft = {
    name: defaultRunName(),
    date: todayISO(),
    start: choiceFor(bms, undefined),
    closure: 'loop',
    end: bms[1] ? { pick: bms[1].id, name: bms[1].name, elevation: bms[1].elevation } : choiceFor(bms, undefined),
    order: last?.order ?? 'third',
    customK: last?.customK,
    method: last?.method ?? 'HI',
    instrument: last?.instrument ?? project.instrument?.split('·')[0]?.trim() ?? '',
    operator: last?.operator ?? project.surveyor ?? '',
    weather: '',
    notes: '',
  };
  return (
    <Screen title={quick ? 'Nivelación rápida' : 'Nueva nivelación'} subtitle={project.name} back>
      <RunForm
        mode="new"
        quick={quick}
        initial={initial}
        onSubmit={(d) => {
          const id = useStore.getState().createLevelRun({ ...draftToRun(d), source: 'manual' });
          replace({ name: 'level-entry', params: { runId: id } });
        }}
      />
    </Screen>
  );
}

export function LevelEdit({ params }: ScreenProps) {
  const { project, run } = useRun(params.runId as string);
  const back = useNav((s) => s.back);
  if (!project) return <NoProject back />;
  if (!run) return <NotFound />;
  const bms = project.benchmarks;
  const initial: Draft = {
    name: run.name,
    date: run.date,
    start: choiceFor(bms, run.startBM),
    closure: run.closure,
    end: choiceFor(bms, run.endBM ?? (bms[1] ? { name: bms[1].name, elevation: bms[1].elevation } : undefined)),
    order: run.order,
    customK: run.customK,
    method: run.method,
    instrument: run.instrument ?? '',
    operator: run.operator ?? '',
    weather: run.weather ?? '',
    notes: run.notes ?? '',
  };
  return (
    <Screen title="Editar nivelación" subtitle={run.name} back>
      <RunForm
        mode="edit"
        initial={initial}
        onSubmit={(d) => {
          useStore.getState().updateLevelRun(run.id, draftToRun(d));
          toast('Cambios guardados');
          back();
        }}
        onDelete={async () => {
          const ok = await confirmDialog({
            title: 'Eliminar nivelación',
            text: `Se eliminará "${run.name}" con sus ${run.observations.length} lecturas. Esta acción no se puede deshacer.`,
            okLabel: 'Eliminar',
            danger: true,
          });
          if (!ok) return;
          useStore.getState().deleteLevelRun(run.id);
          useNav.getState().resetTab('leveling');
          toast('Nivelación eliminada');
        }}
      />
    </Screen>
  );
}
