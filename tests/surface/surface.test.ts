import {
  buildTin, contours, elevationAt, profileAlong, slopeStats, triangleCount,
  volumeAverageEndArea, volumeBetween, volumePrismoidal,
} from '@/core/surface';
import { areaPerimeter } from '@/core/cogo';

const square = (f: (x: number, y: number) => number) =>
  [[0, 0], [10, 0], [10, 10], [0, 10]].map(([x, y]) => ({ x, y, z: f(x, y) }));

const plane = buildTin(square((_x, y) => y)); // z = y
const pyramid = buildTin([...square(() => 0), { x: 5, y: 5, z: 10 }]);

describe('TIN', () => {
  test('triangulación e interpolación', () => {
    expect(triangleCount(plane)).toBe(2);
    expect(triangleCount(pyramid)).toBe(4);
    expect(elevationAt(plane, 3, 7)).toBeCloseTo(7, 12);
    expect(elevationAt(plane, 10, 5)).toBeCloseTo(5, 12); // en el borde
    expect(elevationAt(plane, 11, 5)).toBeUndefined();
    expect(elevationAt(pyramid, 5, 5)).toBeCloseTo(10, 12);
    expect(elevationAt(pyramid, 2.5, 5)).toBeCloseTo(5, 12);
    expect(elevationAt(pyramid, 1, 1)).toBeCloseTo(2, 12);
  });
  test('coordenadas UTM grandes', () => {
    const t = buildTin(square((x, y) => x + y).map((p) => ({ ...p, x: p.x + 280000, y: p.y + 8667000 })));
    expect(elevationAt(t, 280002, 8667003)).toBeCloseTo(5, 9);
  });
  test('menos de 3 puntos: sin triángulos', () => {
    const t = buildTin([{ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }]);
    expect(triangleCount(t)).toBe(0);
    expect(elevationAt(t, 0.5, 0.5)).toBeUndefined();
  });
});

describe('curvas de nivel', () => {
  test('plano inclinado: rectas y maestras', () => {
    const c = contours(plane, 2.5, 0, 2);
    const levels = c.map((l) => l.elevation);
    expect(levels).toEqual(expect.arrayContaining([2.5, 5, 7.5]));
    const c5 = c.find((l) => l.elevation === 5)!;
    expect(c5.master).toBe(true);
    expect(c.find((l) => l.elevation === 2.5)!.master).toBe(false);
    expect(c5.lines).toHaveLength(1);
    const xs = c5.lines[0].map((p) => p[0]).sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(0, 9);
    expect(xs[xs.length - 1]).toBeCloseTo(10, 9);
    for (const p of c5.lines[0]) expect(p[1]).toBeCloseTo(5, 9);
  });
  test('pirámide: curva cerrada de 25 m²', () => {
    const c = contours(pyramid, 5);
    const c5 = c.find((l) => l.elevation === 5)!;
    expect(c5.master).toBe(false);
    expect(c5.lines).toHaveLength(1);
    const line = c5.lines[0];
    expect(line[0]).toEqual(line[line.length - 1]);
    expect(line).toHaveLength(5);
    expect(areaPerimeter(line.slice(0, -1).map(([x, y]) => ({ x, y }))).area).toBeCloseTo(25, 9);
    expect(c.find((l) => l.elevation === 10)).toBeUndefined(); // pico puntual descartado
  });
});

describe('volúmenes', () => {
  test('prismas exactos contra plano', () => {
    const v0 = volumeBetween(pyramid, 0);
    expect(v0.method).toBe('prism');
    expect(v0.cut).toBeCloseTo(1000 / 3, 9);
    expect(v0.fill).toBeCloseTo(0, 12);
    expect(v0.area).toBeCloseTo(100, 12);
    const v5 = volumeBetween(pyramid, 5);
    expect(v5.cut).toBeCloseTo(125 / 3, 9);
    expect(v5.fill).toBeCloseTo(625 / 3, 9);
    expect(v5.net).toBeCloseTo(-500 / 3, 9);
  });
  test('malla contra plano y entre TIN', () => {
    const g = volumeBetween(pyramid, 0, 0.1);
    expect(g.method).toBe('grid');
    expect(Math.abs(g.cut - 1000 / 3)).toBeLessThan(0.5);
    const up = buildTin(square((_x, y) => y + 1));
    const d = volumeBetween(up, plane, 1);
    expect(d.cut).toBeCloseTo(100, 9);
    expect(d.fill).toBe(0);
    expect(d.area).toBeCloseTo(100, 9);
    const r = volumeBetween(plane, up, 1);
    expect(r.fill).toBeCloseTo(100, 9);
  });
  test('áreas extremas promediadas', () => {
    const v = volumeAverageEndArea([
      { station: 20, cutArea: 20, fillArea: 4 },
      { station: 0, cutArea: 10, fillArea: 0 },
      { station: 40, cutArea: 0, fillArea: 6 },
    ]);
    expect(v.cut).toBeCloseTo(500, 9);
    expect(v.fill).toBeCloseTo(140, 9);
    expect(v.net).toBeCloseTo(360, 9);
    expect(v.segments).toHaveLength(2);
  });
  test('prismoidal exacto para áreas cuadráticas', () => {
    const q = (s: number) => ({ station: s, cutArea: s * s, fillArea: 0 });
    expect(volumePrismoidal([q(0), q(10), q(20)]).cut).toBeCloseTo(8000 / 3, 9);
    expect(volumePrismoidal([q(0), q(5), q(20)]).cut).toBeCloseTo(8000 / 3, 9);
    expect(volumeAverageEndArea([q(0), q(10), q(20)]).cut).toBeCloseTo(3000, 9);
    // 4 secciones: Simpson + último tramo por áreas extremas
    expect(volumePrismoidal([q(0), q(10), q(20), q(30)]).cut).toBeCloseTo(8000 / 3 + 6500, 9);
  });
});

describe('perfil y pendientes', () => {
  test('perfil longitudinal', () => {
    const p = profileAlong(plane, [{ x: 5, y: 0 }, { x: 5, y: 10 }, { x: 15, y: 10 }], 4);
    expect(p.map((q) => q.dist)).toEqual([0, 4, 8, 10, 12, 16, 20]);
    expect(p[1].z).toBeCloseTo(4, 12);
    expect(p[3].z).toBeCloseTo(10, 12);
    expect(p[4].z).toBeCloseTo(10, 12);
    expect(p[5].z).toBeUndefined();
  });
  test('estadísticas de pendiente', () => {
    const s = slopeStats(plane);
    expect(s.min).toBeCloseTo(100, 9);
    expect(s.max).toBeCloseTo(100, 9);
    expect(slopeStats(pyramid).mean).toBeCloseTo(200, 9);
    const flat = slopeStats(buildTin(square((_x, y) => 0.001 * y)));
    expect(flat.mean).toBeCloseTo(0.1, 9);
    expect(flat.flat).toHaveLength(2);
    expect(slopeStats(plane, 150).flat).toHaveLength(2);
  });
});
