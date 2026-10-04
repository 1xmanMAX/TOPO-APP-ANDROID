import { Kpi, NumberInput, Segmented } from '@/ui/kit';
import { cutFill, cutFillLabel, gradeStake } from '@/core/leveling';
import { Formula, HowTo, InputCard, Notice, ResultCard, ToolActions, Waiting, n, ns, useToolState } from '../ui/shared';

interface S {
  mode: 'bm' | 'hi';
  bm?: number;
  bs?: number;
  hi?: number;
  design?: number;
  reading?: number;
}

export const gradeStakeDefaults: S = { mode: 'bm' };
export const gradeStakeExample: S = { mode: 'bm', bm: 152.315, bs: 1.487, design: 152.9, reading: 0.842 };

export default function GradeStake() {
  const [s, set] = useToolState<S>(gradeStakeDefaults);
  const hi = s.mode === 'bm' ? (s.bm !== undefined && s.bs !== undefined ? s.bm + s.bs : undefined) : s.hi;
  const target = hi !== undefined && s.design !== undefined ? gradeStake(hi, s.design) : undefined;
  const ground = hi !== undefined && s.reading !== undefined ? hi - s.reading : undefined;
  const cf = hi !== undefined && s.reading !== undefined && s.design !== undefined ? cutFill(hi, s.reading, s.design) : undefined;
  const badReading = (v?: number) => v !== undefined && (v < 0 || v > 5.5);

  const copy =
    hi === undefined
      ? null
      : [
          `AI = ${n(hi)} m`,
          target !== undefined ? `Lectura objetivo = ${n(target)} m (cota proyecto ${n(s.design)})` : '',
          ground !== undefined ? `Cota del punto = ${n(ground)} m` : '',
          cf !== undefined ? cutFillLabel(cf) : '',
        ]
          .filter(Boolean)
          .join('\n');

  return (
    <div className="stack-l">
      <InputCard title="Altura de instrumento (AI)">
        <Segmented
          value={s.mode}
          onChange={(mode) => set({ mode })}
          options={[
            { value: 'bm', label: 'Desde BM + vista atrás' },
            { value: 'hi', label: 'AI conocida' },
          ]}
        />
        {s.mode === 'bm' ? (
          <div className="grid-2">
            <NumberInput label="Cota BM" value={s.bm} onChange={(bm) => set({ bm })} suffix="m" />
            <NumberInput label="Vista atrás (+)" value={s.bs} onChange={(bs) => set({ bs })} suffix="m" />
          </div>
        ) : (
          <NumberInput label="Altura de instrumento" value={s.hi} onChange={(v) => set({ hi: v })} suffix="m" />
        )}
      </InputCard>

      <InputCard title="Punto">
        <div className="grid-2">
          <NumberInput label="Cota de proyecto" value={s.design} onChange={(design) => set({ design })} suffix="m" />
          <NumberInput
            label="Lectura en el punto"
            value={s.reading}
            onChange={(reading) => set({ reading })}
            suffix="m"
            hint="Opcional: da cota y corte/relleno"
          />
        </div>
        {(badReading(s.bs) || badReading(s.reading)) && <Notice>Lectura fuera del rango usual de una mira (0 – 5.5 m). Revisa el dato.</Notice>}
      </InputCard>

      {hi === undefined ? (
        <Waiting>Ingresa la cota del BM y la vista atrás (o la AI) para empezar.</Waiting>
      ) : target !== undefined ? (
        <ResultCard
          label="Lectura objetivo de mira"
          value={n(target)}
          unit="m"
          tone={target < 0 ? 'fail' : 'brand'}
          sub={
            target < 0
              ? 'La cota de proyecto está por encima del instrumento: no se puede leer en mira.'
              : `Cuando la mira marque ${n(target)} m, su pie está a la cota de proyecto ${n(s.design)} m.`
          }
        />
      ) : (
        <ResultCard label="Altura de instrumento" value={n(hi)} unit="m" tone="brand" sub="Ingresa la cota de proyecto para obtener la lectura objetivo." />
      )}

      {hi !== undefined && (
        <div className="grid-3 tl-kpis">
          <Kpi label="AI" value={n(hi)} unit="m" />
          <Kpi label="Cota punto" value={n(ground)} unit="m" sub={ground === undefined ? 'Falta lectura' : undefined} />
          <Kpi
            label="Corte / relleno"
            value={cf === undefined ? '—' : <span className={Math.abs(cf) <= 0.0005 ? 'c-ok' : cf > 0 ? 'c-cut' : 'c-fill'}>{ns(cf)}</span>}
            unit={cf === undefined ? undefined : 'm'}
            sub={cf === undefined ? 'Falta lectura' : cutFillLabel(cf)}
          />
        </div>
      )}

      <ToolActions copy={copy} />

      <HowTo source="Nivelación geométrica por altura de instrumento (método HI).">
        <Formula>{`AI = Cota BM + Vista atrás
Lectura objetivo = AI − Cota proyecto
Cota punto = AI − Lectura
Corte (+) / Relleno (−) = Cota punto − Cota proyecto`}</Formula>
        <p>
          Si la mira marca <b>menos</b> que la lectura objetivo, el terreno está alto (cortar); si marca <b>más</b>, está bajo (rellenar).
        </p>
      </HowTo>
    </div>
  );
}
