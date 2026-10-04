import { computeLevelRun } from '@/core/leveling';
import type { LevelRun } from '@/core/types';

const base: LevelRun = {
  id: 'r',
  name: 'en curso',
  date: '2026-10-04',
  method: 'HI',
  closure: 'loop',
  order: 'third',
  startBM: { name: 'BM-1', elevation: 100 },
  source: 'manual',
  observations: [
    { id: '1', kind: 'BS', pointName: 'BM-1', reading: 1.5, distance: 30 },
    { id: '2', kind: 'IS', pointName: '0+000', reading: 1.6, distance: 20, designElevation: 99.9 },
    { id: '3', kind: 'FS', pointName: 'PC-1', reading: 0.5, distance: 30 },
    { id: '4', kind: 'BS', pointName: 'PC-1', reading: 1.2, distance: 30 },
  ],
};

test('una libreta de circuito que aún no vuelve al BM no se compensa', () => {
  const r = computeLevelRun(base);
  expect(r.closure.inProgress).toBe(true);
  expect(r.closure.misclosureMm).toBeUndefined();
  expect(r.rows.every((x) => x.correction === 0)).toBe(true);
  const is = r.rows.find((x) => x.pointName === '0+000')!;
  expect(is.cutFill).toBeCloseTo(0, 9); // 100 + 1.5 − 1.6 = 99.9
  expect(r.issues.some((i) => i.includes('en curso'))).toBe(true);
});

test('al leer la vista adelante sobre el BM de inicio se calcula el cierre', () => {
  const run: LevelRun = {
    ...base,
    observations: [...base.observations, { id: '5', kind: 'FS', pointName: 'bm-1 ', reading: 2.198, distance: 30 }],
  };
  const r = computeLevelRun(run);
  expect(r.closure.inProgress).toBeFalsy();
  expect(r.closure.misclosureMm).toBeCloseTo(2, 6);
});
