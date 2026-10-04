import { Chips, Kpi, NumberInput, Segmented, TextInput } from '@/ui/kit';
import { curveStakeout, horizontalCurve, parseStation, stationFormat } from '@/core/cogo';
import { AngleInput, Formula, HowTo, InputCard, Notice, ResultCard, ResultPair, ToolActions, Waiting, angValue, dms, n, useToolState, type Ang } from '../ui/shared';

interface S {
  R?: number;
  delta?: Ang;
  ref: 'pc' | 'pi';
  station: string;
  interval: '5' | '10' | '20';
}

export const curveDefaults: S = { ref: 'pi', station: '', interval: '10' };
export const curveExample: S = { R: 120, delta: { d: 38, m: 24, s: 30 }, ref: 'pi', station: '0+347.82', interval: '10' };

export default function Curve() {
  const [s, set] = useToolState<S>(curveDefaults);
  const d = angValue(s.delta);
  const delta = d.deg !== undefined ? Math.abs(d.deg) : undefined;
  const st = s.station.trim() ? parseStation(s.station) : null;
  const badSt = s.station.trim() !== '' && st === null;
  const badDelta = delta !== undefined && (delta <= 0 || delta >= 180);
  const ok = s.R !== undefined && s.R > 0 && delta !== undefined && !badDelta;
  const el = ok ? horizontalCurve({ R: s.R!, deltaDeg: delta! }) : null;
  const pc = el && st !== null ? (s.ref === 'pc' ? st : st - el.T) : undefined;
  const pt = el && pc !== undefined ? pc + el.L : undefined;
  const pi = el && pc !== undefined ? pc + el.T : undefined;
  const interval = Number(s.interval);
  const rows = el && pc !== undefined && pc >= 0 ? curveStakeout({ R: s.R!, deltaDeg: delta!, pcStation: pc, interval }) : [];
  const G = ok ? (2 * Math.asin(Math.min(1, interval / (2 * s.R!))) * 180) / Math.PI : undefined;

  const copy = el
    ? [
        `R = ${n(s.R, 3)} m · Δ = ${dms(delta, 1)}`,
        `T = ${n(el.T)} m · L = ${n(el.L)} m · LC = ${n(el.LC)} m`,
        `E = ${n(el.E)} m · M = ${n(el.M)} m`,
        pc !== undefined ? `PC = ${stationFormat(pc)} · PI = ${stationFormat(pi!)} · PT = ${stationFormat(pt!)}` : '',
        rows.length ? '\nPunto\tProgresiva\tDeflexión\tCuerda\tCuerda PC' : '',
        ...rows.map((r) => `${r.label}\t${stationFormat(r.station)}\t${r.deflectionDms}\t${n(r.chord)}\t${n(r.chordFromPC)}`),
      ]
        .filter((l) => l !== '')
        .join('\n')
    : null;

  return (
    <div className="stack-l">
      <InputCard title="Elementos de la curva">
        <NumberInput label="Radio R" value={s.R} onChange={(R) => set({ R })} suffix="m" />
        <AngleInput label="Ángulo de deflexión Δ" value={s.delta} onChange={(delta) => set({ delta })} />
        {badDelta && <Notice tone="fail">Δ debe estar entre 0° y 180°.</Notice>}
      </InputCard>
      <InputCard title="Progresiva">
        <Segmented
          value={s.ref}
          onChange={(ref) => set({ ref })}
          options={[
            { value: 'pi', label: 'Progresiva del PI' },
            { value: 'pc', label: 'Progresiva del PC' },
          ]}
        />
        <TextInput label={s.ref === 'pi' ? 'Progresiva PI' : 'Progresiva PC'} value={s.station} onChange={(station) => set({ station })} placeholder="0+347.82" hint="km+metros o metros" />
        {badSt && <Notice tone="fail">Progresiva no válida. Usa 1+234.56 o 1234.56.</Notice>}
        <div className="field">
          <span className="field-label">Estacas cada</span>
          <Chips value={s.interval} onChange={(interval) => set({ interval })} options={['5', '10', '20'].map((v) => ({ value: v as S['interval'], label: `${v} m` }))} />
        </div>
      </InputCard>

      {!el ? (
        <Waiting>Ingresa el radio y el ángulo de deflexión.</Waiting>
      ) : (
        <>
          <ResultCard label="Tangente y longitud de curva" value={null} tone="brand" sub={pc !== undefined ? `PC ${stationFormat(pc)} · PT ${stationFormat(pt!)}` : 'Ingresa una progresiva para PC, PT y la tabla de deflexiones.'}>
            <ResultPair
              items={[
                { label: 'T', value: n(el.T), unit: 'm' },
                { label: 'L', value: n(el.L), unit: 'm' },
              ]}
            />
          </ResultCard>
          <div className="grid-3 tl-kpis">
            <Kpi label="Cuerda LC" value={n(el.LC)} unit="m" />
            <Kpi label="Externa E" value={n(el.E)} unit="m" />
            <Kpi label="Flecha M" value={n(el.M)} unit="m" />
          </div>
          <div className="grid-3 tl-kpis">
            <Kpi label="PC" value={<span className="tl-kpi-text">{pc !== undefined ? stationFormat(pc) : '—'}</span>} />
            <Kpi label="PI" value={<span className="tl-kpi-text">{pi !== undefined ? stationFormat(pi) : '—'}</span>} />
            <Kpi label="PT" value={<span className="tl-kpi-text">{pt !== undefined ? stationFormat(pt) : '—'}</span>} />
          </div>
          <Kpi label={`Grado de curva (cuerda ${interval} m)`} value={dms(G, 0)} />
          {pc !== undefined && pc < 0 && <Notice tone="fail">El PC resulta con progresiva negativa: revisa la progresiva del PI.</Notice>}
          {rows.length > 0 && (
            <div className="card flush">
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Punto</th>
                      <th>Progresiva</th>
                      <th>Deflexión</th>
                      <th>Cuerda</th>
                      <th>Desde PC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className={r.label ? 'tp' : undefined}>
                        <td className="text">{r.label || '·'}</td>
                        <td>{stationFormat(r.station)}</td>
                        <td>{r.deflectionDms}</td>
                        <td>{n(r.chord)}</td>
                        <td>{n(r.chordFromPC)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      <ToolActions copy={copy} />

      <HowTo source="Estudio funcional §1.5.2; MTC EG-2013 102.03 (estacas cada 10 m en curva, 20 m en tangente).">
        <Formula>{`T  = R · tan(Δ/2)          L  = π · R · Δ / 180
LC = 2R · sen(Δ/2)         E  = R · (sec(Δ/2) − 1)
M  = R · (1 − cos(Δ/2))    G  = 2 · asen(c / 2R)
PC = PI − T                PT = PC + L
Deflexión δ = arco / (2R)  (al PT: δ = Δ/2)
Cuerda = 2R · sen(δ parcial)`}</Formula>
      </HowTo>
    </div>
  );
}
