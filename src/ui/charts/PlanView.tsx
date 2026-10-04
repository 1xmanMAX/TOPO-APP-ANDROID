/**
 * Vista en planta (SVG) reutilizable: puntos coloreados por cota, BMs como
 * triángulos, curvas de nivel, TIN, líneas auxiliares, barra de escala y
 * flecha Norte. Pan con arrastre, zoom con rueda / pellizco / botones.
 *
 * Rendimiento: la geometría se dibuja una sola vez en coordenadas locales
 * (origen en el centro de los datos, Y invertida) dentro de un <g> con
 * transformación; el pan/zoom solo cambia esa transformación. Los puntos se
 * agrupan por color en pocos <path> (trazos de longitud cero con extremo
 * redondo y `vector-effect: non-scaling-stroke`), así 2000+ puntos cuestan
 * una docena de nodos SVG.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Maximize, Minus, Plus } from 'lucide-react';

export interface PlanPoint {
  id: string;
  name: string;
  x: number;
  y: number;
  z?: number;
  code?: string;
}

export interface PlanContour {
  elevation: number;
  master: boolean;
  lines: [number, number][][];
}

export interface PlanTriangle {
  x: [number, number, number];
  y: [number, number, number];
  /** Cota media (para colorear). */
  z?: number;
  /** Resaltar (p. ej. zona plana). */
  mark?: boolean;
}

export interface PlanLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface PlanViewProps {
  points: PlanPoint[];
  /** BMs adicionales (se dibujan como triángulos). */
  benchmarks?: PlanPoint[];
  contours?: PlanContour[];
  triangles?: PlanTriangle[];
  /** Rellenar los triángulos con la rampa de cota. */
  fillTriangles?: boolean;
  /** Dibujar aristas de triángulos. Por defecto true si hay triángulos. */
  triangleEdges?: boolean;
  lines?: PlanLine[];
  onPointTap?: (id: string | null) => void;
  highlightIds?: string[];
  height: number | string;
  /** Mostrar etiquetas (nombre / cota) cuando el zoom lo permite. */
  labels?: boolean;
  /** Superposiciones (tarjetas flotantes) dentro del lienzo. */
  children?: ReactNode;
  ariaLabel?: string;
}

/* ------------------------------------------------------------------ */
/* Rampa de color (viridis: secuencial, perceptualmente uniforme y     */
/* legible con daltonismo).                                            */
/* ------------------------------------------------------------------ */

const VIRIDIS = ['#440154', '#472d7b', '#3b528b', '#2c728e', '#21918c', '#28ae80', '#5ec962', '#addc30', '#fde725'];

function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const RAMP_RGB = VIRIDIS.map(hexToRgb);

/** Color para t ∈ [0,1]. */
export function rampColor(t: number): string {
  const u = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0)) * (RAMP_RGB.length - 1);
  const i = Math.min(RAMP_RGB.length - 2, Math.floor(u));
  const f = u - i;
  const a = RAMP_RGB[i];
  const b = RAMP_RGB[i + 1];
  const c = (k: number) => Math.round(a[k] + (b[k] - a[k]) * f);
  return `rgb(${c(0)},${c(1)},${c(2)})`;
}

const BUCKETS = 14;
const NO_Z = -1;

const isBM = (p: PlanPoint) => /^(BM|PR)/i.test(p.code ?? '');

function niceStep(v: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / p;
  return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * p;
}

function fmtLen(m: number): string {
  if (m >= 1000) return `${m / 1000} km`;
  if (m >= 1) return `${m} m`;
  return `${Math.round(m * 100)} cm`;
}

interface View {
  s: number;
  tx: number;
  ty: number;
}

export function PlanView({
  points,
  benchmarks = [],
  contours,
  triangles,
  fillTriangles,
  triangleEdges,
  lines,
  onPointTap,
  highlightIds,
  height,
  labels = true,
  children,
  ariaLabel = 'Vista en planta',
}: PlanViewProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View>({ s: 1, tx: 0, ty: 0 });
  const viewRef = useRef(view);
  const raf = useRef(0);

  /* ----------------------------- Datos base ----------------------------- */

  const data = useMemo(() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    const ext = (x: number, y: number) => {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    };
    for (const p of points) ext(p.x, p.y);
    for (const p of benchmarks) ext(p.x, p.y);
    if (!Number.isFinite(minX)) {
      for (const c of contours ?? []) for (const l of c.lines) for (const [x, y] of l) ext(x, y);
      for (const t of triangles ?? []) for (let k = 0; k < 3; k++) ext(t.x[k], t.y[k]);
    }
    for (const p of [...points, ...benchmarks]) {
      if (typeof p.z === 'number' && Number.isFinite(p.z)) {
        if (p.z < minZ) minZ = p.z;
        if (p.z > maxZ) maxZ = p.z;
      }
    }
    for (const t of triangles ?? []) {
      if (typeof t.z === 'number') {
        if (t.z < minZ) minZ = t.z;
        if (t.z > maxZ) maxZ = t.z;
      }
    }
    const has = Number.isFinite(minX);
    const ox = has ? (minX + maxX) / 2 : 0;
    const oy = has ? (minY + maxY) / 2 : 0;
    const hasZ = Number.isFinite(minZ);
    return {
      has,
      ox,
      oy,
      // Extensión local (m)
      halfW: has ? Math.max((maxX - minX) / 2, 5) : 50,
      halfH: has ? Math.max((maxY - minY) / 2, 5) : 50,
      zMin: hasZ ? minZ : 0,
      zMax: hasZ ? maxZ : 0,
      hasZ,
      key: has ? `${minX.toFixed(1)}|${minY.toFixed(1)}|${maxX.toFixed(1)}|${maxY.toFixed(1)}` : 'none',
    };
  }, [points, benchmarks, contours, triangles]);

  const { ox, oy, zMin, zMax } = data;
  const zSpan = zMax - zMin || 1;
  const tOf = useCallback((z: number) => (z - zMin) / zSpan, [zMin, zSpan]);
  const lx = useCallback((x: number) => x - ox, [ox]);
  const ly = useCallback((y: number) => oy - y, [oy]);

  /* ----------------------- Capa en coordenadas locales -------------------- */

  const worldLayer = useMemo(() => {
    const els: ReactNode[] = [];
    const r = (v: number) => v.toFixed(3);

    // Triángulos rellenos por cota
    if (triangles && triangles.length) {
      if (fillTriangles) {
        const buckets: string[][] = Array.from({ length: BUCKETS }, () => []);
        for (const t of triangles) {
          if (typeof t.z !== 'number') continue;
          const b = Math.min(BUCKETS - 1, Math.floor(tOf(t.z) * BUCKETS));
          buckets[b].push(
            `M${r(lx(t.x[0]))} ${r(ly(t.y[0]))}L${r(lx(t.x[1]))} ${r(ly(t.y[1]))}L${r(lx(t.x[2]))} ${r(ly(t.y[2]))}Z`,
          );
        }
        buckets.forEach((d, i) => {
          if (d.length) els.push(<path key={`tf${i}`} className="pv-tfill" d={d.join('')} fill={rampColor((i + 0.5) / BUCKETS)} />);
        });
      }
      const marked = triangles.filter((t) => t.mark);
      if (marked.length) {
        const d = marked
          .map((t) => `M${r(lx(t.x[0]))} ${r(ly(t.y[0]))}L${r(lx(t.x[1]))} ${r(ly(t.y[1]))}L${r(lx(t.x[2]))} ${r(ly(t.y[2]))}Z`)
          .join('');
        els.push(<path key="tmark" className="pv-tmark" d={d} vectorEffect="non-scaling-stroke" />);
      }
      if (triangleEdges !== false) {
        const d = triangles
          .map((t) => `M${r(lx(t.x[0]))} ${r(ly(t.y[0]))}L${r(lx(t.x[1]))} ${r(ly(t.y[1]))}L${r(lx(t.x[2]))} ${r(ly(t.y[2]))}Z`)
          .join('');
        els.push(<path key="tedge" className="pv-tedge" d={d} vectorEffect="non-scaling-stroke" />);
      }
    }

    // Curvas de nivel
    if (contours && contours.length) {
      const minor: string[] = [];
      const master: string[] = [];
      for (const c of contours) {
        const target = c.master ? master : minor;
        for (const l of c.lines) {
          if (l.length < 2) continue;
          target.push('M' + l.map(([x, y]) => `${r(lx(x))} ${r(ly(y))}`).join('L'));
        }
      }
      if (minor.length) els.push(<path key="cmin" className="pv-contour" d={minor.join('')} vectorEffect="non-scaling-stroke" />);
      if (master.length)
        els.push(<path key="cmas" className="pv-contour master" d={master.join('')} vectorEffect="non-scaling-stroke" />);
    }

    // Puntos (sin BMs) agrupados por color
    const halo: string[] = [];
    const buckets = new Map<number, string[]>();
    for (const p of points) {
      if (isBM(p)) continue;
      const seg = `M${r(lx(p.x))} ${r(ly(p.y))}h0`;
      halo.push(seg);
      const b =
        typeof p.z === 'number' && Number.isFinite(p.z) && data.hasZ
          ? Math.min(BUCKETS - 1, Math.floor(tOf(p.z) * BUCKETS))
          : NO_Z;
      const arr = buckets.get(b);
      if (arr) arr.push(seg);
      else buckets.set(b, [seg]);
    }
    if (halo.length) els.push(<path key="halo" className="pv-halo" d={halo.join('')} vectorEffect="non-scaling-stroke" />);
    for (const [b, segs] of buckets) {
      els.push(
        <path
          key={`p${b}`}
          className={b === NO_Z ? 'pv-dot noz' : 'pv-dot'}
          d={segs.join('')}
          stroke={b === NO_Z ? undefined : rampColor((b + 0.5) / BUCKETS)}
          vectorEffect="non-scaling-stroke"
        />,
      );
    }
    return els;
  }, [points, contours, triangles, fillTriangles, triangleEdges, lx, ly, tOf, data.hasZ]);

  /* ------------------------------ Encuadre ------------------------------ */

  const fitView = useCallback((): View => {
    const { w, h } = size;
    if (!w || !h) return viewRef.current;
    // Márgenes: botones a la derecha, norte arriba, escala/leyenda abajo.
    const padL = 28, padR = 72, padT = 30, padB = 56;
    const s = Math.min((w - padL - padR) / (2 * data.halfW), (h - padT - padB) / (2 * data.halfH));
    return { s, tx: padL + (w - padL - padR) / 2, ty: padT + (h - padT - padB) / 2 };
  }, [size, data.halfW, data.halfH]);

  const applyView = useCallback((v: View) => {
    viewRef.current = v;
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      setView(viewRef.current);
    });
  }, []);

  const fittedKey = useRef<string>('');
  const interacted = useRef(false);
  useEffect(() => {
    if (!size.w || !size.h) return;
    const k = data.key;
    if (fittedKey.current !== k || !interacted.current) {
      fittedKey.current = k;
      interacted.current = false;
      const v = fitView();
      viewRef.current = v;
      setView(v);
    }
  }, [size, data.key, fitView]);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  /* ------------------------------ Tamaño ------------------------------ */

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize((o) => (Math.round(r.width) === o.w && Math.round(r.height) === o.h ? o : { w: Math.round(r.width), h: Math.round(r.height) }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ------------------------------ Zoom/pan ------------------------------ */

  const minS = useMemo(() => fitView().s / 20, [fitView]);
  const maxS = 400; // px por metro (≈ 2.5 mm por píxel)

  const zoomAt = useCallback(
    (px: number, py: number, k: number) => {
      const v = viewRef.current;
      const s = Math.min(maxS, Math.max(minS, v.s * k));
      const kk = s / v.s;
      interacted.current = true;
      applyView({ s, tx: px - (px - v.tx) * kk, ty: py - (py - v.ty) * kk });
    },
    [applyView, minS],
  );

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-dy * 0.0015));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ moved: 0, t0: 0, multi: false, sx: 0, sy: 0 });

  const local = (e: React.PointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 1) gesture.current = { moved: 0, t0: performance.now(), multi: false, sx: p.x, sy: p.y };
    else gesture.current.multi = true;
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const p = local(e);
    const ps = pointers.current;
    if (ps.size === 1) {
      const v = viewRef.current;
      gesture.current.moved = Math.max(gesture.current.moved, Math.hypot(p.x - gesture.current.sx, p.y - gesture.current.sy));
      if (gesture.current.moved > 4) {
        interacted.current = true;
        applyView({ s: v.s, tx: v.tx + p.x - prev.x, ty: v.ty + p.y - prev.y });
      }
      ps.set(e.pointerId, p);
    } else if (ps.size >= 2) {
      const others = [...ps.entries()].filter(([id]) => id !== e.pointerId);
      const o = others[0][1];
      const d0 = Math.hypot(prev.x - o.x, prev.y - o.y);
      const d1 = Math.hypot(p.x - o.x, p.y - o.y);
      const m0 = { x: (prev.x + o.x) / 2, y: (prev.y + o.y) / 2 };
      const m1 = { x: (p.x + o.x) / 2, y: (p.y + o.y) / 2 };
      const v = viewRef.current;
      const k = d0 > 0 ? d1 / d0 : 1;
      const s = Math.min(maxS, Math.max(minS, v.s * k));
      const kk = s / v.s;
      interacted.current = true;
      applyView({ s, tx: m1.x - (m0.x - v.tx) * kk, ty: m1.y - (m0.y - v.ty) * kk });
      ps.set(e.pointerId, p);
      gesture.current.moved = 99;
    }
  };

  const hitTest = (sx: number, sy: number): string | null => {
    const v = viewRef.current;
    let best: string | null = null;
    let bd = 22 * 22;
    const test = (p: PlanPoint) => {
      const dx = (p.x - ox) * v.s + v.tx - sx;
      const dy = (oy - p.y) * v.s + v.ty - sy;
      const d = dx * dx + dy * dy;
      if (d < bd) {
        bd = d;
        best = p.id;
      }
    };
    for (const p of points) test(p);
    for (const p of benchmarks) test(p);
    return best;
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const had = pointers.current.get(e.pointerId);
    pointers.current.delete(e.pointerId);
    if (!had) return;
    const g = gesture.current;
    if (pointers.current.size === 0 && !g.multi && g.moved <= 6 && performance.now() - g.t0 < 600 && onPointTap) {
      const p = local(e);
      onPointTap(hitTest(p.x, p.y));
    }
  };

  const onPointerCancel = (e: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
  };

  /* ------------------------- Capa en pantalla ------------------------- */

  const { s, tx, ty } = view;
  const sx = (x: number) => (x - ox) * s + tx;
  const sy = (y: number) => (oy - y) * s + ty;
  const W = size.w;
  const H = size.h;
  const inView = (X: number, Y: number, m = 20) => X > -m && X < W + m && Y > -m && Y < H + m;

  const bms = useMemo(() => [...points.filter(isBM), ...benchmarks], [points, benchmarks]);
  const hl = useMemo(() => new Set(highlightIds ?? []), [highlightIds]);

  const screenLayer: ReactNode[] = [];

  // Etiquetas de curvas maestras
  if (contours && contours.length && W) {
    const occ = new Set<string>();
    let count = 0;
    for (const c of contours) {
      if (!c.master && contours.length > 12) continue;
      for (const l of c.lines) {
        if (l.length < 2 || count > 60) continue;
        const [x, y] = l[Math.floor(l.length / 2)];
        const X = sx(x);
        const Y = sy(y);
        if (!inView(X, Y, -10)) continue;
        const key = `${Math.floor(X / 90)}:${Math.floor(Y / 40)}`;
        if (occ.has(key)) continue;
        occ.add(key);
        count++;
        screenLayer.push(
          <text key={`cl${c.elevation}:${count}`} x={X} y={Y} className="pv-clabel" textAnchor="middle" dominantBaseline="middle">
            {Number(c.elevation.toFixed(2))}
          </text>,
        );
      }
    }
  }

  // Líneas auxiliares (medición)
  for (const [i, l] of (lines ?? []).entries()) {
    screenLayer.push(<line key={`ln${i}`} className="pv-line" x1={sx(l.x1)} y1={sy(l.y1)} x2={sx(l.x2)} y2={sy(l.y2)} />);
  }

  // BMs como triángulos
  for (const p of bms) {
    const X = sx(p.x);
    const Y = sy(p.y);
    if (!inView(X, Y)) continue;
    const fill = typeof p.z === 'number' && data.hasZ ? rampColor(tOf(p.z)) : undefined;
    screenLayer.push(
      <path key={`bm${p.id}`} className="pv-bm" d={`M${X} ${Y - 9}L${X + 8} ${Y + 6}L${X - 8} ${Y + 6}Z`} style={fill ? { fill } : undefined} />,
    );
  }

  // Resaltados
  if (hl.size) {
    for (const p of [...points, ...benchmarks]) {
      if (!hl.has(p.id)) continue;
      const X = sx(p.x);
      const Y = sy(p.y);
      if (!inView(X, Y)) continue;
      screenLayer.push(<circle key={`hl${p.id}`} className="pv-hl" cx={X} cy={Y} r={11} />);
    }
  }

  // Etiquetas de puntos (aparecen al acercarse; se descartan las que se solapan)
  if (labels && W) {
    const vis: PlanPoint[] = [];
    for (const p of bms) if (inView(sx(p.x), sy(p.y), 0)) vis.push(p);
    for (const p of points) {
      if (isBM(p)) continue;
      if (inView(sx(p.x), sy(p.y), 0)) {
        vis.push(p);
        if (vis.length > 400) break;
      }
    }
    // Densidad: área de pantalla por punto visible ≥ ~2 etiquetas.
    const density = (W * H) / Math.max(1, vis.length);
    if (vis.length <= 400 && density > 1500) {
      const occ = new Set<string>();
      const CW = 64;
      const CH = 30;
      // Primero los resaltados y BMs
      vis.sort((a, b) => Number(hl.has(b.id)) - Number(hl.has(a.id)));
      for (const p of vis) {
        const X = sx(p.x);
        const Y = sy(p.y);
        const ci = Math.floor((X + 8) / CW);
        const cj = Math.floor((Y - 4) / CH);
        const keys = [`${ci}:${cj}`, `${ci + 1}:${cj}`];
        if (!hl.has(p.id) && keys.some((k) => occ.has(k))) continue;
        keys.forEach((k) => occ.add(k));
        const showZ = typeof p.z === 'number' && density > 3500;
        screenLayer.push(
          <text key={`lb${p.id}`} x={X + 9} y={Y - 4} className="pv-label">
            <tspan className="pv-label-name">{p.name}</tspan>
            {showZ && (
              <tspan x={X + 9} dy={12} className="pv-label-z">
                {(p.z as number).toFixed(3)}
              </tspan>
            )}
          </text>,
        );
      }
    }
  }

  // Barra de escala
  const scaleM = W ? niceStep((W * 0.28) / s) : 0;
  const scalePx = scaleM * s;

  const gradId = useMemo(() => `pvg${Math.random().toString(36).slice(2, 8)}`, []);

  return (
    <div className="pv" ref={wrapRef} style={{ height }}>
      <svg
        ref={svgRef}
        className="pv-svg"
        width={W || undefined}
        height={H || undefined}
        role="img"
        aria-label={ariaLabel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <defs>
          <linearGradient id={gradId} x1="0" x2="1" y1="0" y2="0">
            {VIRIDIS.map((c, i) => (
              <stop key={c} offset={i / (VIRIDIS.length - 1)} stopColor={c} />
            ))}
          </linearGradient>
        </defs>
        <g transform={`translate(${tx} ${ty}) scale(${s})`}>{worldLayer}</g>
        <g>{screenLayer}</g>

        {/* Norte */}
        <g transform="translate(30 32)" className="pv-north" aria-label="Norte">
          <circle r={20} className="pv-north-bg" />
          <path d="M0 -14 L6 6 L0 2 L-6 6 Z" className="pv-north-arrow" />
          <text y={17} textAnchor="middle" className="pv-north-n">
            N
          </text>
        </g>

        {/* Escala */}
        {W > 0 && (
          <g transform={`translate(14 ${H - 18})`} className="pv-scale">
            <rect x={-6} y={-22} width={scalePx + 12} height={30} rx={8} className="pv-chip-bg" />
            <path d={`M0 -6V0H${scalePx}V-6`} className="pv-scale-line" />
            <text x={scalePx / 2} y={-9} textAnchor="middle" className="pv-scale-text">
              {fmtLen(scaleM)}
            </text>
          </g>
        )}

        {/* Leyenda de cotas */}
        {W > 0 && data.hasZ && zMax > zMin && (
          <g transform={`translate(${Math.min(W - 216, 64)} 18)`} className="pv-legend">
            <rect x={-8} y={-6} width={146} height={40} rx={8} className="pv-chip-bg" />
            <rect x={0} y={0} width={130} height={9} rx={4} fill={`url(#${gradId})`} />
            <text x={0} y={25} className="pv-legend-text">
              {zMin.toFixed(2)}
            </text>
            <text x={130} y={25} textAnchor="end" className="pv-legend-text">
              {zMax.toFixed(2)} m
            </text>
          </g>
        )}
      </svg>

      <div className="pv-tools">
        <button className="pv-btn" aria-label="Acercar" onClick={() => zoomAt(W / 2, H / 2, 1.6)}>
          <Plus size={20} />
        </button>
        <button className="pv-btn" aria-label="Alejar" onClick={() => zoomAt(W / 2, H / 2, 1 / 1.6)}>
          <Minus size={20} />
        </button>
        <button
          className="pv-btn"
          aria-label="Encuadrar"
          title="Encuadrar"
          onClick={() => {
            interacted.current = false;
            applyView(fitView());
          }}
        >
          <Maximize size={18} />
        </button>
      </div>
      {children}
    </div>
  );
}

export default PlanView;
