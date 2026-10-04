import { Kpi, NumberInput, Segmented } from '@/ui/kit';
import { azimuth, intersectionByAzimuths, intersectionByDistances, type XY } from '@/core/cogo';
import { normalizeDiffDeg } from '@/core/units';
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
  ptXY,
  useToolState,
  type Ang,
  type PtVal,
} from '../ui/shared';

interface S {
  mode: 'az' | 'dist';
  a?: PtVal;
  b?: PtVal;
  azA?: Ang;
  azB?: Ang;
  rA?: number;
  rB?: number;
  pick: 'right' | 'left';
}

export const intersectionDefaults: S = { mode: 'az', pick: 'right' };
export const intersectionExample: S = {
  mode: 'az',
  a: { x: 1000, y: 1000 },
  b: { x: 1100, y: 1000 },
  azA: { d: 45 },
  azB: { d: 315 },
  rA: 80,
  rB: 70,
  pick: 'right',
};

export default function Intersection() {
  const [s, set] = useToolState<S>(intersectionDefaults);
  const A = ptXY(s.a);
  const B = ptXY(s.b);
  const la = s.a?.name ?? 'A';
  const lb = s.b?.name ?? 'B';
  let P: XY | null = null;
  let sols: XY[] = [];
  let msg: { tone: 'fail' | 'warn'; text: string } | undefined;
  let waiting = true;

  if (A && B) {
    if (A.x === B.x && A.y === B.y) {
      msg = { tone: 'fail', text: 'A y B coinciden: no hay base para la intersección.' };
      waiting = false;
    } else if (s.mode === 'az') {
      const a1 = angValue(s.azA).deg;
      const a2 = angValue(s.azB).deg;
      if (a1 !== undefined && a2 !== undefined) {
        waiting = false;
        P = intersectionByAzimuths(A, a1, B, a2);
        if (!P) msg = { tone: 'fail', text: 'Las visuales son paralelas: no se cortan.' };
        else {
          const dA = (P.x - A.x) * Math.sin((a1 * Math.PI) / 180) + (P.y - A.y) * Math.cos((a1 * Math.PI) / 180);
          const dB = (P.x - B.x) * Math.sin((a2 * Math.PI) / 180) + (P.y - B.y) * Math.cos((a2 * Math.PI) / 180);
          if (dA < 0 || dB < 0) msg = { tone: 'warn', text: 'Las visuales se cortan por detrás de uno de los puntos: revisa los azimuts.' };
          const ang = Math.abs(normalizeDiffDeg(a1 - a2));
          if (Math.min(ang, 180 - ang) < 15) msg = { tone: 'warn', text: `Ángulo de corte muy agudo (${n(Math.min(ang, 180 - ang), 1)}°): la solución es poco precisa.` };
        }
      }
    } else if (s.rA !== undefined && s.rB !== undefined) {
      waiting = false;
      if (s.rA <= 0 || s.rB <= 0) msg = { tone: 'fail', text: 'Las distancias deben ser positivas.' };
      else {
        sols = intersectionByDistances(A, s.rA, B, s.rB);
        if (sols.length === 0) msg = { tone: 'fail', text: `Sin solución: las circunferencias no se cortan (AB = ${n(Math.hypot(B.x - A.x, B.y - A.y))} m).` };
        else P = sols.length === 1 ? sols[0] : s.pick === 'right' ? sols[0] : sols[1];
      }
    }
  }

  const dA = P && A ? Math.hypot(P.x - A.x, P.y - A.y) : undefined;
  const dB = P && B ? Math.hypot(P.x - B.x, P.y - B.y) : undefined;
  const copy = P ? `E = ${n(P.x)}\nN = ${n(P.y)}\nDist. ${la}–P = ${n(dA)} m · ${lb}–P = ${n(dB)} m` : null;

  return (
    <div className="stack-l">
      <Segmented
        value={s.mode}
        onChange={(mode) => set({ mode })}
        options={[
          { value: 'az', label: 'Azimut – azimut' },
          { value: 'dist', label: 'Distancia – distancia' },
        ]}
      />
      <section className="card stack">
        <PointField label="Punto A" value={s.a} onChange={(a) => set({ a })} />
        {s.mode === 'az' ? (
          <AngleInput label="Azimut desde A" value={s.azA} onChange={(azA) => set({ azA })} />
        ) : (
          <NumberInput label="Distancia desde A" value={s.rA} onChange={(rA) => set({ rA })} suffix="m" />
        )}
      </section>
      <section className="card stack">
        <PointField label="Punto B" value={s.b} onChange={(b) => set({ b })} />
        {s.mode === 'az' ? (
          <AngleInput label="Azimut desde B" value={s.azB} onChange={(azB) => set({ azB })} />
        ) : (
          <NumberInput label="Distancia desde B" value={s.rB} onChange={(rB) => set({ rB })} suffix="m" />
        )}
      </section>

      {s.mode === 'dist' && sols.length === 2 && (
        <InputCard title="Solución">
          <Segmented
            value={s.pick}
            onChange={(pick) => set({ pick })}
            options={[
              { value: 'right', label: `A la derecha de ${la}→${lb}` },
              { value: 'left', label: 'A la izquierda' },
            ]}
          />
        </InputCard>
      )}

      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {waiting && !msg ? (
        <Waiting>Ingresa los dos puntos y {s.mode === 'az' ? 'los dos azimuts' : 'las dos distancias'}.</Waiting>
      ) : (
        P &&
        A &&
        B && (
          <>
            <ResultCard label="Punto de intersección P" value={null} tone="brand">
              <div className="tl-xyz">
                <div>
                  <span>E</span>
                  <b>{n(P.x)}</b>
                </div>
                <div>
                  <span>N</span>
                  <b>{n(P.y)}</b>
                </div>
              </div>
            </ResultCard>
            <div className="grid-2 tl-kpis">
              <Kpi label={`Dist. ${la}–P`} value={n(dA)} unit="m" sub={`Az ${dms(azimuth(A, P), 0)}`} />
              <Kpi label={`Dist. ${lb}–P`} value={n(dB)} unit="m" sub={`Az ${dms(azimuth(B, P), 0)}`} />
            </div>
            <div className="card flush">
              <PlanSketch
                points={[
                  { ...A, label: la, kind: 'known' },
                  { ...B, label: lb, kind: 'known' },
                  ...sols.filter((q) => q !== P).map((q) => ({ ...q, label: 'alt.', kind: 'plain' as const })),
                  { ...P, label: 'P', kind: 'new' },
                ]}
                lines={[
                  [A, P],
                  [B, P],
                ]}
                dashed={[[A, B]]}
                circles={s.mode === 'dist' && s.rA && s.rB ? [{ c: A, r: s.rA }, { c: B, r: s.rB }] : []}
                height={220}
              />
            </div>
          </>
        )
      )}

      <ToolActions copy={copy} points={P ? [{ name: '', x: P.x, y: P.y, note: s.mode === 'az' ? 'Intersección az-az' : 'Intersección dist-dist' }] : null} />

      <HowTo source="Estudio funcional §3.3.">
        <Formula>
          {s.mode === 'az'
            ? `d_A = [(E_B − E_A)·cos Az_B − (N_B − N_A)·sen Az_B] / sen(Az_A − Az_B)
P = A + d_A · (sen Az_A, cos Az_A)
Sin solución si sen(Az_A − Az_B) ≈ 0 (paralelas)`
            : `d = |AB|
a = (r_A² − r_B² + d²) / (2d)      h = √(r_A² − a²)
P₀ = A + a·(B − A)/d
P = P₀ ± h·(ΔN, −ΔE)/d   (derecha / izquierda de A→B)`}
        </Formula>
      </HowTo>
    </div>
  );
}
