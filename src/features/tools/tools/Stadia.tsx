import { Kpi, NumberInput, Segmented } from '@/ui/kit';
import { stadia } from '@/core/leveling';
import { AngleInput, Formula, HowTo, InputCard, Notice, ResultCard, ToolActions, Waiting, angValue, n, ns, useToolState, type Ang } from '../ui/shared';

interface S {
  upper?: number;
  middle?: number;
  lower?: number;
  angleMode: 'level' | 'elev' | 'zenith';
  angle?: Ang;
  k?: number;
  c?: number;
  stationZ?: number;
  hi?: number;
}

export const stadiaDefaults: S = { angleMode: 'level', k: 100, c: 0 };
export const stadiaExample: S = { upper: 1.854, middle: 1.62, lower: 1.386, angleMode: 'zenith', angle: { d: 87, m: 15, s: 0 }, k: 100, c: 0, stationZ: 152.315, hi: 1.52 };

export default function Stadia() {
  const [s, set] = useToolState<S>(stadiaDefaults);
  const ang = angValue(s.angle, { signed: true });
  const angleDeg = s.angleMode === 'level' ? 0 : ang.deg === undefined ? undefined : s.angleMode === 'zenith' ? 90 - ang.deg : ang.deg;
  const ready = s.upper !== undefined && s.lower !== undefined && angleDeg !== undefined;
  const r = ready
    ? stadia({
        upper: s.upper!,
        lower: s.lower!,
        middle: s.middle,
        k: s.k ?? 100,
        c: s.c ?? 0,
        verticalAngleDeg: angleDeg,
        instrumentHeight: s.hi,
      })
    : null;
  const inverted = s.upper !== undefined && s.lower !== undefined && s.upper < s.lower;
  const interUp = s.upper !== undefined && s.middle !== undefined ? s.upper - s.middle : undefined;
  const interDown = s.middle !== undefined && s.lower !== undefined ? s.middle - s.lower : undefined;
  const elev = r && s.stationZ !== undefined && r.elevationDiff !== undefined ? s.stationZ + r.elevationDiff : undefined;

  const copy = r
    ? [
        `Distancia horizontal = ${n(r.horizontalDistance, 2)} m`,
        `Intervalo s = ${n(r.intercept)} m`,
        s.angleMode !== 'level' ? `Desnivel V = ${ns(r.verticalDiff)} m` : '',
        elev !== undefined ? `Cota del punto = ${n(elev)} m` : '',
      ]
        .filter(Boolean)
        .join('\n')
    : null;

  return (
    <div className="stack-l">
      <InputCard title="Lecturas de los hilos">
        <div className="grid-3">
          <NumberInput label="Superior" value={s.upper} onChange={(upper) => set({ upper })} suffix="m" />
          <NumberInput label="Medio" value={s.middle} onChange={(middle) => set({ middle })} suffix="m" />
          <NumberInput label="Inferior" value={s.lower} onChange={(lower) => set({ lower })} suffix="m" />
        </div>
        {inverted && <Notice tone="info">El hilo superior es menor que el inferior (mira invertida o hilos cruzados): se usa el valor absoluto.</Notice>}
      </InputCard>

      <InputCard title="Ángulo vertical">
        <Segmented
          value={s.angleMode}
          onChange={(angleMode) => set({ angleMode })}
          options={[
            { value: 'level', label: 'Nivel (0°)' },
            { value: 'elev', label: 'Elevación α' },
            { value: 'zenith', label: 'Cenital Z' },
          ]}
        />
        {s.angleMode !== 'level' && (
          <AngleInput
            label={s.angleMode === 'zenith' ? 'Ángulo cenital Z' : 'Ángulo de elevación α (− depresión)'}
            value={s.angle}
            onChange={(angle) => set({ angle })}
            hint={s.angleMode === 'zenith' ? '90° = horizontal' : undefined}
          />
        )}
        <div className="grid-2">
          <NumberInput label="Constante K" value={s.k} onChange={(k) => set({ k })} hint="Normalmente 100" />
          <NumberInput label="Constante C" value={s.c} onChange={(c) => set({ c })} suffix="m" hint="0 en equipos modernos" />
        </div>
      </InputCard>

      <InputCard title="Cota del punto (opcional)">
        <div className="grid-2">
          <NumberInput label="Cota estación" value={s.stationZ} onChange={(stationZ) => set({ stationZ })} suffix="m" />
          <NumberInput label="Altura instrumento" value={s.hi} onChange={(v) => set({ hi: v })} suffix="m" />
        </div>
      </InputCard>

      {!r ? (
        <Waiting>Ingresa los hilos superior e inferior{s.angleMode !== 'level' ? ' y el ángulo vertical' : ''}.</Waiting>
      ) : (
        <>
          <ResultCard
            label="Distancia horizontal"
            value={n(r.horizontalDistance, 2)}
            unit="m"
            tone="brand"
            sub={elev !== undefined ? `Cota del punto ${n(elev)} m` : `Intervalo s = ${n(r.intercept)} m`}
          />
          <div className="grid-2 tl-kpis">
            <Kpi label="Intervalo s" value={n(r.intercept)} unit="m" sub="Superior − inferior" />
            <Kpi label="Dist. inclinada" value={n(r.slopeDistance, 2)} unit="m" sub="K·s + C" />
            <Kpi label="Desnivel V" value={ns(r.verticalDiff)} unit="m" sub="Eje → hilo medio" />
            <Kpi
              label="Hilo medio"
              value={r.middleDiffMm === undefined ? '—' : ns(r.middleDiffMm, 1)}
              unit={r.middleDiffMm === undefined ? undefined : 'mm'}
              sub={r.middleDiffMm === undefined ? `Esperado ${n(r.middleExpected)} m` : r.middleOk ? 'Comprobación correcta' : 'Releer: > 3 mm'}
              tone={r.middleDiffMm === undefined ? undefined : r.middleOk ? 'ok' : 'fail'}
            />
          </div>
          {interUp !== undefined && interDown !== undefined && Math.abs(interUp - interDown) > 0.003 && (
            <Notice>
              Intervalos desiguales: sup.−medio = {n(interUp)} m, medio−inf. = {n(interDown)} m. Revisa la lectura.
            </Notice>
          )}
          {elev !== undefined && (
            <div className="grid-2 tl-kpis">
              <Kpi label="Desnivel est.→punto" value={ns(r.elevationDiff)} unit="m" sub="hi + V − hm" />
              <Kpi label="Cota punto" value={n(elev)} unit="m" tone="brand" />
            </div>
          )}
        </>
      )}

      <ToolActions copy={copy} />

      <HowTo source="Estudio funcional §2.4; literatura clásica de taquimetría (anteojo analático K = 100, C = 0).">
        <Formula>{`s  = hs − hi
D  = K·s·cos²α + C·cosα
V  = K·s·sen(2α)/2 + C·senα
Con cenital Z: α = 90° − Z
Comprobación: |hm − (hs + hi)/2| ≤ 3 mm
Cota P = Cota E + hi_instr + V − hm`}</Formula>
      </HowTo>
    </div>
  );
}
