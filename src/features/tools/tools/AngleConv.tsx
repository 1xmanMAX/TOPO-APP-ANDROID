import { Kpi, NumberInput } from '@/ui/kit';
import { degToGon, degToRad, gonToDeg, normalizeDeg, radToDeg } from '@/core/units';
import { AngleInput, Formula, HowTo, InputCard, Notice, ResultCard, ToolActions, Waiting, angValue, dms, n, toAng, useToolState, type Ang } from '../ui/shared';

type Src = 'dms' | 'deg' | 'gon' | 'rad';

interface S {
  src: Src;
  dmsVal?: Ang;
  val?: number;
}

export const anglesDefaults: S = { src: 'dms' };
export const anglesExample: S = { src: 'dms', dmsVal: { d: 123, m: 45, s: 30 } };

const round = (v: number, dec: number) => Math.round(v * 10 ** dec) / 10 ** dec;

export default function AngleConv() {
  const [s, set] = useToolState<S>(anglesDefaults);
  let deg: number | undefined;
  let error: string | undefined;
  if (s.src === 'dms') {
    const r = angValue(s.dmsVal);
    deg = r.deg;
    error = r.error;
  } else if (s.val !== undefined) {
    deg = s.src === 'deg' ? s.val : s.src === 'gon' ? gonToDeg(s.val) : radToDeg(s.val);
  }
  const v = (src: Src, dec: number, conv: (d: number) => number) => (s.src === src ? s.val : deg === undefined ? undefined : round(conv(deg), dec));
  const dmsShown: Ang | undefined = s.src === 'dms' ? s.dmsVal : deg === undefined ? {} : toAng(deg);

  const copy =
    deg !== undefined
      ? `${dms(deg, 2)} = ${n(deg, 8)}° = ${n(degToGon(deg), 6)} gon = ${n(degToRad(deg), 9)} rad`
      : null;

  return (
    <div className="stack-l">
      <InputCard title="Edita cualquiera y se actualizan las demás">
        <AngleInput label="Sexagesimal (G° M' S&quot;)" value={dmsShown} onChange={(dmsVal) => set({ src: 'dms', dmsVal })} />
        <NumberInput label="Grados decimales" value={v('deg', 8, (d) => d)} onChange={(val) => set({ src: 'deg', val })} suffix="°" />
        <div className="grid-2">
          <NumberInput label="Centesimal" value={v('gon', 6, degToGon)} onChange={(val) => set({ src: 'gon', val })} suffix="gon" />
          <NumberInput label="Radianes" value={v('rad', 9, degToRad)} onChange={(val) => set({ src: 'rad', val })} suffix="rad" />
        </div>
      </InputCard>

      {error ? (
        <Notice tone="fail">{error}</Notice>
      ) : deg === undefined ? (
        <Waiting>Escribe un ángulo en cualquier formato.</Waiting>
      ) : (
        <>
          <ResultCard label="Ángulo" value={dms(deg, 2)} tone="brand" sub={`${n(deg, 8)}°`} />
          <div className="grid-2 tl-kpis">
            <Kpi label="Centesimal" value={n(degToGon(deg), 5)} unit="gon" />
            <Kpi label="Radianes" value={n(degToRad(deg), 7)} unit="rad" />
            <Kpi label="Segundos" value={n(deg * 3600, 1)} unit="″" />
            <Kpi label="Normalizado" value={dms(normalizeDeg(deg), 1)} sub="Azimut 0–360°" />
          </div>
        </>
      )}

      <ToolActions copy={copy} />

      <HowTo source="Estudio funcional §3.4.">
        <Formula>{`360° = 400 gon = 2π rad
° = G + M/60 + S/3600
gon = ° · 10/9          ° = gon · 0.9
rad = ° · π / 180
1 rad = 206 264.806″    1 mgon = 3.24″`}</Formula>
      </HowTo>
    </div>
  );
}
