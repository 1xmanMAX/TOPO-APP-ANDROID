/** Piezas compartidas del control de capas: editor de capas y de rasante. */
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { uid } from '@/core/id';
import type { DesignGrade, PavementLayer } from '@/core/types';
import { Field, NumberInput, Segmented } from '@/ui/kit';
import { fs, station } from '@/ui/format';

export function gradeText(g: DesignGrade): string {
  return `Cota ${g.startElevation.toFixed(3)} en ${station(g.startStation)} · pend. ${fs(g.longSlope, 2)} % · bombeo ${g.crossSlope.toFixed(2)} % ${g.crossType === 'crown' ? 'a dos aguas' : 'a una caída'}`;
}

export function LayersEditor({ layers, onChange }: { layers: PavementLayer[]; onChange: (l: PavementLayer[]) => void }) {
  const upd = (i: number, patch: Partial<PavementLayer>) => onChange(layers.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= layers.length) return;
    const c = [...layers];
    [c[i], c[j]] = [c[j], c[i]];
    onChange(c);
  };
  let depth = 0;
  return (
    <div className="stack">
      <div className="lc-layer-head xs faint">
        <span>Capa (de arriba hacia abajo)</span>
        <span>Espesor</span>
        <span>Tol. ±</span>
        <span />
      </div>
      {layers.map((l, i) => {
        const top = depth;
        depth += l.thickness || 0;
        return (
          <div key={l.id} className="lc-layer-row">
            <div className="lc-layer-name">
              <span className="lc-layer-idx">{i + 1}</span>
              <input className="input" value={l.name} onChange={(e) => upd(i, { name: e.target.value })} aria-label="Nombre de la capa" />
              <span className="xs faint lc-depth">−{top.toFixed(2)} m</span>
            </div>
            <NumberInput value={l.thickness} suffix="m" onChange={(v) => upd(i, { thickness: v ?? 0 })} />
            <NumberInput value={Math.round(l.tolerance * 10000) / 10} suffix="mm" onChange={(v) => upd(i, { tolerance: (v ?? 0) / 1000 })} />
            <div className="lc-layer-btns">
              <button className="icon-btn" aria-label="Subir" disabled={i === 0} onClick={() => move(i, -1)}>
                <ArrowUp size={17} />
              </button>
              <button className="icon-btn" aria-label="Bajar" disabled={i === layers.length - 1} onClick={() => move(i, 1)}>
                <ArrowDown size={17} />
              </button>
              <button className="icon-btn" aria-label="Quitar capa" disabled={layers.length <= 1} onClick={() => onChange(layers.filter((_, j) => j !== i))}>
                <Trash2 size={17} />
              </button>
            </div>
          </div>
        );
      })}
      <button
        className="btn ghost"
        onClick={() => onChange([...layers, { id: uid('ly'), name: `Capa ${layers.length + 1}`, thickness: 0.15, tolerance: 0.01 }])}
      >
        <Plus size={18} /> Añadir capa
      </button>
    </div>
  );
}

export function GradeEditor({ grade, onChange }: { grade: DesignGrade; onChange: (g: DesignGrade) => void }) {
  const set = <K extends keyof DesignGrade>(k: K, v: DesignGrade[K]) => onChange({ ...grade, [k]: v });
  return (
    <div className="stack">
      <div className="grid-2">
        <NumberInput label="Cota inicial (eje, sup. terminada)" suffix="m" value={grade.startElevation} onChange={(v) => set('startElevation', v ?? 0)} />
        <NumberInput label="Progresiva inicial" suffix="m" value={grade.startStation} onChange={(v) => set('startStation', v ?? 0)} />
        <NumberInput label="Pendiente longitudinal" suffix="%" value={grade.longSlope} onChange={(v) => set('longSlope', v ?? 0)} hint="+ sube, − baja" />
        <NumberInput label="Bombeo / transversal" suffix="%" value={grade.crossSlope} onChange={(v) => set('crossSlope', v ?? 0)} />
      </div>
      <Field label="Tipo de sección">
        <Segmented<DesignGrade['crossType']>
          value={grade.crossType}
          onChange={(v) => set('crossType', v)}
          options={[
            { value: 'crown', label: 'Dos aguas (desde el eje)' },
            { value: 'one-way', label: 'Una caída (hacia +)' },
          ]}
        />
      </Field>
    </div>
  );
}

/** "-3.6, 0, 3.6" → [-3.6, 0, 3.6] */
export function parseOffsets(s: string): number[] | null {
  const parts = s
    .split(/[;,\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  const out = parts.map((p) => Number(p));
  if (!out.length || out.some((n) => !Number.isFinite(n))) return null;
  return [...new Set(out)].sort((a, b) => a - b);
}
