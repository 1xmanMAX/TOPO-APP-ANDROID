import { useState, type ReactNode } from 'react';
import {
  Archive,
  BookOpenCheck,
  ChevronRight,
  ClipboardCheck,
  Eye,
  FileDown,
  FileSpreadsheet,
  FileText,
  FileUp,
  FolderPlus,
  Layers,
  MapPinned,
  PenLine,
  Sparkles,
} from 'lucide-react';
import { go } from '@/app/nav';
import { useProject, useStore } from '@/app/store';
import { saveFile } from '@/app/platform';
import type { ID, Project } from '@/core/types';
import { computeLevelRun } from '@/core/leveling';
import { EmptyState, ListItem, QuickAction, Sheet, StatusBadge, toast } from '@/ui/kit';
import { dateShort, slug } from '@/ui/format';
import { projectToJson } from '@/io';
import { downloadReport, errorText, MIME, type ReportFmt, type ReportKind } from './shared';
import { Spinner } from './Spinner';
import { Page } from './Page';

type Action = ReportFmt | 'preview';

interface CardDef {
  kind: ReportKind;
  icon: ReactNode;
  tone: 'brand' | 'accent' | 'ok' | 'info' | 'warn';
  title: string;
  text: string;
  meta: string;
  disabled?: string;
  pdf: boolean;
  xlsx: boolean;
  preview: boolean;
}

function cards(p: Project): CardDef[] {
  const runs = p.levelRuns.length;
  const ctrls = p.layerControls.length;
  const pass = p.levelRuns.filter((r) => computeLevelRun(r).closure.passes === true).length;
  return [
    {
      kind: 'level',
      icon: <BookOpenCheck size={24} />,
      tone: 'brand',
      title: 'Libreta de nivelación',
      text: 'Lecturas, cotas compensadas, comprobación aritmética y cierre contra tolerancia.',
      meta: runs ? `${runs} libreta${runs > 1 ? 's' : ''} · ${pass} con cierre conforme` : 'Sin libretas',
      disabled: runs ? undefined : 'Crea o importa una libreta de nivelación',
      pdf: true,
      xlsx: true,
      preview: true,
    },
    {
      kind: 'layer',
      icon: <Layers size={24} />,
      tone: 'accent',
      title: 'Protocolo de control de capas',
      text: 'Cota de proyecto vs. medida por capa, desviación y conformidad punto a punto.',
      meta: ctrls ? `${ctrls} control${ctrls > 1 ? 'es' : ''} de capas` : 'Sin controles de capas',
      disabled: ctrls ? undefined : 'Crea un control de capas en Nivelación',
      pdf: true,
      xlsx: true,
      preview: true,
    },
    {
      kind: 'points',
      icon: <MapPinned size={24} />,
      tone: 'info',
      title: 'Cuadro de BMs y puntos',
      text: 'Bancos de nivel y coordenadas UTM (Este, Norte, Cota, código).',
      meta: `${p.benchmarks.length} BM · ${p.points.length} puntos`,
      disabled: p.points.length + p.benchmarks.length ? undefined : 'El proyecto no tiene puntos ni BMs',
      pdf: true,
      xlsx: true,
      preview: true,
    },
    {
      kind: 'summary',
      icon: <ClipboardCheck size={24} />,
      tone: 'ok',
      title: 'Informe de control topográfico',
      text: 'Resumen ejecutivo: indicadores, cierres de cada libreta y estado de las capas.',
      meta: 'Para supervisión / valorización',
      pdf: true,
      xlsx: true,
      preview: true,
    },
    {
      kind: 'project',
      icon: <FileSpreadsheet size={24} />,
      tone: 'warn',
      title: 'Proyecto completo (Excel)',
      text: 'Un libro con una hoja por libreta, control de capas, puntos y BMs.',
      meta: 'Para procesar en gabinete',
      pdf: false,
      xlsx: true,
      preview: false,
    },
  ];
}

export function ReportsRoot() {
  const project = useProject();
  const settings = useStore((s) => s.settings);
  const [busy, setBusy] = useState<string | null>(null);
  const [pick, setPick] = useState<{ kind: 'level' | 'layer'; action: Action } | null>(null);

  if (!project) {
    return (
      <Page title="Informes">
        <EmptyState
          icon={<FileText size={34} />}
          title="Sin proyecto activo"
          text="Crea un proyecto o carga el ejemplo para generar informes, importar y exportar datos."
          action={
            <div className="stack" style={{ width: '100%', maxWidth: 320 }}>
              <button className="btn primary lg block" onClick={() => go('project-edit', {}, 'home')}>
                <FolderPlus size={20} /> Crear proyecto
              </button>
              <button className="btn ghost lg block" onClick={() => useStore.getState().loadDemo()}>
                <Sparkles size={20} /> Cargar proyecto de ejemplo
              </button>
              <button className="btn ghost lg block" onClick={() => go('import', {})}>
                <FileUp size={20} /> Importar datos
              </button>
            </div>
          }
        />
      </Page>
    );
  }

  const run = async (kind: ReportKind, action: Action, id?: ID) => {
    if (action === 'preview') {
      go('report', { kind, id });
      return;
    }
    const key = `${kind}:${action}`;
    setBusy(key);
    try {
      await downloadReport(project, kind, action, { id });
      toast(action === 'pdf' ? 'PDF listo' : 'Excel listo');
    } catch (e) {
      toast(`No se pudo generar: ${errorText(e)}`, 'fail');
    } finally {
      setBusy(null);
    }
  };

  const onAction = (kind: ReportKind, action: Action) => {
    if (kind === 'level' || kind === 'layer') {
      const list = kind === 'level' ? project.levelRuns : project.layerControls;
      if (list.length === 1) return run(kind, action, list[0].id);
      setPick({ kind, action });
      return;
    }
    return run(kind, action);
  };

  const backup = async () => {
    try {
      await saveFile(`${slug(project.name)}.topo.json`, projectToJson(project), MIME.json);
      toast('Respaldo guardado');
    } catch (e) {
      toast(`No se pudo guardar: ${errorText(e)}`, 'fail');
    }
  };

  const noHeader = !settings.company.trim() && !settings.engineer.trim();

  return (
    <Page title="Informes" subtitle={project.name}>
      {noHeader && (
        <button className="rp-notice" onClick={() => go('settings', {}, 'home')}>
          <div className="rp-notice-icon">
            <PenLine size={20} />
          </div>
          <div className="grow">
            <strong>Configura tu membrete</strong>
            <span>Empresa, ingeniero y CIP aparecerán en cada informe.</span>
          </div>
          <ChevronRight size={20} />
        </button>
      )}

      <h2 className="section-title">Informes listos para supervisión</h2>
      <div className="rp-cards">
        {cards(project).map((c) => (
          <article key={c.kind} className={`card rp-card${c.disabled ? ' is-disabled' : ''}`}>
            <div className="rp-card-head">
              <div className={`rp-card-icon tone-${c.tone}`}>{c.icon}</div>
              <div className="grow" style={{ minWidth: 0 }}>
                <h3>{c.title}</h3>
                <p>{c.text}</p>
              </div>
            </div>
            <div className="rp-card-meta">{c.disabled ?? c.meta}</div>
            <div className="rp-card-actions">
              {c.pdf && (
                <button
                  className="btn primary"
                  disabled={!!c.disabled || busy !== null}
                  onClick={() => onAction(c.kind, 'pdf')}
                >
                  {busy === `${c.kind}:pdf` ? <Spinner /> : <FileDown size={18} />} PDF
                </button>
              )}
              {c.xlsx && (
                <button
                  className={`btn ${c.pdf ? 'ghost' : 'primary'}`}
                  disabled={!!c.disabled || busy !== null}
                  onClick={() => onAction(c.kind, 'xlsx')}
                >
                  {busy === `${c.kind}:xlsx` ? <Spinner /> : <FileSpreadsheet size={18} />} Excel
                </button>
              )}
              {c.preview && (
                <button
                  className="btn ghost rp-preview-btn"
                  disabled={!!c.disabled}
                  onClick={() => onAction(c.kind, 'preview')}
                  aria-label={`Vista previa: ${c.title}`}
                >
                  <Eye size={18} /> <span>Vista previa</span>
                </button>
              )}
            </div>
          </article>
        ))}
      </div>

      <h2 className="section-title">Datos</h2>
      <div className="grid-auto rp-quick">
        <QuickAction
          icon={<FileUp size={22} />}
          title="Importar datos"
          sub="Nivel digital, estación, GNSS, CSV"
          tone="brand"
          onClick={() => go('import', {})}
        />
        <QuickAction
          icon={<FileDown size={22} />}
          title="Exportar"
          sub="CSV, Excel, DXF, KML, LandXML, GSI"
          tone="accent"
          onClick={() => go('export', {})}
        />
        <QuickAction
          icon={<Archive size={22} />}
          title="Respaldo del proyecto"
          sub="Archivo .topo.json completo"
          tone="info"
          onClick={backup}
        />
      </div>

      <Sheet
        open={!!pick}
        title={pick?.kind === 'level' ? 'Elige la libreta' : 'Elige el control de capas'}
        onClose={() => setPick(null)}
      >
        <div className="list">
          {pick?.kind === 'level' &&
            project.levelRuns.map((r) => {
              const cl = computeLevelRun(r).closure;
              const st = cl.passes === undefined ? 'pending' : cl.passes ? 'ok' : 'fail';
              return (
                <ListItem
                  key={r.id}
                  icon={<BookOpenCheck size={20} />}
                  title={r.name}
                  sub={`${dateShort(r.date)} · ${r.observations.length} obs.`}
                  right={<StatusBadge status={st} label={st === 'pending' ? 'Abierta' : undefined} />}
                  onClick={() => {
                    const a = pick.action;
                    setPick(null);
                    void run('level', a, r.id);
                  }}
                />
              );
            })}
          {pick?.kind === 'layer' &&
            project.layerControls.map((c) => (
              <ListItem
                key={c.id}
                icon={<Layers size={20} />}
                tone="accent"
                title={c.name}
                sub={`${c.layers.length} capas · ${c.points.length} puntos de control`}
                right={<ChevronRight size={20} className="faint" />}
                onClick={() => {
                  const a = pick.action;
                  setPick(null);
                  void run('layer', a, c.id);
                }}
              />
            ))}
        </div>
      </Sheet>
    </Page>
  );
}
