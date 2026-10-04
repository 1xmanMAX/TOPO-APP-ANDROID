import {
  degToDms, degToGon, degToRad, dmsToDeg, fmt, fmtSigned, formatDms, gonToDeg,
  normalizeDeg, normalizeDiffDeg, parseAngle, radToDeg, slopeFrom, trimNum,
} from '@/core/units';

describe('ángulos', () => {
  test('dmsToDeg', () => {
    expect(dmsToDeg(12, 30, 0)).toBe(12.5);
    expect(dmsToDeg(-12, 30, 0)).toBe(-12.5);
    expect(dmsToDeg(-0, 30, 0)).toBe(-0.5);
    expect(dmsToDeg(12, 34, 56.7)).toBeCloseTo(12.5824166667, 9);
  });

  test('degToDms', () => {
    expect(degToDms(12.5)).toEqual({ d: 12, m: 30, s: 0, sign: 1 });
    const r = degToDms(-45.2575);
    expect(r.sign).toBe(-1);
    expect(r.d).toBe(45);
    expect(r.m).toBe(15);
    expect(r.s).toBeCloseTo(27, 6);
  });

  test('formatDms con acarreo', () => {
    expect(formatDms(12.5824166667)).toBe('12°34\'56.7"');
    expect(formatDms(29.99999999)).toBe('30°00\'00.0"');
    expect(formatDms(-0.5, 0)).toBe('-0°30\'00"');
    expect(formatDms(1 + 1 / 60 + 5 / 3600, 1)).toBe('1°01\'05.0"');
  });

  test('parseAngle', () => {
    expect(parseAngle('12.5')).toBe(12.5);
    expect(parseAngle('12°30\'15"')).toBeCloseTo(12.5041666667, 9);
    expect(parseAngle('12 30 15')).toBeCloseTo(12.5041666667, 9);
    expect(parseAngle('-12 30')).toBe(-12.5);
    expect(parseAngle('12,5')).toBe(12.5);
    expect(parseAngle('12.3015')).toBe(12.3015);
    expect(parseAngle('12.3015', { calculator: true })).toBeCloseTo(12.5041666667, 9);
    expect(parseAngle('12.30155', { calculator: true })).toBeCloseTo(12 + 30 / 60 + 15.5 / 3600, 9);
    expect(parseAngle('12.3', { calculator: true })).toBeCloseTo(12.5, 9);
    expect(parseAngle('12 61 00')).toBeNull();
    expect(parseAngle('abc')).toBeNull();
    expect(parseAngle('')).toBeNull();
  });

  test('gon y radianes', () => {
    expect(degToGon(90)).toBe(100);
    expect(gonToDeg(200)).toBe(180);
    expect(degToRad(180)).toBeCloseTo(Math.PI, 12);
    expect(radToDeg(Math.PI / 2)).toBeCloseTo(90, 12);
  });

  test('normalización', () => {
    expect(normalizeDeg(-90)).toBe(270);
    expect(normalizeDeg(720)).toBe(0);
    expect(normalizeDiffDeg(359)).toBe(-1);
    expect(normalizeDiffDeg(180)).toBe(180);
  });
});

describe('pendientes', () => {
  test('1 m en 50 m', () => {
    const s = slopeFrom(1, 50);
    expect(s.percent).toBeCloseTo(2, 12);
    expect(s.permil).toBeCloseTo(20, 12);
    expect(s.degrees).toBeCloseTo(1.1457628, 6);
    expect(s.ratio).toBe('1:50');
  });
  test('talud 1:1.5 descendente', () => {
    const s = slopeFrom(-2, 3);
    expect(s.percent).toBeCloseTo(-66.6667, 4);
    expect(s.ratio).toBe('1:1.5');
    expect(slopeFrom(0, 10).ratio).toBe('1:∞');
  });
});

describe('formato', () => {
  test('fmt', () => {
    expect(fmt(1.23456, 2)).toBe('1.23');
    expect(fmt(-0.0001, 3)).toBe('0.000');
    expect(fmt(2)).toBe('2.000');
    expect(fmt(NaN)).toBe('—');
    expect(fmtSigned(0.012)).toBe('+0.012');
    expect(fmtSigned(-0.005)).toBe('-0.005');
    expect(trimNum(1.5, 3)).toBe('1.5');
    expect(trimNum(2, 3)).toBe('2');
  });
});
