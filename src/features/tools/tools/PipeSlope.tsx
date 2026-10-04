import { Chips, Kpi, NumberInput, Segmented, Toggle } from '@/ui/kit';
import { manholeDepth, os070MinSlope, OS070_MIN_FLOW, pipeInvertAt, pipeSlopeFrom, pipeTable } from '../calc/pipe';
import { Formula, HowTo, InputCard, Notice, ResultCard, ToolActions, Verdict, Waiting, n, ns, useToolState } from '../ui/shared';

interface S {
  start?: number;
  slopeMode: 'permil' | 'percent' | 'end';
  slope?: number;
  end?: number;
  length?: number;
  x?: number;
  step: string;
  hi?: number;
  coverStart?: number;
  coverEnd?: number;
  os070: boolean;
  qi?: number;
}

export const pipeDefaults: S = { slopeMode: 'permil', step: '10', os070: false };
export const pipeExample: S = {
  start: 148.62,
  slopeMode: 'permil',
  slope: 8,
  length: 48.5,
  x: 25,
  step: '10',
  hi: 151.437,
  coverStart: 150.42,
  coverEnd: 150.18,
  os070: true,
  qi: 1.5,
};

export default function PipeSlope() {
  const [s, set] = useToolState<S>(pipeDefaults);
  const L = s.length;
  let S: number | undefined;
  if (s.slopeMode === 'end') {
    if (s.start !== undefined && s.end !== undefined && L !== undefined && L > 0) S = pipeSlopeFrom(s.start, s.end, L);
  } else if (s.slope !== undefined) {
    S = s.slopeMode === 'permil' ? s.slope / 1000 : s.slope / 100;
  }
  const endInvert = s.start !== undefined && S !== undefined && L !== undefined && L > 0 ? pipeInvertAt(s.start, S, L) : undefined;
  const atX = s.start !== undefined && S !== undefined && s.x !== undefined ? pipeInvertAt(s.start, S, s.x) : undefined;
  const step = Number(s.step);
  const rows =
    s.start !== undefined && S !== undefined && L !== undefined && L > 0
      ? pipeTable({ startInvert: s.start, slopeMM: S, length: L, step, hi: s.hi })
      : [];
  const depthStart = s.coverStart !== undefined && s.start !== undefined ? manholeDepth(s.coverStart, s.start) : undefined;
  const depthEnd = s.coverEnd !== undefined && endInvert !== undefined ? manholeDepth(s.coverEnd, endInvert) : undefined;
  const smin = s.os070 && s.qi !== undefined && s.qi > 0 ? os070MinSlope(s.qi) : undefined;
  const xOut = s.x !== undefined && L !== undefined && (s.x < 0 || s.x > L);

  const copy =
    s.start !== undefined && S !== undefined
      ? [
          `Pendiente S = ${n(S * 1000, 2)} ‰`,
          atX !== undefined ? `Cota de fondo a ${n(s.x, 2)} m = ${n(atX)} m` : '',
          endInvert !== undefined ? `Cota de fondo final = ${n(endInvert)} m` : '',
          depthStart !== undefined ? `Profundidad buzón inicial = ${n(depthStart, 2)} m` : '',
          depthEnd !== undefined ? `Profundidad buzón final = ${n(depthEnd, 2)} m` : '',
          rows.length ? '\nx (m)\tCota fondo\tLectura' : '',
          ...rows.map((r) => `${n(r.x, 2)}\t${n(r.invert)}\t${r.reading !== undefined ? n(r.reading) : ''}`),
        ]
          .filter((l) => l !== '')
          .join('\n')
      : null;

  return (
    <div className="stack-l">
      <InputCard title="Tramo">
        <div className="grid-2">
          <NumberInput label="Cota fondo inicial" value={s.start} onChange={(start) => set({ start })} suffix="m" hint="Buzón aguas arriba" />
          <NumberInput label="Longitud del tramo" value={s.length} onChange={(length) => set({ length })} suffix="m" hint="Horizontal" />
        </div>
        <Segmented
          value={s.slopeMode}
          onChange={(slopeMode) => set({ slopeMode })}
          options={[
            { value: 'permil', label: 'Pendiente ‰' },
            { value: 'percent', label: 'Pendiente %' },
            { value: 'end', label: 'Cota final' },
          ]}
        />
        {s.slopeMode === 'end' ? (
          <NumberInput label="Cota fondo final" value={s.end} onChange={(end) => set({ end })} suffix="m" hint="Buzón aguas abajo" />
        ) : (
          <NumberInput
            label="Pendiente (positiva = baja)"
            value={s.slope}
            onChange={(slope) => set({ slope })}
            suffix={s.slopeMode === 'permil' ? '‰' : '%'}
          />
        )}
        <NumberInput label="Distancia x desde el buzón inicial" value={s.x} onChange={(x) => set({ x })} suffix="m" />
        {xOut && <Notice tone="info">x está fuera del tramo (0 – {n(L, 2)} m): se extrapola.</Notice>}
      </InputCard>

      <InputCard title="Replanteo y buzones (opcional)">
        <NumberInput label="Altura de instrumento (AI)" value={s.hi} onChange={(v) => set({ hi: v })} suffix="m" hint="Para la lectura de mira esperada sobre el fondo" />
        <div className="grid-2">
          <NumberInput label="Cota tapa inicial" value={s.coverStart} onChange={(coverStart) => set({ coverStart })} suffix="m" />
          <NumberInput label="Cota tapa final" value={s.coverEnd} onChange={(coverEnd) => set({ coverEnd })} suffix="m" />
        </div>
        <div className="field">
          <span className="field-label">Tabla cada</span>
          <Chips
            value={s.step}
            onChange={(step) => set({ step })}
            options={['5', '10', '20'].map((v) => ({ value: v, label: `${v} m` }))}
          />
        </div>
        <Toggle checked={s.os070} onChange={(os070) => set({ os070 })} label="Verificar pendiente mínima OS.070" />
        {s.os070 && (
          <NumberInput
            label="Caudal inicial Qi"
            value={s.qi}
            onChange={(qi) => set({ qi })}
            suffix="L/s"
            hint={`Mínimo de cálculo ${OS070_MIN_FLOW} L/s`}
          />
        )}
      </InputCard>

      {s.start === undefined || S === undefined ? (
        <Waiting>Ingresa la cota de fondo inicial y la pendiente (o la cota final y la longitud).</Waiting>
      ) : (
        <>
          {S <= 0 && (
            <Notice tone="fail">
              {S === 0 ? 'Pendiente nula: la tubería no escurre.' : 'Contrapendiente: el fondo sube en el sentido del flujo.'} Revisa las cotas.
            </Notice>
          )}
          <ResultCard
            label={atX !== undefined ? `Cota de fondo a ${n(s.x, 2)} m` : 'Pendiente del tramo'}
            value={atX !== undefined ? n(atX) : n(S * 1000, 2)}
            unit={atX !== undefined ? 'm' : '‰'}
            tone={S <= 0 ? 'fail' : 'brand'}
            sub={
              atX !== undefined
                ? `S = ${n(S * 1000, 2)} ‰ (${n(S * 100, 3)} %)${s.hi !== undefined ? ` · lectura esperada ${n(s.hi - atX)} m` : ''}`
                : `${n(S * 100, 3)} % · ${n(S, 5)} m/m`
            }
          />
          <div className="grid-2 tl-kpis">
            <Kpi label="Pendiente" value={n(S * 1000, 2)} unit="‰" sub={`${n(S, 5)} m/m`} />
            <Kpi label="Cota fondo final" value={n(endInvert)} unit="m" sub={L !== undefined ? `a ${n(L, 2)} m · Δ ${ns(endInvert !== undefined ? endInvert - s.start : undefined)}` : 'Falta longitud'} />
            <Kpi label="Prof. buzón inicial" value={n(depthStart, 2)} unit={depthStart !== undefined ? 'm' : undefined} sub="Tapa − fondo" />
            <Kpi label="Prof. buzón final" value={n(depthEnd, 2)} unit={depthEnd !== undefined ? 'm' : undefined} sub="Tapa − fondo" />
          </div>
          {smin !== undefined && (
            <div className="card row-between wrap">
              <div>
                <div className="tl-card-title">Pendiente mínima OS.070</div>
                <div className="small muted mono">
                  S₀min = {n(smin * 1000, 2)} ‰ (Qi = {n(Math.max(OS070_MIN_FLOW, s.qi ?? 0), 2)} L/s)
                </div>
              </div>
              <Verdict ok={S >= smin} />
            </div>
          )}
          {rows.length > 0 && (
            <div className="card flush">
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>x (m)</th>
                      <th>Cota fondo</th>
                      {s.hi !== undefined && <th>Lectura mira</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className={i === 0 || i === rows.length - 1 ? 'tp' : undefined}>
                        <td>
                          {n(r.x, 2)}
                          {i === 0 ? ' · BZ ini.' : i === rows.length - 1 ? ' · BZ fin' : ''}
                        </td>
                        <td>{n(r.invert)}</td>
                        {s.hi !== undefined && <td className={r.reading !== undefined && (r.reading < 0 || r.reading > 5.5) ? 'c-fail' : undefined}>{n(r.reading)}</td>}
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

      <HowTo source="Estudio funcional §1.6; RNE Norma OS.070 Redes de aguas residuales (τ ≥ 1.0 Pa, n = 0.013).">
        <Formula>{`S (m/m) = (Cf inicial − Cf final) / L
Cf(x) = Cf inicial − S · x
Lectura esperada = AI − Cf(x)
Profundidad de buzón = Cota tapa − Cota fondo
OS.070: S₀min = 0.0055 · Qi^(−0.47)   (Qi ≥ 1.5 L/s)`}</Formula>
      </HowTo>
    </div>
  );
}
