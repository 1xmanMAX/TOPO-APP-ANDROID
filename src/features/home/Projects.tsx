import { useState } from 'react';
import {
  Check,
  Copy,
  Download,
  FolderOpen,
  FolderUp,
  Mountain,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import type { ScreenProps } from '@/app/feature';
import { go, useNav } from '@/app/nav';
import { useStore } from '@/app/store';
import { pickFiles, readText, saveFile } from '@/app/platform';
import type { Project } from '@/core/types';
import { projectFromJson, projectToJson } from '@/io';
import { EmptyState, Fab, ListItem, Screen, Sheet, confirmDialog, toast } from '@/ui/kit';
import { relative, slug } from '@/ui/format';

export async function exportProjectBackup(p: Project): Promise<void> {
  try {
    await saveFile(`${slug(p.name)}.topo.json`, projectToJson(p), 'application/json');
    toast('Respaldo exportado');
  } catch (e) {
    toast(`No se pudo exportar: ${(e as Error).message}`, 'fail');
  }
}

export async function importProjectBackup(): Promise<boolean> {
  const files = await pickFiles('.json,.topo.json,application/json');
  if (!files.length) return false;
  try {
    const text = await readText(files[0]);
    const p = projectFromJson(text);
    useStore.getState().importProject(p);
    toast(`Proyecto «${p.name}» importado`);
    return true;
  } catch (e) {
    toast(`Archivo no válido: ${(e as Error).message}`, 'fail');
    return false;
  }
}

function ProjectActions({ p, onClose }: { p: Project | null; onClose: () => void }) {
  const activeId = useStore((s) => s.activeProjectId);
  const setActive = useStore((s) => s.setActiveProject);
  const duplicate = useStore((s) => s.duplicateProject);
  const del = useStore((s) => s.deleteProject);
  if (!p) return null;
  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };
  return (
    <Sheet open title={p.name} onClose={onClose}>
      <div className="card flush">
        <div className="list">
          {p.id !== activeId && (
            <ListItem
              icon={<FolderOpen size={20} />}
              title="Abrir como proyecto activo"
              onClick={run(() => {
                setActive(p.id);
                useNav.getState().resetTab('home');
              })}
            />
          )}
          <ListItem
            icon={<Pencil size={20} />}
            tone="info"
            title="Editar datos"
            sub="Nombre, cliente, zona UTM…"
            onClick={run(() => go('project-edit', { id: p.id }, 'home'))}
          />
          <ListItem
            icon={<Copy size={20} />}
            tone="accent"
            title="Duplicar"
            sub="Copia completa con todas sus libretas"
            onClick={run(() => {
              duplicate(p.id);
              toast('Proyecto duplicado');
            })}
          />
          <ListItem
            icon={<Download size={20} />}
            tone="ok"
            title="Exportar respaldo"
            sub={`${slug(p.name)}.topo.json`}
            onClick={run(() => void exportProjectBackup(p))}
          />
          <ListItem
            icon={<Trash2 size={20} />}
            tone="fail"
            title="Eliminar proyecto"
            sub="No se puede deshacer"
            onClick={run(async () => {
              const ok = await confirmDialog({
                title: '¿Eliminar proyecto?',
                text: `Se borrarán «${p.name}» y todos sus datos de este dispositivo. Exporta un respaldo si lo necesitas.`,
                okLabel: 'Eliminar',
                danger: true,
              });
              if (ok) {
                del(p.id);
                toast('Proyecto eliminado');
              }
            })}
          />
        </div>
      </div>
    </Sheet>
  );
}

export default function Projects(_: ScreenProps) {
  const projects = useStore((s) => s.projects);
  const activeId = useStore((s) => s.activeProjectId);
  const setActive = useStore((s) => s.setActiveProject);
  const loadDemo = useStore((s) => s.loadDemo);
  const [q, setQ] = useState('');
  const [menu, setMenu] = useState<Project | null>(null);

  const term = q.trim().toLowerCase();
  const list = [...projects]
    .filter((p) =>
      !term ? true : [p.name, p.client, p.location, p.surveyor].some((s) => s?.toLowerCase().includes(term)),
    )
    .sort((a, b) => (a.id === activeId ? -1 : b.id === activeId ? 1 : b.updatedAt.localeCompare(a.updatedAt)));

  return (
    <Screen
      back
      title="Proyectos"
      subtitle={`${projects.length} en este dispositivo`}
      actions={
        <button className="icon-btn" aria-label="Importar respaldo" title="Importar respaldo" onClick={() => void importProjectBackup()}>
          <FolderUp size={22} />
        </button>
      }
      fab={<Fab icon={<Plus size={22} />} label="Nuevo proyecto" onClick={() => go('project-edit', {}, 'home')} />}
    >
      <div className="stack">
        {projects.length > 3 && (
          <div className="hm-search-field">
            <Search size={18} />
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar proyecto…" />
          </div>
        )}

        {projects.length === 0 ? (
          <EmptyState
            icon={<Mountain size={28} />}
            title="Sin proyectos"
            text="Crea tu primer proyecto, importa un respaldo .topo.json o explora el ejemplo."
            action={
              <div className="stack" style={{ width: '100%', maxWidth: 320 }}>
                <button className="btn primary lg" onClick={() => go('project-edit', {}, 'home')}>
                  <Plus size={20} /> Crear proyecto
                </button>
                <button className="btn ghost lg" onClick={() => void importProjectBackup()}>
                  <FolderUp size={20} /> Importar respaldo
                </button>
                <button
                  className="btn ghost lg"
                  onClick={() => {
                    loadDemo();
                    useNav.getState().resetTab('home');
                  }}
                >
                  Proyecto de ejemplo
                </button>
              </div>
            }
          />
        ) : list.length === 0 ? (
          <p className="muted hm-center" style={{ padding: 24 }}>
            Ningún proyecto coincide con «{q}».
          </p>
        ) : (
          <div className="stack">
            {list.map((p) => {
              const active = p.id === activeId;
              return (
                <div key={p.id} className={`card flush hm-proj${active ? ' active' : ''}`}>
                  <button
                    className="hm-proj-main"
                    onClick={() => {
                      setActive(p.id);
                      useNav.getState().resetTab('home');
                    }}
                  >
                    <div className={`hm-proj-icon ${active ? 'tone-brand' : 'tone-info'}`}>
                      <Mountain size={22} />
                    </div>
                    <div className="grow">
                      <div className="hm-proj-title">
                        <span>{p.name}</span>
                        {active && (
                          <span className="badge ok">
                            <Check size={13} strokeWidth={3} /> Activo
                          </span>
                        )}
                      </div>
                      <div className="hm-proj-sub">
                        {[p.client, p.location].filter(Boolean).join(' · ') || 'Sin cliente'}
                      </div>
                      <div className="hm-proj-stats mono">
                        <span>{p.levelRuns.length} libretas</span>
                        <span>{p.points.length} pts</span>
                        <span>{p.benchmarks.length} BMs</span>
                        <span>
                          {p.crs.zone}
                          {p.crs.hemisphere}
                        </span>
                      </div>
                      <div className="xs faint">Editado {relative(p.updatedAt)}</div>
                    </div>
                  </button>
                  <button className="icon-btn hm-proj-more" aria-label={`Opciones de ${p.name}`} onClick={() => setMenu(p)}>
                    <MoreVertical size={22} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {projects.length > 0 && (
          <button className="btn ghost block" onClick={() => void importProjectBackup()}>
            <FolderUp size={18} /> Importar respaldo (.topo.json)
          </button>
        )}
      </div>
      <ProjectActions p={menu} onClose={() => setMenu(null)} />
    </Screen>
  );
}
