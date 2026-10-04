import { Kpi, NumberInput } from '@/ui/kit';
import { allSlopes, slopeToRatio, type SlopeUnit } from '../calc/slope';
import { Formula, HowTo, InputCard, Notice, ResultCard, ToolActions, Waiting, dms, n, useToolState } from '../ui/shared';

interface S {
  src: SlopeUnit | 'dzdh';
  val?: number;
  dz?: number;
  dh?: number;
}

export const slopeDefaults: S = { src: 'percent' };
export const slopeExample: S = { src: 'dzdh', dz: 1.5, dh: 60 };

const round = (v: number, dec: number) => (Number.isFinite(v) ? Math.round(v * 10 ** dec) / 10 ** dec : undefined);

function SlopeTriangle({ r }: { r: number }) {
  const W = 300;
  const H = 120;
  const a = Math.atan(Math.abs(r));
  // Exagera visualmente pendientes pequeñas para que se vean.
  const disp = Math.max(Math.min(a, 1.2), 0.03);
  let w = W - 40;
  let h = Math.tan(disp) * w;
  if (h > H - 30) {
    h = H - 30;
    w = h / Math.tan(disp);
  }
  const x0 = 20;
  const y0 = H - 14;
  const up = r >= 0;
  const p1 = up ? [x0, y0] : [x0, y0 - h];
  const p2 = up ? [x0 + w, y0 - h] : [x0 + w, y0];
  return (
    <svg viewBox={`0 ${y0 - h - 12} ${W} ${h + 28}`} className="tl-diagram tl-sl-svg" role="img" aria-label="Esquema de la pendiente">
      <polygon points={`${x0},${y0} ${x0 + w},${y0} ${up ? `${x0 + w},${y0 - h}` : `${x0},${y0 - h}`}`} className="tl-sl-fill" />
      <line x1={p1[0]} y1={p1[1]} x2={p2[0]} y2={p2[1]} className="tl-sl-line" />
      <text x={x0 + w / 2} y={H - 1} textAnchor="middle" className="tl-sl-txt">
        H
      </text>
      <text x={up ? x0 + w + 6 : x0 - 6} y={y0 - h / 2 + 4} textAnchor={up ? 'start' : 'end'} className="tl-sl-txt">
        V
      </text>
    </svg>
  );
}

export default function SlopeConv() {
  const [s, set] = useToolState<S>(slopeDefaults);
  let r: number | undefined;
  let error: string | undefined;
  if (s.src === 'dzdh') {
    if (s.dz !== undefined && s.dh !== undefined) {
      if (s.dh <= 0) error = 'La distancia horizontal debe ser positiva.';
      else r = s.dz / s.dh;
    }
  } else if (s.val !== undefined) {
    const v = slopeToRatio(s.src, s.val);
    if (Number.isNaN(v)) error = s.src === 'degrees' ? 'El ángulo debe estar entre −90° y 90°.' : 'n debe ser distinto de 0.';
    else if ((s.src === 'ratio' || s.src === 'hv') && s.val < 0) error = 'n debe ser positivo.';
    else r = v;
  }
  const all = r !== undefined ? allSlopes(r) : undefined;
  const field = (u: SlopeUnit, dec: number): number | undefined => {
    if (s.src === u) return s.val;
    if (!all) return undefined;
    return round(all[u], dec);
  };
  const setSrc = (u: SlopeUnit) => (val: number | undefined) => set({ src: u, val });

  const copy = all
    ? `${n(all.percent, 3)} % = ${n(all.permil, 2)} ‰ = ${n(all.degrees, 4)}° (${dms(all.degrees, 0)}) = 1:${Number.isFinite(all.ratio) ? n(all.ratio, 2) : '∞'} (H:V ${Number.isFinite(all.hv) ? n(all.hv, 2) : '∞'}:1)`
    : null;

  return (
    <div className="stack-l">
      <InputCard title="Edita cualquiera y se actualizan las demás">
        <div className="grid-2">
          <NumberInput label="Porcentaje" value={field('percent', 4)} onChange={setSrc('percent')} suffix="%" />
          <NumberInput label="Por mil" value={field('permil', 3)} onChange={setSrc('permil')} suffix="‰" />
          <NumberInput label="Ángulo" value={field('degrees', 5)} onChange={setSrc('degrees')} suffix="°" />
          <NumberInput label="Relación 1 : n (V:H)" value={field('ratio', 3)} onChange={setSrc('ratio')} hint="n horizontal por 1 vertical" />
        </div>
        <NumberInput label="Talud H : V (z : 1)" value={field('hv', 3)} onChange={setSrc('hv')} hint="Planos de corte/relleno, p.ej. 1.5 : 1" />
      </InputCard>
      <InputCard title="Desde desnivel y distancia">
        <div className="grid-2">
          <NumberInput label="Desnivel ΔV" value={s.src === 'dzdh' ? s.dz : undefined} onChange={(dz) => set({ src: 'dzdh', dz, dh: s.src === 'dzdh' ? s.dh : undefined })} suffix="m" />
          <NumberInput label="Distancia horizontal" value={s.src === 'dzdh' ? s.dh : undefined} onChange={(dh) => set({ src: 'dzdh', dh, dz: s.src === 'dzdh' ? s.dz : undefined })} suffix="m" />
        </div>
      </InputCard>

      {error ? (
        <Notice tone="fail">{error}</Notice>
      ) : !all || r === undefined ? (
        <Waiting>Escribe un valor en cualquier campo.</Waiting>
      ) : (
        <>
          <ResultCard label="Pendiente" value={n(all.percent, 3)} unit="%" tone="brand" sub={`${r > 0 ? 'Sube' : r < 0 ? 'Baja' : 'Horizontal'} · ${n(r, 5)} m/m`}>
            <SlopeTriangle r={r} />
          </ResultCard>
          <div className="grid-2 tl-kpis">
            <Kpi label="Por mil" value={n(all.permil, 2)} unit="‰" />
            <Kpi label="Ángulo" value={dms(all.degrees, 0)} sub={`${n(all.degrees, 4)}°`} />
            <Kpi label="Relación V:H" value={Number.isFinite(all.ratio) ? `1:${n(all.ratio, 2)}` : '1:∞'} />
            <Kpi label="Talud H:V" value={Number.isFinite(all.hv) ? `${n(all.hv, 2)}:1` : '∞:1'} />
          </div>
          {s.src === 'dzdh' && s.dz !== undefined && s.dh !== undefined && (
            <p className="small muted mono">Distancia inclinada = {n(Math.hypot(s.dz, s.dh))} m</p>
          )}
        </>
      )}

      <ToolActions copy={copy} />

      <HowTo source="Estudio funcional §3.8. Taludes en planos peruanos: H:V; tuberías: ‰; vías: %.">
        <Formula>{`p% = 100 · ΔV / ΔH      p‰ = 1000 · ΔV / ΔH
θ  = atan(ΔV / ΔH)      p% = 100 · tan θ
1 : n  →  n = ΔH / ΔV = 100 / p%
H : V  →  z = ΔH / ΔV   (z : 1)
Ejemplo: 1.5 m en 60 m = 2.50 % = 25 ‰ = 1°25′56″ = 1:40`}</Formula>
      </HowTo>
    </div>
  );
}
