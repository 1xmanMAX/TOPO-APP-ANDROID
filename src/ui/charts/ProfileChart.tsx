/**
 * Perfil longitudinal reutilizable (SVG responsive, sin dependencias).
 *
 * Eje x = distancia/progresiva, eje y = cota. Dibuja la serie medida
 * (línea continua + marcadores), la cota de proyecto (línea discontinua) y
 * el área entre ambas coloreada como corte (medido > proyecto) o relleno.
 * Crosshair + tooltip al pasar el dedo / ratón.
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';

export interface ProfileDatum {
  x: number;
  /** Cota medida / calculada. */
  y?: number;
  /** Cota de proyecto. */
  design?: number;
  label?: string;
  /** Resalta el marcador (BM, punto de cambio). */
  marker?: 'bm' | 'tp' | 'point';
}

export interface ProfileChartProps {
  data: ProfileDatum[];
  height?: number;
  xFormat?: (x: number) => string;
  xTitle?: string;
  yDecimals?: number;
  seriesLabel?: string;
  designLabel?: string;
  /** Etiquetas de punto sobre los marcadores. */
  showLabels?: boolean;
  ariaLabel?: string;
}

/** Paso "bonito" (1, 2, 2.5, 5 × 10^n) para ~`target` divisiones. */
export function niceStep(range: number, target: number): number {
  if (!(range > 0) || !Number.isFinite(range)) return 1;
  const raw = range / Math.max(1, target);
  const p = 10 ** Math.floor(Math.log10(raw));
  const m = raw / p;
  const n = m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10;
  return n * p;
}

export function niceTicks(min: number, max: number, target: number): { lo: number; hi: number; ticks: number[]; step: number } {
  const step = niceStep(max - min, target);
  const lo = Math.floor(min / step + 1e-9) * step;
  const hi = Math.ceil(max / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let v = lo, i = 0; v <= hi + step * 1e-6 && i < 200; v = lo + ++i * step) ticks.push(Math.round(v * 1e9) / 1e9);
  return { lo, hi, ticks, step };
}

const decimalsFor = (step: number) => Math.max(0, Math.min(4, -Math.floor(Math.log10(step) + 1e-9)));

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function ProfileChart({
  data,
  height = 260,
  xFormat,
  xTitle = 'Distancia (m)',
  yDecimals = 3,
  seriesLabel = 'Cota',
  designLabel = 'Proyecto',
  showLabels = true,
  ariaLabel = 'Perfil longitudinal',
}: ProfileChartProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(360);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && Math.abs(w - width) > 1) setWidth(Math.round(w));
    });
    ro.observe(el);
    setWidth(Math.round(el.clientWidth || 360));
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pts = useMemo(() => [...data].filter((d) => isNum(d.x)).sort((a, b) => a.x - b.x), [data]);
  const hasDesign = pts.some((d) => isNum(d.design));
  const hasY = pts.some((d) => isNum(d.y));

  const geo = useMemo(() => {
    const m = { l: 58, r: 14, t: showLabels ? 26 : 14, b: 40 };
    const iw = Math.max(40, width - m.l - m.r);
    const ih = Math.max(40, height - m.t - m.b);
    const xs = pts.map((d) => d.x);
    const ys = pts.flatMap((d) => [d.y, d.design]).filter(isNum);
    let x0 = xs.length ? Math.min(...xs) : 0;
    let x1 = xs.length ? Math.max(...xs) : 1;
    if (x1 - x0 < 1e-9) {
      x0 -= 1;
      x1 += 1;
    }
    let y0 = ys.length ? Math.min(...ys) : 0;
    let y1 = ys.length ? Math.max(...ys) : 1;
    const minSpan = 0.05;
    if (y1 - y0 < minSpan) {
      const c = (y0 + y1) / 2;
      y0 = c - minSpan / 2;
      y1 = c + minSpan / 2;
    }
    const pad = (y1 - y0) * 0.12;
    const yt = niceTicks(y0 - pad, y1 + pad, Math.max(3, Math.round(ih / 48)));
    const xt = niceTicks(x0, x1, Math.max(2, Math.round(iw / 80)));
    // El eje x no se extiende más allá de los datos: ticks dentro del rango.
    const xTicks = xt.ticks.filter((v) => v >= x0 - 1e-9 && v <= x1 + 1e-9);
    const sx = (v: number) => m.l + ((v - x0) / (x1 - x0)) * iw;
    const sy = (v: number) => m.t + ih - ((v - yt.lo) / (yt.hi - yt.lo)) * ih;
    return { m, iw, ih, x0, x1, yt, xTicks, xStep: xt.step, sx, sy };
  }, [pts, width, height, showLabels]);

  const { m, iw, ih, yt, xTicks, xStep, sx, sy } = geo;
  const yDec = decimalsFor(yt.step);
  const xDec = decimalsFor(xStep);
  const fx = (v: number) => (xFormat ? xFormat(v) : v.toFixed(xDec));

  // Línea medida y de proyecto: une los puntos que tienen dato (la de
  // proyecto se interpola entre los puntos con cota de proyecto).
  const pathOf = (key: 'y' | 'design') =>
    pts
      .filter((p) => isNum(p[key]))
      .map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p[key] as number).toFixed(1)}`)
      .join('');

  // Áreas de corte / relleno entre pares consecutivos con ambos valores.
  const areas = useMemo(() => {
    const out: Array<{ d: string; kind: 'cut' | 'fill' }> = [];
    const poly = (a: Array<[number, number]>, kind: 'cut' | 'fill') =>
      out.push({ d: 'M' + a.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L') + 'Z', kind });
    const both = pts.filter((p) => isNum(p.y) && isNum(p.design));
    for (let i = 0; i + 1 < both.length; i++) {
      const a = both[i];
      const b = both[i + 1];
      if (!isNum(a.y) || !isNum(a.design) || !isNum(b.y) || !isNum(b.design)) continue;
      const d0 = a.y - a.design;
      const d1 = b.y - b.design;
      if (d0 * d1 >= 0) {
        const kind = d0 + d1 >= 0 ? 'cut' : 'fill';
        poly(
          [
            [sx(a.x), sy(a.y)],
            [sx(b.x), sy(b.y)],
            [sx(b.x), sy(b.design)],
            [sx(a.x), sy(a.design)],
          ],
          kind,
        );
      } else {
        const t = d0 / (d0 - d1);
        const xc = a.x + t * (b.x - a.x);
        const yc = a.y + t * (b.y - a.y);
        poly(
          [
            [sx(a.x), sy(a.y)],
            [sx(xc), sy(yc)],
            [sx(a.x), sy(a.design)],
          ],
          d0 > 0 ? 'cut' : 'fill',
        );
        poly(
          [
            [sx(xc), sy(yc)],
            [sx(b.x), sy(b.y)],
            [sx(b.x), sy(b.design)],
          ],
          d1 > 0 ? 'cut' : 'fill',
        );
      }
    }
    return out;
  }, [pts, sx, sy]);

  // Etiquetas: se omiten las que chocarían con la anterior.
  const labelIdx = useMemo(() => {
    if (!showLabels) return new Set<number>();
    const s = new Set<number>();
    let lastX = -Infinity;
    pts.forEach((p, i) => {
      if (!p.label || !isNum(p.y)) return;
      const px = sx(p.x);
      const w = Math.max(28, p.label.length * 6.4);
      const important = p.marker === 'bm';
      if (px - lastX >= w || (important && px - lastX >= w * 0.6)) {
        s.add(i);
        lastX = px;
      }
    });
    return s;
  }, [pts, sx, showLabels]);

  const onMove = (e: RPointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * width;
    let best = -1;
    let bd = Infinity;
    pts.forEach((p, i) => {
      const d = Math.abs(sx(p.x) - px);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    setHover(best >= 0 ? best : null);
  };

  if (pts.length === 0 || (!hasY && !hasDesign)) {
    return (
      <div ref={wrapRef} className="pc-empty">
        Sin datos para graficar
      </div>
    );
  }

  const hp = hover !== null ? pts[hover] : null;
  const hx = hp ? sx(hp.x) : 0;
  const diff = hp && isNum(hp.y) && isNum(hp.design) ? hp.y - hp.design : undefined;
  const tipLeft = hp ? Math.min(Math.max(hx - 80, 4), width - 164) : 0;

  return (
    <div className="pc-wrap" ref={wrapRef}>
      <svg
        className="chart pc-svg"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={ariaLabel}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(null)}
      >
        {/* rejilla y eje y */}
        {yt.ticks.map((v) => (
          <g key={`y${v}`}>
            <line className="pc-grid" x1={m.l} x2={m.l + iw} y1={sy(v)} y2={sy(v)} />
            <text x={m.l - 8} y={sy(v) + 4} textAnchor="end" className="pc-tick">
              {v.toFixed(yDec)}
            </text>
          </g>
        ))}
        {xTicks.map((v) => (
          <g key={`x${v}`}>
            <line className="pc-axis" x1={sx(v)} x2={sx(v)} y1={m.t + ih} y2={m.t + ih + 5} />
            <text x={sx(v)} y={m.t + ih + 18} textAnchor="middle" className="pc-tick">
              {fx(v)}
            </text>
          </g>
        ))}
        <line className="pc-axis" x1={m.l} x2={m.l + iw} y1={m.t + ih} y2={m.t + ih} />
        <text x={m.l + iw} y={height - 4} textAnchor="end" className="pc-title">
          {xTitle}
        </text>
        <text x={4} y={12} className="pc-title">
          Cota (m)
        </text>

        {/* corte / relleno */}
        {areas.map((a, i) => (
          <path key={i} d={a.d} className={a.kind === 'cut' ? 'pc-area-cut' : 'pc-area-fill'} />
        ))}

        {hasDesign && <path d={pathOf('design')} className="pc-design" />}
        {hasY && <path d={pathOf('y')} className="pc-line" />}

        {pts.map((p, i) =>
          isNum(p.y) ? (
            <g key={`p${i}`}>
              <circle
                cx={sx(p.x)}
                cy={sy(p.y)}
                r={p.marker === 'bm' ? 5.5 : p.marker === 'tp' ? 4.5 : 3.5}
                className={`pc-dot ${p.marker ?? 'point'}`}
              />
            </g>
          ) : null,
        )}

        {pts.map((p, i) => {
          if (!labelIdx.has(i) || !isNum(p.y)) return null;
          const half = Math.max(14, (p.label?.length ?? 0) * 3.2);
          const lx = Math.min(Math.max(sx(p.x), m.l + half + 2), m.l + iw - half);
          return (
            <text key={`l${i}`} x={lx} y={sy(p.y) - 10} textAnchor="middle" className="pc-label">
              {p.label}
            </text>
          );
        })}

        {hp && (
          <g pointerEvents="none">
            <line className="pc-cross" x1={hx} x2={hx} y1={m.t} y2={m.t + ih} />
            {isNum(hp.design) && <circle cx={hx} cy={sy(hp.design)} r={4} className="pc-hl-design" />}
            {isNum(hp.y) && <circle cx={hx} cy={sy(hp.y)} r={6} className="pc-hl" />}
          </g>
        )}
      </svg>

      {hp && (
        <div className="pc-tip" style={{ left: tipLeft }}>
          <strong>{hp.label ?? fx(hp.x)}</strong>
          <span className="faint xs">x = {fx(hp.x)}</span>
          {isNum(hp.y) && (
            <span>
              {seriesLabel}: <b className="num">{hp.y.toFixed(yDecimals)}</b>
            </span>
          )}
          {isNum(hp.design) && (
            <span>
              {designLabel}: <b className="num">{hp.design.toFixed(yDecimals)}</b>
            </span>
          )}
          {diff !== undefined && (
            <span className={Math.abs(diff) < 0.0005 ? 'c-ok' : diff > 0 ? 'c-cut' : 'c-fill'}>
              <b>{Math.abs(diff) < 0.0005 ? 'En rasante' : `${diff > 0 ? 'Cortar' : 'Rellenar'} ${Math.abs(diff).toFixed(3)}`}</b>
            </span>
          )}
        </div>
      )}

      <div className="pc-legend">
        {hasY && (
          <span>
            <i className="pc-key-line" /> {seriesLabel}
          </span>
        )}
        {hasDesign && (
          <span>
            <i className="pc-key-design" /> {designLabel}
          </span>
        )}
        {areas.some((a) => a.kind === 'cut') && (
          <span>
            <i className="pc-key-area cut" /> Corte
          </span>
        )}
        {areas.some((a) => a.kind === 'fill') && (
          <span>
            <i className="pc-key-area fill" /> Relleno
          </span>
        )}
      </div>
    </div>
  );
}

export default ProfileChart;
