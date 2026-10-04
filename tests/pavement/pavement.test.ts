import {
  PAVEMENT_TEMPLATES, checkLayer, cutFillLabel, designElevationAt, generateControlGrid,
  instantiateTemplate, layerDesignElevation, layerSummary, statusFor,
} from '@/core/pavement';
import type { ControlPoint, DesignGrade, LayerControl } from '@/core/types';

const grade: DesignGrade = { startStation: 0, startElevation: 100, longSlope: 2, crossSlope: 2, crossType: 'crown' };
const layers = [
  { id: 'cap', name: 'Carpeta', thickness: 0.05, tolerance: 0.005 },
  { id: 'base', name: 'Base', thickness: 0.2, tolerance: 0.01 },
  { id: 'sb', name: 'Sub-base', thickness: 0.2, tolerance: 0.02 },
  { id: 'sr', name: 'Subrasante', thickness: 0, tolerance: 0.02 },
];
const pt = (id: string, measured: Record<string, number>, extra: Partial<ControlPoint> = {}): ControlPoint =>
  ({ id, station: 50, offset: 0, measured, ...extra });

describe('rasante', () => {
  test('bombeo a dos aguas', () => {
    expect(designElevationAt(grade, 50, 0)).toBeCloseTo(101, 12);
    expect(designElevationAt(grade, 50, -3.5)).toBeCloseTo(100.93, 12);
    expect(designElevationAt(grade, 50, 3.5)).toBeCloseTo(100.93, 12);
    expect(designElevationAt(grade, -10, 0)).toBeCloseTo(99.8, 12);
  });
  test('una sola caída', () => {
    const g = { ...grade, crossType: 'one-way' as const };
    expect(designElevationAt(g, 50, 3.5)).toBeCloseTo(100.93, 12);
    expect(designElevationAt(g, 50, -3.5)).toBeCloseTo(101.07, 12);
  });
  test('cota por capa', () => {
    const c = { layers, grade };
    const p = pt('a', {});
    expect(layerDesignElevation(c, p, 0)).toBeCloseTo(101, 12);
    expect(layerDesignElevation(c, p, 1)).toBeCloseTo(100.95, 12);
    expect(layerDesignElevation(c, p, 2)).toBeCloseTo(100.75, 12);
    expect(layerDesignElevation(c, p, 3)).toBeCloseTo(100.55, 12);
    expect(layerDesignElevation(c, { ...p, designOverride: 99 }, 1)).toBeCloseTo(98.95, 12);
    expect(() => layerDesignElevation(c, p, 4)).toThrow();
  });
});

describe('verificación de capa', () => {
  const control: LayerControl = {
    id: 'lc', name: 'Av. Prueba', layers, grade,
    points: [
      pt('A', { base: 100.958 }),
      pt('B', { base: 100.963 }),
      pt('C', { base: 100.93 }),
      pt('D', { cap: 101.0 }),
      pt('E', { base: 100.96 }),
    ],
  };
  const checks = checkLayer(control, 'base');

  test('estados', () => {
    expect(checks.map((c) => c.status)).toEqual(['ok', 'warn', 'fail', 'pending', 'ok']);
    expect(checks[0].design).toBeCloseTo(100.95, 12);
    expect(checks[0].deviation).toBeCloseTo(0.008, 9);
    expect(checks[2].deviation).toBeCloseTo(-0.02, 9);
    expect(checks[3].measured).toBeUndefined();
    expect(() => checkLayer(control, 'nope')).toThrow();
  });

  test('resumen', () => {
    const s = layerSummary(checks);
    expect(s).toMatchObject({ total: 5, measured: 4, ok: 2, warn: 1, fail: 1, pending: 1, pctOk: 50 });
    expect(s.maxHigh).toBeCloseTo(0.013, 9);
    expect(s.maxLow).toBeCloseTo(-0.02, 9);
    expect(s.meanDev).toBeCloseTo(0.00275, 9);
    expect(s.stdDev).toBeCloseTo(0.0153052, 6);
    const empty = layerSummary([]);
    expect(empty.pctOk).toBe(0);
    expect(empty.maxHigh).toBe(0);
  });

  test('statusFor en los límites', () => {
    expect(statusFor(0.015, 0.01)).toBe('warn');
    expect(statusFor(-0.0151, 0.01)).toBe('fail');
    expect(statusFor(undefined, 0.01)).toBe('pending');
  });
});

describe('utilidades', () => {
  test('malla de control', () => {
    const g = generateControlGrid({ fromStation: 0, toStation: 45, interval: 20, offsets: [-3.5, 0, 3.5] });
    expect(g).toHaveLength(12);
    expect([...new Set(g.map((p) => p.station))]).toEqual([0, 20, 40, 45]);
    expect(g[0].label).toBe('0+000.00 Izq 3.5');
    expect(g[1].label).toBe('0+000.00 Eje');
    expect(g[0].measured).toEqual({});
    expect(new Set(g.map((p) => p.id)).size).toBe(12);
  });
  test('etiqueta corte/relleno', () => {
    expect(cutFillLabel(0.023)).toBe('C 0.023');
    expect(cutFillLabel(-0.015)).toBe('R 0.015');
    expect(cutFillLabel(0.0002)).toBe('OK');
  });
  test('plantillas', () => {
    expect(PAVEMENT_TEMPLATES.map((t) => t.id)).toEqual(['flexible-urbano', 'rigido', 'vereda', 'afirmado']);
    for (const t of PAVEMENT_TEMPLATES) {
      expect(t.normative.length).toBeGreaterThan(0);
      for (const l of t.layers) expect(l.normative.length).toBeGreaterThan(0);
      expect(t.layers[t.layers.length - 1].name).toBe('Subrasante');
    }
    const flex = PAVEMENT_TEMPLATES[0];
    expect(flex.layers.map((l) => [l.thickness, l.tolerance])).toEqual([[0.05, 0.005], [0.2, 0.01], [0.2, 0.02], [0, 0.02]]);
    const ls = instantiateTemplate('vereda');
    expect(ls.map((l) => l.thickness)).toEqual([0.1, 0.1, 0]);
    expect(new Set(ls.map((l) => l.id)).size).toBe(3);
    expect(() => instantiateTemplate('x')).toThrow();
  });
});
