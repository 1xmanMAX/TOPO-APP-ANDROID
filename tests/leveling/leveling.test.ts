import type { LevelObservation, LevelRun } from '@/core/types';
import {
  ORDER_K,
  ORDER_LABEL,
  kFor,
  toleranceMm,
  computeLevelRun,
  levelRunSummary,
  profileFromRun,
} from '@/core/leveling';

let n = 0;
const o = (kind: LevelObservation['kind'], pointName: string, reading: number, extra: Partial<LevelObservation> = {}): LevelObservation => ({
  id: `o${++n}`,
  kind,
  pointName,
  reading,
  ...extra,
});

const baseRun = (over: Partial<LevelRun>): LevelRun => ({
  id: 'r1',
  name: 'Prueba',
  date: '2026-10-04',
  method: 'HI',
  closure: 'loop',
  order: 'ordinary',
  startBM: { name: 'BM1', elevation: 100 },
  observations: [],
  source: 'manual',
  ...over,
});

/**
 * Circuito cerrado de libro (calculado a mano):
 *  E1: BS BM1 1.500 (40 m) → HI 101.500; IS A 2.100 (20 m) → 99.400; FS TP1 0.800 (40 m) → 100.700
 *  E2: BS TP1 1.200 (50 m) → HI 101.900; FS TP2 2.400 (50 m) → 99.500
 *  E3: BS TP2 1.700 (30 m) → HI 101.200; FS BM1 1.192 (30 m) → 100.008  ⇒ error +8 mm
 *  ΣBS 4.400, ΣFS 4.392, ΣS 1.808, ΣB 1.800. L = 240 m.
 */
const loopObs = () => [
  o('BS', 'BM1', 1.5, { distance: 40 }),
  o('IS', 'A', 2.1, { distance: 20, designElevation: 99.3 }),
  o('FS', 'TP1', 0.8, { distance: 40 }),
  o('BS', 'TP1', 1.2, { distance: 50 }),
  o('FS', 'TP2', 2.4, { distance: 50 }),
  o('BS', 'TP2', 1.7, { distance: 30 }),
  o('FS', 'BM1', 1.192, { distance: 30 }),
];

describe('tolerancia', () => {
  test('coeficientes y etiquetas', () => {
    expect(ORDER_K).toEqual({ first: 4, second: 8, third: 12, ordinary: 24 });
    expect(ORDER_LABEL.first).toBe('1er orden (alta precisión)');
    expect(kFor({ order: 'custom', customK: 10 })).toBe(10);
    expect(kFor({ order: 'custom' })).toBe(24);
    expect(kFor({ order: 'third' })).toBe(12);
  });
  test('T = k·√K y criterio por estaciones', () => {
    expect(toleranceMm(12, 4)).toBeCloseTo(24, 9);
    // sin distancias: 10 estaciones → 1 km
    expect(toleranceMm(12, 0, 10)).toBeCloseTo(12, 9);
    expect(toleranceMm(12, 0, 0)).toBe(0);
  });
});

describe('computeLevelRun — circuito cerrado', () => {
  const run = baseRun({ observations: loopObs() });
  const res = computeLevelRun(run);

  test('cotas y HI', () => {
    expect(res.issues).toEqual([]);
    expect(res.rows).toHaveLength(7);
    expect(res.rows[0].hi).toBeCloseTo(101.5, 9);
    expect(res.rows[1].elevation).toBeCloseTo(99.4, 9);
    expect(res.rows[2].elevation).toBeCloseTo(100.7, 9);
    expect(res.rows[3].elevation).toBeCloseTo(100.7, 9);
    expect(res.rows[4].elevation).toBeCloseTo(99.5, 9);
    expect(res.rows[6].elevation).toBeCloseTo(100.008, 9);
    expect(res.rows.map((r) => r.setup)).toEqual([1, 1, 1, 2, 2, 3, 3]);
  });

  test('ascensos/descensos y checks aritméticos', () => {
    expect(res.rows[1].fall).toBeCloseTo(0.6, 9);
    expect(res.rows[2].rise).toBeCloseTo(1.3, 9);
    expect(res.rows[4].fall).toBeCloseTo(1.2, 9);
    expect(res.rows[6].rise).toBeCloseTo(0.508, 9);
    expect(res.checks.sumBS).toBeCloseTo(4.4, 9);
    expect(res.checks.sumFS).toBeCloseTo(4.392, 9);
    expect(res.checks.sumRise).toBeCloseTo(1.808, 9);
    expect(res.checks.sumFall).toBeCloseTo(1.8, 9);
    expect(res.checks.arithmeticOk).toBe(true);
    expect(res.checks.distanceImbalance).toBeCloseTo(0, 9);
  });

  test('cierre y tolerancia', () => {
    expect(res.closure.misclosureMm).toBeCloseTo(8, 6);
    expect(res.closure.lengthKm).toBeCloseTo(0.24, 9);
    expect(res.closure.toleranceMm).toBeCloseTo(24 * Math.sqrt(0.24), 6);
    expect(res.closure.passes).toBe(true);
    expect(res.closure.setups).toBe(3);
    const strict = computeLevelRun(baseRun({ observations: loopObs(), order: 'third' }));
    expect(strict.closure.passes).toBe(false);
    expect(levelRunSummary(baseRun({ order: 'third' }), strict).verdict).toBe(
      'Repetir nivelación: error 8.0 mm > tolerancia 5.9 mm',
    );
  });

  test('compensación proporcional a la distancia', () => {
    expect(res.rows[0].correction).toBe(0);
    expect(res.rows[1].correction * 1000).toBeCloseTo((-8 * 40) / 240, 6); // IS: hasta la BS
    expect(res.rows[2].correction * 1000).toBeCloseTo((-8 * 80) / 240, 6);
    expect(res.rows[3].correction).toBeCloseTo(res.rows[2].correction, 12);
    expect(res.rows[4].adjustedElevation).toBeCloseTo(99.494, 9);
    expect(res.rows[6].adjustedElevation).toBeCloseTo(100.0, 9);
    expect(res.rows[1].cutFill).toBeCloseTo(99.4 - 0.008 / 6 - 99.3, 9);
  });

  test('resumen y perfil', () => {
    const s = levelRunSummary(run, res);
    expect(s.verdict).toBe('Cierre dentro de tolerancia');
    expect(s.nPoints).toBe(4);
    expect(s.nSetups).toBe(3);
    expect(s.lengthM).toBeCloseTo(240, 9);
    expect(s.minElevation).toBeCloseTo(99.3987, 3);
    const p = profileFromRun(res);
    expect(p.map((q) => q.name)).toEqual(['BM1', 'A', 'TP1', 'TP2', 'BM1']);
    expect(p.map((q) => q.distAcum)).toEqual([0, 60, 80, 180, 240]);
    expect(p[3].adjusted).toBeCloseTo(99.494, 9);
  });

  test('método RF da las mismas cotas', () => {
    const rf = computeLevelRun(baseRun({ observations: loopObs(), method: 'RF' }));
    expect(rf.rows.map((r) => r.elevation)).toEqual(res.rows.map((r) => r.elevation));
    expect(rf.checks.arithmeticOk).toBe(true);
  });
});

describe('computeLevelRun — BM conocido y abierta', () => {
  const obs = () => [
    o('BS', 'BM-A', 2.0),
    o('FS', 'TP1', 1.0),
    o('BS', 'TP1', 1.5),
    o('IS', 'P', 2.0, { designElevation: 50.3 }),
    o('FS', 'BM-B', 0.48),
  ];
  test('known-bm, compensación por estaciones', () => {
    const run = baseRun({
      closure: 'known-bm',
      startBM: { name: 'BM-A', elevation: 50 },
      endBM: { name: 'BM-B', elevation: 52 },
      observations: obs(),
    });
    const r = computeLevelRun(run);
    expect(r.issues).toEqual([]);
    expect(r.closure.computedEnd).toBeCloseTo(52.02, 9);
    expect(r.closure.misclosureMm).toBeCloseTo(20, 6);
    expect(r.closure.lengthKm).toBe(0);
    expect(r.closure.toleranceMm).toBeCloseTo(24 * Math.sqrt(0.2), 6);
    expect(r.closure.passes).toBe(false);
    expect(r.rows[1].correction).toBeCloseTo(-0.01, 9);
    expect(r.rows[3].adjustedElevation).toBeCloseTo(50.48, 9);
    expect(r.rows[3].cutFill).toBeCloseTo(0.18, 9);
    expect(r.rows[4].adjustedElevation).toBeCloseTo(52, 9);
    const p = profileFromRun(r);
    expect(p.map((q) => q.distAcum)).toEqual([0, 1, 2, 3]);
  });
  test('abierta: sin cierre ni corrección', () => {
    const run = baseRun({ closure: 'open', startBM: { name: 'BM-A', elevation: 50 }, observations: obs() });
    const r = computeLevelRun(run);
    expect(r.closure.misclosureMm).toBeUndefined();
    expect(r.closure.passes).toBeUndefined();
    expect(r.rows.every((x) => x.correction === 0)).toBe(true);
    expect(r.rows[3].cutFill).toBeCloseTo(0.2, 9);
    expect(levelRunSummary(run, r).verdict).toBe('Nivelación abierta: sin control de cierre');
  });
});

describe('hilos estadimétricos', () => {
  test('distancia desde hilos y control del hilo medio', () => {
    const run = baseRun({
      closure: 'open',
      observations: [
        o('BS', 'BM1', 1.6, { upper: 1.85, lower: 1.35 }),
        o('FS', 'P1', 1.2, { upper: 1.45, lower: 0.96 }), // medio esperado 1.205 → 5 mm
      ],
    });
    const r = computeLevelRun(run);
    expect(r.rows[0].distance).toBeCloseTo(50, 9);
    expect(r.rows[1].distance).toBeCloseTo(49, 9);
    expect(r.checks.distanceImbalance).toBeCloseTo(1, 9);
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]).toContain('Hilo medio inconsistente en P1');
  });
});

describe('datos defectuosos', () => {
  test('array vacío', () => {
    const r = computeLevelRun(baseRun({ observations: [] }));
    expect(r.rows).toEqual([]);
    expect(r.issues.length).toBeGreaterThan(0);
    expect(levelRunSummary(baseRun({}), r).verdict).toBe('Sin observaciones');
    expect(profileFromRun(r)).toEqual([]);
  });
  test('no empieza con BS, lectura NaN, punto de cambio con otro nombre', () => {
    const r = computeLevelRun(
      baseRun({
        observations: [
          o('IS', 'X', 1.0),
          o('BS', 'BM9', 1.0),
          o('IS', 'Q', NaN),
          o('FS', 'TP1', 0.5),
          o('BS', 'TP9', 1.0),
          o('FS', 'BM1', 1.5),
        ],
      }),
    );
    expect(r.rows).toHaveLength(6);
    const txt = r.issues.join('\n');
    expect(txt).toContain('primera observación debe ser una vista atrás');
    expect(txt).toContain('sin vista atrás previa');
    expect(txt).toContain('Lectura no válida en Q');
    expect(txt).toContain('último punto de cambio es TP1');
    expect(Number.isNaN(r.rows[2].elevation)).toBe(true);
    expect(r.rows[4].elevation).toBeCloseTo(100.5, 9); // usa la cota del FS
    expect(r.closure.misclosureMm).toBeCloseTo(0, 6);
    expect(r.checks.arithmeticOk).toBe(false); // hay NaN
  });
  test('BM de inicio distinto en la primera BS', () => {
    const r = computeLevelRun(baseRun({ observations: [o('BS', 'BMX', 1), o('FS', 'BM1', 1)] }));
    expect(r.issues.join()).toContain('no es sobre el BM de inicio');
  });
});
