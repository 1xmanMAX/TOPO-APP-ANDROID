import type { ReactNode } from 'react';
import {
  BookOpen,
  Database,
  ExternalLink,
  Heart,
  Info,
  Palette,
  Ruler,
  Sparkles,
  Trash2,
  FileText,
} from 'lucide-react';
import type { ScreenProps } from '@/app/feature';
import { useNav } from '@/app/nav';
import { useStore, type ThemeMode } from '@/app/store';
import { BrandMark } from './BrandMark';
import { Field, Screen, Segmented, StatusBadge, TextInput, Toggle, confirmDialog, toast } from '@/ui/kit';
import { vibrate } from '@/app/platform';

const VERSION = '1.0.0';
const REPO = 'https://github.com/1xmanMAX/TOPO-APP-ANDROID';

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="stack">
      <h2 className="section-title hm-sec-title">
        {icon}
        {title}
      </h2>
      <div className="card stack">{children}</div>
    </section>
  );
}

/** Vista previa del tema activo: libreta en miniatura. */
function ThemePreview({ decimals }: { decimals: number }) {
  return (
    <div className="hm-preview" aria-label="Vista previa del tema">
      <div className="hm-preview-head">
        <span className="hm-preview-dot" />
        <b>Circuito BM-1</b>
        <StatusBadge status="ok" label="Cumple" />
      </div>
      <div className="hm-preview-rows mono">
        <span>BS BM-1</span>
        <span>{(1.425).toFixed(decimals)}</span>
        <span className="c-brand">{(152.315).toFixed(decimals)}</span>
        <span>FS PC-1</span>
        <span>{(0.968).toFixed(decimals)}</span>
        <span>{(152.772).toFixed(decimals)}</span>
      </div>
      <div className="hm-preview-foot">
        <span className="badge warn">Al límite</span>
        <span className="badge fail">No cumple</span>
        <button className="btn primary sm" tabIndex={-1}>
          Siguiente
        </button>
      </div>
    </div>
  );
}

export default function Settings(_: ScreenProps) {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const loadDemo = useStore((s) => s.loadDemo);

  const wipe = async () => {
    const ok = await confirmDialog({
      title: '¿Borrar todos los datos?',
      text: 'Se eliminarán todos los proyectos, libretas, puntos y ajustes de este dispositivo. Esta acción no se puede deshacer.',
      okLabel: 'Borrar todo',
      danger: true,
    });
    if (!ok) return;
    try {
      localStorage.clear();
    } catch {
      /* almacenamiento bloqueado */
    }
    location.reload();
  };

  return (
    <Screen back title="Ajustes">
      <div className="stack-l hm-settings">
        <Section icon={<Palette size={15} />} title="Apariencia">
          <Field label="Tema" hint="«Sol» maximiza el contraste para trabajar a pleno sol.">
            <Segmented<ThemeMode>
              value={settings.theme}
              onChange={(v) => setSettings({ theme: v })}
              options={[
                { value: 'auto', label: 'Auto' },
                { value: 'light', label: 'Claro' },
                { value: 'dark', label: 'Oscuro' },
                { value: 'sun', label: 'Sol' },
              ]}
            />
          </Field>
          <ThemePreview decimals={settings.decimals} />
        </Section>

        <Section icon={<Ruler size={15} />} title="Unidades y formato">
          <Field label="Decimales en cotas y lecturas">
            <Segmented<string>
              value={String(settings.decimals)}
              onChange={(v) => setSettings({ decimals: Number(v) })}
              options={[
                { value: '2', label: '0.01 m' },
                { value: '3', label: '0.001 m' },
                { value: '4', label: '0.0001 m' },
              ]}
            />
          </Field>
          <Toggle
            checked={settings.haptics}
            onChange={(v) => {
              setSettings({ haptics: v });
              if (v) vibrate(20);
            }}
            label="Vibrar al confirmar lecturas"
          />
        </Section>

        <Section icon={<FileText size={15} />} title="Membrete de informes">
          <TextInput
            label="Empresa"
            value={settings.company}
            onChange={(v) => setSettings({ company: v })}
            placeholder="Ej. Topografía & Ingeniería S.A.C."
          />
          <div className="md-grid-2 stack">
            <TextInput
              label="Ingeniero responsable"
              value={settings.engineer}
              onChange={(v) => setSettings({ engineer: v })}
              placeholder="Ing. Nombre Apellido"
            />
            <TextInput
              label="CIP"
              value={settings.cip}
              onChange={(v) => setSettings({ cip: v })}
              placeholder="N° de colegiatura"
            />
          </div>
          <p className="xs faint">Aparece en la cabecera y el bloque de firma de cada PDF.</p>
        </Section>

        <Section icon={<Database size={15} />} title="Datos">
          <button
            className="btn ghost lg block"
            onClick={() => {
              loadDemo();
              toast('Proyecto de ejemplo cargado');
              useNav.getState().resetTab('home');
            }}
          >
            <Sparkles size={20} /> Cargar proyecto de ejemplo
          </button>
          <button className="btn danger lg block" onClick={() => void wipe()}>
            <Trash2 size={20} /> Borrar todos los datos
          </button>
          <p className="xs faint">
            Todo se guarda localmente en este dispositivo. Exporta respaldos desde Proyectos.
          </p>
        </Section>

        <Section icon={<Info size={15} />} title="Acerca de">
          <div className="row hm-about">
            <BrandMark size={52} />
            <div className="grow">
              <strong className="hm-about-name">TOPO APP</strong>
              <div className="small muted">
                Versión <span className="mono">{VERSION}</span> · Topografía de campo sin internet
              </div>
            </div>
          </div>
          <div className="list hm-links">
            <a className="list-item" href={`${REPO}#readme`} target="_blank" rel="noreferrer">
              <div className="li-icon tone-info">
                <BookOpen size={20} />
              </div>
              <div className="li-body">
                <div className="li-title">Guía de uso</div>
                <div className="li-sub">README del proyecto</div>
              </div>
              <ExternalLink size={18} className="faint" />
            </a>
            <a className="list-item" href={`${REPO}/tree/main/docs`} target="_blank" rel="noreferrer">
              <div className="li-icon tone-accent">
                <FileText size={20} />
              </div>
              <div className="li-body">
                <div className="li-title">Documentación técnica</div>
                <div className="li-sub">Fórmulas, tolerancias y formatos de equipos</div>
              </div>
              <ExternalLink size={18} className="faint" />
            </a>
          </div>
          <p className="small muted hm-center hm-credits">
            Hecho en Perú <Heart size={14} className="c-fail" fill="currentColor" /> para topógrafos y residentes de obra.
          </p>
        </Section>
      </div>
    </Screen>
  );
}
