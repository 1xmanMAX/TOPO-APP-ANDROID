import type { LevelOrder, LevelRun } from '@/core/types';

/**
 * Coeficiente e (mm) de la tolerancia de cierre T = e·√K (K en km).
 *
 * Valores de práctica común, aproximados a las clases FGCS (EE.UU.) y a las
 * normas usuales del IGN / especificaciones de obra en Latinoamérica:
 *  - first    ≈ 4 mm·√K  (FGCS 1er orden clase II: 4 mm; alta precisión)
 *  - second   ≈ 8 mm·√K  (FGCS 2º orden clase II: 8 mm)
 *  - third    ≈ 12 mm·√K (FGCS 3er orden: 12 mm)
 *  - ordinary ≈ 24 mm·√K (nivelación de obra / ingeniería corriente)
 */
export const ORDER_K: Record<Exclude<LevelOrder, 'custom'>, number> = {
  first: 4,
  second: 8,
  third: 12,
  ordinary: 24,
};

export const ORDER_LABEL: Record<LevelOrder, string> = {
  first: '1er orden (alta precisión)',
  second: '2º orden (precisión)',
  third: '3er orden (control de obra)',
  ordinary: 'Ordinaria (ingeniería)',
  custom: 'Personalizada',
};

/**
 * Longitud media supuesta por estación (m) cuando no hay distancias medidas:
 * 50 m atrás + 50 m adelante = 100 m = 0,1 km.
 */
export const DEFAULT_SETUP_LENGTH_M = 100;

/** Coeficiente e (mm) de la nivelación. 'custom' sin customK válido → ordinaria. */
export function kFor(run: Pick<LevelRun, 'order' | 'customK'>): number {
  if (run.order === 'custom') {
    const k = run.customK;
    return typeof k === 'number' && Number.isFinite(k) && k > 0 ? k : ORDER_K.ordinary;
  }
  return ORDER_K[run.order] ?? ORDER_K.ordinary;
}

/**
 * Tolerancia de cierre en mm.
 *  - Con longitud (km) > 0: T = k·√K.
 *  - Sin distancias (lengthKm <= 0) y con n estaciones: se supone
 *    DEFAULT_SETUP_LENGTH_M por estación → K = 0,1·n → T = k·√n / √10.
 *  - Sin longitud ni estaciones: 0 (no hay criterio).
 */
export function toleranceMm(k: number, lengthKm: number, setups = 0): number {
  if (Number.isFinite(lengthKm) && lengthKm > 0) return k * Math.sqrt(lengthKm);
  if (setups > 0) return k * Math.sqrt((setups * DEFAULT_SETUP_LENGTH_M) / 1000);
  return 0;
}
