import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import {
  ArrowLeft,
  Calculator,
  CornerDownLeft,
  FileText,
  FolderOpen,
  MapPin,
  Ruler,
  Search as SearchIcon,
  Triangle,
  X,
} from 'lucide-react';
import type { ScreenProps } from '@/app/feature';
import { go, useNav, type TabId } from '@/app/nav';
import { useProject } from '@/app/store';
import { dateShort, f } from '@/ui/format';
import { ACTIONS, score, type ActionGroup } from './actions';

interface Result {
  key: string;
  group: string;
  icon: ReactNode;
  tone: string;
  title: string;
  sub?: string;
  right?: string;
  score: number;
  run: () => void;
}

const GROUP_ICON: Record<ActionGroup, { icon: ReactNode; tone: string }> = {
  Nivelación: { icon: <Ruler size={18} />, tone: 'brand' },
  Puntos: { icon: <MapPin size={18} />, tone: 'info' },
  Cálculos: { icon: <Calculator size={18} />, tone: 'warn' },
  Informes: { icon: <FileText size={18} />, tone: 'accent' },
  Proyecto: { icon: <FolderOpen size={18} />, tone: 'ok' },
};

const openTab = (tab: TabId) => {
  const nav = useNav.getState();
  nav.back();
  nav.resetTab(tab);
  if (nav.tab !== tab) nav.setTab(tab);
};

/** Navega desde la búsqueda: retira la paleta de la pila de Inicio antes de ir. */
const leaveAndGo = (route: string | undefined, params: Record<string, unknown> | undefined, tab: TabId) => {
  const nav = useNav.getState();
  if (!route) return openTab(tab);
  if (tab === 'home') {
    nav.replace({ name: route, params });
    window.scrollTo({ top: 0 });
    return;
  }
  nav.back();
  go(route, params, tab);
};

const MAX_PER_GROUP = 8;

export default function Search(_: ScreenProps) {
  const p = useProject();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const groups = useMemo(() => {
    const term = q.trim();
    const out: Array<{ name: string; items: Result[] }> = [];

    const actions = ACTIONS.filter((a) => (term ? true : a.top))
      .map((a): Result => ({
        key: `a:${a.id}`,
        group: 'Acciones',
        icon: GROUP_ICON[a.group].icon,
        tone: GROUP_ICON[a.group].tone,
        title: a.title,
        sub: a.group,
        score: score(term, a.title, `${a.group} ${a.keywords ?? ''}`),
        run: () => leaveAndGo(a.route, a.params, a.tab),
      }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score);
    if (actions.length) out.push({ name: term ? 'Acciones' : 'Sugeridas', items: actions.slice(0, term ? 10 : 8) });

    if (p && term) {
      const pts = p.points
        .map((pt): Result => ({
          key: `p:${pt.id}`,
          group: 'Puntos',
          icon: <MapPin size={18} />,
          tone: 'info',
          title: pt.name,
          sub: [pt.code, `E ${f(pt.x, 3)} · N ${f(pt.y, 3)}`].filter(Boolean).join(' · '),
          right: pt.z !== undefined ? f(pt.z, 3) : undefined,
          score: score(term, pt.name, pt.code ?? ''),
          run: () => leaveAndGo('point-edit', { id: pt.id }, 'points'),
        }))
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score);
      if (pts.length) out.push({ name: `Puntos (${pts.length})`, items: pts.slice(0, MAX_PER_GROUP) });

      const runs = p.levelRuns
        .map((r): Result => ({
          key: `r:${r.id}`,
          group: 'Libretas',
          icon: <Ruler size={18} />,
          tone: 'brand',
          title: r.name,
          sub: `${dateShort(r.date)} · ${r.startBM.name} · ${r.observations.length} lecturas`,
          score: score(term, r.name, `${r.startBM.name} ${r.endBM?.name ?? ''} ${r.instrument ?? ''} libreta nivelacion`),
          run: () => leaveAndGo('level-run', { runId: r.id }, 'leveling'),
        }))
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score);
      if (runs.length) out.push({ name: 'Libretas', items: runs.slice(0, MAX_PER_GROUP) });

      const bms = p.benchmarks
        .map((b): Result => ({
          key: `b:${b.id}`,
          group: 'BMs',
          icon: <Triangle size={18} />,
          tone: 'accent',
          title: b.name,
          sub: b.description ?? (b.official ? 'Oficial' : 'Auxiliar'),
          right: f(b.elevation, 3),
          score: score(term, b.name, `${b.description ?? ''} bm banco`),
          run: () => leaveAndGo('benchmarks', {}, 'home'),
        }))
        .filter((r) => r.score > 0);
      if (bms.length) out.push({ name: 'BMs', items: bms.slice(0, MAX_PER_GROUP) });
    }
    return out;
  }, [q, p]);

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  useEffect(() => setSel(0), [q]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${sel}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, flat.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      flat[sel]?.run();
    } else if (e.key === 'Escape') {
      if (q) setQ('');
      else useNav.getState().back();
    }
  };

  let idx = -1;
  return (
    <>
      <header className="topbar hm-search-bar">
        <button className="icon-btn" aria-label="Atrás" onClick={() => useNav.getState().back()}>
          <ArrowLeft size={22} />
        </button>
        <div className="hm-search-field grow">
          <SearchIcon size={18} />
          <input
            ref={inputRef}
            className="input"
            value={q}
            autoFocus
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Buscar acciones, puntos, libretas…"
            aria-label="Buscar"
            role="combobox"
            aria-expanded="true"
            aria-controls="hm-search-results"
            aria-activedescendant={flat[sel] ? `hm-r-${sel}` : undefined}
            enterKeyHint="go"
          />
          {q && (
            <button className="hm-clear" aria-label="Limpiar" onClick={() => setQ('')}>
              <X size={18} />
            </button>
          )}
        </div>
      </header>
      <main className="content">
        <div className="stack-l" ref={listRef} id="hm-search-results" role="listbox">
          {groups.length === 0 && (
            <div className="hm-center muted" style={{ padding: '40px 16px' }}>
              <p>Sin resultados para «{q}».</p>
              <p className="small faint" style={{ marginTop: 6 }}>
                Prueba con «cota», «dxf», «utm» o el nombre de un punto.
              </p>
            </div>
          )}
          {groups.map((g) => (
            <section key={g.name} className="stack">
              <h2 className="section-title">{g.name}</h2>
              <div className="card flush">
                <div className="list">
                  {g.items.map((r) => {
                    idx += 1;
                    const i = idx;
                    return (
                      <button
                        key={r.key}
                        id={`hm-r-${i}`}
                        data-idx={i}
                        role="option"
                        aria-selected={i === sel}
                        className={`list-item hm-result${i === sel ? ' selected' : ''}`}
                        onMouseMove={() => i !== sel && setSel(i)}
                        onClick={r.run}
                      >
                        <div className={`li-icon tone-${r.tone}`}>{r.icon}</div>
                        <div className="li-body">
                          <div className="li-title">{r.title}</div>
                          {r.sub && <div className="li-sub">{r.sub}</div>}
                        </div>
                        {r.right && <span className="mono small hm-result-right">{r.right}</span>}
                        {i === sel && <CornerDownLeft size={16} className="faint hm-enter" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>
          ))}
          {!q && (
            <p className="xs faint hm-center hm-kbd-hint">
              <span className="kbd">↑</span> <span className="kbd">↓</span> para moverte ·{' '}
              <span className="kbd">Enter</span> para abrir · <span className="kbd">Esc</span> para salir
            </p>
          )}
        </div>
      </main>
    </>
  );
}
