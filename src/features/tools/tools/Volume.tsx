import { Plus, Trash2 } from 'lucide-react';
import { Kpi, NumberInput, Segmented } from '@/ui/kit';
import { parseStation, stationFormat } from '@/core/cogo';
import { volumeAverageEndArea, volumePrismoidal, type CrossSection } from '@/core/surface';
import { Formula, HowTo, InputCard, Notice, ResultCard, ResultPair, ToolActions, Waiting, n, nk, useToolState } from '../ui/shared';

interface Row {
  st: string;
  cut?: number;
  fill?: number;
}

interface S {
  method: 'avg' | 'prism';
  rows: Row[];
  swell?: number;
}

export const volumeDefaults: S = { method: 'avg', rows: [{ st: '0+000' }, { st: '0+020' }, { st: '0+040' }] };
export const volumeExample: S = {
  method: 'avg',
  swell: 1.25,
  rows: [
    { st: '0+000', cut: 12.4, fill: 0 },
    { st: '0+020', cut: 15.8, fill: 1.2 },
    { st: '0+040', cut: 9.6, fill: 4.5 },
    { st: '0+060', cut: 3.1, fill: 8.9 },
    { st: '0+080', cut: 0, fill: 11.7 },
  ],
};

export default function Volume() {
  const [s, set] = useToolState<S>(volumeDefaults);
  const setRow = (i: number, p: Partial<Row>) => set({ rows: s.rows.map((r, j) => (j === i ? { ...r, ...p } : r)) });

  const parsed = s.rows.map((r) => ({ st: parseStation(r.st), cut: r.cut, fill: r.fill }));
  const badSt = parsed.some((p, i) => s.rows[i].st.trim() !== '' && p.st === null);
  const secs: CrossSection[] = parsed
    .filter((p) => p.st !== null && (p.cut !== undefined || p.fill !== undefined))
    .map((p) => ({ station: p.st as number, cutArea: p.cut ?? 0, fillArea: p.fill ?? 0 }));
  const dupSt = new Set(secs.map((x) => x.station)).size !== secs.length;
  const neg = secs.some((x) => x.cutArea < 0 || x.fillArea < 0);
  const ok = secs.length >= 2 && !dupSt && !neg;
  const avg = ok ? volumeAverageEndArea(secs) : null;
  const pri = ok ? volumePrismoidal(secs) : null;
  const res = s.method === 'avg' ? avg : pri;
  const other = s.method === 'avg' ? pri : avg;
  const loose = res && s.swell !== undefined && s.swell > 0 ? res.cut * s.swell : undefined;

  const addRow = () => {
    const last = parsed.filter((p) => p.st !== null).map((p) => p.st as number);
    const prev = last.length ? Math.max(...last) : -20;
    const step = last.length >= 2 ? last[last.length - 1] - last[last.length - 2] || 20 : 20;
    set({ rows: [...s.rows, { st: stationFormat(prev + Math.abs(step), 0).replace(/\.$/, '') }] });
  };

  const copy = res
    ? [
        `Método: ${s.method === 'avg' ? 'áreas medias' : 'prismoidal'}`,
        `Corte = ${n(res.cut, 2)} m³ · Relleno = ${n(res.fill, 2)} m³ · Neto = ${n(res.net, 2)} m³`,
        loose !== undefined ? `Corte esponjado (×${s.swell}) = ${n(loose, 2)} m³` : '',
        '\nTramo\tCorte m³\tRelleno m³',
        ...res.segments.map((g) => `${stationFormat(g.from)} – ${stationFormat(g.to)}\t${n(g.cut, 2)}\t${n(g.fill, 2)}`),
      ]
        .filter((l) => l !== '')
        .join('\n')
    : null;

  return (
    <div className="stack-l">
      <Segmented
        value={s.method}
        onChange={(method) => set({ method })}
        options={[
          { value: 'avg', label: 'Áreas medias' },
          { value: 'prism', label: 'Prismoidal' },
        ]}
      />

      <InputCard title={`Secciones (${secs.length})`}>
        <div className="tl-rows">
          <div className="tl-row tl-row-head" aria-hidden="true">
            <span>Progresiva</span>
            <span>Corte m²</span>
            <span>Relleno m²</span>
            <span />
          </div>
          {s.rows.map((r, i) => (
            <div key={i} className="tl-row tl-row-sec">
              <input className="input num" value={r.st} onChange={(e) => setRow(i, { st: e.target.value })} placeholder="0+000" aria-label={`Progresiva ${i + 1}`} inputMode="decimal" />
              <NumberInput value={r.cut} onChange={(cut) => setRow(i, { cut })} placeholder="0.00" />
              <NumberInput value={r.fill} onChange={(fill) => setRow(i, { fill })} placeholder="0.00" />
              <button className="icon-btn" aria-label={`Eliminar sección ${i + 1}`} onClick={() => set({ rows: s.rows.filter((_, j) => j !== i) })}>
                <Trash2 size={18} />
              </button>
            </div>
          ))}
        </div>
        <button className="btn ghost block" onClick={addRow}>
          <Plus size={20} /> Agregar sección
        </button>
        {badSt && <Notice tone="fail">Hay progresivas no válidas (usa 0+020 o 20).</Notice>}
        {dupSt && <Notice tone="fail">Hay progresivas repetidas.</Notice>}
        {neg && <Notice tone="fail">Las áreas no pueden ser negativas.</Notice>}
        <NumberInput label="Factor de esponjamiento (opcional)" value={s.swell} onChange={(swell) => set({ swell })} hint="Volumen suelto / banco, p.ej. 1.25" />
      </InputCard>

      {!res ? (
        <Waiting>Ingresa al menos dos secciones con progresiva y áreas.</Waiting>
      ) : (
        <>
          <ResultCard label="Volúmenes" value={null} tone="brand" sub={`Neto ${n(res.net, 2)} m³ (${res.net >= 0 ? 'sobra corte' : 'falta material'})`}>
            <ResultPair
              items={[
                { label: 'Corte', value: <span className="c-cut">{nk(res.cut, 2)}</span>, unit: 'm³' },
                { label: 'Relleno', value: <span className="c-fill">{nk(res.fill, 2)}</span>, unit: 'm³' },
              ]}
            />
          </ResultCard>
          <div className="grid-2 tl-kpis">
            <Kpi label={s.method === 'avg' ? 'Prismoidal' : 'Áreas medias'} value={<span className="tl-kpi-text">{nk(other!.cut, 1)} / {nk(other!.fill, 1)}</span>} unit="m³" sub="Corte / relleno (comparación)" />
            <Kpi label="Longitud" value={n(Math.max(...secs.map((x) => x.station)) - Math.min(...secs.map((x) => x.station)), 2)} unit="m" />
            {loose !== undefined && <Kpi label="Corte esponjado" value={nk(loose, 1)} unit="m³" sub={`× ${s.swell}`} />}
          </div>
          {s.method === 'prism' && secs.length % 2 === 0 && <Notice tone="info">Número par de secciones: el último tramo se calcula por áreas medias.</Notice>}
          <div className="card flush">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Tramo</th>
                    <th>Corte m³</th>
                    <th>Relleno m³</th>
                  </tr>
                </thead>
                <tbody>
                  {res.segments.map((g, i) => (
                    <tr key={i}>
                      <td>
                        {stationFormat(g.from)} – {stationFormat(g.to)}
                      </td>
                      <td className="c-cut">{n(g.cut, 2)}</td>
                      <td className="c-fill">{n(g.fill, 2)}</td>
                    </tr>
                  ))}
                  <tr className="tp">
                    <td className="text">
                      <b>Total</b>
                    </td>
                    <td>
                      <b>{n(res.cut, 2)}</b>
                    </td>
                    <td>
                      <b>{n(res.fill, 2)}</b>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <ToolActions copy={copy} />

      <HowTo source="Estudio funcional §1.7 (metrados de movimiento de tierras).">
        <Formula>{`Áreas medias:  V = L · (A1 + A2) / 2
Prismoidal (Simpson, de 3 en 3 secciones):
  V = L · (A1 + 4·Am + A2) / 6     (Am = sección central)
Separaciones desiguales: Simpson no uniforme
Esponjamiento: V suelto = V banco · Fe`}</Formula>
      </HowTo>
    </div>
  );
}
