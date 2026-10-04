import { Chips, Kpi, NumberInput } from '@/ui/kit';
import { curvatureRefraction, EARTH_RADIUS_M } from '@/core/leveling';
import { Formula, HowTo, InputCard, ResultCard, ToolActions, Waiting, n, useToolState } from '../ui/shared';

interface S {
  distance?: number;
  k: '0.13' | '0.14' | '0.16' | 'custom';
  kCustom?: number;
}

export const curvatureDefaults: S = { distance: 100, k: '0.13' };
export const curvatureExample: S = { distance: 300, k: '0.13' };

const TABLE = [30, 50, 100, 150, 200, 300, 500, 1000];

export default function Curvature() {
  const [s, set] = useToolState<S>(curvatureDefaults);
  const k = s.k === 'custom' ? s.kCustom : Number(s.k);
  const D = s.distance;
  const ok = D !== undefined && D >= 0 && k !== undefined && k >= 0 && k < 1;
  const total = ok ? curvatureRefraction(D!, k!) : undefined;
  const curv = ok ? (D! * D!) / (2 * EARTH_RADIUS_M) : undefined;
  const refr = ok ? (k! * D! * D!) / (2 * EARTH_RADIUS_M) : undefined;

  const copy = ok ? `Curvatura y refracción (D = ${n(D, 1)} m, k = ${k}): c = ${n(total! * 1000, 2)} mm` : null;

  return (
    <div className="stack-l">
      <InputCard title="Datos">
        <NumberInput label="Distancia de la visual" value={s.distance} onChange={(distance) => set({ distance })} suffix="m" />
        <div className="field">
          <span className="field-label">Coeficiente de refracción k</span>
          <Chips
            value={s.k}
            onChange={(v) => set({ k: v })}
            options={[
              { value: '0.13', label: '0.13 (usual)' },
              { value: '0.14', label: '0.14' },
              { value: '0.16', label: '0.16 (IGN)' },
              { value: 'custom', label: 'Otro' },
            ]}
          />
        </div>
        {s.k === 'custom' && <NumberInput label="k" value={s.kCustom} onChange={(kCustom) => set({ kCustom })} hint="Entre 0 y 1" />}
      </InputCard>

      {!ok ? (
        <Waiting>Ingresa una distancia positiva y un k entre 0 y 1.</Waiting>
      ) : (
        <>
          <ResultCard
            label="Corrección combinada c"
            value={n(total! * 1000, 2)}
            unit="mm"
            tone="brand"
            sub={`Resta ${n(total!, 4)} m a la lectura de mira (la mira se lee más alta).`}
          />
          <div className="grid-2 tl-kpis">
            <Kpi label="Curvatura" value={n(curv! * 1000, 2)} unit="mm" sub="D²/2R" />
            <Kpi label="Refracción" value={`−${n(refr! * 1000, 2)}`} unit="mm" sub="k·D²/2R" />
          </div>
          <div className="card flush">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Distancia</th>
                    <th>Curvatura</th>
                    <th>Combinada</th>
                  </tr>
                </thead>
                <tbody>
                  {TABLE.map((d) => (
                    <tr key={d} className={d === D ? 'tp' : undefined}>
                      <td>{d} m</td>
                      <td>{n(((d * d) / (2 * EARTH_RADIUS_M)) * 1000, 2)} mm</td>
                      <td>{n(curvatureRefraction(d, k!) * 1000, 2)} mm</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <ToolActions copy={copy} />

      <HowTo source="Estudio funcional §2.8; IGN Perú, NTG Levantamientos verticales 2016 (k = 0.16).">
        <Formula>{`Curvatura   c_c = D² / (2R)
Refracción  c_r = k · D² / (2R)
Combinada   c   = (1 − k) · D² / (2R)     R = 6 371 000 m
Lectura corregida = Lectura − c`}</Formula>
        <p>Con distancias atrás y adelante iguales el efecto se cancela en el desnivel.</p>
      </HowTo>
    </div>
  );
}
