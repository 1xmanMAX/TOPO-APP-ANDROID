import { Kpi, NumberInput } from '@/ui/kit';
import { reciprocalLeveling } from '@/core/leveling';
import { Formula, HowTo, InputCard, Notice, ResultCard, ToolActions, Waiting, n, ns, useToolState } from '../ui/shared';

interface S {
  a1?: number;
  b1?: number;
  a2?: number;
  b2?: number;
  zA?: number;
  distance?: number;
}

export const reciprocalDefaults: S = {};
export const reciprocalExample: S = { a1: 1.234, b1: 2.468, a2: 1.006, b2: 2.252, zA: 100 };

export default function Reciprocal() {
  const [s, set] = useToolState<S>(reciprocalDefaults);
  const ready = [s.a1, s.b1, s.a2, s.b2].every((v) => v !== undefined);
  const r = ready ? reciprocalLeveling({ a1: s.a1!, b1: s.b1!, a2: s.a2!, b2: s.b2! }) : null;
  const zB = r && s.zA !== undefined ? s.zA + r.trueDiff : undefined;
  const big = r ? Math.abs(r.diff1 - r.diff2) > 0.05 : false;

  const copy = r
    ? [`ΔH A→B = ${ns(r.trueDiff)} m`, `Error visual larga = ${ns(r.error * 1000, 1)} mm`, zB !== undefined ? `Cota B = ${n(zB)} m` : '']
        .filter(Boolean)
        .join('\n')
    : null;

  return (
    <div className="stack-l">
      <InputCard title="Puesta 1 · junto a A">
        <div className="grid-2">
          <NumberInput label="Lectura en A (cerca)" value={s.a1} onChange={(a1) => set({ a1 })} suffix="m" />
          <NumberInput label="Lectura en B (lejos)" value={s.b1} onChange={(b1) => set({ b1 })} suffix="m" />
        </div>
      </InputCard>
      <InputCard title="Puesta 2 · junto a B">
        <div className="grid-2">
          <NumberInput label="Lectura en A (lejos)" value={s.a2} onChange={(a2) => set({ a2 })} suffix="m" />
          <NumberInput label="Lectura en B (cerca)" value={s.b2} onChange={(b2) => set({ b2 })} suffix="m" />
        </div>
      </InputCard>
      <InputCard title="Cota de A (opcional)">
        <NumberInput label="Cota A" value={s.zA} onChange={(zA) => set({ zA })} suffix="m" />
      </InputCard>

      {!r ? (
        <Waiting>Ingresa las cuatro lecturas.</Waiting>
      ) : (
        <>
          <ResultCard
            label="Desnivel verdadero A → B"
            value={ns(r.trueDiff)}
            unit="m"
            tone="brand"
            sub={zB !== undefined ? `Cota B = ${n(zB)} m` : r.trueDiff > 0 ? 'B está más alto que A' : r.trueDiff < 0 ? 'B está más bajo que A' : 'A y B al mismo nivel'}
          />
          <div className="grid-3 tl-kpis">
            <Kpi label="Puesta 1" value={ns(r.diff1)} unit="m" sub="a1 − b1" />
            <Kpi label="Puesta 2" value={ns(r.diff2)} unit="m" sub="a2 − b2" />
            <Kpi label="Error ε" value={ns(r.error * 1000, 1)} unit="mm" sub="Colim. + c&r" />
          </div>
          {big && <Notice>Los dos desniveles difieren más de 5 cm. Revisa las lecturas o repite con menos diferencia de tiempo.</Notice>}
        </>
      )}

      <ToolActions copy={copy} />

      <HowTo source="Estudio funcional §2.8 (cruce de ríos y quebradas).">
        <Formula>{`Δh₁ = a1 − b1        Δh₂ = a2 − b2
ΔH_AB = (Δh₁ + Δh₂) / 2
ε = (Δh₂ − Δh₁) / 2   (colimación + curvatura y refracción en la visual larga)`}</Formula>
        <p>Haz las dos puestas con poca diferencia de tiempo para que la refracción sea la misma.</p>
      </HowTo>
    </div>
  );
}
