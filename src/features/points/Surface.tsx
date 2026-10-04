import { useMemo, useState } from 'react';
import { AlertTriangle, CircleCheck, Droplets, FileDown, Mountain, Plus } from 'lucide-react';
import type { ScreenProps } from '@/app/feature';
import { go } from '@/app/nav';
import { useProject } from '@/app/store';
import { contours as buildContours, slopeStats, triangleAt, triangleCount, volumeBetween, type Tin } from '@/core/surface';
import { Chips, EmptyState, Kpi, NumberInput, Screen, Toggle, toast } from '@/ui/kit';
import { PlanView, type PlanTriangle } from '@/ui/charts/PlanView';
import { f, fs, thousands } from '@/ui/format';
import { autoContourInterval, planBenchmarks, planPoints, zRange } from './util';
import { useTin } from './PointsRoot';
import { exportSurfaceDxf } from './dxf';

const INTERVALS = ['auto', '0.1', '0.25', '0.5', '1', '2'] as const;
type IntervalOpt = (typeof INTERVALS)[number];

function planArea(tin: Tin): number {
  let a = 0;
  for (let t = 0; t < triangleCount(tin); t++) {
    const [p, q, r] = triangleAt(tin, t);
    a += Math.abs((q.x - p.x) * (r.y - p.y) - (r.x - p.x) * (q.y - p.y)) / 2;
  }
  return a;
}

const area = (m2: number) => (m2 >= 10000 ? `${f(m2 / 10000, 3)} ha` : `${thousands(m2, 1)} m²`);

export default function Surface(_: ScreenProps) {
  const project = useProject();
  const points = useMemo(() => project?.points ?? [], [project]);
  const tin = useTin(points);
  const [iv, setIv] = useState<IntervalOpt>('auto');
  const [fill, setFill] = useState(true);
  const [showFlat, setShowFlat] = useState(true);
  const zr = useMemo(() => zRange(points), [points]);
  const [ref, setRef] = useState<number | undefined>(() => (zr ? Math.round(zr.mean * 100) / 100 : undefined));
  const [busy, setBusy] = useState(false);

  const autoIv = tin ? autoContourInterval(tin.bbox.maxZ - tin.bbox.minZ) : 0.5;
  const interval = iv === 'auto' ? autoIv : Number(iv);

  const stats = useMemo(() => {
    if (!tin) return null;
    const ss = slopeStats(tin, 0.5);
    const a = planArea(tin);
    let flatArea = 0;
    for (const t of ss.flat) {
      const [p, q, r] = triangleAt(tin, t);
      flatArea += Math.abs((q.x - p.x) * (r.y - p.y) - (r.x - p.x) * (q.y - p.y)) / 2;
    }
    return { ss, area: a, flatArea, n: triangleCount(tin) };
  }, [tin]);

  const cont = useMemo(() => {
    if (!tin) return [];
    // Evita miles de curvas con intervalos muy finos.
    const n = (tin.bbox.maxZ - tin.bbox.minZ) / interval;
    return n > 400 ? [] : buildContours(tin, interval, 0, 5);
  }, [tin, interval]);
  const tooMany = tin ? (tin.bbox.maxZ - tin.bbox.minZ) / interval > 400 : false;

  const tris: PlanTriangle[] = useMemo(() => {
    if (!tin || !stats) return [];
    const flat = new Set(showFlat ? stats.ss.flat : []);
    const out: PlanTriangle[] = [];
    for (let t = 0; t < stats.n; t++) {
      const [a, b, c] = triangleAt(tin, t);
      out.push({ x: [a.x, b.x, c.x], y: [a.y, b.y, c.y], z: (a.z + b.z + c.z) / 3, mark: flat.has(t) });
    }
    return out;
  }, [tin, stats, showFlat]);

  const vol = useMemo(() => (tin && ref !== undefined ? volumeBetween(tin, ref) : null), [tin, ref]);

  const pp = useMemo(() => planPoints(points.filter((p) => p.z !== undefined)), [points]);
  const bms = useMemo(() => (project ? planBenchmarks(project) : []), [project]);

  if (!project) {
    return (
      <Screen title="Superficie y volúmenes" back>
        <EmptyState icon={<Mountain size={30} />} title="Sin proyecto activo" />
      </Screen>
    );
  }

  if (!tin || !stats || !zr) {
    return (
      <Screen title="Superficie y volúmenes" back>
        <EmptyState
          icon={<Mountain size={30} />}
          title="Faltan puntos con cota"
          text="Se necesitan al menos 3 puntos con cota (no alineados) para construir la superficie (TIN)."
          action={
            <button className="btn primary lg" onClick={() => go('point-edit')}>
              <Plus size={20} /> Agregar punto
            </button>
          }
        />
      </Screen>
    );
  }

  const flatPct = stats.area > 0 ? (stats.flatArea / stats.area) * 100 : 0;

  const doExport = async () => {
    setBusy(true);
    try {
      await exportSurfaceDxf(project, cont, interval);
      toast('DXF exportado con curvas de nivel');
    } catch (e) {
      toast((e as Error).message || 'No se pudo exportar', 'fail');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Superficie y volúmenes" subtitle={`${project.name} · TIN de ${zr.n} puntos`} back wide>
      <div className="stack-l">
        <div className="grid-auto pt-surf-kpis">
          <Kpi label="Triángulos" value={thousands(stats.n, 0)} />
          <Kpi label="Área en planta" value={area(stats.area)} />
          <Kpi label="Cota mínima" value={f(zr.min, 3)} unit="m" sub={`Media ${f(zr.mean, 3)} m`} />
          <Kpi label="Cota máxima" value={f(zr.max, 3)} unit="m" sub={`Desnivel ${f(zr.max - zr.min, 2)} m`} />
          <Kpi label="Pendiente media" value={f(stats.ss.areaWeightedMean, 1)} unit="%" sub="Ponderada por área" />
          <Kpi
            label="Pendiente máxima"
            value={stats.ss.max >= 100 ? thousands(stats.ss.max, 0) : f(stats.ss.max, 1)}
            unit="%"
            tone={stats.ss.max > 50 ? 'warn' : undefined}
            sub={`Mínima ${f(stats.ss.min, 2)} %`}
          />
        </div>

        {stats.ss.flat.length > 0 ? (
          <div className="pt-alert warn" role="alert">
            <Droplets size={22} />
            <div>
              <strong>
                {stats.ss.flat.length} triángulo{stats.ss.flat.length === 1 ? '' : 's'} con pendiente &lt; 0.5 %
              </strong>
              <div className="small">
                {f(stats.flatArea, 1)} m² ({f(flatPct, 1)} % del área): posible encharcamiento. Revisa el drenaje en las zonas
                marcadas en la planta.
              </div>
            </div>
          </div>
        ) : (
          <div className="pt-alert ok" role="status">
            <CircleCheck size={22} />
            <div>
              <strong>Sin zonas planas</strong>
              <div className="small">Todos los triángulos tienen pendiente ≥ 0.5 % (drenaje superficial favorable).</div>
            </div>
          </div>
        )}

        <div className="md-grid-2 pt-surf-grid">
          <div className="stack">
            <div className="row-between wrap" style={{ gap: 8 }}>
              <span className="section-title" style={{ margin: 0 }}>
                Curvas de nivel
              </span>
              <span className="xs muted">{cont.length} niveles · maestras cada {f(interval * 5, 2)} m</span>
            </div>
            <Chips
              value={iv}
              onChange={setIv}
              options={INTERVALS.map((v) => ({ value: v, label: v === 'auto' ? `Auto (${autoIv} m)` : `${v} m` }))}
            />
            {tooMany && <span className="small c-warn">Intervalo demasiado fino para este desnivel: elige uno mayor.</span>}
            <PlanView
              points={pp}
              benchmarks={bms}
              contours={cont}
              triangles={tris}
              fillTriangles={fill}
              triangleEdges={!fill || stats.n < 3000}
              height="max(340px, calc(100dvh - 520px))"
              labels={false}
            />
            <div className="grid-2">
              <Toggle checked={fill} onChange={setFill} label="Colorear por cota" />
              <Toggle checked={showFlat} onChange={setShowFlat} label={<span className="row" style={{ gap: 6 }}><span className="pt-flat-sw" /> Zonas &lt; 0.5 %</span>} />
            </div>
          </div>

          <div className="stack">
            <div className="card stack">
              <span className="section-title" style={{ margin: 0 }}>
                Volumen contra cota de referencia
              </span>
              <p className="small muted">Plano horizontal. Corte = terreno por encima de la cota; relleno = por debajo.</p>
              <NumberInput label="Cota de referencia" value={ref} onChange={setRef} suffix="m" />
              <div className="chips">
                {[
                  { l: 'Mín', v: zr.min },
                  { l: 'Media', v: zr.mean },
                  { l: 'Máx', v: zr.max },
                ].map((o) => (
                  <button key={o.l} className="chip" onClick={() => setRef(Math.round(o.v * 1000) / 1000)}>
                    {o.l} {f(o.v, 2)}
                  </button>
                ))}
              </div>
              {vol ? (
                <div className="pt-vol">
                  <div className="pt-vol-cell cut">
                    <span>Corte</span>
                    <strong className="num">{thousands(vol.cut, 2)}</strong>
                    <small>m³</small>
                  </div>
                  <div className="pt-vol-cell fill">
                    <span>Relleno</span>
                    <strong className="num">{thousands(vol.fill, 2)}</strong>
                    <small>m³</small>
                  </div>
                  <div className="pt-vol-cell net">
                    <span>Neto</span>
                    <strong className="num">{fs(vol.net, 2)}</strong>
                    <small>m³ {vol.net > 0 ? '(sobra)' : vol.net < 0 ? '(falta)' : ''}</small>
                  </div>
                </div>
              ) : (
                <p className="small muted">Ingresa una cota de referencia.</p>
              )}
              {vol && <span className="xs faint">Método: prismas triangulares exactos sobre {area(vol.area)}.</span>}
            </div>

            <div className="card stack">
              <span className="section-title" style={{ margin: 0 }}>
                Exportar
              </span>
              <button className="btn primary lg block" onClick={doExport} disabled={busy}>
                <FileDown size={20} /> {busy ? 'Exportando…' : 'Exportar DXF con curvas'}
              </button>
              <span className="xs muted">
                Puntos, BMs y curvas cada {interval} m (maestras cada {f(interval * 5, 2)} m), listo para AutoCAD / Civil 3D.
              </span>
            </div>

            {stats.ss.max > 50 && (
              <div className="pt-alert warn">
                <AlertTriangle size={20} />
                <span className="small">
                  Hay triángulos con pendiente &gt; 50 %: pueden ser puntos con cota errónea o triángulos largos en el borde.
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </Screen>
  );
}
