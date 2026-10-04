import { create } from 'zustand';

/** Pestañas principales (navegación inferior). */
export type TabId = 'home' | 'leveling' | 'points' | 'tools' | 'reports';

export interface Route {
  /** Nombre de pantalla registrado en `screens.ts`. */
  name: string;
  params?: Record<string, unknown>;
}

interface NavState {
  tab: TabId;
  /** Pila de pantallas por pestaña (vacía = raíz de la pestaña). */
  stacks: Record<TabId, Route[]>;
  setTab: (tab: TabId) => void;
  push: (route: Route, tab?: TabId) => void;
  replace: (route: Route) => void;
  back: () => boolean;
  resetTab: (tab?: TabId) => void;
}

const emptyStacks = (): Record<TabId, Route[]> => ({ home: [], leveling: [], points: [], tools: [], reports: [] });

let fromPopState = false;

export const useNav = create<NavState>((set, get) => ({
  tab: 'home',
  stacks: emptyStacks(),
  setTab: (tab) => {
    if (tab === get().tab) {
      // Tocar la pestaña activa vuelve a su raíz.
      set((s) => ({ stacks: { ...s.stacks, [tab]: [] } }));
    } else {
      set({ tab });
    }
    window.scrollTo({ top: 0 });
  },
  push: (route, tab) => {
    const t = tab ?? get().tab;
    set((s) => ({ tab: t, stacks: { ...s.stacks, [t]: [...s.stacks[t], route] } }));
    if (!fromPopState) history.pushState({ topo: true }, '');
    window.scrollTo({ top: 0 });
  },
  replace: (route) => {
    const t = get().tab;
    set((s) => {
      const st = [...s.stacks[t]];
      if (st.length) st[st.length - 1] = route;
      else st.push(route);
      return { stacks: { ...s.stacks, [t]: st } };
    });
  },
  back: () => {
    const t = get().tab;
    const st = get().stacks[t];
    if (st.length > 0) {
      set((s) => ({ stacks: { ...s.stacks, [t]: st.slice(0, -1) } }));
      return true;
    }
    if (t !== 'home') {
      set({ tab: 'home' });
      return true;
    }
    return false;
  },
  resetTab: (tab) => {
    const t = tab ?? get().tab;
    set((s) => ({ stacks: { ...s.stacks, [t]: [] } }));
  },
}));

/** Ruta actual (o null si se está en la raíz de la pestaña). */
export function useCurrentRoute(): Route | null {
  return useNav((s) => {
    const st = s.stacks[s.tab];
    return st.length ? st[st.length - 1] : null;
  });
}

/** Navegación "atrás" del sistema (botón físico de Android / navegador). */
export function installBackHandler(): void {
  history.replaceState({ topo: true }, '');
  window.addEventListener('popstate', () => {
    fromPopState = true;
    const handled = useNav.getState().back();
    fromPopState = false;
    if (handled) history.pushState({ topo: true }, '');
  });
}

/** Atajo para navegar desde cualquier lugar (fuera de React). */
export const go = (name: string, params?: Record<string, unknown>, tab?: TabId) =>
  useNav.getState().push({ name, params }, tab);
