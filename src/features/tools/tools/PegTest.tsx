import { Kpi, NumberInput, Segmented } from '@/ui/kit';
import { pegTestEval, WSDOT_LIMIT_SEC, type PegCriterion } from '../calc/peg';
import { Formula, HowTo, InputCard, Notice, ResultCard, ToolActions, Verdict, Waiting, n, ns, useToolState } from '../ui/shared';

interface S {
  a1?: number;
  b1?: number;
  a2?: number;
  b2?: number;
  distance?: number;
  near?: number;
  criterion: PegCriterion;
}

export const pegDefaults: S = { distance: 60, near: 3, criterion: 'arc20' };
export const pegExample: S = { a1: 1.5, b1: 1.3, a2: 1.42, b2: 1.2228, distance: 60, near: 3, criterion: 'arc20' };

/** Diagrama explicativo: puesta 1 al centro, puesta 2 junto a A. */
function PegDiagram() {
  const Staff = ({ x, label, read }: { x: number; label: string; read: string }) => (
    <g>
      <rect x={x - 3} y={22} width={6} height={50} className="tl-pg-staff" />
      <text x={x} y={86} textAnchor="middle" className="tl-pg-name">
        {label}
      </text>
      <text x={x + (label === 'A' ? -8 : 8)} y={36} textAnchor={label === 'A' ? 'end' : 'start'} className="tl-pg-read">
        {read}
      </text>
    </g>
  );
  const Level = ({ x }: { x: number }) => (
    <g className="tl-pg-level">
      <rect x={x - 9} y={34} width={18} height={8} rx={2} />
      <path d={`M${x},42 L${x - 8},72 M${x},42 L${x + 8},72 M${x},42 L${x},72`} />
    </g>
  );
  const Panel = ({ y, title, lx, ra, rb }: { y: number; title: string; lx: number; ra: string; rb: string }) => (
    <g transform={`translate(0, ${y})`}>
      <text x={8} y={12} className="tl-pg-title">
        {title}
      </text>
      <line x1={10} y1={72} x2={330} y2={72} className="tl-pg-ground" />
      <line x1={40} y1={38} x2={300} y2={38} className="tl-pg-sight" />
      <Staff x={40} label="A" read={ra} />
      <Staff x={300} label="B" read={rb} />
      <Level x={lx} />
    </g>
  );
  return (
    <svg viewBox="0 0 340 196" className="tl-diagram" role="img" aria-label="Esquema de la prueba de dos estacas">
      <Panel y={0} title="1 · Instrumento al centro (L/2)" lx={170} ra="a1" rb="b1" />
      <Panel y={98} title="2 · Instrumento junto a A" lx={62} ra="a2" rb="b2" />
    </svg>
  );
}

export default function PegTest() {
  const [s, set] = useToolState<S>(pegDefaults);
  const ready = [s.a1, s.b1, s.a2, s.b2, s.distance].every((v) => v !== undefined);
  const near = s.near ?? 0;
  const badDist = s.distance !== undefined && (s.distance <= 0 || near >= s.distance);
  const r = ready && !badDist ? pegTestEval({ a1: s.a1!, b1: s.b1!, a2: s.a2!, b2: s.b2!, distance: s.distance!, nearDist: near, criterion: s.criterion }) : null;

  const critLabel = s.criterion === 'wsdot' ? '2 mm en 60 m (WSDOT, ≈ 6.9″)' : '|ángulo| ≤ 20″';
  const copy = r
    ? [
        'Prueba de dos estacas',
        `Desnivel verdadero = ${ns(r.trueDiff)} m`,
        `Lectura correcta en B = ${n(r.expectedB2)} m (leída ${n(s.b2)})`,
        `Error = ${ns(r.errorMm, 1)} mm en ${n(r.effectiveDistance, 1)} m · ${ns(r.errorMmPer30m, 2)} mm/30 m`,
        `Ángulo de colimación = ${ns(r.angleSec, 1)}″`,
        `Criterio ${critLabel}: ${r.passes ? 'CUMPLE' : 'NO CUMPLE'}`,
      ].join('\n')
    : null;

  return (
    <div className="stack-l">
      <div className="card">
        <PegDiagram />
      </div>

      <InputCard title="1 · Instrumento al centro">
        <div className="grid-2">
          <NumberInput label="Lectura en A (a1)" value={s.a1} onChange={(a1) => set({ a1 })} suffix="m" />
          <NumberInput label="Lectura en B (b1)" value={s.b1} onChange={(b1) => set({ b1 })} suffix="m" />
        </div>
      </InputCard>
      <InputCard title="2 · Instrumento junto a A">
        <div className="grid-2">
          <NumberInput label="Lectura en A (a2)" value={s.a2} onChange={(a2) => set({ a2 })} suffix="m" />
          <NumberInput label="Lectura en B (b2)" value={s.b2} onChange={(b2) => set({ b2 })} suffix="m" />
          <NumberInput label="Distancia A–B (L)" value={s.distance} onChange={(distance) => set({ distance })} suffix="m" />
          <NumberInput label="Distancia instr.–A" value={s.near} onChange={(v) => set({ near: v })} suffix="m" hint="≈ 3 m" />
        </div>
        {badDist && <Notice tone="fail">La distancia A–B debe ser mayor que la distancia del instrumento a A.</Notice>}
      </InputCard>

      <InputCard title="Criterio de aceptación">
        <Segmented
          value={s.criterion}
          onChange={(criterion) => set({ criterion })}
          options={[
            { value: 'arc20', label: '20″ (fabricantes)' },
            { value: 'wsdot', label: '2 mm / 60 m (WSDOT)' },
          ]}
        />
      </InputCard>

      {!r ? (
        <Waiting>Ingresa las cuatro lecturas y la distancia A–B.</Waiting>
      ) : (
        <>
          <ResultCard
            label="Error de colimación"
            value={ns(r.errorMmPer30m, 2)}
            unit="mm / 30 m"
            tone={r.passes ? 'ok' : 'fail'}
            extra={<Verdict ok={r.passes} />}
            sub={`${r.errorM > 0 ? 'La visual apunta hacia arriba' : r.errorM < 0 ? 'La visual apunta hacia abajo' : 'Sin error'} · criterio ${critLabel}`}
          />
          <div className="grid-2 tl-kpis">
            <Kpi label="Ángulo" value={ns(r.angleSec, 1)} unit="″" sub={`Límite ${n(r.limitSec, 1)}″`} tone={r.passes ? 'ok' : 'fail'} />
            <Kpi label="Lectura correcta B" value={n(r.expectedB2)} unit="m" sub={`Leída ${n(s.b2)} m`} />
            <Kpi label="Desnivel verdadero" value={ns(r.trueDiff)} unit="m" sub="a1 − b1" />
            <Kpi label="Error en B" value={ns(r.errorMm, 1)} unit="mm" sub={`en ${n(r.effectiveDistance, 1)} m · ${ns(r.errorMmPer60m, 2)} mm/60 m`} />
          </div>
          {!r.passes && (
            <Notice tone="fail">
              Ajusta el retículo (o la colimación electrónica) para leer {n(r.expectedB2)} m en B y repite la prueba. Mientras tanto, equilibra las distancias atrás/adelante.
            </Notice>
          )}
        </>
      )}

      <ToolActions copy={copy} />

      <HowTo source={`WSDOT Survey Manual M22-97, cap. 10 (2 mm en 60 m ≈ ${WSDOT_LIMIT_SEC.toFixed(1)}″); práctica de fabricantes Leica/Topcon (20″).`}>
        <Formula>{`Δh verdadero = a1 − b1      (al centro la colimación se cancela)
Lectura correcta en B = a2 − Δh
e = b2 − lectura correcta
d = L − distancia instr.–A
ángulo = atan(e / d) · 206 265″
e por 30 m = e · 30 / d`}</Formula>
        <p>Con el instrumento junto a A se considera despreciable el error en la visual corta a A; todo el error aparece en B.</p>
      </HowTo>
    </div>
  );
}
