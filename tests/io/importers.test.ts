import { computeLevelRun } from '@/core/leveling';
import { utmToLatLon } from '@/core/geo';
import {
  detectFormat,
  importText,
  parseCsvLeveling,
  parseCsvPoints,
  parseGsiWord,
  parseLeicaGsi,
  parseNmea,
  parseSokkiaSdr,
  parseTopconGts,
  parseTrimbleDini,
} from '@/io';

// Fixtures como texto crudo (vía Vite), sin depender de los tipos de Node.
const FIXTURES = import.meta.glob('../fixtures/*', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const fx = (name: string): string => {
  const t = FIXTURES[`../fixtures/${name}`];
  if (t === undefined) throw new Error(`Fixture no encontrado: ${name}`);
  return t;
};
const byName = <T extends { name: string }>(arr: T[], name: string) => arr.find((p) => p.name === name)!;

describe('Leica GSI: palabras', () => {
  it('interpreta WI de 2 y 3 dígitos y unidades', () => {
    expect(parseGsiWord('331.06+00012554')).toMatchObject({ wi: '331', value: 1.2554 });
    expect(parseGsiWord('32...8+03212345')!.value).toBeCloseTo(32.12345, 6);
    expect(parseGsiWord('110012+0000A110')).toMatchObject({ wi: '11', text: 'A110' });
    expect(parseGsiWord('82..00-00000992')!.value).toBeCloseTo(-0.992, 6);
    expect(parseGsiWord('81..10+00001000')!.value).toBeCloseTo(1.0, 6);
    expect(parseGsiWord('83..01+00001000')!.value).toBeCloseTo(0.3048, 6); // pies
    expect(parseGsiWord('21.024+0000000003545100')!.value).toBeCloseTo(35 + 45 / 60 + 10 / 3600, 8);
    expect(parseGsiWord('basura')).toBeNull();
  });
});

describe('Leica GSI-8/16: coordenadas', () => {
  it('GSI-16 de estación total: P101..P105 + estación', () => {
    const text = fx('tps_gsi16.gsi');
    expect(detectFormat(text, 'tps.gsi')).toBe('leica-gsi16');
    const r = parseLeicaGsi(text);
    expect(r.format).toBe('leica-gsi16');
    expect(r.points).toHaveLength(6);
    const p = byName(r.points, 'P102');
    expect(p.x).toBeCloseTo(1049.254, 6);
    expect(p.y).toBeCloseTo(4980.984, 6);
    expect(p.z).toBeCloseTo(98.726, 6);
    expect(p.source).toBe('total-station');
    const est = byName(r.points, 'EST1');
    expect([est.x, est.y, est.z]).toEqual([1000, 5000, 100]);
    expect(r.levelRuns).toHaveLength(0);
  });

  it('GSI-8 equivalente produce las mismas coordenadas', () => {
    const r = importText(fx('tps_gsi8.gsi'));
    expect(r.format).toBe('leica-gsi8');
    const p = byName(r.points, 'P104');
    expect(p.x).toBeCloseTo(935.965, 6);
    expect(p.y).toBeCloseTo(5000.559, 6);
    expect(p.z).toBeCloseTo(102.458, 6);
  });

  it('ejemplo del manual con N negativos', () => {
    const r = parseLeicaGsi('110001+0000A110 81..00+00005387 82..00-00000992 \r\n\r\n110002+0000A111 81..00+00007586 82..00-00003031\n');
    expect(r.points.map((p) => p.name)).toEqual(['A110', 'A111']);
    expect(r.points[0].y).toBeCloseTo(-0.992, 6);
    expect(r.points[1].z).toBeUndefined();
  });
});

describe('Leica GSI: nivelación', () => {
  it('GSI-8 BF con intermedia (unidad 0,1 mm)', () => {
    const r = parseLeicaGsi(fx('nivel_bf_gsi8.gsi'), 'NIVEL01.gsi');
    expect(r.levelRuns).toHaveLength(1);
    const run = r.levelRuns[0];
    expect(run.name).toBe('NIVEL01');
    expect(run.source).toBe('leica-gsi');
    expect(run.method).toBe('RF');
    expect(run.order).toBe('third');
    expect(run.closure).toBe('open');
    expect(run.startBM).toEqual({ name: 'BM01', elevation: 100 });
    expect(run.observations.map((o) => `${o.kind}:${o.pointName}`)).toEqual([
      'BS:BM01', 'FS:TP1', 'BS:TP1', 'FS:TP2', 'BS:TP2', 'IS:IS01', 'FS:BM02',
    ]);
    expect(run.observations[0].reading).toBeCloseTo(1.523, 6);
    expect(run.observations[0].distance).toBeCloseTo(25.34, 6);
    const res = computeLevelRun(run);
    const el = (n: string) => res.rows.filter((x) => x.pointName === n && x.kind !== 'BS').pop()!.elevation;
    expect(el('TP1')).toBeCloseTo(100.312, 6);
    expect(el('TP2')).toBeCloseTo(99.4153, 6);
    expect(el('BM02')).toBeCloseTo(100.0409, 6);
    expect(el('IS01')).toBeCloseTo(98.7124, 6);
    expect(res.checks.arithmeticOk).toBe(true);
    expect(res.checks.sumBackDist + res.checks.sumForeDist).toBeCloseTo(147.33, 6);
    // Las cotas del equipo (83) coinciden con las recalculadas.
    expect(r.warnings.some((w) => w.startsWith('Cota de'))).toBe(false);
  });

  it('GSI-16 BFFB: promedia dobles lecturas (unidad 0,01 mm)', () => {
    const r = importText(fx('nivel_bffb_gsi16.gsi'), 'bffb.gsi');
    expect(r.format).toBe('leica-gsi16');
    const run = r.levelRuns[0];
    expect(run.startBM).toEqual({ name: 'BM10', elevation: 250 });
    expect(run.observations.map((o) => `${o.kind}:${o.pointName}`)).toEqual(['BS:BM10', 'FS:A1', 'BS:A1', 'FS:BM11']);
    expect(run.observations[0].reading).toBeCloseTo(1.62348, 8);
    expect(run.observations[1].reading).toBeCloseTo(1.10226, 8);
    expect(run.observations[1].distance).toBeCloseTo(22.8, 8);
    expect(run.notes).toContain('BFFB');
    const res = computeLevelRun(run);
    expect(res.rows[1].elevation).toBeCloseTo(250.52122, 6);
    expect(res.rows[3].elevation).toBeCloseTo(249.87594, 6);
  });

  it('sin cota inicial asume 100.000 con aviso; circuito → loop', () => {
    const t = [
      '410001+?......1',
      '110002+00000BM1 32...6+00200000 331.06+00015000',
      '110003+0000000A 32...6+00200000 332.06+00010000',
      '110004+0000000A 32...6+00200000 331.06+00012000',
      '110005+00000BM1 32...6+00200000 332.06+00017010',
    ].join('\n');
    const r = parseLeicaGsi(t);
    const run = r.levelRuns[0];
    expect(run.startBM.elevation).toBe(100);
    expect(r.warnings).toContain('Cota inicial no encontrada; se asumió 100.000');
    expect(run.closure).toBe('loop');
    expect(computeLevelRun(run).closure.misclosureMm).toBeCloseTo(-1, 6);
  });

  it('aBF (BF / FB alternado) agrupa estaciones correctamente', () => {
    const t = [
      '410001+?......3',
      '110002+00000BM1 83...6+01000000',
      '110003+00000BM1 331.06+00015000', // B
      '110004+0000000A 332.06+00010000', // F
      '110005+0000000B 332.06+00020000', // F (estación 2: FB)
      '110006+0000000A 331.06+00013000', // B
    ].join('\n');
    const run = parseLeicaGsi(t).levelRuns[0];
    expect(run.observations.map((o) => `${o.kind}:${o.pointName}`)).toEqual(['BS:BM1', 'FS:A', 'BS:A', 'FS:B']);
    expect(computeLevelRun(run).closure.computedEnd).toBeCloseTo(99.8, 6);
  });

  it('nunca lanza con basura', () => {
    expect(() => parseLeicaGsi('hola\nmundo')).not.toThrow();
    expect(parseLeicaGsi('').points).toHaveLength(0);
  });
});

describe('Trimble DiNi M5', () => {
  it('BF: mismos resultados que el GSI equivalente', () => {
    const text = fx('dini_bf_m5.dat');
    expect(detectFormat(text)).toBe('trimble-dini');
    const r = parseTrimbleDini(text, 'NIVEL01.DAT');
    expect(r.levelRuns).toHaveLength(1);
    const run = r.levelRuns[0];
    expect(run.source).toBe('trimble-dini');
    expect(run.startBM).toEqual({ name: 'BM01', elevation: 100 });
    expect(run.observations.map((o) => o.kind).join('')).toBe('BSFSBSFSBSISFS');
    const res = computeLevelRun(run);
    expect(res.closure.computedEnd).toBeCloseTo(100.0409, 6);
    expect(res.rows.find((x) => x.pointName === 'IS01')!.elevation).toBeCloseTo(98.7124, 6);
    expect(r.warnings.some((w) => w.startsWith('Cota de'))).toBe(false);
  });

  it('BFFB con medición repetida: promedia y descarta la lectura anulada', () => {
    const r = importText(fx('dini_bffb_m5.dat'), 'BFFB01.DAT');
    expect(r.format).toBe('trimble-dini');
    const run = r.levelRuns[0];
    expect(run.observations.map((o) => `${o.kind}:${o.pointName}`)).toEqual(['BS:BM10', 'FS:A1', 'BS:A1', 'FS:BM11']);
    expect(run.observations[3].reading).toBeCloseTo(1.95542, 8);
    expect(run.observations[2].distance).toBeCloseTo(27.1, 8);
    const res = computeLevelRun(run);
    expect(res.rows[1].elevation).toBeCloseTo(250.52122, 6);
    expect(res.closure.computedEnd).toBeCloseTo(249.87594, 6);
    expect(r.warnings.some((w) => w.startsWith('Cota de'))).toBe(false);
  });

  it('acepta alias alemanes y pies', () => {
    const t = [
      'For M5|Adr    12|KD1   122012                  3|                      |                      |Z         0.00000 m   |',
      'For M5|Adr    13|KD1   122012      07:47:275   3|Lr        1.57951 m   |E          28.510 m   |                      |',
      'For M5|Adr    14|KD1       31      07:47:515   3|Lv        1.48116 m   |E          29.107 m   |                      |',
    ].join('\r\n');
    const run = parseTrimbleDini(t).levelRuns[0];
    expect(run.startBM).toEqual({ name: '122012', elevation: 0 });
    expect(run.observations[1]).toMatchObject({ kind: 'FS', pointName: '31' });
    expect(run.observations[1].distance).toBeCloseTo(29.107, 6);
    const ft = 'For M5|Adr   3|KD1   BM757      1            2   10|Rb        0.50 ft       |HD         234.42 ft   |                |';
    const r2 = parseTrimbleDini(ft);
    expect(r2.levelRuns[0].observations[0].reading).toBeCloseTo(0.1524, 6);
  });
});

describe('Sokkia SDR33', () => {
  it('lee 08 y 02 con campos de 16 caracteres', () => {
    const text = fx('topo01.sdr');
    expect(detectFormat(text, 'topo01.sdr')).toBe('sokkia-sdr');
    const r = parseSokkiaSdr(text);
    expect(r.format).toBe('sokkia-sdr');
    expect(r.points.map((p) => p.name)).toEqual(['31', '9', '10', 'BM-A', '11']);
    const p9 = byName(r.points, '9');
    expect(p9.y).toBeCloseTo(510.504, 6); // Norte
    expect(p9.x).toBeCloseTo(908.838, 6); // Este
    expect(p9.z).toBeCloseTo(19.699, 6);
    expect(p9.code).toBe('BORDE');
    expect(byName(r.points, '31').code).toBe('EST');
    expect(byName(r.points, '11').z).toBeUndefined();
    expect(r.warnings.join(' ')).toMatch(/observaciones polares/);
  });
});

describe('Topcon', () => {
  it('GTS-7: PT, NEZ y XYZ de estación', () => {
    const text = fx('topcon_gts7.gt7');
    expect(detectFormat(text)).toBe('topcon-gts');
    const r = parseTopconGts(text);
    expect(r.points.map((p) => p.name)).toEqual(['E1', '101', '102']);
    expect(byName(r.points, 'E1')).toMatchObject({ x: 285431.112, y: 8625104.556, z: 152.384, note: 'Estación' });
    expect(byName(r.points, '101')).toMatchObject({ x: 285456.903, y: 8625131.02, z: 152.91, code: 'PI' });
    expect(byName(r.points, '102')).toMatchObject({ x: 285470.25, y: 8625098.774, code: 'PI' });
    expect(r.warnings.join(' ')).toMatch(/2 observaciones polares/);
  });

  it('CSV de coordenadas de Topcon (PNEZD)', () => {
    const r = parseTopconGts(fx('topcon_coord.csv'));
    expect(r.format).toBe('topcon-gts');
    expect(r.points).toHaveLength(3);
    expect(byName(r.points, '103')).toMatchObject({ x: 285449.018, y: 8625071.305, z: 151.402, code: 'BORDE' });
  });
});

describe('NMEA', () => {
  it('GGA → UTM 18S, filtra sin fix y checksum malo, precisión GST', () => {
    const text = fx('rtk_lima.nmea') + '$GNGGA,153016.00,1226.12346,S,07655.54321,W,4,18,0.62,152.386,M,24.105,M,1.0,0001*00\n';
    expect(detectFormat(text)).toBe('nmea');
    const r = parseNmea(text);
    expect(r.points).toHaveLength(3);
    const p = r.points[0];
    expect(p.source).toBe('gnss');
    expect(p.z).toBeCloseTo(152.384, 6);
    expect(p.precision).toBeCloseTo(Math.hypot(0.01, 0.009), 9);
    expect(p.note).toContain('RTK fijo');
    // Ida y vuelta UTM → geográficas.
    const ll = utmToLatLon(p.x, p.y, 18, 'S');
    expect(ll.lat).toBeCloseTo(-12.43539083, 7);
    expect(ll.lon).toBeCloseTo(-76.92572017, 7);
    expect(p.x).toBeGreaterThan(200000);
    expect(p.y).toBeGreaterThan(8600000);
    expect(r.warnings.join(' ')).toMatch(/checksum/);
    expect(r.warnings.join(' ')).toMatch(/sin solución/);
    expect(r.warnings.join(' ')).toMatch(/flotante/);
  });

  it('zona forzada', () => {
    const r = parseNmea(fx('rtk_lima.nmea'), 17);
    const ll = utmToLatLon(r.points[0].x, r.points[0].y, 17, 'S');
    expect(ll.lon).toBeCloseTo(-76.92572017, 7);
  });
});

describe('CSV de puntos', () => {
  it('PNEZD sin encabezado (Civil 3D)', () => {
    const r = parseCsvPoints(fx('puntos_pnezd.csv'));
    expect(r.order).toBe('PNEZD');
    expect(r.points).toHaveLength(6);
    expect(byName(r.points, '101')).toMatchObject({ x: 1022.915, y: 5026.725, z: 100.604, code: 'BORDE', source: 'import' });
  });

  it('PENZD con encabezado en español, ";" y coma decimal', () => {
    const text = fx('puntos_penzd_header_es.csv');
    expect(detectFormat(text, 'p.csv')).toBe('csv-points');
    const r = parseCsvPoints(text);
    expect(r.order).toBe('PENZD');
    expect(r.points).toHaveLength(6);
    expect(byName(r.points, '104')).toMatchObject({ x: 935.965, y: 5000.559, z: 102.458, code: 'ÁRBOL' });
  });

  it('PENZD UTM separado por espacios: orden inferido por rangos', () => {
    const r = importText(fx('puntos_utm_espacios.txt'), 'puntos.txt');
    expect(r.format).toBe('csv-points');
    const p = byName(r.points, '1');
    expect(p).toMatchObject({ x: 285431.112, y: 8625104.556, z: 152.384, code: 'BM-1' });
    expect(r.warnings).toContain('Orden de columnas: PENZD');
  });

  it('orden forzado, tabulador y filas malas', () => {
    const r = parseCsvPoints('A\t10.5\t20.5\nB\tx\t1\nC\t11\t21\t5\n', { order: 'PENZ', delimiter: '\t', hasHeader: false });
    expect(r.points.map((p) => [p.name, p.x, p.y, p.z])).toEqual([
      ['A', 10.5, 20.5, undefined],
      ['C', 11, 21, 5],
    ]);
    expect(r.warnings[0]).toMatch(/Fila 2/);
  });

  it('NEZ sin nombre de punto', () => {
    const r = parseCsvPoints('8625104.556,285431.112,152.384\n8625131.020,285456.903,152.910\n');
    expect(r.order).toBe('NEZ');
    expect(r.points[1]).toMatchObject({ name: '2', x: 285456.903, y: 8625131.02 });
  });
});

describe('CSV de libreta', () => {
  it('libreta con hilos estadimétricos', () => {
    const text = fx('libreta_manual.csv');
    expect(detectFormat(text, 'libreta.csv')).toBe('csv-leveling');
    const r = parseCsvLeveling(text);
    const run = r.levelRuns[0];
    expect(run.source).toBe('csv');
    expect(run.startBM).toEqual({ name: 'BM01', elevation: 100 });
    expect(run.observations.map((o) => `${o.kind}:${o.pointName}`)).toEqual([
      'BS:BM01', 'FS:TP1', 'BS:TP1', 'FS:TP2', 'BS:TP2', 'IS:IS01', 'FS:BM02',
    ]);
    expect(run.observations[0]).toMatchObject({ upper: 1.65, lower: 1.396 });
    const res = computeLevelRun(run);
    expect(res.closure.computedEnd).toBeCloseTo(100.041, 6);
    expect(res.rows[5].elevation).toBeCloseTo(98.713, 6);
    expect(res.rows[0].distance).toBeCloseTo(25.4, 6);
  });

  it('circuito con ";" y coma decimal, cota de proyecto', () => {
    const r = importText(fx('libreta_circuito.csv'), 'circuito.csv', { runName: 'Circuito A' });
    expect(r.format).toBe('csv-leveling');
    const run = r.levelRuns[0];
    expect(run.name).toBe('Circuito A');
    expect(run.closure).toBe('loop');
    expect(run.startBM).toEqual({ name: 'BM-A', elevation: 250 });
    expect(run.observations[1]).toMatchObject({ kind: 'IS', pointName: 'R1', reading: 1.88, distance: 15.2, designElevation: 249.5 });
    const res = computeLevelRun(run);
    expect(res.rows[1].elevation).toBeCloseTo(249.545, 6);
    expect(res.closure.misclosureMm).toBeCloseTo(4, 6);
  });

  it('sin cota inicial avisa', () => {
    const r = parseCsvLeveling('Punto,VA,VI,VAd\nA,1.5,,\nB,,,1.2\n');
    expect(r.levelRuns[0].startBM.elevation).toBe(100);
    expect(r.warnings).toContain('Cota inicial no encontrada; se asumió 100.000');
  });
});

describe('detectFormat / importText', () => {
  it('formato desconocido', () => {
    expect(detectFormat('')).toBe('unknown');
    expect(detectFormat('hola mundo\nesto no es nada')).toBe('unknown');
    const r = importText('hola mundo\nesto no es nada');
    expect(r.format).toBe('unknown');
    expect(r.warnings).toContain('Formato de archivo no reconocido');
  });

  it('formato forzado', () => {
    const r = importText(fx('puntos_pnezd.csv'), undefined, { format: 'csv-points', csv: { order: 'PENZD' } });
    expect(byName(r.points, '101').x).toBeCloseTo(5026.725, 6);
  });
});
