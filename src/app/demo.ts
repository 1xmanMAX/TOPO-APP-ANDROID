/**
 * Proyecto de ejemplo realista (pavimentación urbana en Lima) para explorar
 * la app sin datos propios y para las capturas del README.
 */
import type { ControlPoint, LevelObservation, PavementLayer, Project, SurveyPoint } from '@/core/types';
import { uid } from '@/core/id';

const iso = (d: string) => new Date(d + 'T09:00:00').toISOString();

function obs(kind: LevelObservation['kind'], pointName: string, reading: number, distance?: number, designElevation?: number): LevelObservation {
  return { id: uid('o'), kind, pointName, reading, distance, designElevation };
}

/** Pseudo-aleatorio determinista para que la demo sea reproducible. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function createDemoProject(): Project {
  const r = rng(42);
  const E0 = 279420;
  const N0 = 8667310;

  // Levantamiento de una calle de 160 m × 16 m (terreno con pendiente ~1.2 %)
  const points: SurveyPoint[] = [];
  let n = 1;
  for (let s = 0; s <= 160; s += 10) {
    for (const o of [-8, -4, 0, 4, 8]) {
      const z = 152.4 + 0.012 * s - 0.018 * Math.abs(o) + (r() - 0.5) * 0.06 + 0.12 * Math.sin(s / 40);
      const code = o === 0 ? 'EJE' : Math.abs(o) === 8 ? 'BORDE' : 'TN';
      points.push({
        id: uid('pt'),
        name: String(n++),
        code,
        x: E0 + s * 0.8 + o * 0.6,
        y: N0 + s * 0.6 - o * 0.8,
        z: Math.round(z * 1000) / 1000,
        source: 'total-station',
        createdAt: iso('2026-09-28'),
      });
    }
  }
  points.push(
    { id: uid('pt'), name: 'BM-1', code: 'BM', x: E0 - 6, y: N0 - 4, z: 152.315, source: 'manual', createdAt: iso('2026-09-27') },
    { id: uid('pt'), name: 'BM-2', code: 'BM', x: E0 + 132, y: N0 + 92, z: 154.062, source: 'manual', createdAt: iso('2026-09-27') },
  );

  // Nivelación cerrada BM-1 → BM-1 con intermedias en eje (cotas de proyecto)
  const loop: LevelObservation[] = [
    obs('BS', 'BM-1', 1.425, 32.0),
    obs('IS', '0+000', 1.602, 18.0, 152.150),
    obs('IS', '0+020', 1.388, 24.0, 152.390),
    obs('FS', 'PC-1', 0.968, 35.0),
    obs('BS', 'PC-1', 1.512, 30.0),
    obs('IS', '0+040', 1.630, 15.0, 152.630),
    obs('IS', '0+060', 1.402, 22.0, 152.870),
    obs('FS', 'PC-2', 0.884, 31.0),
    obs('BS', 'PC-2', 1.736, 33.0),
    obs('IS', '0+080', 2.018, 12.0, 153.110),
    obs('IS', '0+100', 1.794, 26.0, 153.350),
    obs('FS', 'BM-2', 1.074, 34.0),
    obs('BS', 'BM-2', 0.862, 36.0),
    obs('FS', 'PC-3', 1.402, 37.0),
    obs('BS', 'PC-3', 0.774, 35.0),
    obs('FS', 'PC-4', 1.395, 36.0),
    obs('BS', 'PC-4', 0.693, 34.0),
    obs('FS', 'BM-1', 1.276, 33.0),
  ];

  // Nivelación con nivel digital (importada) BM-2 → BM-1, cierre a BM conocido
  const digital: LevelObservation[] = [
    obs('BS', 'BM-2', 1.21843, 28.41),
    obs('FS', 'TP1', 1.87612, 28.37),
    obs('BS', 'TP1', 1.10275, 30.02),
    obs('FS', 'TP2', 1.65530, 29.95),
    obs('BS', 'TP2', 0.98761, 26.88),
    obs('FS', 'BM-1', 1.52441, 26.93),
  ];

  const layers: PavementLayer[] = [
    { id: 'L1', name: 'Carpeta asfáltica', thickness: 0.05, tolerance: 0.006 },
    { id: 'L2', name: 'Base granular', thickness: 0.2, tolerance: 0.01 },
    { id: 'L3', name: 'Sub-base granular', thickness: 0.2, tolerance: 0.02 },
    { id: 'L4', name: 'Subrasante', thickness: 0, tolerance: 0.02 },
  ];

  // Puntos de control cada 20 m en eje y bordes; medidos en subrasante y base
  const cps: ControlPoint[] = [];
  for (let s = 0; s <= 160; s += 20) {
    for (const o of [-3.6, 0, 3.6]) {
      const design = 152.15 + 0.012 * s - 0.02 * Math.abs(o);
      const dSub = design - 0.45 + (r() - 0.45) * 0.05;
      const dBase = design - 0.05 + (r() - 0.5) * 0.024;
      const measured: Record<string, number> = { L4: Math.round(dSub * 1000) / 1000 };
      if (s <= 100) measured.L2 = Math.round(dBase * 1000) / 1000;
      cps.push({ id: uid('cp'), station: s, offset: o, label: o === 0 ? 'Eje' : o < 0 ? 'Izq' : 'Der', measured });
    }
  }

  const t = new Date().toISOString();
  return {
    id: uid('p'),
    name: 'Av. Los Álamos — Pavimentación',
    client: 'Municipalidad Distrital de San Borja',
    location: 'San Borja, Lima',
    surveyor: 'Max',
    instrument: 'Nivel automático Sokkia B40 · Estación total Leica TS07',
    crs: { zone: 18, hemisphere: 'S', datum: 'WGS84' },
    createdAt: iso('2026-09-27'),
    updatedAt: t,
    benchmarks: [
      { id: uid('bm'), name: 'BM-1', elevation: 152.315, x: E0 - 6, y: N0 - 4, official: true, description: 'Hito de concreto, esquina Jr. Las Palmeras' },
      { id: uid('bm'), name: 'BM-2', elevation: 154.062, x: E0 + 132, y: N0 + 92, official: false, description: 'Clavo en sardinel, frente al N° 845' },
    ],
    points,
    levelRuns: [
      {
        id: uid('lv'),
        name: 'Circuito BM-1 · eje 0+000 a 0+100',
        date: '2026-09-29',
        method: 'HI',
        closure: 'loop',
        order: 'third',
        startBM: { name: 'BM-1', elevation: 152.315 },
        observations: loop,
        instrument: 'Sokkia B40',
        operator: 'Max',
        weather: 'Soleado',
        source: 'manual',
      },
      {
        id: uid('lv'),
        name: 'Enlace BM-2 → BM-1 (nivel digital)',
        date: '2026-09-30',
        method: 'RF',
        closure: 'known-bm',
        order: 'second',
        startBM: { name: 'BM-2', elevation: 154.062 },
        endBM: { name: 'BM-1', elevation: 152.315 },
        observations: digital,
        instrument: 'Leica LS15',
        operator: 'Max',
        source: 'leica-gsi',
      },
    ],
    layerControls: [
      {
        id: uid('lc'),
        name: 'Calzada — Pavimento flexible',
        layers,
        grade: { startStation: 0, startElevation: 152.15, longSlope: 1.2, crossSlope: 2, crossType: 'crown' },
        points: cps,
      },
    ],
    notes: 'Proyecto de ejemplo. Puedes editarlo o eliminarlo libremente.',
  };
}
