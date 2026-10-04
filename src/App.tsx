import { useEffect, type ReactNode } from 'react';
import { House, Ruler, MapPin, Calculator, FileText } from 'lucide-react';
import { useNav, useCurrentRoute, type TabId } from '@/app/nav';
import { ROOTS, SCREENS } from '@/app/screens';
import { useStore } from '@/app/store';
import { ConfirmHost, ToastHost } from '@/ui/kit';
import { Logo } from '@/ui/brand';

const TABS: Array<{ id: TabId; label: string; icon: ReactNode }> = [
  { id: 'home', label: 'Inicio', icon: <House size={22} /> },
  { id: 'leveling', label: 'Nivelación', icon: <Ruler size={22} /> },
  { id: 'points', label: 'Puntos', icon: <MapPin size={22} /> },
  { id: 'tools', label: 'Cálculos', icon: <Calculator size={22} /> },
  { id: 'reports', label: 'Informes', icon: <FileText size={22} /> },
];

function useTheme() {
  const theme = useStore((s) => s.settings.theme);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const t = theme === 'auto' ? (mq.matches ? 'dark' : 'light') : theme;
      document.documentElement.dataset.theme = t;
      const meta = document.querySelector('meta[name="theme-color"]');
      meta?.setAttribute('content', t === 'dark' ? '#0b1220' : '#f4f6f9');
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
}

function NavItems() {
  const tab = useNav((s) => s.tab);
  const setTab = useNav((s) => s.setTab);
  return (
    <>
      {TABS.map((t) => (
        <button
          key={t.id}
          className={`nav-item${tab === t.id ? ' active' : ''}`}
          aria-current={tab === t.id ? 'page' : undefined}
          onClick={() => setTab(t.id)}
        >
          <span className="nav-icon">{t.icon}</span>
          <span>{t.label}</span>
        </button>
      ))}
    </>
  );
}

export default function App() {
  useTheme();
  const tab = useNav((s) => s.tab);
  const route = useCurrentRoute();
  const Root = ROOTS[tab];
  const Stacked = route ? SCREENS[route.name] : null;

  return (
    <div className="app">
      <nav className="side-nav" aria-label="Navegación principal">
        <div className="brand">
          <Logo size={34} />
          <span style={{ fontSize: 19 }}>TOPO APP</span>
        </div>
        <NavItems />
      </nav>
      <div className="app-main" key={`${tab}:${route?.name ?? 'root'}:${JSON.stringify(route?.params ?? {})}`}>
        {Stacked ? <Stacked params={route?.params ?? {}} /> : <Root />}
      </div>
      <nav className="bottom-nav" aria-label="Navegación principal">
        <NavItems />
      </nav>
      <ToastHost />
      <ConfirmHost />
    </div>
  );
}
