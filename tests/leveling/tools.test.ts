import {
  twoPegTest,
  stadia,
  curvatureRefraction,
  reciprocalLeveling,
  gradeStake,
  cutFill,
  cutFillLabel,
  quickHI,
  elevationFromReading,
} from '@/core/leveling';

describe('prueba de dos estacas', () => {
  test('instrumento fuera de tolerancia (7 mm en 60 m)', () => {
    const r = twoPegTest({ a1: 1.524, b1: 1.012, a2: 1.42, b2: 0.915, distance: 60 });
    expect(r.trueDiff).toBeCloseTo(0.512, 9);
    expect(r.expectedB2).toBeCloseTo(0.908, 9);
    expect(r.errorMm).toBeCloseTo(7, 6);
    expect(r.errorMmPer30m).toBeCloseTo(3.5, 6);
    expect(r.angleSec).toBeCloseTo(24.06, 1);
    expect(r.passes).toBe(false);
  });
  test('instrumento correcto (2 mm en 60 m)', () => {
    const r = twoPegTest({ a1: 1.524, b1: 1.012, a2: 1.42, b2: 0.91, distance: 60 });
    expect(r.angleSec).toBeCloseTo(6.88, 1);
    expect(r.passes).toBe(true);
  });
});

describe('taquimetría', () => {
  test('visual horizontal', () => {
    const r = stadia({ upper: 1.85, middle: 1.6, lower: 1.35 });
    expect(r.horizontalDistance).toBeCloseTo(50, 9);
    expect(r.verticalDiff).toBeCloseTo(0, 9);
    expect(r.middleOk).toBe(true);
  });
  test('visual inclinada 10°', () => {
    const r = stadia({ upper: 1.85, middle: 1.61, lower: 1.35, verticalAngleDeg: 10, instrumentHeight: 1.5 });
    expect(r.horizontalDistance).toBeCloseTo(48.4923, 3);
    expect(r.verticalDiff).toBeCloseTo(8.5505, 3);
    expect(r.elevationDiff).toBeCloseTo(1.5 + 8.5505 - 1.61, 3);
    expect(r.middleOk).toBe(false);
  });
});

describe('otras herramientas', () => {
  test('curvatura y refracción', () => {
    expect(curvatureRefraction(1000)).toBeCloseTo(0.06828, 5);
    expect(curvatureRefraction(100)).toBeCloseTo(0.000683, 6);
  });
  test('nivelación recíproca', () => {
    // verdadero 0.500, error 4 mm en la visual larga
    const r = reciprocalLeveling({ a1: 1.2, b1: 0.704, a2: 1.804, b2: 1.3 });
    expect(r.trueDiff).toBeCloseTo(0.5, 9);
    expect(r.error).toBeCloseTo(0.004, 9);
  });
  test('replanteo con nivel', () => {
    const hi = quickHI(100, 1.5);
    expect(hi).toBe(101.5);
    expect(elevationFromReading(hi, 2.1)).toBeCloseTo(99.4, 9);
    expect(gradeStake(hi, 100.2)).toBeCloseTo(1.3, 9);
    expect(cutFill(hi, 1.2, 100.2)).toBeCloseTo(0.1, 9);
    expect(cutFill(hi, 1.35, 100.2)).toBeCloseTo(-0.05, 9);
    expect(cutFillLabel(0.1)).toBe('Cortar 0.100 m');
    expect(cutFillLabel(-0.05)).toBe('Rellenar 0.050 m');
    expect(cutFillLabel(0.0002)).toBe('En rasante');
  });
});
