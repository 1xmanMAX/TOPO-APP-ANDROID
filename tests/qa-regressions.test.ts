// @vitest-environment node
/** Regresiones encontradas en la QA de flujos de campo (simulación en teléfono). */
import * as XLSX from 'xlsx';
import type { LevelObservation, LevelRun, Project } from '@/core/types';
import { DEFAULT_SETUP_LENGTH_M, computeLevelRun, toleranceLengthKm, toleranceMm } from '@/core/leveling';
import { todayIso } from '@/io/common';
import { generateControlGrid, gridLabel } from '@/core/pavement';
import { levelRunXlsx } from '@/report';

let n = 0;
const o = (kind: LevelObservation['kind'], pointName: string, reading: number): LevelObservation => ({ id: `q${++n}`, kind, pointName, reading });

/** Circuito sin distancias: 3 estaciones, error +4 mm. */
const loopRun = (): LevelRun => ({
  id: 'lvq',
  name: 'Circuito',
  date: '2026-10-04',
  method: 'HI',
  closure: 'loop',
  order: 'third',
  startBM: { name: 'BM-1', elevation: 100 },
  source: 'manual',
  observations: [
    o('BS', 'BM-1', 1.5),
    o('IS', '0+000', 1.2),
    o('FS', 'PC-1', 0.9),
    o('BS', 'PC-1', 1.1),
    o('FS', 'PC-2', 1.8),
    o('BS', 'PC-2', 1.4),
    o('FS', 'bm-1', 1.296),
  ],
});

describe('K de la tolerancia sin distancias', () => {
  it('toleranceLengthKm usa la longitud o 100 m por estación', () => {
    expect(toleranceLengthKm(0.4, 3)).toEqual({ km: 0.4, assumed: false });
    expect(toleranceLengthKm(0, 3)).toEqual({ km: (3 * DEFAULT_SETUP_LENGTH_M) / 1000, assumed: true });
    expect(toleranceLengthKm(0, 0)).toEqual({ km: 0, assumed: false });
    expect(toleranceMm(12, 0, 3)).toBeCloseTo(12 * Math.sqrt(toleranceLengthKm(0, 3).km), 12);
  });

  it('cierre en circuito (nombre del BM sin distinguir mayúsculas) y compensación por estación', () => {
    const r = computeLevelRun(loopRun());
    expect(r.closure.inProgress).toBeUndefined();
    expect(r.closure.misclosureMm).toBeCloseTo(4, 6);
    expect(r.closure.toleranceMm).toBeCloseTo(12 * Math.sqrt(0.3), 6);
    const last = r.rows[r.rows.length - 1];
    expect(last.adjustedElevation).toBeCloseTo(100, 9);
    expect(r.rows[1].correction).toBeCloseTo(-0.004 / 3, 9);
  });

  it('el Excel de la libreta informa el K supuesto, no 0 km', async () => {
    const run = loopRun();
    const project = { id: 'p', name: 'P', crs: { zone: 18, hemisphere: 'S', datum: 'WGS84' }, createdAt: '', updatedAt: '', benchmarks: [], points: [], levelRuns: [run], layerControls: [] } as Project;
    const blob = levelRunXlsx(project, run.id);
    const wb = XLSX.read(new Uint8Array(await blob.arrayBuffer()), { type: 'array' });
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets.Libreta, { header: 1 });
    const k = rows.find((x) => x[0] === 'Longitud K (km)')!;
    expect(k[1]).toBeCloseTo(0.3, 9);
    expect(String(k[2])).toMatch(/supuesta/);
  });
});

describe('distancias incompletas', () => {
  it('no usan la suma parcial como K (tolerancia irrealmente estricta)', () => {
    const run = loopRun();
    run.observations[0] = { ...run.observations[0], distance: 30 }; // solo la primera VA tiene distancia
    const r = computeLevelRun(run);
    expect(r.closure.lengthKm).toBe(0);
    expect(r.closure.toleranceMm).toBeCloseTo(12 * Math.sqrt(0.3), 6);
    expect(r.closure.passes).toBe(true);
    expect(r.issues.some((t) => /Distancias incompletas/.test(t))).toBe(true);
  });
});

describe('fecha de hoy en hora local', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });
  it('en Lima (UTC−5) a las 21:00 sigue siendo el mismo día', () => {
    vi.stubEnv('TZ', 'America/Lima');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-05T02:00:00Z')); // 4 oct, 21:00 en Lima
    expect(todayIso()).toBe('2026-10-04');
  });
});

describe('etiqueta automática de puntos de control', () => {
  it('la malla usa gridLabel (para regenerarla si se mueve el punto)', () => {
    const g = generateControlGrid({ fromStation: 0, toStation: 20, interval: 20, offsets: [-3.6, 0] });
    expect(g.map((p) => p.label)).toEqual(g.map((p) => gridLabel(p.station, p.offset)));
    expect(gridLabel(20, 3.6)).toMatch(/Der 3\.6$/);
    expect(gridLabel(20, 0)).toMatch(/Eje$/);
  });
});
