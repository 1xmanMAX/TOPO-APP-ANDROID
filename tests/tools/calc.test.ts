import { describe, expect, it } from 'vitest';
import { manholeDepth, os070MinSlope, pipeInvertAt, pipeSlopeFrom, pipeTable } from '@/features/tools/calc/pipe';
import { allSlopes, ratioToSlope, slopeToRatio } from '@/features/tools/calc/slope';
import { pegTestEval, WSDOT_LIMIT_SEC } from '@/features/tools/calc/peg';

describe('pendiente de tuberías', () => {
  it('cota de fondo a x', () => {
    // 8 ‰ en 45 m desde 100.000 → 99.640
    expect(pipeInvertAt(100, 0.008, 45)).toBeCloseTo(99.64, 9);
    expect(pipeSlopeFrom(100, 99.64, 45)).toBeCloseTo(0.008, 12);
    expect(pipeSlopeFrom(100, 99, 0)).toBeNaN();
  });
  it('tabla incluye el final y lecturas', () => {
    const t = pipeTable({ startInvert: 100, slopeMM: 0.01, length: 25, step: 10, hi: 101.5 });
    expect(t.map((r) => r.x)).toEqual([0, 10, 20, 25]);
    expect(t[3].invert).toBeCloseTo(99.75, 9);
    expect(t[3].reading).toBeCloseTo(1.75, 9);
    expect(pipeTable({ startInvert: 0, slopeMM: 0, length: 20, step: 10 }).map((r) => r.x)).toEqual([0, 10, 20]);
  });
  it('profundidad de buzón', () => {
    expect(manholeDepth(102.35, 100.2)).toBeCloseTo(2.15, 9);
  });
  it('pendiente mínima OS.070', () => {
    // Qi = 1.5 L/s → 0.0055·1.5^-0.47 ≈ 0.004546 (≈ 4.5 ‰)
    expect(os070MinSlope(1.5)).toBeCloseTo(0.0045457, 6);
    expect(os070MinSlope(0.5)).toBeCloseTo(os070MinSlope(1.5), 12);
    expect(os070MinSlope(10)).toBeCloseTo(0.0055 * 10 ** -0.47, 12);
  });
});

describe('pendientes', () => {
  it('ejemplo del estudio: 1.5 m en 60 m', () => {
    const s = allSlopes(1.5 / 60);
    expect(s.percent).toBeCloseTo(2.5, 12);
    expect(s.permil).toBeCloseTo(25, 12);
    expect(s.degrees).toBeCloseTo(1.4321, 4);
    expect(s.ratio).toBeCloseTo(40, 9);
    expect(s.hv).toBeCloseTo(40, 9);
  });
  it('ida y vuelta', () => {
    for (const u of ['percent', 'permil', 'degrees', 'ratio', 'hv'] as const) {
      expect(ratioToSlope(u, slopeToRatio(u, 3.7))).toBeCloseTo(3.7, 9);
    }
    expect(slopeToRatio('degrees', 45)).toBeCloseTo(1, 12);
    expect(slopeToRatio('ratio', 0)).toBeNaN();
    expect(ratioToSlope('ratio', 0)).toBe(Infinity);
  });
});

describe('prueba de dos estacas', () => {
  // Centro: a1 = 1.500, b1 = 1.300 → ΔH = 0.200. Junto a A (3 m): a2 = 1.420, b2 = 1.226.
  // Lectura correcta en B = 1.220 → error +6 mm en 57 m.
  const base = { a1: 1.5, b1: 1.3, a2: 1.42, b2: 1.226, distance: 60, nearDist: 3 };
  it('criterio 20″', () => {
    const r = pegTestEval({ ...base, criterion: 'arc20' });
    expect(r.expectedB2).toBeCloseTo(1.22, 9);
    expect(r.errorMm).toBeCloseTo(6, 6);
    expect(r.effectiveDistance).toBe(57);
    expect(r.angleSec).toBeCloseTo(Math.atan(0.006 / 57) * 206264.806, 6);
    expect(r.errorMmPer30m).toBeCloseTo((6 * 30) / 57, 9);
    expect(r.passes).toBe(false);
  });
  it('criterio WSDOT 2 mm / 60 m', () => {
    expect(WSDOT_LIMIT_SEC).toBeCloseTo(6.875, 2);
    const ok = pegTestEval({ ...base, b2: 1.2218, criterion: 'wsdot' });
    expect(ok.errorMmPer60m).toBeCloseTo((1.8 * 60) / 57, 6);
    expect(ok.passes).toBe(true);
    const bad = pegTestEval({ ...base, criterion: 'wsdot' });
    expect(bad.passes).toBe(false);
  });
});
