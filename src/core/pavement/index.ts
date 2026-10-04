/**
 * Control de cotas por capas de pavimento / veredas.
 * Convención: desviación = medido − diseño; >0 alto (cortar), <0 bajo (rellenar).
 */
import { uid } from '@/core/id';
import { stationFormat } from '@/core/cogo';
import { trimNum } from '@/core/units';
import type {
  ComplianceStatus,
  ControlPoint,
  DesignGrade,
  ID,
  LayerCheck,
  LayerControl,
  PavementLayer,
} from '@/core/types';

/** Cota de rasante (superficie terminada) en una progresiva/desplazamiento. */
export function designElevationAt(grade: DesignGrade, station: number, offset: number): number {
  const along = grade.startElevation + (grade.longSlope / 100) * (station - grade.startStation);
  const cross = grade.crossType === 'crown' ? Math.abs(offset) : offset;
  return along - (grade.crossSlope / 100) * cross;
}

/** Cota de diseño de la capa `layerIndex` (0 = superior = rasante). */
export function layerDesignElevation(
  control: Pick<LayerControl, 'layers' | 'grade'>,
  point: Pick<ControlPoint, 'station' | 'offset' | 'designOverride'>,
  layerIndex: number,
): number {
  if (layerIndex < 0 || layerIndex >= control.layers.length) throw new Error(`Capa fuera de rango: ${layerIndex}`);
  const top = point.designOverride ?? designElevationAt(control.grade, point.station, point.offset);
  let depth = 0;
  for (let i = 0; i < layerIndex; i++) depth += control.layers[i].thickness;
  return top - depth;
}

/** Margen numérico para comparar con tolerancias (evita 0.0050000001 > 0.005). */
const EPS = 1e-9;

export function statusFor(deviation: number | undefined, tolerance: number): ComplianceStatus {
  if (deviation === undefined) return 'pending';
  const d = Math.abs(deviation);
  if (d <= tolerance + EPS) return 'ok';
  if (d <= 1.5 * tolerance + EPS) return 'warn';
  return 'fail';
}

/** Verificación de todos los puntos de control para una capa. */
export function checkLayer(control: LayerControl, layerId: ID): LayerCheck[] {
  const idx = control.layers.findIndex((l) => l.id === layerId);
  if (idx < 0) throw new Error(`Capa no encontrada: ${layerId}`);
  const tol = control.layers[idx].tolerance;
  return control.points.map((p) => {
    const design = layerDesignElevation(control, p, idx);
    const measured = p.measured[layerId];
    const has = typeof measured === 'number' && Number.isFinite(measured);
    const deviation = has ? measured - design : undefined;
    const c: LayerCheck = {
      pointId: p.id,
      layerId,
      station: p.station,
      offset: p.offset,
      design,
      status: statusFor(deviation, tol),
    };
    if (has) {
      c.measured = measured;
      c.deviation = deviation;
    }
    return c;
  });
}

export interface LayerSummary {
  total: number;
  measured: number;
  ok: number;
  warn: number;
  fail: number;
  pending: number;
  /** Mayor desviación positiva (punto más alto), 0 si no hay. */
  maxHigh: number;
  /** Mayor desviación negativa (punto más bajo), 0 si no hay. */
  maxLow: number;
  meanDev: number;
  /** Desviación estándar muestral (n−1). */
  stdDev: number;
  /** % de puntos medidos en tolerancia. */
  pctOk: number;
}

export function layerSummary(checks: LayerCheck[]): LayerSummary {
  const devs = checks.filter((c) => c.deviation !== undefined).map((c) => c.deviation as number);
  const count = (s: ComplianceStatus): number => checks.filter((c) => c.status === s).length;
  const n = devs.length;
  const mean = n ? devs.reduce((a, b) => a + b, 0) / n : 0;
  const sd = n > 1 ? Math.sqrt(devs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
  const ok = count('ok');
  return {
    total: checks.length,
    measured: n,
    ok,
    warn: count('warn'),
    fail: count('fail'),
    pending: count('pending'),
    maxHigh: Math.max(0, ...devs),
    maxLow: Math.min(0, ...devs),
    meanDev: mean,
    stdDev: sd,
    pctOk: n ? (ok / n) * 100 : 0,
  };
}

/** Etiqueta de campo: "C 0.023" (cortar), "R 0.015" (rellenar) u "OK". */
export function cutFillLabel(dev: number, okTolerance = 0.0005): string {
  if (Math.abs(dev) < okTolerance) return 'OK';
  return `${dev > 0 ? 'C' : 'R'} ${Math.abs(dev).toFixed(3)}`;
}

export interface ControlGridOptions {
  fromStation: number;
  toStation: number;
  interval: number;
  /** Desplazamientos (m): negativo izquierda, 0 eje, positivo derecha. */
  offsets: number[];
}

/** Malla de puntos de control (sin mediciones). Incluye siempre `toStation`. */
export function generateControlGrid(o: ControlGridOptions): ControlPoint[] {
  if (o.interval <= 0) throw new Error('El intervalo debe ser positivo');
  const stations: number[] = [];
  const lo = Math.min(o.fromStation, o.toStation);
  const hi = Math.max(o.fromStation, o.toStation);
  for (let k = 0; ; k++) {
    const s = Math.round((lo + k * o.interval) * 1e6) / 1e6;
    if (s > hi + 1e-9) break;
    stations.push(s);
  }
  if (hi - stations[stations.length - 1] > 1e-6) stations.push(hi);
  const out: ControlPoint[] = [];
  for (const st of stations) {
    for (const off of o.offsets) {
      const side = off === 0 ? 'Eje' : `${off < 0 ? 'Izq' : 'Der'} ${trimNum(Math.abs(off), 2)}`;
      out.push({ id: uid('cp'), station: st, offset: off, label: `${stationFormat(st)} ${side}`, measured: {} });
    }
  }
  return out;
}

/* ------------------------------- Plantillas -------------------------------- */

export interface TemplateLayer {
  name: string;
  thickness: number;
  tolerance: number;
  /** Fuente del espesor / tolerancia o "valor de tanteo". */
  normative: string;
}

export interface PavementTemplate {
  id: string;
  name: string;
  description: string;
  /** Fuente general de la plantilla. */
  normative: string;
  /** Pendiente transversal típica (%) y tipo. */
  crossSlope: number;
  crossType: DesignGrade['crossType'];
  /** De arriba hacia abajo. */
  layers: TemplateLayer[];
}

const EG = 'EG-2013 (MTC Perú), referencial: verificar especificaciones técnicas del proyecto';
const TANTEO = 'valor de tanteo';

/**
 * Plantillas de partida. Los espesores son típicos y deben reemplazarse por
 * los del expediente; las tolerancias de cota siguen la EG-2013 cuando se
 * conocen y en otro caso se marcan como "valor de tanteo".
 */
export const PAVEMENT_TEMPLATES: readonly PavementTemplate[] = [
  {
    id: 'flexible-urbano',
    name: 'Pavimento flexible urbano',
    description: 'Carpeta asfáltica en caliente sobre base y sub-base granular (CE.010 / EG-2013).',
    normative: `RNE CE.010 Pavimentos Urbanos; ${EG}`,
    crossSlope: 2,
    crossType: 'crown',
    layers: [
      { name: 'Carpeta asfáltica', thickness: 0.05, tolerance: 0.005, normative: TANTEO },
      { name: 'Base granular', thickness: 0.2, tolerance: 0.01, normative: `${EG} (Sección 403: ±10 mm)` },
      { name: 'Sub-base granular', thickness: 0.2, tolerance: 0.02, normative: `${EG} (Sección 402: ±20 mm)` },
      { name: 'Subrasante', thickness: 0, tolerance: 0.02, normative: `${EG} (Sección 205), referencial` },
    ],
  },
  {
    id: 'rigido',
    name: 'Pavimento rígido',
    description: 'Losa de concreto hidráulico sobre base granular.',
    normative: `RNE CE.010 Pavimentos Urbanos; ${EG}`,
    crossSlope: 2,
    crossType: 'crown',
    layers: [
      { name: 'Losa de concreto', thickness: 0.2, tolerance: 0.005, normative: TANTEO },
      { name: 'Base granular', thickness: 0.15, tolerance: 0.01, normative: `${EG} (Sección 403: ±10 mm)` },
      { name: 'Subrasante', thickness: 0, tolerance: 0.02, normative: `${EG} (Sección 205), referencial` },
    ],
  },
  {
    id: 'vereda',
    name: 'Vereda peatonal',
    description: 'Losa de concreto simple con base granular; caída única hacia la calzada.',
    normative: `RNE CE.010 / GH.020; ${TANTEO}`,
    crossSlope: 2,
    crossType: 'one-way',
    layers: [
      { name: 'Losa de concreto', thickness: 0.1, tolerance: 0.005, normative: TANTEO },
      { name: 'Base granular', thickness: 0.1, tolerance: 0.01, normative: TANTEO },
      { name: 'Subrasante', thickness: 0, tolerance: 0.02, normative: TANTEO },
    ],
  },
  {
    id: 'afirmado',
    name: 'Afirmado',
    description: 'Capa de rodadura granular (vía no pavimentada).',
    normative: `${EG}; bombeo según DG-2018 (2.5–3.5 % en afirmado)`,
    crossSlope: 3,
    crossType: 'crown',
    layers: [
      { name: 'Afirmado', thickness: 0.2, tolerance: 0.02, normative: `${EG} (Sección 301), referencial` },
      { name: 'Subrasante', thickness: 0, tolerance: 0.02, normative: `${EG} (Sección 205), referencial` },
    ],
  },
];

/** Capas de una plantilla con ids nuevos, listas para un LayerControl. */
export function instantiateTemplate(templateId: string): PavementLayer[] {
  const t = PAVEMENT_TEMPLATES.find((x) => x.id === templateId);
  if (!t) throw new Error(`Plantilla no encontrada: ${templateId}`);
  return t.layers.map((l) => ({ id: uid('ly'), name: l.name, thickness: l.thickness, tolerance: l.tolerance }));
}
