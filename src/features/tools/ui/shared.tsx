/**
 * Piezas comunes de las herramientas de cálculo: estado persistido por
 * herramienta, tarjeta de resultado, "¿Cómo se calcula?", acciones, entrada
 * de ángulos G-M-S y selector de puntos del proyecto.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, ChevronDown, Copy, Info, MapPinPlus, CircleX, CircleCheck } from 'lucide-react';
import { useProject, useStore } from '@/app/store';
import { go, useNav } from '@/app/nav';
import { NumberInput, Sheet, TextInput, toast } from '@/ui/kit';
import { dmsToDeg, formatDms } from '@/core/units';
import type { SurveyPoint } from '@/core/types';

/* ------------------------------------------------------------------ */
/* Estado persistido                                                   */
/* ------------------------------------------------------------------ */

export const storageKey = (id: string) => `topo-tools/${id}`;

export const ToolIdContext = createContext<string>('tool');

function load<T extends object>(id: string, defaults: T): T {
  try {
    const raw = localStorage.getItem(storageKey(id));
    if (!raw) return defaults;
    const v = JSON.parse(raw) as Partial<T>;
    return v && typeof v === 'object' ? { ...defaults, ...v } : defaults;
  } catch {
    return defaults;
  }
}

/**
 * Estado de la herramienta, recordado en localStorage (`topo-tools/<id>`).
 * Devuelve [estado, parche].
 */
export function useToolState<T extends object>(defaults: T): [T, (patch: Partial<T>) => void] {
  const id = useContext(ToolIdContext);
  const [state, setState] = useState<T>(() => load(id, defaults));
  const first = useRef(true);
  useEffect(() => {
    // No escribe en el montaje: así "Limpiar" deja la clave vacía.
    if (first.current) {
      first.current = false;
      return;
    }
    try {
      localStorage.setItem(storageKey(id), JSON.stringify(state));
    } catch {
      /* sin almacenamiento */
    }
  }, [id, state]);
  const patch = useCallback((p: Partial<T>) => setState((s) => ({ ...s, ...p })), []);
  return [state, patch];
}

/* ------------------------------------------------------------------ */
/* Formato                                                             */
/* ------------------------------------------------------------------ */

/** Número con decimales fijos, "—" si no es finito, sin "-0.000". */
export function n(v: number | undefined | null, dec = 3): string {
  if (v === undefined || v === null || !Number.isFinite(v)) return '—';
  const s = v.toFixed(dec);
  return /^-0\.?0*$/.test(s) ? s.slice(1) : s;
}

/** Con signo explícito (+/−). */
export function ns(v: number | undefined | null, dec = 3): string {
  const s = n(v, dec);
  if (s === '—' || Number(s) === 0) return s;
  return s.startsWith('-') ? '−' + s.slice(1) : '+' + s;
}

/** Ángulo sexagesimal. */
export const dms = (deg: number | undefined, dec = 1) =>
  deg === undefined || !Number.isFinite(deg) ? '—' : formatDms(deg, dec);

/** Entero con separador de miles. */
export function nk(v: number, dec = 0): string {
  if (!Number.isFinite(v)) return '—';
  const [i, d] = Math.abs(v).toFixed(dec).split('.');
  return `${v < 0 ? '−' : ''}${i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}${d ? '.' + d : ''}`;
}

/* ------------------------------------------------------------------ */
/* Presentación                                                        */
/* ------------------------------------------------------------------ */

export function InputCard({ title, children, aside }: { title?: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="card stack">
      {(title || aside) && (
        <div className="row-between">
          {title && <h3 className="tl-card-title">{title}</h3>}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

export type Tone = 'ok' | 'warn' | 'fail' | 'cut' | 'fill' | 'brand';

/** Resultado principal: número grande en fuente mono con unidad. */
export function ResultCard({
  label,
  value,
  unit,
  sub,
  tone,
  extra,
  children,
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: string;
  sub?: ReactNode;
  tone?: Tone;
  extra?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className={`tl-result${tone ? ` tl-tone-${tone}` : ''}`} aria-live="polite">
      <div className="row-between" style={{ alignItems: 'flex-start' }}>
        <span className="tl-result-label">{label}</span>
        {extra}
      </div>
      <div className="tl-result-value">
        {value}
        {unit && <small>{unit}</small>}
      </div>
      {sub && <div className="tl-result-sub">{sub}</div>}
      {children}
    </section>
  );
}

/** Varios valores grandes lado a lado dentro de una ResultCard. */
export function ResultPair({ items }: { items: Array<{ label: string; value: ReactNode; unit?: string }> }) {
  return (
    <div className="tl-pair">
      {items.map((it) => (
        <div key={it.label}>
          <span className="tl-result-label">{it.label}</span>
          <div className="tl-result-value tl-sm">
            {it.value}
            {it.unit && <small>{it.unit}</small>}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Veredicto con icono + texto + color. */
export function Verdict({ ok, okText = 'CUMPLE', failText = 'NO CUMPLE' }: { ok: boolean; okText?: string; failText?: string }) {
  return (
    <span className={`tl-verdict ${ok ? 'ok' : 'fail'}`}>
      {ok ? <CircleCheck size={18} strokeWidth={2.5} /> : <CircleX size={18} strokeWidth={2.5} />}
      {ok ? okText : failText}
    </span>
  );
}

/** Aviso/validación en línea. */
export function Notice({ tone = 'warn', children }: { tone?: 'warn' | 'fail' | 'info'; children: ReactNode }) {
  const Icon = tone === 'info' ? Info : tone === 'fail' ? CircleX : AlertTriangle;
  return (
    <div className={`tl-notice ${tone}`} role={tone === 'info' ? undefined : 'alert'}>
      <Icon size={18} />
      <div>{children}</div>
    </div>
  );
}

/** Mensaje cuando faltan datos (no es error). */
export function Waiting({ children }: { children: ReactNode }) {
  return <div className="tl-waiting">{children}</div>;
}

/** Bloque plegable "¿Cómo se calcula?" con fórmula y fuente. */
export function HowTo({ children, source }: { children: ReactNode; source?: ReactNode }) {
  return (
    <details className="tl-howto">
      <summary>
        <span>¿Cómo se calcula?</span>
        <ChevronDown size={18} className="tl-chev" />
      </summary>
      <div className="tl-howto-body">
        {children}
        {source && <p className="tl-source">Fuente: {source}</p>}
      </div>
    </details>
  );
}

/** Fórmula en bloque mono. */
export function Formula({ children }: { children: ReactNode }) {
  return <pre className="tl-formula">{children}</pre>;
}

/* ------------------------------------------------------------------ */
/* Acciones                                                            */
/* ------------------------------------------------------------------ */

export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast('Resultado copiado');
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      toast('Resultado copiado');
    } catch {
      toast('No se pudo copiar', 'fail');
    }
  }
}

export interface PointDraft {
  name: string;
  x: number;
  y: number;
  z?: number;
  code?: string;
  note?: string;
}

/** Nombre libre siguiente con un prefijo: P-1, P-2… */
export function nextName(points: SurveyPoint[], prefix = 'C-'): string {
  const used = new Set(points.map((p) => p.name));
  let i = 1;
  while (used.has(`${prefix}${i}`)) i++;
  return `${prefix}${i}`;
}

/**
 * Barra de acciones: "Copiar resultado" y, si se dan puntos, "Guardar como
 * punto(s)" (pide nombre si es uno solo).
 */
export function ToolActions({
  copy,
  points,
  saveLabel,
}: {
  copy?: string | null;
  points?: PointDraft[] | null;
  saveLabel?: string;
}) {
  const project = useProject();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const single = points && points.length === 1 ? points[0] : null;

  const save = (list: PointDraft[]) => {
    if (!project) return;
    const existing = new Set(project.points.map((p) => p.name));
    const dup = list.filter((p) => existing.has(p.name)).map((p) => p.name);
    useStore.getState().addPoints(
      list.map((p) => ({
        name: p.name,
        code: p.code || undefined,
        x: p.x,
        y: p.y,
        z: p.z,
        note: p.note,
        source: 'calc' as const,
      })),
    );
    toast(
      list.length === 1 ? `Punto ${list[0].name} guardado` : `${list.length} puntos guardados`,
      dup.length ? 'warn' : 'ok',
      { label: 'Ver', run: () => useNav.getState().setTab('points') },
    );
  };

  const onSave = () => {
    if (!project) {
      toast('Abre o crea un proyecto para guardar puntos', 'warn', {
        label: 'Proyectos',
        run: () => go('projects', {}, 'home'),
      });
      return;
    }
    if (!points?.length) return;
    if (single) {
      setName(single.name || nextName(project.points));
      setCode(single.code ?? '');
      setOpen(true);
    } else {
      save(points);
    }
  };

  const canSave = !!points && points.length > 0;
  if (copy === undefined && points === undefined) return null;
  return (
    <>
      <div className="tl-actions">
        {copy !== undefined && (
          <button className="btn ghost lg" disabled={!copy} onClick={() => copy && copyText(copy)}>
            <Copy size={20} /> Copiar resultado
          </button>
        )}
        {points !== undefined && (
          <button className="btn primary lg" disabled={!canSave} onClick={onSave}>
            <MapPinPlus size={20} /> {saveLabel ?? (points && points.length > 1 ? `Guardar ${points.length} puntos` : 'Guardar como punto')}
          </button>
        )}
      </div>
      <Sheet open={open} title="Guardar como punto" onClose={() => setOpen(false)}>
        {single && (
          <div className="stack">
            <div className="grid-2">
              <TextInput label="Nombre" value={name} onChange={setName} autoFocus />
              <TextInput label="Código" value={code} onChange={setCode} placeholder="Opcional" />
            </div>
            <div className="tl-coords mono">
              <span>E {n(single.x)}</span>
              <span>N {n(single.y)}</span>
              {single.z !== undefined && <span>Z {n(single.z)}</span>}
            </div>
            {project?.points.some((p) => p.name === name.trim()) && (
              <Notice>Ya existe un punto llamado “{name.trim()}”. Se guardará igualmente.</Notice>
            )}
            <button
              className="btn primary lg block"
              disabled={!name.trim()}
              onClick={() => {
                save([{ ...single, name: name.trim(), code: code.trim() || undefined }]);
                setOpen(false);
              }}
            >
              <MapPinPlus size={20} /> Guardar en {project?.name ?? 'el proyecto'}
            </button>
          </div>
        )}
      </Sheet>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Ángulos G° M' S"                                                    */
/* ------------------------------------------------------------------ */

export interface Ang {
  d?: number;
  m?: number;
  s?: number;
  /** Para lat/lon con hemisferio: true = S / W. */
  neg?: boolean;
}

export type AngResult = { deg?: number; error?: string };

/** Interpreta un Ang. Sin grados → sin valor. */
export function angValue(a: Ang | undefined, opts: { signed?: boolean } = {}): AngResult {
  if (!a || a.d === undefined) {
    if (a && (a.m !== undefined || a.s !== undefined)) return { error: 'Faltan los grados' };
    return {};
  }
  const m = a.m ?? 0;
  const s = a.s ?? 0;
  if (m < 0 || s < 0) return { error: 'Minutos y segundos deben ser positivos' };
  if (m >= 60 || s >= 60) return { error: 'Minutos y segundos deben ser menores que 60' };
  if ((a.m !== undefined || a.s !== undefined) && !Number.isInteger(a.d)) {
    return { error: 'Con minutos/segundos, los grados deben ser enteros' };
  }
  let deg = dmsToDeg(a.d, m, s);
  if (opts.signed !== false && a.neg) deg = -Math.abs(deg);
  return { deg };
}

/** Grados → Ang (G, M enteros; S con 2 decimales). */
export function toAng(deg: number, neg?: boolean): Ang {
  const v = Math.abs(deg);
  let d = Math.floor(v);
  let m = Math.floor((v - d) * 60);
  let s = Math.round(((v - d) * 60 - m) * 60 * 10000) / 10000;
  if (s >= 60) { s -= 60; m += 1; }
  if (m >= 60) { m -= 60; d += 1; }
  return neg === undefined ? { d: deg < 0 ? -d : d, m, s } : { d, m, s, neg };
}

/**
 * Entrada de ángulo con tres casillas G° M' S" (teclado numérico). Para
 * grados decimales basta con escribir en la casilla de grados.
 */
export function AngleInput({
  label,
  value,
  onChange,
  hint,
  hemis,
}: {
  label: ReactNode;
  value: Ang | undefined;
  onChange: (v: Ang) => void;
  hint?: ReactNode;
  /** Etiquetas de hemisferio [positivo, negativo], p.ej. ['N','S']. */
  hemis?: [string, string];
}) {
  const v = value ?? {};
  const r = angValue(v);
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="tl-ang">
        {hemis && (
          <button
            type="button"
            className="tl-hemi"
            aria-label={`Hemisferio ${v.neg ? hemis[1] : hemis[0]} (cambiar)`}
            onClick={() => onChange({ ...v, neg: !v.neg })}
          >
            {v.neg ? hemis[1] : hemis[0]}
          </button>
        )}
        <NumberInput value={v.d} onChange={(d) => onChange({ ...v, d })} suffix="°" placeholder="G" />
        <NumberInput value={v.m} onChange={(m) => onChange({ ...v, m })} suffix="'" placeholder="M" />
        <NumberInput value={v.s} onChange={(s) => onChange({ ...v, s })} suffix={'"'} placeholder="S" />
      </div>
      {r.error ? (
        <span className="hint c-fail">{r.error}</span>
      ) : r.deg !== undefined ? (
        <span className="hint mono">
          = {r.deg.toFixed(6)}°{hint ? <span className="tl-hint-sep"> · {hint}</span> : null}
        </span>
      ) : (
        hint && <span className="hint">{hint}</span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Punto (del proyecto o escrito)                                      */
/* ------------------------------------------------------------------ */

export interface PtVal {
  /** Id del punto del proyecto del que se copió. */
  ref?: string;
  name?: string;
  x?: number;
  y?: number;
  z?: number;
}

export function ptXY(p: PtVal | undefined): { x: number; y: number; z?: number } | null {
  if (!p || p.x === undefined || p.y === undefined) return null;
  return { x: p.x, y: p.y, z: p.z };
}

/** Selector compacto de puntos del proyecto. */
export function PointSelect({
  onPick,
  label = 'Elegir del proyecto…',
  exclude,
}: {
  onPick: (p: SurveyPoint) => void;
  label?: string;
  exclude?: Set<string>;
}) {
  const project = useProject();
  const pts = useMemo(
    () => (project ? [...project.points].filter((p) => !exclude?.has(p.id)).sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true })) : []),
    [project, exclude],
  );
  if (!project || pts.length === 0) return null;
  return (
    <select
      className="input tl-pick"
      value=""
      aria-label={label}
      onChange={(e) => {
        const p = pts.find((x) => x.id === e.target.value);
        if (p) onPick(p);
      }}
    >
      <option value="">{label}</option>
      {pts.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
          {p.code ? ` · ${p.code}` : ''}
        </option>
      ))}
    </select>
  );
}

/**
 * Punto: E, N (y opcionalmente Z) escritos a mano o copiados de un punto del
 * proyecto. Editar una coordenada desvincula el punto.
 */
export function PointField({
  label,
  value,
  onChange,
  withZ,
  zLabel = 'Cota Z',
}: {
  label: ReactNode;
  value: PtVal | undefined;
  onChange: (v: PtVal) => void;
  withZ?: boolean;
  zLabel?: string;
}) {
  const v = value ?? {};
  const edit = (p: Partial<PtVal>) => onChange({ ...v, ...p, ref: undefined, name: undefined });
  return (
    <div className="tl-point">
      <div className="tl-point-head">
        <span className="tl-point-label">
          {label}
          {v.name && <span className="badge info">{v.name}</span>}
        </span>
        <PointSelect onPick={(p) => onChange({ ref: p.id, name: p.name, x: p.x, y: p.y, z: p.z })} label="Del proyecto…" />
      </div>
      <div className="grid-2">
        <NumberInput label="Este (E)" value={v.x} onChange={(x) => edit({ x })} suffix="m" />
        <NumberInput label="Norte (N)" value={v.y} onChange={(y) => edit({ y })} suffix="m" />
        {withZ && <NumberInput label={zLabel} value={v.z} onChange={(z) => edit({ z })} suffix="m" hint="Opcional" />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Croquis en planta (SVG)                                             */
/* ------------------------------------------------------------------ */

export interface SketchPt {
  x: number;
  y: number;
  label?: string;
  kind?: 'known' | 'new' | 'station' | 'plain';
}

/**
 * Croquis simple en planta: escala uniforme, norte arriba. Dibuja polilíneas,
 * polígonos, circunferencias y puntos rotulados.
 */
export function PlanSketch({
  points,
  lines = [],
  polygon,
  dashed = [],
  circles = [],
  height = 240,
  ariaLabel = 'Croquis en planta',
}: {
  points: SketchPt[];
  lines?: Array<[SketchPt, SketchPt]>;
  polygon?: SketchPt[];
  dashed?: Array<[SketchPt, SketchPt]>;
  circles?: Array<{ c: SketchPt; r: number }>;
  height?: number;
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(340);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(200, el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const all: SketchPt[] = [...points, ...(polygon ?? [])];
  for (const c of circles) {
    all.push({ x: c.c.x - c.r, y: c.c.y - c.r }, { x: c.c.x + c.r, y: c.c.y + c.r });
  }
  const finite = all.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (finite.length === 0) return null;
  const minX = Math.min(...finite.map((p) => p.x));
  const maxX = Math.max(...finite.map((p) => p.x));
  const minY = Math.min(...finite.map((p) => p.y));
  const maxY = Math.max(...finite.map((p) => p.y));
  const pad = 28;
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const sc = Math.min((w - 2 * pad) / spanX, (height - 2 * pad) / spanY);
  const ox = (w - spanX * sc) / 2;
  const oy = (height - spanY * sc) / 2;
  const X = (x: number) => ox + (x - minX) * sc;
  const Y = (y: number) => height - (oy + (y - minY) * sc);
  const pts = (arr: SketchPt[]) => arr.map((p) => `${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ');
  // Barra de escala "redonda"
  const target = spanX * 0.25 || 1;
  const pow = 10 ** Math.floor(Math.log10(target));
  const bar = [1, 2, 5, 10].map((k) => k * pow).find((v) => v >= target) ?? pow;
  return (
    <div ref={ref} className="tl-sketch">
      <svg width={w} height={height} viewBox={`0 0 ${w} ${height}`} role="img" aria-label={ariaLabel}>
        {polygon && polygon.length >= 3 && <polygon points={pts(polygon)} className="tl-sk-poly" />}
        {circles.map((c, i) => (
          <circle key={i} cx={X(c.c.x)} cy={Y(c.c.y)} r={c.r * sc} className="tl-sk-circle" />
        ))}
        {dashed.map(([a, b], i) => (
          <line key={i} x1={X(a.x)} y1={Y(a.y)} x2={X(b.x)} y2={Y(b.y)} className="tl-sk-dash" />
        ))}
        {lines.map(([a, b], i) => (
          <line key={i} x1={X(a.x)} y1={Y(a.y)} x2={X(b.x)} y2={Y(b.y)} className="tl-sk-line" />
        ))}
        {points.map((p, i) => (
          <g key={i} className={`tl-sk-pt ${p.kind ?? 'plain'}`}>
            {p.kind === 'station' ? (
              <polygon points={`${X(p.x)},${Y(p.y) - 7} ${X(p.x) - 6},${Y(p.y) + 5} ${X(p.x) + 6},${Y(p.y) + 5}`} />
            ) : (
              <circle cx={X(p.x)} cy={Y(p.y)} r={p.kind === 'new' ? 5.5 : 4.5} />
            )}
            {p.label && (
              <text x={X(p.x) + 8} y={Y(p.y) - 8} className="tl-sk-label">
                {p.label}
              </text>
            )}
          </g>
        ))}
        <g className="tl-sk-north" transform={`translate(${w - 18}, 22)`}>
          <path d="M0,-12 L5,4 L0,0 L-5,4 Z" />
          <text y={16} textAnchor="middle">N</text>
        </g>
        <g className="tl-sk-scale" transform={`translate(12, ${height - 12})`}>
          <line x1={0} y1={0} x2={bar * sc} y2={0} />
          <line x1={0} y1={-4} x2={0} y2={4} />
          <line x1={bar * sc} y1={-4} x2={bar * sc} y2={4} />
          <text x={bar * sc + 6} y={4}>
            {bar >= 1 ? bar : bar.toFixed(2)} m
          </text>
        </g>
      </svg>
    </div>
  );
}
