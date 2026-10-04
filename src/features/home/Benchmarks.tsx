import { useState } from 'react';
import { BadgeCheck, Pencil, Plus, Trash2, Triangle } from 'lucide-react';
import type { ScreenProps } from '@/app/feature';
import { go } from '@/app/nav';
import { useProject, useStore } from '@/app/store';
import type { Benchmark } from '@/core/types';
import { EmptyState, Fab, Field, NumberInput, Screen, Sheet, TextInput, Toggle, confirmDialog, toast } from '@/ui/kit';
import { thousands } from '@/ui/format';

type Draft = Omit<Benchmark, 'id' | 'elevation'> & { id?: string; elevation?: number };

const blank = (): Draft => ({ name: '', official: false });

function BmSheet({ draft, onClose }: { draft: Draft | null; onClose: () => void }) {
  const upsert = useStore((s) => s.upsertBenchmark);
  const [d, setD] = useState<Draft>(draft ?? blank());
  const [tried, setTried] = useState(false);
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const save = () => {
    setTried(true);
    if (!d.name.trim() || d.elevation === undefined) {
      toast('Nombre y cota son obligatorios', 'warn');
      return;
    }
    upsert({
      id: d.id,
      name: d.name.trim(),
      elevation: d.elevation,
      x: d.x,
      y: d.y,
      description: d.description?.trim() || undefined,
      official: d.official,
    });
    toast(d.id ? 'BM actualizado' : 'BM agregado');
    onClose();
  };
  return (
    <Sheet open={!!draft} title={d.id ? 'Editar BM' : 'Nuevo BM'} onClose={onClose}>
      <div className="stack">
        <div className="grid-2">
          <Field label="Nombre *" hint={tried && !d.name.trim() ? 'Obligatorio' : undefined}>
            <input
              className="input"
              value={d.name}
              autoFocus={!d.id}
              placeholder="BM-1"
              onChange={(e) => set({ name: e.target.value })}
            />
          </Field>
          <NumberInput
            label="Cota *"
            suffix="m"
            value={d.elevation}
            onChange={(v) => set({ elevation: v })}
            placeholder="0.000"
            hint={tried && d.elevation === undefined ? 'Obligatoria' : undefined}
          />
        </div>
        <div className="grid-2">
          <NumberInput label="Este (X)" suffix="m" value={d.x} onChange={(v) => set({ x: v })} placeholder="opcional" />
          <NumberInput label="Norte (Y)" suffix="m" value={d.y} onChange={(v) => set({ y: v })} placeholder="opcional" />
        </div>
        <TextInput
          label="Descripción"
          value={d.description ?? ''}
          onChange={(v) => set({ description: v })}
          placeholder="Hito de concreto, clavo en sardinel…"
        />
        <div className="card" style={{ padding: '4px 16px' }}>
          <Toggle checked={d.official} onChange={(v) => set({ official: v })} label="BM oficial (IGN / entidad)" />
        </div>
        <button className="btn primary lg block" onClick={save}>
          {d.id ? 'Guardar cambios' : 'Agregar BM'}
        </button>
      </div>
    </Sheet>
  );
}

export default function Benchmarks(_: ScreenProps) {
  const p = useProject();
  const del = useStore((s) => s.deleteBenchmark);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [sheetKey, setSheetKey] = useState(0);

  const open = (d: Draft) => {
    setSheetKey((k) => k + 1);
    setDraft(d);
  };

  if (!p) {
    return (
      <Screen back title="Bancos de nivel">
        <EmptyState
          icon={<Triangle size={28} />}
          title="Sin proyecto activo"
          text="Crea un proyecto para registrar sus BMs."
          action={
            <button className="btn primary lg" onClick={() => go('project-edit', {}, 'home')}>
              Crear proyecto
            </button>
          }
        />
      </Screen>
    );
  }

  const remove = async (b: Benchmark) => {
    const ok = await confirmDialog({
      title: `¿Eliminar ${b.name}?`,
      text: 'Las libretas que lo usan conservan su cota de partida.',
      okLabel: 'Eliminar',
      danger: true,
    });
    if (ok) {
      del(b.id);
      toast(`${b.name} eliminado`);
    }
  };

  const sorted = [...p.benchmarks].sort((a, b) => Number(b.official) - Number(a.official) || a.name.localeCompare(b.name, 'es', { numeric: true }));

  return (
    <Screen
      back
      title="Bancos de nivel"
      subtitle={`${p.benchmarks.length} BM · ${p.name}`}
      fab={<Fab icon={<Plus size={22} />} label="Nuevo BM" onClick={() => open(blank())} />}
    >
      {sorted.length === 0 ? (
        <EmptyState
          icon={<Triangle size={28} />}
          title="Aún no hay BMs"
          text="Registra los bancos de nivel de referencia con su cota. Los usarás para iniciar y cerrar tus nivelaciones."
          action={
            <button className="btn primary lg" onClick={() => open(blank())}>
              <Plus size={20} /> Agregar BM
            </button>
          }
        />
      ) : (
        <div className="hm-bm-grid">
          {sorted.map((b) => (
            <article key={b.id} className="card hm-bm">
              <div className="row-between">
                <div className="row" style={{ minWidth: 0 }}>
                  <div className={`hm-bm-icon ${b.official ? 'tone-brand' : 'tone-info'}`}>
                    <Triangle size={18} strokeWidth={2.4} />
                  </div>
                  <h3 className="hm-bm-name">{b.name}</h3>
                </div>
                {b.official ? (
                  <span className="badge ok">
                    <BadgeCheck size={14} /> Oficial
                  </span>
                ) : (
                  <span className="badge neutral">Auxiliar</span>
                )}
              </div>
              <div className="hm-bm-elev mono">
                {b.elevation.toFixed(3)}
                <small>m</small>
              </div>
              <div className="hm-bm-coords mono small">
                <span>
                  <em>E</em> {b.x !== undefined ? thousands(b.x, 3) : '—'}
                </span>
                <span>
                  <em>N</em> {b.y !== undefined ? thousands(b.y, 3) : '—'}
                </span>
              </div>
              {b.description && <p className="small muted">{b.description}</p>}
              <div className="row hm-bm-actions">
                <button className="btn ghost sm grow" onClick={() => open({ ...b })}>
                  <Pencil size={16} /> Editar
                </button>
                <button className="btn danger sm" aria-label={`Eliminar ${b.name}`} onClick={() => remove(b)}>
                  <Trash2 size={16} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      <BmSheet key={sheetKey} draft={draft} onClose={() => setDraft(null)} />
    </Screen>
  );
}
