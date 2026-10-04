import { Plus, Trash2 } from 'lucide-react';
import { Chips, Kpi, NumberInput, Segmented } from '@/ui/kit';
import { azimuth, traverse, type TraverseResult } from '@/core/cogo';
import { normalizeDeg } from '@/core/units';
import {
  AngleInput,
  Formula,
  HowTo,
  InputCard,
  Notice,
  PlanSketch,
  PointField,
  ResultCard,
  ToolActions,
  Verdict,
  Waiting,
  angValue,
  dms,
  n,
  ns,
  nk,
  ptXY,
  useToolState,
  type Ang,
  type PointDraft,
  type PtVal,
} from '../ui/shared';

interface Leg {
  /** Nombre de la estación de llegada. */
  name: string;
  dist?: number;
  /** Ángulo a la derecha medido en la estación de llegada. */
  ang?: Ang;
}

interface S {
  kind: 'closed' | 'open';
  start?: PtVal;
  startName: string;
  orient: 'az' | 'back';
  az0?: Ang;
  back?: PtVal;
  ang0?: Ang;
  legs: Leg[];
  end?: PtVal;
  endAz?: Ang;
  method: 'bowditch' | 'transit';
  tolA: '10' | '20' | '60';
  prec: '5000' | '10000' | '20000';
}

export const traverseDefaults: S = {
  kind: 'closed',
  startName: 'E-1',
  orient: 'az',
  legs: [{ name: 'E-2' }, { name: 'E-3' }, { name: 'E-4' }, { name: 'E-1' }],
  method: 'bowditch',
  tolA: '10',
  prec: '10000',
};

export const traverseExample: S = {
  ...traverseDefaults,
  start: { x: 279400, y: 8661200, z: 152.3 },
  az0: { d: 90 },
  legs: [
    { name: 'E-2', dist: 100.012, ang: { d: 90, m: 0, s: 5 } },
    { name: 'E-3', dist: 80.005, ang: { d: 89, m: 59, s: 50 } },
    { name: 'E-4', dist: 99.991, ang: { d: 90, m: 0, s: 10 } },
    { name: 'E-1', dist: 79.998, ang: { d: 89, m: 59, s: 59 } },
  ],
};

interface Calc {
  res?: TraverseResult;
  error?: string;
  names: string[];
  nAngles: number;
}

function compute(s: S): Calc {
  const m = s.legs.length;
  const startName = s.start?.name ?? s.startName ?? 'E-1';
  const names = [startName, ...s.legs.map((l, i) => (s.kind === 'closed' && i === m - 1 ? startName : l.name || `V${i + 1}`))];
  const st = ptXY(s.start);
  if (!st) return { names, nAngles: 0, error: 'Falta la estación de partida (E, N).' };
  if (m < (s.kind === 'closed' ? 3 : 1)) return { names, nAngles: 0, error: s.kind === 'closed' ? 'Una poligonal cerrada necesita al menos 3 lados.' : 'Agrega al menos un lado.' };
  let az0: number | undefined;
  if (s.orient === 'az') az0 = angValue(s.az0).deg;
  else {
    const b = ptXY(s.back);
    const a = angValue(s.ang0).deg;
    if (b && a !== undefined) az0 = normalizeDeg(azimuth(st, b) + a);
  }
  if (az0 === undefined) return { names, nAngles: 0, error: 'Falta la orientación inicial.' };
  const distances: number[] = [];
  for (let i = 0; i < m; i++) {
    const d = s.legs[i].dist;
    if (d === undefined || !(d > 0)) return { names, nAngles: 0, error: `Falta la distancia del lado ${i + 1} (${names[i]} → ${names[i + 1]}).` };
    distances.push(d);
  }
  const angles: number[] = [];
  const needed = s.kind === 'closed' ? m : m - 1;
  for (let i = 0; i < needed; i++) {
    const a = angValue(s.legs[i].ang);
    if (a.error) return { names, nAngles: 0, error: `Ángulo en ${names[i + 1]}: ${a.error}` };
    if (a.deg === undefined) return { names, nAngles: 0, error: `Falta el ángulo en ${names[i + 1]}.` };
    angles.push(a.deg);
  }
  let closing: { x: number; y: number; azimuthDeg?: number } | undefined;
  if (s.kind === 'open') {
    const e = ptXY(s.end);
    const endAz = angValue(s.endAz).deg;
    const lastAng = angValue(s.legs[m - 1]?.ang).deg;
    if (endAz !== undefined && lastAng !== undefined) angles.push(lastAng);
    if (e) closing = { x: e.x, y: e.y, azimuthDeg: endAz !== undefined && lastAng !== undefined ? endAz : undefined };
  }
  try {
    const res = traverse({ start: st, startAzimuthDeg: az0, angles, distances, closing, method: s.method, closed: s.kind === 'closed' });
    return { res, names, nAngles: angles.length };
  } catch (e) {
    return { names, nAngles: 0, error: e instanceof Error ? e.message : 'Error de cálculo' };
  }
}

export default function Traverse() {
  const [s, set] = useToolState<S>(traverseDefaults);
  const m = s.legs.length;
  const { res, error, names, nAngles } = compute(s);
  const setLeg = (i: number, p: Partial<Leg>) => set({ legs: s.legs.map((l, j) => (j === i ? { ...l, ...p } : l)) });
  const addLeg = () => {
    const legs = [...s.legs];
    const nextNum = m + (s.kind === 'closed' ? 1 : 2);
    const prefix = (s.start?.name ?? s.startName ?? 'E-1').replace(/\d+$/, '') || 'E-';
    if (s.kind === 'closed') legs.splice(m - 1, 0, { name: `${prefix}${nextNum - 1}` });
    else legs.push({ name: `${prefix}${nextNum}` });
    set({ legs });
  };
  const delLeg = (i: number) => set({ legs: s.legs.filter((_, j) => j !== i) });

  const aSec = Number(s.tolA);
  const tolAngSec = nAngles > 0 ? aSec * Math.sqrt(nAngles) : undefined;
  const angOk = res?.angularErrorSec !== undefined && tolAngSec !== undefined ? Math.abs(res.angularErrorSec) <= tolAngSec : undefined;
  const reqN = Number(s.prec);
  const linOk = res?.precision !== undefined ? res.precision >= reqN : undefined;

  const newPts: PointDraft[] = [];
  if (res) {
    const last = s.kind === 'closed' || ptXY(s.end) ? m - 1 : m;
    for (let i = 1; i <= last; i++) {
      const p = res.adjusted[i];
      newPts.push({ name: names[i], x: p.x, y: p.y, note: `Poligonal ${s.method === 'bowditch' ? 'Bowditch' : 'tránsito'}` });
    }
  }

  const copy = res
    ? [
        `Poligonal ${s.kind === 'closed' ? 'cerrada' : 'abierta'} · ${m} lados · perímetro ${n(res.perimeter)} m`,
        res.angularErrorSec !== undefined ? `Error angular = ${ns(res.angularErrorSec, 1)}″ (tol. ${n(tolAngSec, 1)}″)` : '',
        res.linearError !== undefined ? `Error lineal = ${n(res.linearError, 4)} m · precisión ${res.precisionLabel}` : '',
        '',
        'Est.\tE\tN',
        ...res.adjusted.map((p, i) => `${names[i]}\t${n(p.x)}\t${n(p.y)}`),
      ]
        .filter((l, i) => l !== '' || i === 3)
        .join('\n')
    : null;

  const sketchPts = res
    ? res.adjusted.slice(0, s.kind === 'closed' ? m : m + 1).map((p, i) => ({ ...p, label: names[i], kind: i === 0 ? ('station' as const) : ('new' as const) }))
    : [];

  return (
    <div className="stack-l">
      <InputCard title="Tipo y partida">
        <Segmented
          value={s.kind}
          onChange={(kind) => {
            if (kind === s.kind) return;
            const legs = [...s.legs];
            const startName = s.start?.name ?? s.startName;
            if (kind === 'closed' && legs.length) legs[legs.length - 1] = { ...legs[legs.length - 1], name: startName };
            set({ kind, legs });
          }}
          options={[
            { value: 'closed', label: 'Cerrada' },
            { value: 'open', label: 'Abierta / enlazada' },
          ]}
        />
        <PointField label={`Estación de partida ${s.start?.name ? '' : `(${s.startName})`}`} value={s.start} onChange={(start) => set({ start })} />
        <Segmented
          value={s.orient}
          onChange={(orient) => set({ orient })}
          options={[
            { value: 'az', label: 'Azimut del 1er lado' },
            { value: 'back', label: 'Vista atrás + ángulo' },
          ]}
        />
        {s.orient === 'az' ? (
          <AngleInput label={`Azimut ${names[0]} → ${names[1] ?? ''}`} value={s.az0} onChange={(az0) => set({ az0 })} />
        ) : (
          <>
            <PointField label="Punto de vista atrás" value={s.back} onChange={(back) => set({ back })} />
            <AngleInput label={`Ángulo a la derecha en ${names[0]}`} value={s.ang0} onChange={(ang0) => set({ ang0 })} hint="De la vista atrás al 1er lado" />
          </>
        )}
      </InputCard>

      <InputCard title={`Lados (${m})`} aside={<span className="xs muted">Ángulos a la derecha (horario)</span>}>
        <div className="tl-legs">
          {s.legs.map((l, i) => {
            const fixedName = s.kind === 'closed' && i === m - 1;
            const angOptional = s.kind === 'open' && i === m - 1;
            return (
              <div key={i} className="tl-leg">
                <div className="tl-leg-head">
                  <span className="tl-leg-num">{i + 1}</span>
                  <span className="tl-leg-from mono">{names[i]} →</span>
                  {fixedName ? (
                    <span className="tl-leg-to mono">{names[0]}</span>
                  ) : (
                    <input className="input tl-leg-name" value={l.name} onChange={(e) => setLeg(i, { name: e.target.value })} aria-label={`Nombre de la estación ${i + 2}`} />
                  )}
                  <button className="icon-btn" aria-label={`Eliminar lado ${i + 1}`} onClick={() => delLeg(i)} disabled={m <= 1}>
                    <Trash2 size={18} />
                  </button>
                </div>
                <NumberInput label="Distancia horizontal" value={l.dist} onChange={(dist) => setLeg(i, { dist })} suffix="m" />
                <AngleInput
                  label={`Ángulo en ${fixedName ? names[0] : l.name || `V${i + 1}`}${fixedName ? ' (cierre)' : ''}`}
                  value={l.ang}
                  onChange={(ang) => setLeg(i, { ang })}
                  hint={angOptional ? 'Solo con azimut de cierre' : undefined}
                />
              </div>
            );
          })}
        </div>
        <button className="btn ghost block" onClick={addLeg}>
          <Plus size={20} /> Agregar lado
        </button>
      </InputCard>

      {s.kind === 'open' && (
        <InputCard title="Llegada conocida (control)">
          <PointField label="Punto de llegada" value={s.end} onChange={(end) => set({ end })} />
          <AngleInput label="Azimut de cierre (llegada → referencia)" value={s.endAz} onChange={(endAz) => set({ endAz })} hint="Opcional: control angular" />
        </InputCard>
      )}

      <InputCard title="Compensación y tolerancias">
        <Segmented
          value={s.method}
          onChange={(method) => set({ method })}
          options={[
            { value: 'bowditch', label: 'Brújula (Bowditch)' },
            { value: 'transit', label: 'Tránsito' },
          ]}
        />
        <div className="field">
          <span className="field-label">Tolerancia angular a·√n</span>
          <Chips value={s.tolA} onChange={(tolA) => set({ tolA })} options={[{ value: '10', label: '10″√n' }, { value: '20', label: '20″√n' }, { value: '60', label: '1′√n' }]} />
        </div>
        <div className="field">
          <span className="field-label">Precisión lineal mínima</span>
          <Chips
            value={s.prec}
            onChange={(prec) => set({ prec })}
            options={[
              { value: '5000', label: '1:5 000' },
              { value: '10000', label: '1:10 000' },
              { value: '20000', label: '1:20 000' },
            ]}
          />
        </div>
      </InputCard>

      {error || !res ? (
        <Waiting>{error ?? 'Completa los datos.'}</Waiting>
      ) : (
        <>
          {res.precision !== undefined ? (
            <ResultCard
              label="Precisión relativa"
              value={res.precisionLabel === '1/∞' ? '1 / ∞' : `1 / ${nk(res.precision)}`}
              tone={linOk && angOk !== false ? 'ok' : 'fail'}
              extra={linOk !== undefined && <Verdict ok={linOk && angOk !== false} />}
              sub={`Error lineal ${n(res.linearError, 4)} m en ${n(res.perimeter, 3)} m · mínimo 1:${nk(reqN)}`}
            />
          ) : (
            <ResultCard label="Poligonal sin control" value="Sin cierre" tone="fail" sub="Sin punto de llegada conocido no se puede verificar ni compensar." />
          )}
          {s.kind === 'open' && res.precision === undefined && <Notice>Poligonal abierta sin control: los errores no se detectan. Usa un punto de llegada conocido.</Notice>}
          <div className="grid-2 tl-kpis">
            <Kpi
              label="Error angular"
              value={res.angularErrorSec !== undefined ? ns(res.angularErrorSec, 1) : '—'}
              unit={res.angularErrorSec !== undefined ? '″' : undefined}
              sub={tolAngSec !== undefined && res.angularErrorSec !== undefined ? `Tol. ${n(tolAngSec, 1)}″ (n = ${nAngles})` : 'Sin control angular'}
              tone={angOk === undefined ? undefined : angOk ? 'ok' : 'fail'}
            />
            <Kpi label="Corrección / ángulo" value={ns(res.angularCorrection * 3600, 2)} unit="″" />
            <Kpi label="Error E / N" value={<span className="tl-kpi-text">{ns(res.errorX, 4)} / {ns(res.errorY, 4)}</span>} unit="m" />
            <Kpi
              label="Suma de ángulos"
              value={res.angleSum !== undefined ? dms(res.angleSum, 0) : '—'}
              sub={res.angleSumTheoretical !== undefined ? `Teórica ${res.angleSumTheoretical}°` : undefined}
            />
          </div>
          {angOk === false && <Notice tone="fail">El error angular supera la tolerancia: revisa los ángulos antes de compensar.</Notice>}

          <div className="card flush">
            <PlanSketch points={sketchPts} polygon={s.kind === 'closed' ? sketchPts : undefined} lines={s.kind === 'open' ? sketchPts.slice(1).map((p, i) => [sketchPts[i], p]) : []} height={260} />
          </div>

          <div className="card flush">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Lado</th>
                    <th>Az comp.</th>
                    <th>Dist.</th>
                    <th>ΔE</th>
                    <th>ΔN</th>
                    <th>cE</th>
                    <th>cN</th>
                  </tr>
                </thead>
                <tbody>
                  {res.legs.map((l) => (
                    <tr key={l.from}>
                      <td>
                        {names[l.from]}–{names[l.to]}
                      </td>
                      <td>{dms(l.azimuth, 1)}</td>
                      <td>{n(l.distance)}</td>
                      <td>{ns(l.dx)}</td>
                      <td>{ns(l.dy)}</td>
                      <td>{ns(l.cx, 4)}</td>
                      <td>{ns(l.cy, 4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="card flush">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Estación</th>
                    <th>Este (E)</th>
                    <th>Norte (N)</th>
                  </tr>
                </thead>
                <tbody>
                  {res.adjusted.slice(0, s.kind === 'closed' ? m : m + 1).map((p, i) => (
                    <tr key={i} className={i === 0 ? 'tp' : undefined}>
                      <td>{names[i]}</td>
                      <td>{n(p.x)}</td>
                      <td>{n(p.y)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <ToolActions copy={copy} points={res && res.precision !== undefined ? newPts : null} />

      <HowTo source="Estudio funcional §1.4; FGCC 1984 (tolerancias angulares); MTC EG-2013 Tabla 102-01 (1:10 000 puntos de control, 1:5 000 eje).">
        <Formula>{`Az(i+1) = Az(i) + 180° + α(i+1)          (α a la derecha)
Cerrada: Σα teórica = (n − 2)·180° (interiores)
Corrección angular = −e_α / n            Tolerancia = a·√n
ΔE = L·sen Az    ΔN = L·cos Az
e_L = √(e_E² + e_N²)      Precisión = 1 / (P / e_L)
Brújula: c = −e · L_i / P
Tránsito: c_E = −e_E · |ΔE_i| / Σ|ΔE|  (ídem N)`}</Formula>
        <p>Recorriendo la poligonal cerrada en sentido antihorario, los ángulos a la derecha son los interiores.</p>
      </HowTo>
    </div>
  );
}
