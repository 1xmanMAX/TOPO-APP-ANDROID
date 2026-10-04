import { Kpi } from '@/ui/kit';
import { inverse } from '@/core/cogo';
import { normalizeDeg } from '@/core/units';
import { Formula, HowTo, PlanSketch, PointField, ResultCard, ToolActions, Waiting, dms, n, ns, ptXY, useToolState, type PtVal } from '../ui/shared';

interface S {
  p1?: PtVal;
  p2?: PtVal;
}

export const inverseDefaults: S = {};
export const inverseExample: S = {
  p1: { x: 279412.381, y: 8661215.442, z: 152.315 },
  p2: { x: 279544.102, y: 8661309.877, z: 154.062 },
};

export default function Inverse() {
  const [s, set] = useToolState<S>(inverseDefaults);
  const a = ptXY(s.p1);
  const b = ptXY(s.p2);
  const r = a && b ? inverse(a, b) : null;
  const same = r && r.dh === 0;
  const l1 = s.p1?.name ?? 'P1';
  const l2 = s.p2?.name ?? 'P2';

  const copy =
    r && !same
      ? [
          `${l1} → ${l2}`,
          `Distancia horizontal = ${n(r.dh)} m`,
          `Azimut = ${dms(r.azimuth)}`,
          `Rumbo = ${r.bearing}`,
          `ΔE = ${ns(r.dx)} m · ΔN = ${ns(r.dy)} m`,
          r.dz !== undefined ? `ΔZ = ${ns(r.dz)} m · Dist. inclinada = ${n(r.slopeDist)} m · Pendiente = ${ns(r.slopePercent, 2)} %` : '',
        ]
          .filter(Boolean)
          .join('\n')
      : null;

  return (
    <div className="stack-l">
      <section className="card stack">
        <PointField label="Punto inicial P1" value={s.p1} onChange={(p1) => set({ p1 })} withZ />
      </section>
      <section className="card stack">
        <PointField label="Punto final P2" value={s.p2} onChange={(p2) => set({ p2 })} withZ />
      </section>

      {!r ? (
        <Waiting>Ingresa (o elige del proyecto) las coordenadas E y N de ambos puntos.</Waiting>
      ) : same ? (
        <Waiting>Los dos puntos coinciden en planta: no hay dirección.</Waiting>
      ) : (
        <>
          <ResultCard label={`Distancia horizontal ${l1} → ${l2}`} value={n(r.dh)} unit="m" tone="brand" sub={`Azimut ${dms(r.azimuth)} · ${r.bearing}`} />
          <div className="grid-2 tl-kpis">
            <Kpi label="Azimut" value={dms(r.azimuth)} sub={`${n(r.azimuth, 6)}°`} />
            <Kpi label="Contra-azimut" value={dms(normalizeDeg(r.azimuth + 180))} sub={`${l2} → ${l1}`} />
            <Kpi label="Rumbo" value={<span className="tl-kpi-text">{r.bearing}</span>} />
            <Kpi label="ΔE / ΔN" value={<span className="tl-kpi-text">{ns(r.dx)} / {ns(r.dy)}</span>} unit="m" />
            <Kpi label="Desnivel ΔZ" value={r.dz !== undefined ? ns(r.dz) : '—'} unit={r.dz !== undefined ? 'm' : undefined} sub={r.dz === undefined ? 'Falta Z en algún punto' : undefined} />
            <Kpi label="Pendiente" value={r.slopePercent !== undefined ? ns(r.slopePercent, 2) : '—'} unit={r.slopePercent !== undefined ? '%' : undefined} sub={r.slopeDist !== undefined ? `Dist. inclinada ${n(r.slopeDist)} m` : undefined} />
          </div>
          <div className="card flush">
            <PlanSketch
              points={[
                { ...a!, label: l1, kind: 'known' },
                { ...b!, label: l2, kind: 'new' },
              ]}
              lines={[[a!, b!]]}
              height={200}
            />
          </div>
        </>
      )}

      <ToolActions copy={copy} />

      <HowTo source="Estudio funcional §3.1 (azimut desde el Norte, sentido horario).">
        <Formula>{`ΔE = E2 − E1      ΔN = N2 − N1
Dh = √(ΔE² + ΔN²)
Az = atan2(ΔE, ΔN)   (si Az < 0: Az + 360°)
Di = √(Dh² + ΔZ²)    Pendiente % = 100 · ΔZ / Dh
Rumbo: N Az E · S (180°−Az) E · S (Az−180°) W · N (360°−Az) W`}</Formula>
      </HowTo>
    </div>
  );
}
