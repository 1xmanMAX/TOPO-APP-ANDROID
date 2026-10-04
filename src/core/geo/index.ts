/**
 * Geodesia: UTM ↔ geográficas sobre WGS84 con las series de Krüger hasta n⁶
 * (Karney 2011). Error < 5 nm dentro de la zona, muy por debajo de 1 mm.
 * Sin excepciones de Noruega/Svalbard (irrelevantes para Perú).
 */

export const WGS84 = { a: 6378137, f: 1 / 298.257223563 } as const;
export const UTM_K0 = 0.9996;

const { a, f } = WGS84;
const e2 = f * (2 - f);
const e = Math.sqrt(e2);
const n = f / (2 - f);
const n2 = n * n, n3 = n2 * n, n4 = n3 * n, n5 = n4 * n, n6 = n5 * n;
/** Radio rectificante. */
const A = (a / (1 + n)) * (1 + n2 / 4 + n4 / 64 + n6 / 256);

const ALPHA = [
  0,
  n / 2 - (2 * n2) / 3 + (5 * n3) / 16 + (41 * n4) / 180 - (127 * n5) / 288 + (7891 * n6) / 37800,
  (13 * n2) / 48 - (3 * n3) / 5 + (557 * n4) / 1440 + (281 * n5) / 630 - (1983433 * n6) / 1935360,
  (61 * n3) / 240 - (103 * n4) / 140 + (15061 * n5) / 26880 + (167603 * n6) / 181440,
  (49561 * n4) / 161280 - (179 * n5) / 168 + (6601661 * n6) / 7257600,
  (34729 * n5) / 80640 - (3418889 * n6) / 1995840,
  (212378941 * n6) / 319334400,
];
const BETA = [
  0,
  n / 2 - (2 * n2) / 3 + (37 * n3) / 96 - n4 / 360 - (81 * n5) / 512 + (96199 * n6) / 604800,
  n2 / 48 + n3 / 15 - (437 * n4) / 1440 + (46 * n5) / 105 - (1118711 * n6) / 3870720,
  (17 * n3) / 480 - (37 * n4) / 840 - (209 * n5) / 4480 + (5569 * n6) / 90720,
  (4397 * n4) / 161280 - (11 * n5) / 504 - (830251 * n6) / 7257600,
  (4583 * n5) / 161280 - (108847 * n6) / 3991680,
  (20648693 * n6) / 638668800,
];

const D2R = Math.PI / 180;
const FALSE_E = 500000;
const FALSE_N_S = 10000000;

export type Hemisphere = 'N' | 'S';

export interface UtmCoord {
  E: number;
  N: number;
  zone: number;
  hemisphere: Hemisphere;
  /** Convergencia de meridianos γ (grados): ángulo del norte geográfico al norte de cuadrícula. */
  convergence: number;
  /** Factor de escala puntual k. */
  scaleFactor: number;
}

export interface LatLon {
  lat: number;
  lon: number;
  convergence: number;
  scaleFactor: number;
}

/** Zona UTM (1..60) para una longitud. */
export function zoneFromLon(lon: number): number {
  const l = ((((lon + 180) % 360) + 360) % 360);
  return Math.min(60, Math.floor(l / 6) + 1);
}

export function centralMeridian(zone: number): number {
  return zone * 6 - 183;
}

export function latLonToUtm(lat: number, lon: number, forceZone?: number): UtmCoord {
  if (lat < -80.5 || lat > 84.5) throw new Error('Latitud fuera del rango UTM');
  const zone = forceZone ?? zoneFromLon(lon);
  let dLon = lon - centralMeridian(zone);
  dLon = ((((dLon + 180) % 360) + 360) % 360) - 180;
  const phi = lat * D2R;
  const lam = dLon * D2R;
  const cosL = Math.cos(lam);
  const sinL = Math.sin(lam);
  const tanL = Math.tan(lam);

  const tau = Math.tan(phi);
  const sigma = Math.sinh(e * Math.atanh((e * tau) / Math.sqrt(1 + tau * tau)));
  const taup = tau * Math.sqrt(1 + sigma * sigma) - sigma * Math.sqrt(1 + tau * tau);

  const xip = Math.atan2(taup, cosL);
  const etap = Math.asinh(sinL / Math.sqrt(taup * taup + cosL * cosL));

  let xi = xip;
  let eta = etap;
  let pp = 1;
  let qp = 0;
  for (let j = 1; j <= 6; j++) {
    const c = Math.cos(2 * j * xip), s = Math.sin(2 * j * xip);
    const ch = Math.cosh(2 * j * etap), sh = Math.sinh(2 * j * etap);
    xi += ALPHA[j] * s * ch;
    eta += ALPHA[j] * c * sh;
    pp += 2 * j * ALPHA[j] * c * ch;
    qp += 2 * j * ALPHA[j] * s * sh;
  }
  const x = UTM_K0 * A * eta;
  const y = UTM_K0 * A * xi;

  const gammaP = Math.atan((taup / Math.sqrt(1 + taup * taup)) * tanL);
  const gammaPP = Math.atan2(qp, pp);
  const gamma = gammaP + gammaPP;

  const sinPhi = Math.sin(phi);
  const kp = (Math.sqrt(1 - e2 * sinPhi * sinPhi) * Math.sqrt(1 + tau * tau)) / Math.sqrt(taup * taup + cosL * cosL);
  const kpp = (A / a) * Math.sqrt(pp * pp + qp * qp);

  const hemisphere: Hemisphere = lat < 0 ? 'S' : 'N';
  return {
    E: x + FALSE_E,
    N: hemisphere === 'S' ? y + FALSE_N_S : y,
    zone,
    hemisphere,
    convergence: gamma / D2R,
    scaleFactor: UTM_K0 * kp * kpp,
  };
}

export function utmToLatLon(E: number, N: number, zone: number, hemisphere: Hemisphere): LatLon {
  const x = E - FALSE_E;
  const y = hemisphere === 'S' ? N - FALSE_N_S : N;
  const eta = x / (UTM_K0 * A);
  const xi = y / (UTM_K0 * A);

  let xip = xi;
  let etap = eta;
  let p = 1;
  let q = 0;
  for (let j = 1; j <= 6; j++) {
    const c = Math.cos(2 * j * xi), s = Math.sin(2 * j * xi);
    const ch = Math.cosh(2 * j * eta), sh = Math.sinh(2 * j * eta);
    xip -= BETA[j] * s * ch;
    etap -= BETA[j] * c * sh;
    p -= 2 * j * BETA[j] * c * ch;
    q += 2 * j * BETA[j] * s * sh;
  }
  const sinhEtap = Math.sinh(etap);
  const sinXip = Math.sin(xip);
  const cosXip = Math.cos(xip);
  const taup = sinXip / Math.sqrt(sinhEtap * sinhEtap + cosXip * cosXip);

  // Newton-Raphson para τ = tan φ.
  let tau = taup;
  for (let it = 0; it < 20; it++) {
    const sigma = Math.sinh(e * Math.atanh((e * tau) / Math.sqrt(1 + tau * tau)));
    const taui = tau * Math.sqrt(1 + sigma * sigma) - sigma * Math.sqrt(1 + tau * tau);
    const d =
      ((taup - taui) / Math.sqrt(1 + taui * taui)) *
      ((1 + (1 - e2) * tau * tau) / ((1 - e2) * Math.sqrt(1 + tau * tau)));
    tau += d;
    if (Math.abs(d) < 1e-14) break;
  }
  const phi = Math.atan(tau);
  const lam = Math.atan2(sinhEtap, cosXip);

  const gammaP = Math.atan(Math.tan(xip) * Math.tanh(etap));
  const gammaPP = Math.atan2(q, p);
  const sinPhi = Math.sin(phi);
  const kp =
    Math.sqrt(1 - e2 * sinPhi * sinPhi) * Math.sqrt(1 + tau * tau) * Math.sqrt(sinhEtap * sinhEtap + cosXip * cosXip);
  const kpp = A / a / Math.sqrt(p * p + q * q);

  return {
    lat: phi / D2R,
    lon: centralMeridian(zone) + lam / D2R,
    convergence: (gammaP + gammaPP) / D2R,
    scaleFactor: UTM_K0 * kp * kpp,
  };
}

/** Radio medio terrestre usado para el factor de elevación (m). */
export const MEAN_EARTH_RADIUS = 6371000;

/** Factor de elevación R/(R+h) (h ≈ altura elipsoidal; con cota ortométrica el error es despreciable en obra). */
export function elevationFactor(elevation: number, R = MEAN_EARTH_RADIUS): number {
  return R / (R + elevation);
}

/** Factor combinado = k (escala UTM) × factor de elevación. */
export function combinedScaleFactor(k: number, elevation: number, R = MEAN_EARTH_RADIUS): number {
  return k * elevationFactor(elevation, R);
}

/** Distancia topográfica (terreno) → distancia UTM (cuadrícula). */
export function groundToGrid(groundDist: number, csf: number): number {
  return groundDist * csf;
}

/** Distancia UTM (cuadrícula) → distancia topográfica (terreno). */
export function gridToGround(gridDist: number, csf: number): number {
  return gridDist / csf;
}
