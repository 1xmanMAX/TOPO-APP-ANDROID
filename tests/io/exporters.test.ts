import type { Project, SurveyPoint } from '@/core/types';
import { computeLevelRun } from '@/core/leveling';
import { latLonToUtm } from '@/core/geo';
import {
  exportDxf,
  exportGsi16Points,
  exportKml,
  exportLandXml,
  exportLevelRunCsv,
  exportPointsCsv,
  parseCsvLeveling,
  parseCsvPoints,
  parseLeicaGsi,
  projectFromJson,
  projectToJson,
} from '@/io';

// Fixtures como texto crudo (vía Vite), sin depender de los tipos de Node.
const FIXTURES = import.meta.glob('../fixtures/*', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const fx = (name: string): string => {
  const t = FIXTURES[`../fixtures/${name}`];
  if (t === undefined) throw new Error(`Fixture no encontrado: ${name}`);
  return t;
};

const pt = (name: string, x: number, y: number, z?: number, code?: string): SurveyPoint => ({
  id: `id_${name}`,
  name,
  x,
  y,
  z,
  code,
  source: 'manual',
  createdAt: '2026-10-04T00:00:00.000Z',
});

const points: SurveyPoint[] = [
  pt('1', 285431.112, 8625104.556, 152.384, 'BM'),
  pt('2', 285456.903, 8625131.02, 152.91, 'PI'),
  pt('3', 285470.25, 8625098.774, 151.877, 'Árbol, grande'),
  pt('4', 285449.018, 8625071.305, undefined, 'BORDE'),
];

const project: Project = {
  id: 'prj1',
  name: 'Obra <Lima> & Co',
  crs: { zone: 18, hemisphere: 'S', datum: 'WGS84' },
  createdAt: '2026-10-04T00:00:00.000Z',
  updatedAt: '2026-10-04T00:00:00.000Z',
  benchmarks: [{ id: 'b1', name: 'BM-1', elevation: 152.384, x: 285400, y: 8625100, official: true }],
  points,
  levelRuns: [],
  layerControls: [],
};

/** Pares (código, valor) de un DXF. */
function dxfPairs(dxf: string): [string, string][] {
  const ls = dxf.split(/\r\n/);
  if (ls[ls.length - 1] === '') ls.pop();
  expect(ls.length % 2).toBe(0);
  const out: [string, string][] = [];
  for (let i = 0; i < ls.length; i += 2) out.push([ls[i].trim(), ls[i + 1]]);
  return out;
}

describe('CSV de puntos', () => {
  it('PNEZD ida y vuelta', () => {
    const csv = exportPointsCsv(points);
    expect(csv.split('\r\n')[0]).toBe('1,8625104.556,285431.112,152.384,BM');
    expect(csv).toContain('"Árbol, grande"');
    const back = parseCsvPoints(csv, { order: 'PNEZD' });
    expect(back.points).toHaveLength(4);
    back.points.forEach((p, i) => {
      expect(p.x).toBeCloseTo(points[i].x, 3);
      expect(p.y).toBeCloseTo(points[i].y, 3);
      expect(p.code).toBe(points[i].code);
    });
    expect(back.points[3].z).toBeUndefined();
  });

  it('PENZD con ";" se reimporta detectando el orden', () => {
    const csv = exportPointsCsv(points, 'PENZD', ';');
    expect(csv.split('\r\n')[1]).toBe('2;285456.903;8625131.020;152.910;PI');
    const back = parseCsvPoints(csv);
    expect(back.order).toBe('PENZD');
    expect(back.points[1].y).toBeCloseTo(8625131.02, 3);
  });
});

describe('CSV de libreta', () => {
  it('exporta y se reimporta con los mismos resultados', () => {
    const run = parseCsvLeveling(fx('libreta_circuito.csv')).levelRuns[0];
    const res = computeLevelRun(run);
    const csv = exportLevelRunCsv(run, res);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('Punto,VA,VI,VAd,DistVA,DistVI,DistVAd,AI,Cota,Correccion,CotaCompensada,CotaProy,CorteRelleno,Nota');
    expect(lines[1].startsWith('BM-A,1.4250,,,30.00,,,251.4250,250.0000')).toBe(true);
    // Punto de cambio en una sola fila: VA y VAd.
    expect(lines[3].startsWith('PC1,1.1020,,0.9870,')).toBe(true);
    expect(csv).toContain('Error de cierre (mm),4.0');
    const back = parseCsvLeveling(csv).levelRuns[0];
    expect(back.observations.map((o) => `${o.kind}:${o.pointName}:${o.reading}`)).toEqual(
      run.observations.map((o) => `${o.kind}:${o.pointName}:${o.reading}`),
    );
    expect(back.startBM.elevation).toBe(250);
    expect(computeLevelRun(back).closure.misclosureMm).toBeCloseTo(4, 6);
  });
});

describe('DXF R12', () => {
  it('estructura mínima, capas por código, POINT con Z y textos', () => {
    const dxf = exportDxf(project, {
      textHeight: 0.5,
      includeContours: [
        { elevation: 152, lines: [[[285430, 8625100], [285440, 8625110], [285450, 8625100]]], major: true },
        { elevation: 151.5, lines: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
      ],
    });
    const pairs = dxfPairs(dxf);
    const values = pairs.map((p) => p[1]);
    expect(pairs[0]).toEqual(['0', 'SECTION']);
    expect(pairs[pairs.length - 1]).toEqual(['0', 'EOF']);
    expect(values).toContain('AC1009');
    for (const s of ['HEADER', 'TABLES', 'ENTITIES']) expect(values).toContain(s);
    expect(pairs.filter((p) => p[0] === '0' && p[1] === 'SECTION')).toHaveLength(3);
    expect(pairs.filter((p) => p[0] === '0' && p[1] === 'ENDSEC')).toHaveLength(3);

    // Tabla LAYER con su conteo.
    const layerTab = pairs.findIndex((p, i) => p[1] === 'LAYER' && pairs[i - 1]?.[1] === 'TABLE');
    expect(layerTab).toBeGreaterThan(0);
    const count = Number(pairs[layerTab + 1][1]);
    const layerNames: string[] = [];
    for (let i = layerTab + 2; pairs[i][1] !== 'ENDTAB'; i++) {
      if (pairs[i][0] === '0' && pairs[i][1] === 'LAYER') layerNames.push(pairs[i + 1][1]);
    }
    expect(layerNames).toHaveLength(count);
    expect(layerNames).toEqual(
      expect.arrayContaining(['0', 'PTS_BM', 'PTS_PI', 'PTS_ARBOL__GRANDE', 'PTS_BORDE', 'TXT_NOMBRE', 'TXT_COTA', 'BM', 'CURVAS_MAYORES', 'CURVAS_MENORES']),
    );

    // Todas las capas usadas por entidades están declaradas.
    const ent = pairs.findIndex((p) => p[1] === 'ENTITIES');
    const used = new Set(pairs.slice(ent).filter((p) => p[0] === '8').map((p) => p[1]));
    for (const l of used) expect(layerNames).toContain(l);

    // POINT del punto 2 con Z.
    const i2 = pairs.findIndex((p, i) => p[1] === 'POINT' && pairs[i + 1][1] === 'PTS_PI');
    expect(pairs.slice(i2 + 2, i2 + 5)).toEqual([['10', '285456.9030'], ['20', '8625131.0200'], ['30', '152.9100']]);
    // Textos: nombre y cota.
    const texts = pairs.filter((p) => p[0] === '1').map((p) => p[1]);
    expect(texts).toEqual(expect.arrayContaining(['2', '152.910', 'BM-1 152.384']));
    expect(pairs.filter((p) => p[1] === 'POINT')).toHaveLength(5);
    // Punto sin cota: sin texto de cota (3 cotas de puntos + ninguna del 4).
    expect(pairs.filter((p, i) => p[1] === 'TXT_COTA' && pairs[i - 1][1] === 'TEXT')).toHaveLength(3);
    // Polilíneas: una abierta y una cerrada (70=1) con 3 vértices.
    expect(pairs.filter((p) => p[1] === 'POLYLINE')).toHaveLength(2);
    expect(pairs.filter((p) => p[1] === 'VERTEX')).toHaveLength(6);
    expect(pairs.filter((p) => p[1] === 'SEQEND')).toHaveLength(2);
  });

  it('proyecto vacío sigue siendo un DXF válido', () => {
    const pairs = dxfPairs(exportDxf({ ...project, points: [], benchmarks: [] }));
    expect(pairs[pairs.length - 1]).toEqual(['0', 'EOF']);
  });
});

describe('KML', () => {
  it('XML válido y coordenadas lon,lat', () => {
    // Punto conocido: lat −12.43539083, lon −76.92572017.
    const u = latLonToUtm(-12.43539083, -76.92572017, 18);
    const kml = exportKml([pt('G1', u.E, u.N, 152.384, 'RTK & fix')], project.crs, 'Lima <prueba>');
    expect(kml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(kml).toContain('<kml xmlns="http://www.opengis.net/kml/2.2">');
    expect(kml).toContain('<name>Lima &lt;prueba&gt;</name>');
    expect(kml).toContain('RTK &amp; fix');
    const m = /<coordinates>([^<]+)<\/coordinates>/.exec(kml)!;
    const [lon, lat, z] = m[1].split(',').map(Number);
    expect(lon).toBeCloseTo(-76.92572017, 7);
    expect(lat).toBeCloseTo(-12.43539083, 7);
    expect(z).toBeCloseTo(152.384, 6);
    // Etiquetas balanceadas.
    for (const tag of ['Placemark', 'Document', 'Folder', 'kml', 'Point', 'ExtendedData']) {
      const open = (kml.match(new RegExp(`<${tag}[ >]`, 'g')) ?? []).length;
      const close = (kml.match(new RegExp(`</${tag}>`, 'g')) ?? []).length;
      expect(open).toBe(close);
    }
  });
});

describe('LandXML 1.2', () => {
  it('CgPoints (N E Z), namespace y superficie TIN', () => {
    const xml = exportLandXml(project, {
      surface: { points: points.slice(0, 3).map((p) => ({ x: p.x, y: p.y, z: p.z! })), triangles: [0, 2, 1] },
    });
    expect(xml).toContain('xmlns="http://www.landxml.org/schema/LandXML-1.2"');
    expect(xml).toContain('version="1.2"');
    expect(xml).toContain('epsgCode="32718"');
    expect(xml).toContain('<Project name="Obra &lt;Lima&gt; &amp; Co"/>');
    expect(xml).toContain('<CgPoint name="2" code="PI" pntSurv="sideshot">8625131.0200 285456.9030 152.9100</CgPoint>');
    expect(xml).toContain('<CgPoint name="BM-1" code="BM" pntSurv="control">8625100.0000 285400.0000 152.3840</CgPoint>');
    expect(xml).toContain('>8625071.3050 285449.0180</CgPoint>');
    expect(xml).toContain('<F>1 3 2</F>');
    expect(xml).toContain('<P id="3">8625098.7740 285470.2500 151.8770</P>');
    expect((xml.match(/<CgPoint /g) ?? []).length).toBe(5);
  });
});

describe('GSI-16 de puntos', () => {
  it('ida y vuelta con parseLeicaGsi', () => {
    const gsi = exportGsi16Points(points);
    const first = gsi.split('\r\n')[0];
    expect(first).toBe(
      '*110001+0000000000000001 81..00+0000000285431112 82..00+0000008625104556 83..00+0000000000152384 71....+00000000000000BM ',
    );
    const back = parseLeicaGsi(gsi);
    expect(back.format).toBe('leica-gsi16');
    expect(back.points).toHaveLength(4);
    expect(back.points[1]).toMatchObject({ name: '2', x: 285456.903, y: 8625131.02, z: 152.91, code: 'PI' });
    expect(back.points[3].z).toBeUndefined();
  });

  it('coordenadas negativas', () => {
    const back = parseLeicaGsi(exportGsi16Points([pt('A', -12.5, 3, -1.25)]));
    expect(back.points[0]).toMatchObject({ x: -12.5, y: 3, z: -1.25 });
  });
});

describe('Respaldo JSON', () => {
  it('ida y vuelta', () => {
    const json = projectToJson(project);
    const parsed = JSON.parse(json);
    expect(parsed.app).toBe('topo-app');
    expect(parsed.version).toBe(1);
    expect(projectFromJson(json)).toEqual(project);
  });

  it('acepta proyecto sin envoltura y completa listas faltantes', () => {
    const p = projectFromJson(JSON.stringify({ name: 'X', crs: { zone: 17, hemisphere: 'S' } }));
    expect(p.points).toEqual([]);
    expect(p.levelRuns).toEqual([]);
    expect(p.crs.datum).toBe('WGS84');
    expect(typeof p.id).toBe('string');
  });

  it('errores en español', () => {
    expect(() => projectFromJson('{no')).toThrow('El archivo no es un JSON válido');
    expect(() => projectFromJson('[]')).toThrow(/objeto/);
    expect(() => projectFromJson(JSON.stringify({ app: 'otra', project: {} }))).toThrow(/no es un respaldo de TOPO APP/);
    expect(() => projectFromJson(JSON.stringify({ app: 'topo-app', version: 9, project: {} }))).toThrow(/Versión/);
    expect(() => projectFromJson(JSON.stringify({ app: 'topo-app', version: 1, project: { name: 'X', crs: { zone: 99, hemisphere: 'S' } } }))).toThrow(/Zona UTM/);
    expect(() =>
      projectFromJson(JSON.stringify({ name: 'X', crs: { zone: 18, hemisphere: 'S' }, points: [{ name: 'A', x: 'a', y: 1 }] })),
    ).toThrow(/Punto 1 inválido/);
  });
});
