import type {
  LevelChecks,
  LevelClosureResult,
  LevelObservation,
  LevelRow,
  LevelRun,
  LevelRunResult,
} from '@/core/types';
import { DEFAULT_SETUP_LENGTH_M, kFor, toleranceMm } from './tolerance';

/** Tolerancia del control hilo medio ≈ (superior+inferior)/2 (m). */
export const STADIA_MIDDLE_TOL_M = 0.003;
/** Tolerancia de los checks aritméticos (m). */
export const ARITH_TOL_M = 1e-6;
/** Constante estadimétrica usual. */
export const STADIA_K = 100;

const fmt = (v: number, d = 3) => (Number.isFinite(v) ? v.toFixed(d) : String(v));
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Distancia instrumento-mira de una observación: `distance` o 100·(sup−inf).
 * Añade issues si los hilos están invertidos o el hilo medio no cuadra.
 */
export function observationDistance(obs: LevelObservation, issues?: string[]): number | undefined {
  const hasThreads = isNum(obs.upper) && isNum(obs.lower);
  if (hasThreads && issues && isNum(obs.reading)) {
    const mid = (obs.upper! + obs.lower!) / 2;
    if (Math.abs(obs.reading - mid) > STADIA_MIDDLE_TOL_M) {
      issues.push(
        `Hilo medio inconsistente en ${obs.pointName}: lectura ${fmt(obs.reading)} m, ` +
          `promedio de hilos ${fmt(mid, 4)} m (dif. ${fmt((obs.reading - mid) * 1000, 1)} mm)`,
      );
    }
  }
  if (isNum(obs.distance)) return Math.abs(obs.distance);
  if (hasThreads) {
    if (obs.upper! < obs.lower! && issues) {
      issues.push(`Hilos superior e inferior invertidos en ${obs.pointName}`);
    }
    return STADIA_K * Math.abs(obs.upper! - obs.lower!);
  }
  return undefined;
}

/**
 * Calcula una nivelación geométrica completa: cotas, checks aritméticos,
 * cierre, tolerancia y compensación proporcional. Nunca lanza: los problemas
 * de datos se devuelven en `issues`.
 */
export function computeLevelRun(run: LevelRun): LevelRunResult {
  const issues: string[] = [];
  const obsList = Array.isArray(run.observations) ? run.observations : [];
  const startElev = run.startBM?.elevation;
  if (!isNum(startElev)) issues.push('La cota del BM de inicio no es válida');

  const rows: LevelRow[] = [];
  let setup = 0;
  let hi = NaN;
  let prevReading = NaN; // lectura anterior dentro de la estación (para RF)
  let stationOpen = false; // hay BS sin FS que la cierre
  let lastFsIdx = -1;

  // Acumulados para compensación por distancia.
  let cumDist = 0;
  let allDist = true; // todas las BS/FS tienen distancia
  /** Distancia acumulada al terminar cada BS (índice = setup). */
  const cumAtBS: number[] = [0];
  /** Distancia acumulada al terminar cada FS (índice = setup). */
  const cumAtFS: number[] = [0];

  let sumBS = 0, sumFS = 0, sumRise = 0, sumFall = 0;
  let sumBackDist = 0, sumForeDist = 0;
  let anyNaN = false;

  obsList.forEach((obs, i) => {
    const reading = obs.reading;
    const readingOk = isNum(reading);
    if (!readingOk) {
      anyNaN = true;
      issues.push(`Lectura no válida en ${obs.pointName || `fila ${i + 1}`} (${obs.kind})`);
    }
    const dist = observationDistance(obs, issues);
    const row: LevelRow = {
      obsId: obs.id,
      kind: obs.kind,
      pointName: obs.pointName,
      reading,
      distance: dist,
      setup: Math.max(setup, 1),
      elevation: NaN,
      adjustedElevation: NaN,
      correction: 0,
      designElevation: obs.designElevation,
      note: obs.note,
    };

    if (obs.kind === 'BS') {
      // Cota del punto donde se apoya la vista atrás.
      let pointElev: number;
      if (i === 0) {
        if (obs.pointName !== run.startBM?.name) {
          issues.push(
            `La primera vista atrás (${obs.pointName}) no es sobre el BM de inicio (${run.startBM?.name})`,
          );
        }
        pointElev = startElev;
      } else if (lastFsIdx >= 0 && rows[i - 1]?.kind === 'FS') {
        const fsRow = rows[lastFsIdx];
        if (fsRow.pointName !== obs.pointName) {
          issues.push(
            `Vista atrás sobre ${obs.pointName} pero el último punto de cambio es ${fsRow.pointName}; se usa la cota de ${fsRow.pointName}`,
          );
        }
        pointElev = fsRow.elevation;
      } else {
        issues.push(`Estación ${setup} sin vista adelante antes de la vista atrás en ${obs.pointName}`);
        // Se busca el mismo punto en filas anteriores; si no, el último FS o el BM.
        const same = [...rows].reverse().find((r) => r.pointName === obs.pointName && isNum(r.elevation));
        pointElev = same ? same.elevation : lastFsIdx >= 0 ? rows[lastFsIdx].elevation : startElev;
      }
      setup += 1;
      row.setup = setup;
      hi = pointElev + reading;
      row.hi = hi;
      row.elevation = pointElev;
      prevReading = reading;
      stationOpen = true;
      if (readingOk) sumBS += reading;
      if (isNum(dist)) sumBackDist += dist;
      else allDist = false;
      cumDist += dist ?? 0;
      cumAtBS[setup] = cumDist;
    } else {
      if (setup === 0 || !stationOpen) {
        issues.push(
          `${obs.kind === 'FS' ? 'Vista adelante' : 'Vista intermedia'} en ${obs.pointName} sin vista atrás previa`,
        );
        row.setup = Math.max(setup, 1);
        rows.push(row);
        return;
      }
      row.hi = hi;
      row.elevation = hi - reading;
      const d = prevReading - reading;
      if (Number.isFinite(d)) {
        if (d >= 0) {
          row.rise = d;
          sumRise += d;
        } else {
          row.fall = -d;
          sumFall += -d;
        }
      }
      prevReading = reading;
      if (obs.kind === 'FS') {
        if (readingOk) sumFS += reading;
        if (isNum(dist)) sumForeDist += dist;
        else allDist = false;
        cumDist += dist ?? 0;
        cumAtFS[setup] = cumDist;
        lastFsIdx = i;
        stationOpen = false;
      }
    }
    rows.push(row);
  });

  if (obsList.length === 0) issues.push('La nivelación no tiene observaciones');
  else if (obsList[0].kind !== 'BS') issues.push('La primera observación debe ser una vista atrás (BS) sobre el BM de inicio');
  if (rows.length > 0 && rows[rows.length - 1].kind !== 'FS') {
    issues.push('La nivelación no termina con una vista adelante (FS)');
  }

  // Checks aritméticos.
  const lastFsElev = lastFsIdx >= 0 ? rows[lastFsIdx].elevation : startElev;
  const lastRow = [...rows].reverse().find((r) => r.kind !== 'BS');
  const lastRowElev = lastRow ? lastRow.elevation : startElev;
  const dBF = sumBS - sumFS;
  const dRF = sumRise - sumFall;
  const arithmeticOk =
    !anyNaN &&
    isNum(lastFsElev) &&
    Math.abs(dBF - (lastFsElev - startElev)) <= ARITH_TOL_M &&
    Math.abs(dRF - (lastRowElev - startElev)) <= ARITH_TOL_M;
  if (!arithmeticOk && rows.length > 0 && !anyNaN && isNum(startElev)) {
    issues.push(
      `Comprobación aritmética: ΣBS−ΣFS = ${fmt(dBF, 4)}, ΣS−ΣB = ${fmt(dRF, 4)}, ΔH = ${fmt(lastFsElev - startElev, 4)}`,
    );
  }
  const checks: LevelChecks = {
    sumBS,
    sumFS,
    sumRise,
    sumFall,
    arithmeticOk,
    sumBackDist,
    sumForeDist,
    distanceImbalance: sumBackDist - sumForeDist,
  };

  // Cierre.
  const setups = setup;
  const k = kFor(run);
  // K solo con distancias completas: si faltan en alguna VA/VAd, la suma parcial
  // daría una tolerancia demasiado estricta → se usa la longitud supuesta por estación.
  const measuredKm = (sumBackDist + sumForeDist) / 1000;
  const lengthKm = allDist ? measuredKm : 0;
  if (!allDist && measuredKm > 0) {
    issues.push(
      `Distancias incompletas en vistas atrás/adelante: la tolerancia se calcula con ${DEFAULT_SETUP_LENGTH_M} m por estación y la compensación por número de estaciones`,
    );
  }
  const closure: LevelClosureResult = {
    computedEnd: lastFsElev,
    k,
    lengthKm,
    setups,
  };
  // El cierre solo se evalúa cuando la libreta termina (última observación
  // = vista adelante) sobre el BM de cierre. Si no, está "en curso": sin
  // error ni compensación, para no repartir un falso error en campo.
  const sameName = (a?: string, b?: string) =>
    (a ?? '').trim().toUpperCase() === (b ?? '').trim().toUpperCase();
  const lastObs = run.observations[run.observations.length - 1];
  const endsOnFs = lastObs?.kind === 'FS' && lastFsIdx === rows.length - 1;
  let knownEnd: number | undefined;
  let closingName: string | undefined;
  if (run.closure === 'loop') {
    closingName = run.startBM?.name;
    knownEnd = startElev;
  } else if (run.closure === 'known-bm') {
    if (run.endBM && isNum(run.endBM.elevation)) {
      closingName = run.endBM.name;
      knownEnd = run.endBM.elevation;
    } else {
      issues.push('Cierre a BM conocido sin BM de llegada válido: se trata como nivelación abierta');
    }
  }
  if (knownEnd !== undefined && lastFsIdx >= 0 && !(endsOnFs && sameName(rows[lastFsIdx].pointName, closingName))) {
    closure.inProgress = true;
    issues.push(`Libreta en curso: aún no se cierra en ${closingName}. El cierre se calcula al leer la vista adelante sobre ${closingName}.`);
    knownEnd = undefined;
  }

  let errorM = NaN;
  if (knownEnd !== undefined && lastFsIdx >= 0) {
    closure.knownEnd = knownEnd;
    errorM = lastFsElev - knownEnd;
    if (Number.isFinite(errorM)) {
      const tol = toleranceMm(k, lengthKm, setups);
      closure.misclosureMm = errorM * 1000;
      closure.toleranceMm = tol;
      closure.passes = Math.abs(closure.misclosureMm) <= tol + 1e-9;
      closure.ratio = tol > 0 ? Math.abs(closure.misclosureMm) / tol : undefined;
    } else {
      issues.push('No se pudo calcular el error de cierre (lecturas no válidas)');
    }
  } else if (knownEnd !== undefined) {
    issues.push('No hay vista adelante: no se puede calcular el cierre');
  }

  // Compensación: corrección = −error·(acumulado / total).
  // Con distancias: FS → acumulado (BS+FS) hasta ese FS; IS → acumulado hasta
  // la BS de su estación (error del HI vigente). Sin distancias: s/n para el
  // FS y las IS de la estación s. La BS hereda la corrección del FS previo.
  const useDist = allDist && cumDist > 0;
  const fraction = (cum: number | undefined, s: number): number => {
    if (useDist) return (cum ?? 0) / cumDist;
    return setups > 0 ? s / setups : 0;
  };
  const canAdjust = Number.isFinite(errorM);
  let prevFsCorr = 0;
  for (const r of rows) {
    let c = 0;
    if (canAdjust) {
      if (r.kind === 'BS') c = prevFsCorr;
      else if (r.kind === 'FS') {
        c = -errorM * fraction(cumAtFS[r.setup], r.setup);
        prevFsCorr = c;
      } else c = -errorM * fraction(cumAtBS[r.setup], r.setup);
    }
    r.correction = c;
    r.adjustedElevation = r.elevation + c;
    if (isNum(r.designElevation) && Number.isFinite(r.adjustedElevation)) {
      r.cutFill = r.adjustedElevation - r.designElevation;
    }
  }

  return { rows, checks, closure, issues };
}
