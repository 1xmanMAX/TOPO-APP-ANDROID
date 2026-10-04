import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  Benchmark,
  ControlPoint,
  ID,
  ImportResult,
  LayerControl,
  LevelObservation,
  LevelRun,
  Project,
  SurveyPoint,
} from '@/core/types';
import { uid } from '@/core/id';
import { createDemoProject } from './demo';

export type ThemeMode = 'auto' | 'light' | 'dark' | 'sun';

export interface Settings {
  theme: ThemeMode;
  /** Decimales para cotas y lecturas (m). */
  decimals: number;
  /** Unidad de ángulo preferida. */
  angleUnit: 'sexagesimal' | 'centesimal';
  /** Datos de membrete para informes. */
  company: string;
  engineer: string;
  cip: string;
  /** Vibración al confirmar lecturas. */
  haptics: boolean;
}

interface State {
  projects: Project[];
  activeProjectId: ID | null;
  settings: Settings;
  onboarded: boolean;

  // proyectos
  createProject: (data: Partial<Project> & { name: string }) => ID;
  updateProject: (id: ID, patch: Partial<Project>) => void;
  deleteProject: (id: ID) => void;
  duplicateProject: (id: ID) => ID | null;
  setActiveProject: (id: ID) => void;
  loadDemo: () => ID;
  importProject: (p: Project) => ID;

  // ajustes
  setSettings: (patch: Partial<Settings>) => void;
  setOnboarded: (v: boolean) => void;

  // BMs
  upsertBenchmark: (bm: Omit<Benchmark, 'id'> & { id?: ID }) => ID;
  deleteBenchmark: (id: ID) => void;

  // puntos
  addPoints: (pts: Array<Omit<SurveyPoint, 'id' | 'createdAt'> & Partial<Pick<SurveyPoint, 'id' | 'createdAt'>>>) => void;
  updatePoint: (id: ID, patch: Partial<SurveyPoint>) => void;
  deletePoints: (ids: ID[]) => void;

  // nivelación
  createLevelRun: (data: Omit<LevelRun, 'id' | 'observations'> & { observations?: LevelObservation[] }) => ID;
  updateLevelRun: (id: ID, patch: Partial<LevelRun>) => void;
  deleteLevelRun: (id: ID) => void;
  duplicateLevelRun: (id: ID) => ID | null;
  addObservation: (runId: ID, obs: Omit<LevelObservation, 'id'>) => ID;
  updateObservation: (runId: ID, obsId: ID, patch: Partial<LevelObservation>) => void;
  deleteObservation: (runId: ID, obsId: ID) => void;
  insertObservation: (runId: ID, index: number, obs: Omit<LevelObservation, 'id'>) => ID;

  // control de capas
  createLayerControl: (data: Omit<LayerControl, 'id'>) => ID;
  updateLayerControl: (id: ID, patch: Partial<LayerControl>) => void;
  deleteLayerControl: (id: ID) => void;
  setMeasurement: (controlId: ID, pointId: ID, layerId: ID, value: number | undefined) => void;
  upsertControlPoint: (controlId: ID, cp: Omit<ControlPoint, 'id'> & { id?: ID }) => ID;
  deleteControlPoint: (controlId: ID, pointId: ID) => void;

  // importación
  applyImport: (r: ImportResult) => { points: number; runs: number };
}

const now = () => new Date().toISOString();

export function emptyProject(name: string): Project {
  const t = now();
  return {
    id: uid('p'),
    name,
    crs: { zone: 18, hemisphere: 'S', datum: 'WGS84' },
    createdAt: t,
    updatedAt: t,
    benchmarks: [],
    points: [],
    levelRuns: [],
    layerControls: [],
  };
}

export const useStore = create<State>()(
  persist(
    (set, get) => {
      /** Aplica una transformación al proyecto activo y marca updatedAt. */
      const mutActive = (fn: (p: Project) => Project) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === s.activeProjectId ? { ...fn(p), updatedAt: now() } : p,
          ),
        }));

      const mutRun = (runId: ID, fn: (r: LevelRun) => LevelRun) =>
        mutActive((p) => ({ ...p, levelRuns: p.levelRuns.map((r) => (r.id === runId ? fn(r) : r)) }));

      const mutControl = (id: ID, fn: (c: LayerControl) => LayerControl) =>
        mutActive((p) => ({ ...p, layerControls: p.layerControls.map((c) => (c.id === id ? fn(c) : c)) }));

      return {
        projects: [],
        activeProjectId: null,
        onboarded: false,
        settings: {
          theme: 'auto',
          decimals: 3,
          angleUnit: 'sexagesimal',
          company: '',
          engineer: '',
          cip: '',
          haptics: true,
        },

        createProject: (data) => {
          const p = { ...emptyProject(data.name), ...data, id: uid('p') } as Project;
          set((s) => ({ projects: [p, ...s.projects], activeProjectId: p.id }));
          return p.id;
        },
        updateProject: (id, patch) =>
          set((s) => ({
            projects: s.projects.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: now() } : p)),
          })),
        deleteProject: (id) =>
          set((s) => {
            const projects = s.projects.filter((p) => p.id !== id);
            return {
              projects,
              activeProjectId: s.activeProjectId === id ? projects[0]?.id ?? null : s.activeProjectId,
            };
          }),
        duplicateProject: (id) => {
          const src = get().projects.find((p) => p.id === id);
          if (!src) return null;
          const copy: Project = {
            ...structuredClone(src),
            id: uid('p'),
            name: `${src.name} (copia)`,
            createdAt: now(),
            updatedAt: now(),
          };
          set((s) => ({ projects: [copy, ...s.projects] }));
          return copy.id;
        },
        setActiveProject: (id) => set({ activeProjectId: id }),
        loadDemo: () => {
          const p = createDemoProject();
          set((s) => ({ projects: [p, ...s.projects], activeProjectId: p.id }));
          return p.id;
        },
        importProject: (p) => {
          const copy = { ...p, id: uid('p'), updatedAt: now() };
          set((s) => ({ projects: [copy, ...s.projects], activeProjectId: copy.id }));
          return copy.id;
        },

        setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
        setOnboarded: (v) => set({ onboarded: v }),

        upsertBenchmark: (bm) => {
          const id = bm.id ?? uid('bm');
          mutActive((p) => {
            const exists = p.benchmarks.some((b) => b.id === id);
            const item = { ...bm, id } as Benchmark;
            return {
              ...p,
              benchmarks: exists ? p.benchmarks.map((b) => (b.id === id ? item : b)) : [...p.benchmarks, item],
            };
          });
          return id;
        },
        deleteBenchmark: (id) => mutActive((p) => ({ ...p, benchmarks: p.benchmarks.filter((b) => b.id !== id) })),

        addPoints: (pts) =>
          mutActive((p) => ({
            ...p,
            points: [
              ...p.points,
              ...pts.map((x) => ({ ...x, id: x.id ?? uid('pt'), createdAt: x.createdAt ?? now() }) as SurveyPoint),
            ],
          })),
        updatePoint: (id, patch) =>
          mutActive((p) => ({ ...p, points: p.points.map((x) => (x.id === id ? { ...x, ...patch } : x)) })),
        deletePoints: (ids) => {
          const set_ = new Set(ids);
          mutActive((p) => ({ ...p, points: p.points.filter((x) => !set_.has(x.id)) }));
        },

        createLevelRun: (data) => {
          const run: LevelRun = { ...data, id: uid('lv'), observations: data.observations ?? [] };
          mutActive((p) => ({ ...p, levelRuns: [run, ...p.levelRuns] }));
          return run.id;
        },
        updateLevelRun: (id, patch) => mutRun(id, (r) => ({ ...r, ...patch })),
        deleteLevelRun: (id) => mutActive((p) => ({ ...p, levelRuns: p.levelRuns.filter((r) => r.id !== id) })),
        duplicateLevelRun: (id) => {
          const p = get().projects.find((x) => x.id === get().activeProjectId);
          const src = p?.levelRuns.find((r) => r.id === id);
          if (!src) return null;
          const copy: LevelRun = {
            ...structuredClone(src),
            id: uid('lv'),
            name: `${src.name} (copia)`,
            observations: src.observations.map((o) => ({ ...o, id: uid('o') })),
          };
          mutActive((pp) => ({ ...pp, levelRuns: [copy, ...pp.levelRuns] }));
          return copy.id;
        },
        addObservation: (runId, obs) => {
          const id = uid('o');
          mutRun(runId, (r) => ({ ...r, observations: [...r.observations, { ...obs, id }] }));
          return id;
        },
        insertObservation: (runId, index, obs) => {
          const id = uid('o');
          mutRun(runId, (r) => {
            const list = [...r.observations];
            list.splice(index, 0, { ...obs, id });
            return { ...r, observations: list };
          });
          return id;
        },
        updateObservation: (runId, obsId, patch) =>
          mutRun(runId, (r) => ({
            ...r,
            observations: r.observations.map((o) => (o.id === obsId ? { ...o, ...patch } : o)),
          })),
        deleteObservation: (runId, obsId) =>
          mutRun(runId, (r) => ({ ...r, observations: r.observations.filter((o) => o.id !== obsId) })),

        createLayerControl: (data) => {
          const c: LayerControl = { ...data, id: uid('lc') };
          mutActive((p) => ({ ...p, layerControls: [c, ...p.layerControls] }));
          return c.id;
        },
        updateLayerControl: (id, patch) => mutControl(id, (c) => ({ ...c, ...patch })),
        deleteLayerControl: (id) =>
          mutActive((p) => ({ ...p, layerControls: p.layerControls.filter((c) => c.id !== id) })),
        setMeasurement: (controlId, pointId, layerId, value) =>
          mutControl(controlId, (c) => ({
            ...c,
            points: c.points.map((pt) => {
              if (pt.id !== pointId) return pt;
              const measured = { ...pt.measured };
              if (value === undefined || Number.isNaN(value)) delete measured[layerId];
              else measured[layerId] = value;
              return { ...pt, measured };
            }),
          })),
        upsertControlPoint: (controlId, cp) => {
          const id = cp.id ?? uid('cp');
          mutControl(controlId, (c) => {
            const item = { ...cp, id } as ControlPoint;
            const exists = c.points.some((x) => x.id === id);
            const points = exists ? c.points.map((x) => (x.id === id ? item : x)) : [...c.points, item];
            points.sort((a, b) => a.station - b.station || a.offset - b.offset);
            return { ...c, points };
          });
          return id;
        },
        deleteControlPoint: (controlId, pointId) =>
          mutControl(controlId, (c) => ({ ...c, points: c.points.filter((x) => x.id !== pointId) })),

        applyImport: (r) => {
          if (!get().activeProjectId) get().createProject({ name: 'Proyecto importado' });
          mutActive((p) => ({
            ...p,
            points: [...p.points, ...r.points],
            levelRuns: [...r.levelRuns, ...p.levelRuns],
          }));
          return { points: r.points.length, runs: r.levelRuns.length };
        },
      };
    },
    {
      name: 'topo-app/v1',
      version: 1,
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

/** Proyecto activo (o null). */
export function useProject(): Project | null {
  return useStore((s) => s.projects.find((p) => p.id === s.activeProjectId) ?? null);
}
