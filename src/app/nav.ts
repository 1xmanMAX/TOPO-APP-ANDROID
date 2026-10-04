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
    if (t === get().tab) window.scrollTo({ top: 0 });
  },
}));

/** Ruta actual (o null si se está en la raíz de la pestaña). */
export function useCurrentRoute(): Route | null {
  return useNav((s) => {
    const st = s.stacks[s.tab];
    return st.length ? st[st.length - 1] : null;
  });
}

/** Cierres de capas abiertas (hojas inferiores); el botón atrás cierra la última. */
const overlays: Array<() => void> = [];

/** Registra una capa que el botón atrás debe cerrar antes de navegar. Devuelve la baja. */
export function pushBackOverlay(close: () => void): () => void {
  overlays.push(close);
  return () => {
    const i = overlays.lastIndexOf(close);
    if (i >= 0) overlays.splice(i, 1);
  };
}

/**
 * Navegación "atrás" del sistema (botón físico de Android / navegador).
 *
 * El historial tiene siempre una sola entrada "guarda" sobre la base (no una
 * por pantalla, que dejaría pulsaciones "fantasma" tras usar la flecha de la
 * app). Al pulsar atrás se consume la guarda: si la app tenía adónde volver
 * (o una hoja que cerrar) se repone; si ya estaba en la raíz de Inicio, no se
 * repone y la siguiente pulsación sale de la app.
 */
export function installBackHandler(): void {
  let guarded = true;
  const guard = () => {
    history.pushState({ topo: 'guard' }, '');
    guarded = true;
  };
  history.replaceState({ topo: 'base' }, '');
  guard();
  window.addEventListener('popstate', () => {
    guarded = false;
    const close = overlays[overlays.length - 1];
    if (close) close();
    const handled = !!close || useNav.getState().back();
    if (handled) guard();
  });
  // Si se salió de la raíz y luego se vuelve a navegar, se repone la guarda.
  useNav.subscribe((s) => {
    if (!guarded && (s.tab !== 'home' || s.stacks.home.length > 0)) guard();
  });
}

/** Atajo para navegar desde cualquier lugar (fuera de React). */
export const go = (name: string, params?: Record<string, unknown>, tab?: TabId) =>
  useNav.getState().push({ name, params }, tab);
