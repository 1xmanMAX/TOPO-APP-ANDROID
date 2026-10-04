import { useState } from 'react';
import { RotateCcw, Search, SearchX, Sparkles, X } from 'lucide-react';
import type { FeatureModule, ScreenProps } from '@/app/feature';
import { go } from '@/app/nav';
import { EmptyState, QuickAction, Screen, toast } from '@/ui/kit';
import { SECTIONS, TOOLS, toolById } from './registry';
import { ToolIdContext, storageKey } from './ui/shared';

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

function Root() {
  const [q, setQ] = useState('');
  const terms = norm(q).split(/\s+/).filter(Boolean);
  const list = TOOLS.filter((t) => terms.every((w) => norm(`${t.title} ${t.sub} ${t.keywords}`).includes(w)));
  return (
    <Screen title="Cálculos" subtitle="Herramientas topográficas">
      <div className="stack-l">
        <div className="tl-search">
          <Search size={20} className="tl-search-icon" />
          <input
            className="input"
            type="search"
            value={q}
            placeholder="Buscar: cota, azimut, UTM, buzón…"
            onChange={(e) => setQ(e.target.value)}
            aria-label="Buscar herramienta"
          />
          {q && (
            <button className="icon-btn tl-search-clear" aria-label="Borrar búsqueda" onClick={() => setQ('')}>
              <X size={18} />
            </button>
          )}
        </div>
        {list.length === 0 ? (
          <EmptyState icon={<SearchX size={28} />} title="Sin resultados" text={`Ninguna herramienta coincide con “${q}”.`} />
        ) : (
          SECTIONS.map((sec) => {
            const items = list.filter((t) => t.section === sec.id);
            if (!items.length) return null;
            return (
              <section key={sec.id} className="stack">
                <h2 className="section-title">{sec.title}</h2>
                <div className="grid-auto">
                  {items.map((t) => (
                    <QuickAction key={t.id} icon={<t.icon size={22} />} title={t.title} sub={t.sub} tone={sec.tone} onClick={() => go('tool', { id: t.id })} />
                  ))}
                </div>
              </section>
            );
          })
        )}
      </div>
    </Screen>
  );
}

function ToolScreen({ params }: ScreenProps) {
  const id = String(params.id ?? '');
  const def = toolById(id);
  const [nonce, setNonce] = useState(0);
  if (!def) {
    return (
      <Screen title="Herramienta" back>
        <EmptyState icon={<SearchX size={28} />} title="Herramienta no encontrada" />
      </Screen>
    );
  }
  const write = (v: object | null) => {
    try {
      if (v) localStorage.setItem(storageKey(id), JSON.stringify(v));
      else localStorage.removeItem(storageKey(id));
    } catch {
      /* sin almacenamiento */
    }
    setNonce((x) => x + 1);
  };
  const C = def.Component;
  return (
    <Screen
      title={def.title}
      subtitle={def.sub}
      back
      actions={
        <>
          <button
            className="icon-btn"
            aria-label="Cargar ejemplo"
            title="Cargar ejemplo"
            onClick={() => {
              write(def.example);
              toast('Ejemplo cargado', 'info');
            }}
          >
            <Sparkles size={20} />
          </button>
          <button
            className="icon-btn"
            aria-label="Limpiar datos"
            title="Limpiar datos"
            onClick={() => {
              write(null);
              toast('Datos borrados', 'info');
            }}
          >
            <RotateCcw size={20} />
          </button>
        </>
      }
    >
      <ToolIdContext.Provider value={id}>
        <div className="tl-tool">
          <C key={nonce} />
        </div>
      </ToolIdContext.Provider>
    </Screen>
  );
}

const mod: FeatureModule = { Root, screens: { tool: ToolScreen } };
export default mod;
