import { useMemo } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2, X } from 'lucide-react';
import { Kpi, NumberInput, Segmented } from '@/ui/kit';
import { useProject } from '@/app/store';
import { areaPerimeter, type XY } from '@/core/cogo';
import { Formula, HowTo, InputCard, Notice, PlanSketch, PointSelect, ResultCard, ToolActions, Waiting, n, nk, useToolState } from '../ui/shared';

interface Row {
  x?: number;
  y?: number;
}

interface S {
  source: 'project' | 'manual';
  ids: string[];
  rows: Row[];
}

export const areaDefaults: S = { source: 'project', ids: [], rows: [{}, {}, {}] };
export const areaExample: S = {
  source: 'manual',
  ids: [],
  rows: [
    { x: 1000, y: 1000 },
    { x: 1085.42, y: 1012.3 },
    { x: 1092.15, y: 1078.66 },
    { x: 1021.7, y: 1095.04 },
    { x: 994.3, y: 1046.2 },
  ],
};

/** ¿Se cruzan dos lados no contiguos? (polígono no simple) */
function selfIntersects(p: XY[]): boolean {
  const nP = p.length;
  const cross = (a: XY, b: XY, c: XY) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  for (let i = 0; i < nP; i++) {
    const a = p[i];
    const b = p[(i + 1) % nP];
    for (let j = i + 2; j < nP; j++) {
      if (i === 0 && j === nP - 1) continue;
      const c = p[j];
      const d = p[(j + 1) % nP];
      const d1 = cross(a, b, c);
      const d2 = cross(a, b, d);
      const d3 = cross(c, d, a);
      const d4 = cross(c, d, b);
      if (d1 * d2 < 0 && d3 * d4 < 0) return true;
    }
  }
  return false;
}

export default function Area() {
  const [s, set] = useToolState<S>(areaDefaults);
  const project = useProject();
  const byId = useMemo(() => new Map((project?.points ?? []).map((p) => [p.id, p])), [project]);

  const chosen = s.ids.map((id) => byId.get(id)).filter((p): p is NonNullable<typeof p> => !!p);
  const pts: Array<XY & { label: string }> =
    s.source === 'project'
      ? chosen.map((p) => ({ x: p.x, y: p.y, label: p.name }))
      : s.rows.flatMap((r, i) => (r.x !== undefined && r.y !== undefined ? [{ x: r.x, y: r.y, label: String(i + 1) }] : []));
  const incomplete = s.source === 'manual' && s.rows.some((r) => (r.x === undefined) !== (r.y === undefined));
  const r = pts.length >= 3 ? areaPerimeter(pts) : null;
  const bad = r ? selfIntersects(pts) : false;
  const missing = s.ids.length - chosen.length;

  const setRow = (i: number, p: Partial<Row>) => set({ rows: s.rows.map((row, j) => (j === i ? { ...row, ...p } : row)) });
  const move = (i: number, d: -1 | 1) => {
    const ids = [...s.ids];
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    set({ ids });
  };
  const exclude = useMemo(() => new Set(s.ids), [s.ids]);

  const copy = r
    ? [`Área = ${n(r.area, 3)} m² (${n(r.hectares, 4)} ha)`, `Perímetro = ${n(r.perimeter, 3)} m`, `Vértices: ${pts.map((p) => p.label).join(', ')}`].join('\n')
    : null;

  return (
    <div className="stack-l">
      <Segmented
        value={s.source}
        onChange={(source) => set({ source })}
        options={[
          { value: 'project', label: 'Puntos del proyecto' },
          { value: 'manual', label: 'Lista manual' },
        ]}
      />

      {s.source === 'project' ? (
        <InputCard
          title={`Vértices en orden (${chosen.length})`}
          aside={
            s.ids.length > 0 && (
              <button className="btn ghost sm" onClick={() => set({ ids: [] })}>
                Vaciar
              </button>
            )
          }
        >
          {!project ? (
            <Notice tone="info">No hay proyecto activo. Usa la lista manual o abre un proyecto.</Notice>
          ) : project.points.length === 0 ? (
            <Notice tone="info">El proyecto no tiene puntos. Usa la lista manual.</Notice>
          ) : (
            <>
              {chosen.length > 0 && (
                <ol className="tl-vertices">
                  {chosen.map((p, i) => (
                    <li key={p.id}>
                      <span className="tl-leg-num">{i + 1}</span>
                      <span className="grow">
                        <b>{p.name}</b>
                        <span className="xs muted mono"> {n(p.x)} · {n(p.y)}</span>
                      </span>
                      <button className="icon-btn" aria-label="Subir" onClick={() => move(i, -1)} disabled={i === 0}>
                        <ArrowUp size={18} />
                      </button>
                      <button className="icon-btn" aria-label="Bajar" onClick={() => move(i, 1)} disabled={i === chosen.length - 1}>
                        <ArrowDown size={18} />
                      </button>
                      <button className="icon-btn" aria-label={`Quitar ${p.name}`} onClick={() => set({ ids: s.ids.filter((x) => x !== p.id) })}>
                        <X size={18} />
                      </button>
                    </li>
                  ))}
                </ol>
              )}
              <PointSelect onPick={(p) => set({ ids: [...s.ids.filter((id) => byId.has(id)), p.id] })} label="+ Añadir vértice…" exclude={exclude} />
              {missing > 0 && <Notice tone="info">{missing} punto(s) ya no existen en el proyecto y se omiten.</Notice>}
            </>
          )}
        </InputCard>
      ) : (
        <InputCard title={`Vértices en orden (${pts.length})`}>
          <div className="tl-rows">
            {s.rows.map((row, i) => (
              <div key={i} className="tl-row">
                <span className="tl-leg-num">{i + 1}</span>
                <NumberInput value={row.x} onChange={(x) => setRow(i, { x })} placeholder="Este" />
                <NumberInput value={row.y} onChange={(y) => setRow(i, { y })} placeholder="Norte" />
                <button className="icon-btn" aria-label={`Eliminar vértice ${i + 1}`} onClick={() => set({ rows: s.rows.filter((_, j) => j !== i) })}>
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
          </div>
          <button className="btn ghost block" onClick={() => set({ rows: [...s.rows, {}] })}>
            <Plus size={20} /> Agregar vértice
          </button>
          {incomplete && <Notice>Hay vértices con solo una coordenada: se omiten.</Notice>}
        </InputCard>
      )}

      {!r ? (
        <Waiting>Se necesitan al menos 3 vértices.</Waiting>
      ) : (
        <>
          {bad && <Notice tone="fail">Los lados se cruzan: el orden de los vértices no forma un polígono simple y el área no es válida.</Notice>}
          <ResultCard label="Área" value={nk(r.area, 2)} unit="m²" tone={bad ? 'fail' : 'brand'} sub={`${n(r.hectares, 4)} ha`} />
          <div className="grid-3 tl-kpis">
            <Kpi label="Perímetro" value={n(r.perimeter, 2)} unit="m" />
            <Kpi label="Vértices" value={pts.length} />
            <Kpi label="Sentido" value={<span className="tl-kpi-text">{r.clockwise ? 'Horario' : 'Antihorario'}</span>} />
          </div>
          <div className="card flush">
            <PlanSketch points={pts.map((p) => ({ ...p, kind: 'known' as const }))} polygon={pts} height={240} />
          </div>
        </>
      )}

      <ToolActions copy={copy} />

      <HowTo source="Estudio funcional §3.7 (fórmula de Gauss / del lazo).">
        <Formula>{`2A = Σ (E_i · N_{i+1} − E_{i+1} · N_i)     (cíclico)
A > 0: sentido antihorario
Perímetro = Σ distancias entre vértices consecutivos
1 ha = 10 000 m²`}</Formula>
        <p>El polígono se cierra automáticamente del último vértice al primero. Los vértices deben estar en orden a lo largo del contorno.</p>
      </HowTo>
    </div>
  );
}
