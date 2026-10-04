import {
  centralMeridian, combinedScaleFactor, elevationFactor, gridToGround, groundToGrid,
  latLonToUtm, utmToLatLon, zoneFromLon,
} from '@/core/geo';

// Referencias: PROJ 9 (pyproj, EPSG:327xx) y GeographicLib (0°,0° → 31N 166021.4431 E).
describe('UTM WGS84', () => {
  test('Lima, Plaza de Armas → 18S', () => {
    const u = latLonToUtm(-12.0464, -77.0428);
    expect(u.zone).toBe(18);
    expect(u.hemisphere).toBe('S');
    expect(Math.abs(u.E - 277617.4532)).toBeLessThan(0.001);
    expect(Math.abs(u.N - 8667487.897)).toBeLessThan(0.001);
    expect(u.convergence).toBeCloseTo(0.4265162624, 8);
    expect(u.scaleFactor).toBeCloseTo(1.00021188024, 9);
  });

  test('punto publicado GeographicLib (0,0)', () => {
    const u = latLonToUtm(0, 0);
    expect(u.zone).toBe(31);
    expect(u.hemisphere).toBe('N');
    expect(u.E).toBeCloseTo(166021.4431, 4);
    expect(u.N).toBeCloseTo(0, 6);
  });

  test('Arequipa 19S y Piura 17S', () => {
    const a = latLonToUtm(-16.3989, -71.5375);
    expect(a.zone).toBe(19);
    expect(Math.abs(a.E - 228979.0859)).toBeLessThan(0.001);
    expect(Math.abs(a.N - 8185244.56)).toBeLessThan(0.001);
    expect(a.convergence).toBeCloseTo(0.7168341241, 8);
    expect(a.scaleFactor).toBeCloseTo(1.0005084097, 9);
    const p = latLonToUtm(-5.1945, -80.6328);
    expect(p.zone).toBe(17);
    expect(Math.abs(p.E - 540693.7499)).toBeLessThan(0.001);
    expect(Math.abs(p.N - 9425824.0986)).toBeLessThan(0.001);
  });

  test('zona forzada (Lima en 17S, fuera de su huso)', () => {
    const u = latLonToUtm(-12.0464, -77.0428, 17);
    expect(u.zone).toBe(17);
    expect(Math.abs(u.E - 931018.3923)).toBeLessThan(0.001);
    expect(Math.abs(u.N - 8665205.4492)).toBeLessThan(0.001);
  });

  test('hemisferio norte (Colombia)', () => {
    const u = latLonToUtm(3.5, -73.25);
    expect(Math.abs(u.E - 694400.6021)).toBeLessThan(0.001);
    expect(Math.abs(u.N - 387041.2744)).toBeLessThan(0.001);
  });

  test('ida y vuelta < 1e-9° y factores coherentes', () => {
    const pts: [number, number][] = [[-12.0464, -77.0428], [-16.3989, -71.5375], [-3.7491, -73.2538], [-18.0146, -70.2536], [0.5, -75.2], [45, 9]];
    for (const [lat, lon] of pts) {
      const u = latLonToUtm(lat, lon);
      const g = utmToLatLon(u.E, u.N, u.zone, u.hemisphere);
      expect(Math.abs(g.lat - lat)).toBeLessThan(1e-9);
      expect(Math.abs(g.lon - lon)).toBeLessThan(1e-9);
      expect(g.convergence).toBeCloseTo(u.convergence, 9);
      expect(g.scaleFactor).toBeCloseTo(u.scaleFactor, 10);
    }
  });

  test('meridiano central: k = k0 y γ = 0', () => {
    const u = latLonToUtm(-10, -75);
    expect(u.E).toBeCloseTo(500000, 6);
    expect(u.scaleFactor).toBeCloseTo(0.9996, 12);
    expect(u.convergence).toBeCloseTo(0, 12);
  });

  test('zonas', () => {
    expect(zoneFromLon(-77.0428)).toBe(18);
    expect(zoneFromLon(-81)).toBe(17);
    expect(zoneFromLon(-69)).toBe(19);
    expect(zoneFromLon(-180)).toBe(1);
    expect(zoneFromLon(179.9)).toBe(60);
    expect(centralMeridian(18)).toBe(-75);
  });
});

describe('factor combinado', () => {
  test('elevación y escala', () => {
    expect(elevationFactor(0)).toBe(1);
    expect(elevationFactor(6371)).toBeCloseTo(0.999000999, 9);
    expect(combinedScaleFactor(0.9996, 0)).toBe(0.9996);
    expect(combinedScaleFactor(1.0002, 2335)).toBeCloseTo(1.0002 * (6371000 / 6373335), 12);
  });
  test('distancias terreno ↔ UTM', () => {
    expect(groundToGrid(1000, 0.9995)).toBeCloseTo(999.5, 9);
    expect(gridToGround(999.5, 0.9995)).toBeCloseTo(1000, 9);
  });
});
