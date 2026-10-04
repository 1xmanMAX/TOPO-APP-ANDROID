/**
 * Gráficos dibujados con primitivas de jsPDF (sin canvas ni DOM).
 */
import type { ProfilePoint } from '@/core/leveling';
import { C, CONTENT_W, PAGE, type ReportDoc, type RGB } from './base';
import { isNum, nf } from '../format';

/** Escala "bonita" para ejes: paso 1/2/5·10^n. */
export function niceTicks(min: number, max: number, target = 6): number[] {
  if (!(max > min)) {
    const d = Math.abs(min) * 0.01 || 1;
    min -= d;
    max += d;
  }
  const raw = (max - min) / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => s >= raw) ?? 10 * mag;
  const start = Math.floor(min / step) * step;
  const out: number[] = [];
  for (let v = start; v <= max + step * 1e-6; v += step) out.push(Math.round(v / step) * step);
  if (out[out.length - 1] < max - 1e-9) out.push(out[out.length - 1] + step);
  return out;
}

const decOfStep = (step: number): number => Math.max(0, Math.min(4, -Math.floor(Math.log10(step) + 1e-9)));

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Ejes con cuadrícula y etiquetas. Devuelve funciones de escala. */
function axes(r: ReportDoc, box: Box, xs: number[], ys: number[], xLabel: string, yLabel: string) {
  const { doc } = r;
  const xMin = xs[0], xMax = xs[xs.length - 1];
  const yMin = ys[0], yMax = ys[ys.length - 1];
  const sx = (v: number) => box.x + ((v - xMin) / (xMax - xMin || 1)) * box.w;
  const sy = (v: number) => box.y + box.h - ((v - yMin) / (yMax - yMin || 1)) * box.h;
  doc.setLineWidth(0.1);
  r.color(C.greySoft, 'draw');
  const xd = xs.length > 1 ? decOfStep(xs[1] - xs[0]) : 0;
  const yd = ys.length > 1 ? decOfStep(ys[1] - ys[0]) : 2;
  r.font(6.5, 'normal', C.muted);
  for (const v of ys) {
    r.color(C.greySoft, 'draw');
    doc.line(box.x, sy(v), box.x + box.w, sy(v));
    r.text(v.toFixed(yd), box.x - 1.5, sy(v) + 1, { align: 'right' });
  }
  for (const v of xs) {
    r.color(C.greySoft, 'draw');
    doc.line(sx(v), box.y, sx(v), box.y + box.h);
    r.text(v.toFixed(xd), sx(v), box.y + box.h + 3.5, { align: 'center' });
  }
  r.color(C.grey, 'draw');
  doc.setLineWidth(0.25);
  doc.line(box.x, box.y + box.h, box.x + box.w, box.y + box.h);
  doc.line(box.x, box.y, box.x, box.y + box.h);
  r.font(7, 'bold', C.muted);
  r.text(xLabel, box.x + box.w / 2, box.y + box.h + 7.5, { align: 'center' });
  doc.text(yLabel, box.x - 13, box.y + box.h / 2, { angle: 90, align: 'center' } as never);
  return { sx, sy };
}

function legend(r: ReportDoc, x: number, y: number, items: { label: string; color: RGB; dashed?: boolean }[]): void {
  const { doc } = r;
  let cx = x;
  for (const it of items) {
    r.color(it.color, 'draw');
    doc.setLineWidth(0.5);
    if (it.dashed) doc.setLineDashPattern([1.4, 1], 0);
    doc.line(cx, y - 1, cx + 6, y - 1);
    doc.setLineDashPattern([], 0);
    r.font(7, 'normal', C.ink);
    r.text(it.label, cx + 7.5, y);
    cx += 10 + doc.getTextWidth(it.label) + 4;
  }
}

/** Perfil longitudinal de la nivelación: cota compensada y cota de proyecto. */
export function drawProfile(r: ReportDoc, pts: ProfilePoint[], hasDist: boolean, height = 72): void {
  const data = pts
    .map((p) => ({ ...p, z: isNum(p.adjusted) ? p.adjusted : p.elevation }))
    .filter((p) => isNum(p.z) && isNum(p.distAcum));
  if (data.length < 2) return;
  r.ensure(height + 14);
  const box: Box = { x: PAGE.m + 17, y: r.y + 4, w: CONTENT_W - 19, h: height - 16 };
  const zs = data.flatMap((p) => (isNum(p.design) ? [p.z, p.design] : [p.z]));
  const zMin = Math.min(...zs), zMax = Math.max(...zs);
  const pad = Math.max((zMax - zMin) * 0.12, 0.05);
  const ys = niceTicks(zMin - pad, zMax + pad, 5);
  const xs = niceTicks(0, Math.max(...data.map((p) => p.distAcum)), 8);
  const { sx, sy } = axes(r, box, xs, ys, hasDist ? 'Distancia acumulada (m)' : 'Punto N°', 'Cota (m)');
  const { doc } = r;

  // Cota de proyecto (discontinua) sobre los puntos que la tienen.
  const design = data.filter((p) => isNum(p.design));
  if (design.length > 1) {
    r.color(C.ok, 'draw');
    doc.setLineWidth(0.45);
    doc.setLineDashPattern([1.4, 1], 0);
    for (let i = 1; i < design.length; i++) {
      doc.line(sx(design[i - 1].distAcum), sy(design[i - 1].design!), sx(design[i].distAcum), sy(design[i].design!));
    }
    doc.setLineDashPattern([], 0);
  }
  // Cota compensada.
  r.color(C.accent, 'draw');
  doc.setLineWidth(0.6);
  for (let i = 1; i < data.length; i++) doc.line(sx(data[i - 1].distAcum), sy(data[i - 1].z), sx(data[i].distAcum), sy(data[i].z));
  const labelEvery = Math.max(1, Math.ceil(data.length / 24));
  data.forEach((p, i) => {
    r.color(C.white, 'fill');
    r.color(C.accent, 'draw');
    doc.setLineWidth(0.35);
    doc.circle(sx(p.distAcum), sy(p.z), 0.8, 'FD');
    if (isNum(p.design)) {
      r.color(C.ok, 'fill');
      doc.circle(sx(p.distAcum), sy(p.design), 0.55, 'F');
    }
    if (i % labelEvery === 0) {
      r.font(5.8, 'normal', C.ink);
      doc.text(p.name.slice(0, 10), sx(p.distAcum) + 0.6, sy(p.z) - 1.6, { angle: 45 } as never);
    }
  });
  legend(r, box.x + 2, box.y - 1.5, [
    { label: 'Cota compensada', color: C.accent },
    ...(design.length > 1 ? [{ label: 'Cota de proyecto', color: C.ok, dashed: true }] : []),
  ]);
  r.y = box.y + box.h + 12;
}

/** Histograma de desviaciones (mm) con bandas de tolerancia. */
export function drawHistogram(r: ReportDoc, devsMm: number[], tolMm: number, box: Box): void {
  const { doc } = r;
  r.color(C.line, 'draw');
  doc.setLineWidth(0.2);
  r.font(7.5, 'bold', C.ink);
  r.text('Distribución de desviaciones (mm)', box.x, box.y - 2);
  if (devsMm.length === 0) {
    r.font(7.5, 'italic', C.muted);
    r.text('Sin mediciones', box.x + box.w / 2, box.y + box.h / 2, { align: 'center' });
    return;
  }
  const maxAbs = Math.max(1.6 * tolMm, ...devsMm.map((d) => Math.abs(d)));
  const nb = 12;
  const lo = -maxAbs, step = (2 * maxAbs) / nb;
  const bins = new Array(nb).fill(0) as number[];
  for (const d of devsMm) bins[Math.min(nb - 1, Math.max(0, Math.floor((d - lo) / step)))]++;
  const top = Math.max(...bins);
  const inner = { x: box.x + 6, y: box.y + 2, w: box.w - 8, h: box.h - 10 };
  const bw = inner.w / nb;
  // Banda de tolerancia.
  const sx = (v: number) => inner.x + ((v - lo) / (2 * maxAbs)) * inner.w;
  r.color(C.okSoft, 'fill');
  doc.rect(sx(-tolMm), inner.y, sx(tolMm) - sx(-tolMm), inner.h, 'F');
  bins.forEach((n, i) => {
    if (!n) return;
    const center = lo + (i + 0.5) * step;
    const a = Math.abs(center);
    const tone = a <= tolMm ? C.ok : a <= 1.5 * tolMm ? C.warn : C.fail;
    const bh = (n / top) * inner.h;
    r.color(tone, 'fill');
    doc.rect(inner.x + i * bw + 0.4, inner.y + inner.h - bh, bw - 0.8, bh, 'F');
    r.font(6, 'bold', C.ink);
    r.text(String(n), inner.x + i * bw + bw / 2, inner.y + inner.h - bh - 0.8, { align: 'center' });
  });
  r.color(C.grey, 'draw');
  doc.setLineWidth(0.25);
  doc.line(inner.x, inner.y + inner.h, inner.x + inner.w, inner.y + inner.h);
  doc.setLineDashPattern([1, 0.8], 0);
  r.color(C.ok, 'draw');
  for (const t of [-tolMm, tolMm]) doc.line(sx(t), inner.y, sx(t), inner.y + inner.h);
  doc.setLineDashPattern([], 0);
  r.font(6.3, 'normal', C.muted);
  for (const v of [-maxAbs, -tolMm, 0, tolMm, maxAbs]) r.text(nf(v, 0), sx(v), inner.y + inner.h + 3.2, { align: 'center' });
  r.font(6.3, 'normal', C.ok);
  r.text(`Tolerancia ±${nf(tolMm, 0)} mm`, inner.x + inner.w / 2, inner.y + inner.h + 6.8, { align: 'center' });
}
