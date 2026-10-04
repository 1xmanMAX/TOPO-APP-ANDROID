import {
  areaPerimeter, bearing, curveStakeout, horizontalCurve, intersectionByAzimuths,
  intersectionByDistances, inverse, parseStation, pointToAlignment, polar,
  radiateFromStation, stationFormat, traverse,
} from '@/core/cogo';

describe('inverso y rumbos', () => {
  test('inverso 3D a 45°', () => {
    const r = inverse({ x: 0, y: 0, z: 100 }, { x: 100, y: 100, z: 110 });
    expect(r.dh).toBeCloseTo(141.421356, 6);
    expect(r.azimuth).toBeCloseTo(45, 12);
    expect(r.bearing).toBe('N 45°00\'00" E');
    expect(r.dz).toBe(10);
    expect(r.slopeDist).toBeCloseTo(141.774469, 6);
    expect(r.slopePercent).toBeCloseTo(7.0710678, 6);
  });
  test('cuadrantes', () => {
    const r = inverse({ x: 0, y: 0 }, { x: -3, y: -4 });
    expect(r.dh).toBe(5);
    expect(r.azimuth).toBeCloseTo(216.8698976, 6);
    expect(r.bearing).toBe('S 36°52\'12" W');
    expect(r.dz).toBeUndefined();
    expect(bearing(135.5)).toBe('S 44°30\'00" E');
    expect(bearing(300)).toBe('N 60°00\'00" W');
  });
});

describe('radiación', () => {
  test('polar', () => {
    const p = polar({ x: 1000, y: 2000, z: 50 }, 30, 100, -2);
    expect(p.x).toBeCloseTo(1050, 9);
    expect(p.y).toBeCloseTo(2086.6025404, 6);
    expect(p.z).toBe(48);
  });
  test('estación total horizontal', () => {
    const p = radiateFromStation({
      station: { x: 1000, y: 1000, z: 100 }, backsight: { x: 1000, y: 1100 },
      hiInstr: 1.5, hz: 90, vz: 90, slopeDist: 50, targetHeight: 1.5,
    });
    expect(p.x).toBeCloseTo(1050, 9);
    expect(p.y).toBeCloseTo(1000, 9);
    expect(p.z).toBeCloseTo(100, 9);
  });
  test('estación total inclinada con lectura de orientación', () => {
    const p = radiateFromStation({
      station: { x: 1000, y: 1000, z: 100 }, backAzimuthDeg: 30, hzBacksight: 15,
      hiInstr: 1.55, hz: 135, vz: 80, slopeDist: 100, targetHeight: 1.8,
    });
    expect(p.azimuth).toBeCloseTo(150, 12);
    expect(p.horizontalDist).toBeCloseTo(98.4807753, 6);
    expect(p.x).toBeCloseTo(1049.2403877, 6);
    expect(p.y).toBeCloseTo(914.7131469, 6);
    expect(p.z).toBeCloseTo(117.1148178, 6);
  });
  test('sin orientación lanza error', () => {
    expect(() => radiateFromStation({ station: { x: 0, y: 0 }, hiInstr: 1, hz: 0, vz: 90, slopeDist: 1, targetHeight: 1 })).toThrow();
  });
});

describe('intersecciones', () => {
  test('por azimuts', () => {
    const p = intersectionByAzimuths({ x: 0, y: 0 }, 45, { x: 100, y: 0 }, 315);
    expect(p!.x).toBeCloseTo(50, 9);
    expect(p!.y).toBeCloseTo(50, 9);
    expect(intersectionByAzimuths({ x: 0, y: 0 }, 10, { x: 5, y: 0 }, 190)).toBeNull();
  });
  test('por distancias', () => {
    const s = intersectionByDistances({ x: 0, y: 0 }, 5, { x: 8, y: 0 }, 5);
    expect(s).toHaveLength(2);
    expect(s[0].x).toBeCloseTo(4, 9);
    expect(s[0].y).toBeCloseTo(-3, 9); // a la derecha de p1→p2 (hacia el Este)
    expect(s[1].y).toBeCloseTo(3, 9);
    const t = intersectionByDistances({ x: 0, y: 0 }, 4, { x: 8, y: 0 }, 4);
    expect(t).toHaveLength(1);
    expect(t[0].x).toBeCloseTo(4, 9);
    expect(intersectionByDistances({ x: 0, y: 0 }, 1, { x: 8, y: 0 }, 1)).toEqual([]);
  });
});

describe('áreas', () => {
  test('cuadrado antihorario', () => {
    const r = areaPerimeter([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]);
    expect(r.area).toBe(100);
    expect(r.hectares).toBe(0.01);
    expect(r.perimeter).toBe(40);
    expect(r.clockwise).toBe(false);
  });
  test('triángulo 3-4-5 en coordenadas UTM, horario', () => {
    const E = 500000, N = 8600000;
    const r = areaPerimeter([{ x: E, y: N }, { x: E, y: N + 3 }, { x: E + 4, y: N }]);
    expect(r.area).toBeCloseTo(6, 9);
    expect(r.perimeter).toBeCloseTo(12, 9);
    expect(r.clockwise).toBe(true);
  });
});

describe('poligonal', () => {
  const start = { x: 1000, y: 1000 };
  test('cuadrado perfecto cerrado', () => {
    const r = traverse({ start, startAzimuthDeg: 90, angles: [90, 90, 90, 90], distances: [100, 100, 100, 100], method: 'bowditch', closed: true });
    expect(r.angleSum).toBe(360);
    expect(r.angleSumTheoretical).toBe(360);
    expect(r.angularError).toBeCloseTo(0, 9);
    expect(r.linearError).toBeCloseTo(0, 9);
    expect(r.precisionLabel).toMatch(/^1\/(∞|\d{9,})$/);
    expect(r.adjusted[2].x).toBeCloseTo(1100, 9);
    expect(r.adjusted[2].y).toBeCloseTo(1100, 9);
  });

  test('cerrada con errores: compensación angular y Bowditch', () => {
    const r = traverse({
      start, startAzimuthDeg: 90,
      angles: [90.001, 89.999, 90.002, 90.0],
      distances: [100.02, 99.99, 100.01, 99.98],
      method: 'bowditch', closed: true,
    });
    expect(r.angleSum).toBeCloseTo(360.002, 9);
    expect(r.angularErrorSec).toBeCloseTo(7.2, 6);
    expect(r.angularCorrection).toBeCloseTo(-0.0005, 9);
    expect(r.legs[1].azimuth).toBeCloseTo(0.0005, 9);
    expect(r.legs[3].azimuth).toBeCloseTo(180.0005, 9);
    expect(r.errorX).toBeCloseTo(0.0100001, 6);
    expect(r.errorY).toBeCloseTo(0.0082545, 6);
    expect(r.linearError).toBeCloseTo(0.012966, 5);
    expect(r.precision!).toBeGreaterThan(30800);
    expect(r.precision!).toBeLessThan(30900);
    expect(r.legs[0].cx).toBeCloseTo(-0.0025005, 6);
    expect(r.adjusted[1].x).toBeCloseTo(1100.0174995, 6);
    expect(r.adjusted[4]).toEqual(start);
    // Sin compensar, el punto final no coincide con el inicio.
    expect(Math.hypot(r.unadjusted[4].x - 1000, r.unadjusted[4].y - 1000)).toBeGreaterThan(0.01);
  });

  test('tránsito vs Bowditch', () => {
    const base = { start, startAzimuthDeg: 90, angles: [90, 90, 90, 90], distances: [100.02, 100, 100, 100], closed: true };
    const t = traverse({ ...base, method: 'transit' });
    expect(t.errorX).toBeCloseTo(0.02, 9);
    expect(t.legs[0].cx).toBeCloseTo((-0.02 * 100.02) / 200.02, 9);
    expect(t.legs[1].cx).toBeCloseTo(0, 9); // lado N-S sin proyección en X
    expect(t.adjusted[1].x).toBeCloseTo(1100.009999, 6);
    const b = traverse({ ...base, method: 'bowditch' });
    expect(b.legs[0].cx).toBeCloseTo((-0.02 * 100.02) / 400.02, 9);
  });

  test('abierta con vista atrás y azimut de cierre', () => {
    const r = traverse({
      start: { x: 0, y: 0 }, backsight: { x: 0, y: -100 },
      angles: [180, 270, 90], distances: [100, 50],
      closing: { x: 50, y: 100, azimuthDeg: 0.001 },
      method: 'bowditch', closed: false,
    });
    expect(r.unadjusted[2].x).toBeCloseTo(50, 9);
    expect(r.unadjusted[2].y).toBeCloseTo(100, 9);
    expect(r.angularError).toBeCloseTo(-0.001, 9);
    expect(r.angularCorrection).toBeCloseTo(0.001 / 3, 9);
    expect(r.adjusted[2]).toEqual({ x: 50, y: 100 });
  });

  test('abierta sin control: solo coordenadas', () => {
    const r = traverse({ start: { x: 0, y: 0 }, startAzimuthDeg: 0, angles: [90], distances: [10, 10], method: 'bowditch', closed: false });
    expect(r.angularError).toBeUndefined();
    expect(r.linearError).toBeUndefined();
    expect(r.adjusted[2].x).toBeCloseTo(-10, 9); // 90° a la derecha desde la vista atrás (Sur) = Oeste
    expect(r.adjusted[2].y).toBeCloseTo(10, 9);
  });
});

describe('curvas y progresivas', () => {
  test('elementos de curva R=100 Δ=60°', () => {
    const c = horizontalCurve({ R: 100, deltaDeg: 60 });
    expect(c.T).toBeCloseTo(57.735027, 6);
    expect(c.L).toBeCloseTo(104.719755, 6);
    expect(c.LC).toBeCloseTo(100, 9);
    expect(c.E).toBeCloseTo(15.470054, 6);
    expect(c.M).toBeCloseTo(13.39746, 5);
  });
  test('tabla de deflexiones', () => {
    const rows = curveStakeout({ R: 100, deltaDeg: 60, pcStation: 1012.34, interval: 20 });
    expect(rows.map((r) => r.label)).toEqual(['PC', '', '', '', '', '', 'PT']);
    expect(rows[1].station).toBe(1020);
    expect(rows[1].deflection).toBeCloseTo(2.19443, 5);
    expect(rows[1].chord).toBeCloseTo(7.658127, 5);
    expect(rows[2].chord).toBeCloseTo(200 * Math.sin(0.1), 9);
    expect(rows[6].station).toBeCloseTo(1117.059755, 6);
    expect(rows[6].deflection).toBeCloseTo(30, 9);
    expect(rows[6].chordFromPC).toBeCloseTo(100, 9);
    expect(rows[6].deflectionDms).toBe('30°00\'00.0"');
  });
  test('formato de progresivas', () => {
    expect(stationFormat(1120.5)).toBe('1+120.50');
    expect(stationFormat(5)).toBe('0+005.00');
    expect(stationFormat(999.999)).toBe('1+000.00');
    expect(stationFormat(-20)).toBe('-0+020.00');
    expect(stationFormat(120, 0)).toBe('0+120');
    expect(parseStation('1+120.50')).toBe(1120.5);
    expect(parseStation(' 0+020 ')).toBe(20);
    expect(parseStation('120.5')).toBe(120.5);
    expect(parseStation('abc')).toBeNull();
  });
  test('punto respecto a eje', () => {
    const r = pointToAlignment({ x: 1, y: 5 }, { x: 0, y: 0 }, { x: 0, y: 10 });
    expect(r.station).toBeCloseTo(5, 12);
    expect(r.offset).toBeCloseTo(1, 12);
    expect(r.within).toBe(true);
    const s = pointToAlignment({ x: -2, y: 12 }, { x: 0, y: 0 }, { x: 0, y: 10 }, 1000);
    expect(s.station).toBeCloseTo(1012, 12);
    expect(s.offset).toBeCloseTo(-2, 12);
    expect(s.within).toBe(false);
    const d = pointToAlignment({ x: 10, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 10 });
    expect(d.station).toBeCloseTo(7.0710678, 6);
    expect(d.offset).toBeCloseTo(7.0710678, 6);
    expect(d.foot.x).toBeCloseTo(5, 9);
  });
});
