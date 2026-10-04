/**
 * Kit de componentes de TOPO APP. Toda pantalla se arma con estas piezas
 * para mantener un lenguaje visual único.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { create } from 'zustand';
import { ArrowLeft, Check, Delete, X, AlertTriangle, CircleCheck, CircleX, Minus } from 'lucide-react';
import { pushBackOverlay, useNav } from '@/app/nav';
import type { ComplianceStatus } from '@/core/types';
import { vibrate } from '@/app/platform';
import { parseNum } from './format';

/* ------------------------------------------------------------------ */
/* Pantalla                                                            */
/* ------------------------------------------------------------------ */

interface ScreenProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Muestra flecha atrás (pantallas apiladas). */
  back?: boolean;
  actions?: ReactNode;
  fab?: ReactNode;
  children: ReactNode;
  /** Ancho máximo del contenido. */
  wide?: boolean;
}

export function Screen({ title, subtitle, back, actions, fab, children, wide }: ScreenProps) {
  const [scrolled, setScrolled] = useState(false);
  const goBack = useNav((s) => s.back);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 4);
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  return (
    <>
      <header className={`topbar${scrolled ? ' scrolled' : ''}`}>
        {back && (
          <button className="icon-btn" aria-label="Atrás" onClick={() => goBack()}>
            <ArrowLeft size={22} />
          </button>
        )}
        <div className="topbar-title">
          <h1>{title}</h1>
          {subtitle && <small>{subtitle}</small>}
        </div>
        {actions}
      </header>
      <main className="content" style={wide ? { maxWidth: 1280 } : undefined}>
        {children}
      </main>
      {fab}
    </>
  );
}

export function Fab({ icon, label, onClick }: { icon: ReactNode; label?: string; onClick: () => void }) {
  return (
    <button className="fab" onClick={onClick} aria-label={label}>
      {icon}
      {label && <span>{label}</span>}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Hoja inferior                                                       */
/* ------------------------------------------------------------------ */

export function Sheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current();
    window.addEventListener('keydown', k);
    // El botón atrás (Android / navegador) cierra la hoja en vez de salir de la pantalla.
    const unregister = pushBackOverlay(() => closeRef.current());
    return () => {
      window.removeEventListener('keydown', k);
      unregister();
    };
  }, [open]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true">
        <div className="sheet-handle" />
        {title && (
          <div className="sheet-header">
            <h2>{title}</h2>
            <button className="icon-btn" aria-label="Cerrar" onClick={onClose}>
              <X size={22} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Controles                                                           */
/* ------------------------------------------------------------------ */

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: ReactNode }>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === value}
          className={o.value === value ? 'active' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chips<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: ReactNode }>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="chips">
      {options.map((o) => (
        <button key={o.value} className={`chip${o.value === value ? ' active' : ''}`} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function TextInput({
  label,
  value,
  onChange,
  placeholder,
  hint,
  autoFocus,
}: {
  label: ReactNode;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: ReactNode;
  autoFocus?: boolean;
}) {
  return (
    <Field label={label} hint={hint}>
      <input
        className="input"
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

/**
 * Campo numérico que conserva el texto mientras se escribe (acepta coma) y
 * entrega `number | undefined` al padre.
 */
export function NumberInput({
  label,
  value,
  onChange,
  suffix,
  hint,
  placeholder,
  autoFocus,
  step,
}: {
  label?: ReactNode;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  suffix?: string;
  hint?: ReactNode;
  placeholder?: string;
  autoFocus?: boolean;
  step?: number;
}) {
  const [text, setText] = useState(value === undefined ? '' : String(value));
  const last = useRef(value);
  useEffect(() => {
    if (value !== last.current) {
      last.current = value;
      if (parseNum(text) !== value) setText(value === undefined ? '' : String(value));
    }
  }, [value, text]);
  const input = (
    <div className="input-group">
      <input
        className="input num"
        inputMode="decimal"
        value={text}
        step={step}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => {
          setText(e.target.value);
          const n = parseNum(e.target.value);
          last.current = n;
          onChange(n);
        }}
        style={suffix ? { paddingRight: 44 } : undefined}
      />
      {suffix && <span className="suffix">{suffix}</span>}
    </div>
  );
  if (label === undefined) return input;
  return (
    <Field label={label} hint={hint}>
      {input}
    </Field>
  );
}

export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: ReactNode;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
  hint?: ReactNode;
}) {
  return (
    <Field label={label} hint={hint}>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="row-between" style={{ minHeight: 48, cursor: 'pointer' }}>
      <span style={{ fontWeight: 600 }}>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: 24, height: 24, accentColor: 'var(--brand)' }}
      />
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* Presentación                                                        */
/* ------------------------------------------------------------------ */

const STATUS_META: Record<ComplianceStatus, { cls: string; label: string; Icon: typeof Check }> = {
  ok: { cls: 'ok', label: 'Cumple', Icon: CircleCheck },
  warn: { cls: 'warn', label: 'Al límite', Icon: AlertTriangle },
  fail: { cls: 'fail', label: 'No cumple', Icon: CircleX },
  pending: { cls: 'neutral', label: 'Pendiente', Icon: Minus },
};

/** Estado con icono + texto + color (nunca solo color). */
export function StatusBadge({ status, label }: { status: ComplianceStatus; label?: string }) {
  const m = STATUS_META[status];
  return (
    <span className={`badge ${m.cls}`}>
      <m.Icon size={14} strokeWidth={2.5} />
      {label ?? m.label}
    </span>
  );
}

export function Kpi({
  label,
  value,
  unit,
  sub,
  tone,
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: string;
  sub?: ReactNode;
  tone?: 'ok' | 'warn' | 'fail' | 'brand';
}) {
  const color = tone ? `var(--${tone === 'brand' ? 'brand' : tone})` : undefined;
  return (
    <div className="kpi">
      <span className="kpi-label">{label}</span>
      <span className="kpi-value" style={{ color }}>
        {value}
        {unit && <small>{unit}</small>}
      </span>
      {sub && <span className="kpi-sub">{sub}</span>}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon: ReactNode;
  title: string;
  text?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="e-icon">{icon}</div>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

export function QuickAction({
  icon,
  title,
  sub,
  tone = 'brand',
  onClick,
}: {
  icon: ReactNode;
  title: string;
  sub?: string;
  tone?: 'brand' | 'accent' | 'ok' | 'warn' | 'info' | 'fail';
  onClick: () => void;
}) {
  return (
    <button className="quick" onClick={onClick}>
      <div className={`q-icon tone-${tone}`}>{icon}</div>
      <div>
        <strong>{title}</strong>
        {sub && (
          <>
            <br />
            <span>{sub}</span>
          </>
        )}
      </div>
    </button>
  );
}

export function ListItem({
  icon,
  tone = 'brand',
  title,
  sub,
  right,
  onClick,
}: {
  icon?: ReactNode;
  tone?: 'brand' | 'accent' | 'ok' | 'warn' | 'info' | 'fail';
  title: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button className="list-item" onClick={onClick}>
      {icon && <div className={`li-icon tone-${tone}`}>{icon}</div>}
      <div className="li-body">
        <div className="li-title">{title}</div>
        {sub && <div className="li-sub">{sub}</div>}
      </div>
      {right}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Teclado numérico de campo                                           */
/* ------------------------------------------------------------------ */

/**
 * Teclado grande para lecturas de mira: 0-9, punto, borrar, ± y "Siguiente".
 * Pensado para uso con una mano y guantes.
 */
export function NumPad({
  value,
  onChange,
  onEnter,
  enterLabel = 'Siguiente',
  allowNegative,
}: {
  value: string;
  onChange: (v: string) => void;
  onEnter: () => void;
  enterLabel?: string;
  allowNegative?: boolean;
}) {
  const press = (k: string) => {
    vibrate(8);
    if (k === 'del') return onChange(value.slice(0, -1));
    if (k === 'clr') return onChange('');
    if (k === 'neg') return onChange(value.startsWith('-') ? value.slice(1) : '-' + value);
    if (k === '.' && value.includes('.')) return;
    if (value.replace('-', '').replace('.', '').length + k.length > 9) return;
    onChange(value + k);
  };
  return (
    <div className="numpad">
      {['7', '8', '9'].map((k) => (
        <button key={k} onClick={() => press(k)}>
          {k}
        </button>
      ))}
      <button className="k-fn" onClick={() => press('del')} aria-label="Borrar">
        <Delete size={22} />
      </button>
      {['4', '5', '6'].map((k) => (
        <button key={k} onClick={() => press(k)}>
          {k}
        </button>
      ))}
      <button className="k-fn" onClick={() => press('clr')}>
        Limpiar
      </button>
      {['1', '2', '3'].map((k) => (
        <button key={k} onClick={() => press(k)}>
          {k}
        </button>
      ))}
      <button
        className="k-ok"
        onClick={() => {
          vibrate(18);
          onEnter();
        }}
      >
        {enterLabel}
      </button>
      <button onClick={() => press(allowNegative ? 'neg' : '0')}>{allowNegative ? '±' : '0'}</button>
      <button onClick={() => press(allowNegative ? '0' : '.')}>{allowNegative ? '0' : '.'}</button>
      <button onClick={() => press(allowNegative ? '.' : '00')} className={allowNegative ? '' : 'k-fn'}>
        {allowNegative ? '.' : '00'}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Toasts y confirmaciones                                             */
/* ------------------------------------------------------------------ */

interface ToastMsg {
  id: number;
  text: string;
  tone: 'ok' | 'warn' | 'fail' | 'info';
  action?: { label: string; run: () => void };
}

const useToasts = create<{ list: ToastMsg[] }>(() => ({ list: [] }));
let toastSeq = 0;

export function toast(text: string, tone: ToastMsg['tone'] = 'ok', action?: ToastMsg['action']): void {
  const id = ++toastSeq;
  useToasts.setState((s) => ({ list: [...s.list.slice(-2), { id, text, tone, action }] }));
  setTimeout(() => useToasts.setState((s) => ({ list: s.list.filter((t) => t.id !== id) })), action ? 5000 : 2800);
}

export function ToastHost() {
  const list = useToasts((s) => s.list);
  return (
    <div className="toast-host" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={`toast ${t.tone}`}>
          <span className="dot" />
          <span className="grow">{t.text}</span>
          {t.action && (
            <button
              className="btn sm"
              style={{ background: 'rgba(255,255,255,0.14)', color: '#fff' }}
              onClick={() => {
                t.action!.run();
                useToasts.setState((s) => ({ list: s.list.filter((x) => x.id !== t.id) }));
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

interface ConfirmReq {
  title: string;
  text?: string;
  okLabel?: string;
  danger?: boolean;
  resolve: (v: boolean) => void;
}

const useConfirm = create<{ req: ConfirmReq | null }>(() => ({ req: null }));

export function confirmDialog(opts: Omit<ConfirmReq, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => useConfirm.setState({ req: { ...opts, resolve } }));
}

export function ConfirmHost() {
  const req = useConfirm((s) => s.req);
  const close = (v: boolean) => {
    req?.resolve(v);
    useConfirm.setState({ req: null });
  };
  return (
    <Sheet open={!!req} title={req?.title} onClose={() => close(false)}>
      <div className="stack">
        {req?.text && <p className="muted">{req.text}</p>}
        <div className="grid-2" style={{ marginTop: 8 }}>
          <button className="btn ghost lg" onClick={() => close(false)}>
            Cancelar
          </button>
          <button className={`btn lg ${req?.danger ? 'danger' : 'primary'}`} onClick={() => close(true)}>
            {req?.okLabel ?? 'Aceptar'}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
