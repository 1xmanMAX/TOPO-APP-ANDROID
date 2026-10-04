import { Kpi, NumberInput, Segmented, Toggle } from '@/ui/kit';
import { azimuth, polar, radiateFromStation, type XYZ } from '@/core/cogo';
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
  Waiting,
  angValue,
  dms,
  n,
  ns,
  ptXY,
  useToolState,
  type Ang,
  type PtVal,
} from '../ui/shared';

interface S {
  mode: 'polar' | 'ts';
  station?: PtVal;
  az?: Ang;
  dist?: number;
  dz?: number;
  orient: 'point' | 'az';
  back?: PtVal;
  backAz?: Ang;
  hzBack?: Ang;
  hz?: Ang;
  vz?: Ang;
  sd?: number;
  hiInstr?: number;
  hp?: number;
  cr: boolean;
}

export const radiationDefaults: S = { mode: 'polar', orient: 'point', cr: false, hzBack: { d: 0 } };
export const radiationExample: S = {
  mode: 'ts',
  station: { x: 279412.381, y: 8661215.442, z: 152.315 },
  orient: 'az',
  backAz: { d: 35, m: 38, s: 30 },
  hzBack: { d: 0 },
  hz: { d: 72, m: 14, s: 20 },
  vz: { d: 91, m: 2, s: 40 },
  sd: 84.512,
  hiInstr: 1.52,
  hp: 1.8,
  cr: false,
};

export default function Radiation() {
  const [s, set] = useToolState<S>(radiationDefaults);
  const st = ptXY(s.station);
  let result: (XYZ & { az: number; dh: number; dz?: number }) | null = null;
  let error: string | undefined;

  if (s.mode === 'polar') {
    const az = angValue(s.az).deg;
    if (st && az !== undefined && s.dist !== undefined) {
      if (s.dist < 0) error = 'La distancia debe ser positiva.';
      else {
        const p = polar(st, az, s.dist, s.dz);
        result = { ...p, az, dh: s.dist, dz: s.dz };
      }
    }
  } else {
    const hz = angValue(s.hz).deg;
    const vz = angValue(s.vz).deg;
    const hzb = angValue(s.hzBack).deg ?? 0;
    const backPt = ptXY(s.back);
    const backAz = s.orient === 'az' ? angValue(s.backAz).deg : backPt && st ? azimuth(st, backPt) : undefined;
    if (st && hz !== undefined && vz !== undefined && s.sd !== undefined && backAz !== undefined) {
      if (vz <= 0 || vz >= 180) error = 'El ángulo cenital debe estar entre 0° y 180° (90° = horizontal).';
      else if (s.sd <= 0) error = 'La distancia inclinada debe ser positiva.';
      else {
        const shot = radiateFromStation({
          station: st,
          backAzimuthDeg: backAz,
          hzBacksight: hzb,
          hz,
          vz,
          slopeDist: s.sd,
          hiInstr: s.hiInstr ?? 0,
          targetHeight: s.hp ?? 0,
          curvatureRefraction: s.cr,
        });
        result = { x: shot.x, y: shot.y, z: shot.z, az: shot.azimuth, dh: shot.horizontalDist, dz: shot.dz };
      }
    }
  }

  const copy = result
    ? [`E = ${n(result.x)}`, `N = ${n(result.y)}`, result.z !== undefined ? `Z = ${n(result.z)}` : '', `Az = ${dms(result.az)} · Dh = ${n(result.dh)} m`]
        .filter(Boolean)
        .join('\n')
    : null;

  return (
    <div className="stack-l">
      <Segmented
        value={s.mode}
        onChange={(mode) => set({ mode })}
        options={[
          { value: 'polar', label: 'Azimut y distancia' },
          { value: 'ts', label: 'Estación total' },
        ]}
      />
      <section className="card stack">
        <PointField label="Estación" value={s.station} onChange={(station) => set({ station })} withZ />
      </section>

      {s.mode === 'polar' ? (
        <InputCard title="Observación">
          <AngleInput label="Azimut" value={s.az} onChange={(az) => set({ az })} />
          <div className="grid-2">
            <NumberInput label="Distancia horizontal" value={s.dist} onChange={(dist) => set({ dist })} suffix="m" />
            <NumberInput label="Desnivel ΔZ" value={s.dz} onChange={(dz) => set({ dz })} suffix="m" hint="Opcional" />
          </div>
        </InputCard>
      ) : (
        <>
          <InputCard title="Orientación (vista atrás)">
            <Segmented
              value={s.orient}
              onChange={(orient) => set({ orient })}
              options={[
                { value: 'point', label: 'Punto atrás' },
                { value: 'az', label: 'Azimut atrás' },
              ]}
            />
            {s.orient === 'point' ? (
              <PointField label="Punto de vista atrás" value={s.back} onChange={(back) => set({ back })} />
            ) : (
              <AngleInput label="Azimut estación → atrás" value={s.backAz} onChange={(backAz) => set({ backAz })} />
            )}
            <AngleInput label="Lectura Hz en la vista atrás" value={s.hzBack} onChange={(hzBack) => set({ hzBack })} hint="Normalmente 0°" />
          </InputCard>
          <InputCard title="Observación al punto">
            <AngleInput label="Ángulo horizontal Hz" value={s.hz} onChange={(hz) => set({ hz })} hint="Horario" />
            <AngleInput label="Ángulo cenital V" value={s.vz} onChange={(vz) => set({ vz })} hint="90° = horizontal" />
            <NumberInput label="Distancia inclinada" value={s.sd} onChange={(sd) => set({ sd })} suffix="m" />
            <div className="grid-2">
              <NumberInput label="Altura instrumento" value={s.hiInstr} onChange={(hiInstr) => set({ hiInstr })} suffix="m" />
              <NumberInput label="Altura prisma" value={s.hp} onChange={(hp) => set({ hp })} suffix="m" />
            </div>
            <Toggle checked={s.cr} onChange={(cr) => set({ cr })} label="Corregir curvatura y refracción" />
          </InputCard>
        </>
      )}

      {error ? (
        <Notice tone="fail">{error}</Notice>
      ) : !result ? (
        <Waiting>Completa la estación y la observación.</Waiting>
      ) : (
        <>
          <ResultCard label="Coordenadas del punto" value={null} tone="brand">
            <div className="tl-xyz">
              <div>
                <span>E</span>
                <b>{n(result.x)}</b>
              </div>
              <div>
                <span>N</span>
                <b>{n(result.y)}</b>
              </div>
              {result.z !== undefined && (
                <div>
                  <span>Z</span>
                  <b>{n(result.z)}</b>
                </div>
              )}
            </div>
          </ResultCard>
          <div className="grid-3 tl-kpis">
            <Kpi label="Azimut" value={<span className="tl-kpi-text">{dms(result.az, 0).replace("'", "′").replace('"', '″')}</span>} />
            <Kpi label="Dist. horiz." value={n(result.dh)} unit="m" />
            <Kpi label="ΔZ" value={result.dz !== undefined ? ns(result.dz) : '—'} unit={result.dz !== undefined ? 'm' : undefined} />
          </div>
          {st && (
            <div className="card flush">
              <PlanSketch
                points={[
                  { ...st, label: s.station?.name ?? 'Est.', kind: 'station' },
                  ...(s.mode === 'ts' && s.orient === 'point' && ptXY(s.back) ? [{ ...ptXY(s.back)!, label: s.back?.name ?? 'Atrás', kind: 'known' as const }] : []),
                  { x: result.x, y: result.y, label: 'P', kind: 'new' },
                ]}
                lines={[[st, result]]}
                dashed={s.mode === 'ts' && s.orient === 'point' && ptXY(s.back) ? [[st, ptXY(s.back)!]] : []}
                height={200}
              />
            </div>
          )}
        </>
      )}

      <ToolActions copy={copy} points={result ? [{ name: '', x: result.x, y: result.y, z: result.z, note: 'Radiación' }] : null} />

      <HowTo source="Estudio funcional §3.2 (radiación con estación total).">
        <Formula>{`Az = Az atrás + (Hz − Hz atrás)
Dh = Di · sen V          ΔV = Di · cos V
E = E₀ + Dh · sen Az     N = N₀ + Dh · cos Az
Z = Z₀ + hi + ΔV − hp    (+ (1 − 0.13)·Dh²/2R con c&r)`}</Formula>
      </HowTo>
    </div>
  );
}
