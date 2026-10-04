/**
 * Poligonal (abierta o cerrada) con ángulos a la derecha y compensación
 * angular uniforme + compensación lineal Bowditch (brújula) o tránsito.
 *
 * Estaciones 0..m (m = nº de lados); la estación m es la de llegada (en una
 * poligonal cerrada coincide con `start`). Indexado de `angles`:
 *  - Con `backsight` / `backAzimuthDeg`: angles[i] es el ángulo en la estación i
 *    (angles[0] orienta el primer lado). Longitud m, o m+1 si hay ángulo de
 *    cierre (cerrada, o abierta con `closing.azimuthDeg`).
 *  - Con `startAzimuthDeg` (azimut del primer lado): angles[i] es el ángulo en
 *    la estación i+1. Longitud m−1, o m si hay ángulo de cierre.
 * En una cerrada el ángulo de cierre es el medido en `start` entre el último
 * vértice y el primero (ángulo interior si se recorre en sentido antihorario).
 */
import { normalizeDeg, normalizeDiffDeg } from '@/core/units';
import { azimuth, type XY } from './basic';

export interface TraverseInput {
  start: XY;
  /** Azimut del primer lado (start → P1). */
  startAzimuthDeg?: number;
  /** Punto de vista atrás desde `start`. */
  backsight?: XY;
  /** Azimut start → vista atrás (alternativa a `backsight`). */
  backAzimuthDeg?: number;
  /** Ángulos horizontales a la derecha (grados). Ver indexado arriba. */
  angles: number[];
  /** Distancias horizontales de cada lado (m). */
  distances: number[];
  /** Punto de llegada conocido (abierta) y azimut de cierre (llegada → referencia). */
  closing?: { x: number; y: number; azimuthDeg?: number };
  method: 'bowditch' | 'transit';
  closed: boolean;
}

export interface TraverseLeg {
  from: number;
  to: number;
  distance: number;
  /** Azimut con ángulos sin corregir. */
  rawAzimuth: number;
  /** Azimut con ángulos compensados. */
  azimuth: number;
  /** Proyecciones con azimut compensado, antes del ajuste lineal. */
  dx: number;
  dy: number;
  /** Correcciones lineales. */
  cx: number;
  cy: number;
}

export interface TraverseResult {
  legs: TraverseLeg[];
  /** Coordenadas con ángulos y distancias crudos (estaciones 0..m). */
  unadjusted: XY[];
  /** Coordenadas compensadas (angular + lineal). */
  adjusted: XY[];
  /** Error de cierre angular (grados, calculado − conocido). Sin control: undefined. */
  angularError?: number;
  angularErrorSec?: number;
  /** Corrección aplicada a cada ángulo (grados). */
  angularCorrection: number;
  /** Suma de ángulos y suma teórica (solo cerradas): (n−2)·180 o (n+2)·180. */
  angleSum?: number;
  angleSumTheoretical?: number;
  /** Errores de cierre lineal (tras compensar ángulos). */
  errorX?: number;
  errorY?: number;
  linearError?: number;
  perimeter: number;
  /** Precisión relativa 1/N (N = perímetro / error lineal). */
  precision?: number;
  precisionLabel?: string;
}

export function traverse(inp: TraverseInput): TraverseResult {
  const m = inp.distances.length;
  if (m === 0) throw new Error('La poligonal no tiene lados');

  // Ángulos por estación (undefined = no medido).
  const atSt: (number | undefined)[] = new Array(m + 1).fill(undefined);
  let firstAz: number | undefined;
  let byBack = false;
  if (inp.backsight || inp.backAzimuthDeg !== undefined) {
    byBack = true;
    inp.angles.forEach((a, i) => { if (i <= m) atSt[i] = a; });
    if (atSt[0] === undefined) throw new Error('Falta el ángulo en la estación inicial');
  } else if (inp.startAzimuthDeg !== undefined) {
    firstAz = inp.startAzimuthDeg;
    inp.angles.forEach((a, i) => { if (i + 1 <= m) atSt[i + 1] = a; });
  } else {
    throw new Error('Falta la orientación: startAzimuthDeg, backsight o backAzimuthDeg');
  }
  for (let i = 1; i < m; i++) {
    if (atSt[i] === undefined) throw new Error(`Falta el ángulo en la estación ${i}`);
  }
  const backAz = inp.backsight ? azimuth(inp.start, inp.backsight) : inp.backAzimuthDeg;

  // Azimut conocido de cierre y ángulos que intervienen.
  let knownClosingAz: number | undefined;
  const hasClosingAngle = atSt[m] !== undefined;
  if (hasClosingAngle) {
    if (inp.closed) knownClosingAz = byBack ? undefined : firstAz;
    else if (inp.closing?.azimuthDeg !== undefined) knownClosingAz = inp.closing.azimuthDeg;
  }
  if (inp.closed && byBack && hasClosingAngle) {
    // Cerrada orientada por vista atrás: el azimut del primer lado se conoce tras orientar.
    knownClosingAz = normalizeDeg((backAz as number) + (atSt[0] as number));
  }

  const used: number[] = [];
  for (let i = byBack ? 0 : 1; i <= m; i++) if (atSt[i] !== undefined) used.push(i);

  const propagate = (corr: number): { legAz: number[]; closingAz?: number } => {
    const legAz: number[] = [];
    // En cerrada con vista atrás el primer lado queda fijo (orientación): atSt[0]
    // no se compensa y el control es el regreso a ese azimut.
    let az = byBack
      ? normalizeDeg((backAz as number) + (atSt[0] as number) + (inp.closed ? 0 : corr))
      : (firstAz as number);
    legAz.push(az);
    for (let i = 1; i < m; i++) {
      az = normalizeDeg(az + 180 + (atSt[i] as number) + corr);
      legAz.push(az);
    }
    const closingAz = hasClosingAngle ? normalizeDeg(az + 180 + (atSt[m] as number) + corr) : undefined;
    return { legAz, closingAz };
  };

  const raw = propagate(0);
  let angularError: number | undefined;
  let corr = 0;
  if (knownClosingAz !== undefined && raw.closingAz !== undefined) {
    angularError = normalizeDiffDeg(raw.closingAz - knownClosingAz);
    // Ángulos compensables: en cerrada con vista atrás no se corrige atSt[0].
    const nAdj = inp.closed && byBack ? used.length - 1 : used.length;
    corr = -angularError / nAdj;
  }
  const adj = propagate(corr);

  const coords = (azs: number[]): { pts: XY[]; d: { dx: number; dy: number }[] } => {
    const pts: XY[] = [{ x: inp.start.x, y: inp.start.y }];
    const d: { dx: number; dy: number }[] = [];
    for (let i = 0; i < m; i++) {
      const a = (azs[i] * Math.PI) / 180;
      const dx = inp.distances[i] * Math.sin(a);
      const dy = inp.distances[i] * Math.cos(a);
      d.push({ dx, dy });
      const p = pts[i];
      pts.push({ x: p.x + dx, y: p.y + dy });
    }
    return { pts, d };
  };

  const un = coords(raw.legAz);
  const ca = coords(adj.legAz);
  const perimeter = inp.distances.reduce((s, v) => s + v, 0);

  const target: XY | undefined = inp.closed ? inp.start : inp.closing ? { x: inp.closing.x, y: inp.closing.y } : undefined;
  const legs: TraverseLeg[] = [];
  const adjusted: XY[] = [{ x: inp.start.x, y: inp.start.y }];
  let errorX: number | undefined;
  let errorY: number | undefined;
  let linearError: number | undefined;
  let precision: number | undefined;
  if (target) {
    const end = ca.pts[m];
    errorX = end.x - target.x;
    errorY = end.y - target.y;
    linearError = Math.hypot(errorX, errorY);
    precision = linearError > 0 ? perimeter / linearError : Infinity;
  }
  const sumAbsDx = ca.d.reduce((s, v) => s + Math.abs(v.dx), 0);
  const sumAbsDy = ca.d.reduce((s, v) => s + Math.abs(v.dy), 0);
  for (let i = 0; i < m; i++) {
    const { dx, dy } = ca.d[i];
    let cx = 0;
    let cy = 0;
    if (errorX !== undefined && errorY !== undefined) {
      if (inp.method === 'transit') {
        cx = sumAbsDx > 0 ? (-errorX * Math.abs(dx)) / sumAbsDx : 0;
        cy = sumAbsDy > 0 ? (-errorY * Math.abs(dy)) / sumAbsDy : 0;
      } else {
        cx = (-errorX * inp.distances[i]) / perimeter;
        cy = (-errorY * inp.distances[i]) / perimeter;
      }
    }
    const p = adjusted[i];
    adjusted.push({ x: p.x + dx + cx, y: p.y + dy + cy });
    legs.push({
      from: i,
      to: i + 1,
      distance: inp.distances[i],
      rawAzimuth: raw.legAz[i],
      azimuth: adj.legAz[i],
      dx,
      dy,
      cx,
      cy,
    });
  }
  if (target) adjusted[m] = { x: target.x, y: target.y };

  let angleSum: number | undefined;
  let angleSumTheoretical: number | undefined;
  if (inp.closed && hasClosingAngle) {
    // Ángulos en los vértices 1..m (m = start).
    angleSum = 0;
    for (let i = 1; i <= m; i++) angleSum += atSt[i] as number;
    const interior = (m - 2) * 180;
    const exterior = (m + 2) * 180;
    angleSumTheoretical = Math.abs(angleSum - interior) <= Math.abs(angleSum - exterior) ? interior : exterior;
  }

  return {
    legs,
    unadjusted: un.pts,
    adjusted,
    angularError,
    angularErrorSec: angularError === undefined ? undefined : angularError * 3600,
    angularCorrection: corr,
    angleSum,
    angleSumTheoretical,
    errorX,
    errorY,
    linearError,
    perimeter,
    precision,
    precisionLabel: precision === undefined ? undefined : Number.isFinite(precision) ? `1/${Math.round(precision)}` : '1/∞',
  };
}
