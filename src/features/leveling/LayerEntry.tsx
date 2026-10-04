/** 'layer-entry' — captura rápida de cotas medidas para una capa. */
import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, CheckCheck, MapPinned, SkipForward, Telescope } from 'lucide-react';
import type { ScreenProps } from '@/app/feature';
import { useNav } from '@/app/nav';
import { useStore } from '@/app/store';
import { vibrate } from '@/app/platform';
import { layerDesignElevation, statusFor } from '@/core/pavement';
import { gradeStake } from '@/core/leveling';
import type { LayerControl, PavementLayer } from '@/core/types';
import { NumPad, NumberInput, Screen, Segmented, Sheet, StatusBadge, toast } from '@/ui/kit';
import { f, fs, parseNum, station } from '@/ui/format';
import { NoProject, NotFound, useControl } from './shared';

type Mode = 'direct' | 'level';

const offLabel = (o: number) => (Math.abs(o) < 1e-9 ? 'Eje' : `${o < 0 ? 'Izquierda' : 'Derecha'} ${Math.abs(o).toFixed(2)} m`);

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function store(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* sin almacenamiento */
  }
}

export function LayerEntry({ params }: ScreenProps) {
  const { project, control } = useControl(params.id as string);
  if (!project) return <NoProject back />;
  if (!control) return <NotFound what="El control de capas" />;
  const layer = control.layers.find((l) => l.id === params.layerId) ?? control.layers[0];
  if (!layer) return <NotFound what="La capa" />;
  return <Entry control={control} layer={layer} />;
}

function Entry({ control, layer }: { control: LayerControl; layer: PavementLayer }) {
  const project = useStore((s) => s.projects.find((p) => p.id === s.activeProjectId));
  const haptics = useStore((s) => s.settings.haptics);
  const layerIdx = control.layers.findIndex((l) => l.id === layer.id);
  const pts = control.points;
  const isDone = (i: number) => Number.isFinite(pts[i]?.measured[layer.id]);

  const [idx, setIdx] = useState(() => {
    const i = pts.findIndex((_, j) => !Number.isFinite(pts[j].measured[layer.id]));
    return i >= 0 ? i : 0;
  });
  const [mode, setMode] = useState<Mode>(() => load<Mode>('lc-mode', 'level'));
  const [hi, setHi] = useState<number | undefined>(() => load<number | undefined>(`lc-hi-${control.id}`, undefined));
  const [hiSheet, setHiSheet] = useState(false);
  const pt = pts[idx];
  const design = pt ? layerDesignElevation(control, pt, layerIdx) : undefined;

  const prefill = (m: Mode, i: number) => {
    const p = pts[i];
    if (!p) return '';
    const cur = p.measured[layer.id];
    if (m === 'direct') {
      if (Number.isFinite(cur)) return cur.toFixed(3);
      const d = layerDesignElevation(control, p, layerIdx);
      return `${Math.floor(d)}.`;
    }
    return '';
  };
  const [val, setVal] = useState(() => prefill(mode, idx));

  useEffect(() => store('lc-mode', mode), [mode]);
  useEffect(() => store(`lc-hi-${control.id}`, hi ?? null), [hi, control.id]);

  const goTo = (i: number) => {
    const n = Math.max(0, Math.min(pts.length - 1, i));
    setIdx(n);
    setVal(prefill(mode, n));
  };

  const num = parseNum(val);
  const measured = mode === 'direct' ? num : hi !== undefined && num !== undefined ? hi - num : undefined;
  const dev = measured !== undefined && design !== undefined && (mode === 'direct' ? !val.endsWith('.') : true) ? measured - design : undefined;
  const status = statusFor(dev, layer.tolerance);
  const target = hi !== undefined && design !== undefined ? gradeStake(hi, design) : undefined;
  const doneCount = pts.filter((p) => Number.isFinite(p.measured[layer.id])).length;

  const save = () => {
    if (!pt) return;
    if (mode === 'level' && hi === undefined) {
      setHiSheet(true);
      return;
    }
    if (measured === undefined || !Number.isFinite(measured)) {
      toast(mode === 'direct' ? 'Ingresa la cota medida' : 'Ingresa la lectura de mira', 'warn');
      return;
    }
    if (mode === 'level' && (num! < 0 || num! > 5)) {
      toast('Lectura fuera de rango (0–5 m)', 'fail');
      return;
    }
    if (design !== undefined && Math.abs(measured - design) > 2) {
      toast(`Diferencia de ${fs(measured - design, 3)} m con el diseño: revisa el valor`, 'fail');
      return;
    }
    const prev = pt.measured[layer.id];
    const st = useStore.getState();
    st.setMeasurement(control.id, pt.id, layer.id, Math.round(measured * 10000) / 10000);
    if (haptics) vibrate(status === 'fail' ? 40 : 18);
    const devMm = design !== undefined ? (measured - design) * 1000 : 0;
    toast(`${station(pt.station)} ${offLabel(pt.offset)} · ${fs(devMm, 0)} mm`, status === 'ok' ? 'ok' : status === 'warn' ? 'warn' : 'fail', {
      label: 'Deshacer',
      run: () => useStore.getState().setMeasurement(control.id, pt.id, layer.id, prev),
    });
    // siguiente pendiente después del actual
    let next = -1;
    for (let k = 1; k <= pts.length; k++) {
      const j = (idx + k) % pts.length;
      if (j !== idx && !isDone(j)) {
        next = j;
        break;
      }
    }
    if (next < 0) {
      toast(`${layer.name}: todos los puntos medidos`, 'ok');
      goTo(Math.min(idx + 1, pts.length - 1));
    } else goTo(next);
  };

  // Teclado físico.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (hiSheet || (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT'))) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^[0-9]$/.test(e.key)) setVal((v) => v + e.key);
      else if ((e.key === '.' || e.key === ',') && !val.includes('.')) setVal((v) => v + '.');
      else if (e.key === 'Backspace') setVal((v) => v.slice(0, -1));
      else if (e.key === 'Enter') save();
      else if (e.key === 'ArrowRight' || e.key === 'PageDown') goTo(idx + 1);
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') goTo(idx - 1);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  const back = () => useNav.getState().back();

  if (!pt) {
    return (
      <Screen title={`Medir · ${layer.name}`} back>
        <p className="muted">Este control no tiene puntos. Añádelos desde la pantalla del control.</p>
      </Screen>
    );
  }

  const cur = pt.measured[layer.id];

  return (
    <Screen
      title={`Medir · ${layer.name}`}
      subtitle={`${control.name} · tol. ±${(layer.tolerance * 1000).toFixed(0)} mm`}
      back
      actions={
        <button className="btn sm primary" onClick={back}>
          <CheckCheck size={17} /> Listo
        </button>
      }
    >
      <div className="lc-entry">
        <div className="lc-progress">
          <div className="row-between xs faint">
            <span>
              Punto {idx + 1} de {pts.length}
            </span>
            <span className="num">
              {doneCount}/{pts.length} medidos
            </span>
          </div>
          <div className="meter">
            <span style={{ width: `${(doneCount / Math.max(1, pts.length)) * 100}%`, background: 'var(--accent)' }} />
          </div>
        </div>

        <div className="card lc-point">
          <button className="icon-btn" aria-label="Anterior" onClick={() => goTo(idx - 1)} disabled={idx === 0}>
            <ChevronLeft size={26} />
          </button>
          <div className="grow lc-point-body">
            <div className="lc-point-sta num">{station(pt.station)}</div>
            <div className="small muted">
              {offLabel(pt.offset)}
              {pt.label && !/^(Eje|Izq|Der)/.test(pt.label) ? ` · ${pt.label}` : ''}
            </div>
            <div className="lc-point-design">
              Diseño <b className="num">{f(design)}</b>
              {Number.isFinite(cur) && (
                <span className="faint">
                  {' '}
                  · medido <b className="num">{f(cur)}</b>
                </span>
              )}
            </div>
          </div>
          <button className="icon-btn" aria-label="Siguiente" onClick={() => goTo(idx + 1)} disabled={idx >= pts.length - 1}>
            <ChevronRight size={26} />
          </button>
        </div>

        <Segmented<Mode>
          value={mode}
          onChange={(m) => {
            setMode(m);
            setVal(prefill(m, idx));
          }}
          options={[
            { value: 'level', label: 'Con nivel (lectura)' },
            { value: 'direct', label: 'Cota directa' },
          ]}
        />

        {mode === 'level' && (
          <div className="lc-hi-row">
            <button className="lc-hi" onClick={() => setHiSheet(true)}>
              <Telescope size={18} />
              <span>
                AI <b className="num">{hi !== undefined ? f(hi) : 'definir'}</b>
              </span>
            </button>
            <div className="lc-target">
              <span>Lectura objetivo</span>
              <b className="num">{target !== undefined ? f(target) : '—'}</b>
            </div>
          </div>
        )}

        <div className={`reading-display lc-display s-${dev === undefined ? 'pending' : status}`}>
          <span className="lv-display-label">{mode === 'direct' ? 'Cota medida' : 'Lectura de mira'}</span>
          <span>
            {val || <span className="faint">{mode === 'direct' ? '0.000' : '0.000'}</span>}
            <small>m</small>
          </span>
        </div>

        <div className="lc-live">
          {dev !== undefined ? (
            <>
              <StatusBadge status={status} />
              <span className="num">
                {mode === 'level' && <>Cota {f(measured)} · </>}
                <b className={status === 'ok' ? 'c-ok' : status === 'warn' ? 'c-warn' : 'c-fail'}>{fs(dev * 1000, 0)} mm</b>
                <span className="faint"> {dev > 0 ? 'alto (cortar)' : dev < 0 ? 'bajo (rellenar)' : ''}</span>
              </span>
            </>
          ) : (
            <span className="faint small">
              {mode === 'level' && hi === undefined ? 'Define la altura de instrumento (AI) para empezar.' : 'Ingresa el valor y pulsa Siguiente.'}
            </span>
          )}
        </div>

        <NumPad value={val} onChange={setVal} onEnter={save} enterLabel="Siguiente" />

        <div className="grid-2">
          <button className="btn ghost" onClick={() => goTo(idx - 1)} disabled={idx === 0}>
            <ChevronLeft size={18} /> Anterior
          </button>
          <button className="btn ghost" onClick={() => goTo(idx + 1)} disabled={idx >= pts.length - 1}>
            Saltar <SkipForward size={18} />
          </button>
        </div>
      </div>

      <Sheet open={hiSheet} title="Altura de instrumento" onClose={() => setHiSheet(false)}>
        {hiSheet && (
          <HiEditor
            bms={project?.benchmarks ?? []}
            hi={hi}
            onDone={(v) => {
              setHi(v);
              setHiSheet(false);
              toast(`AI = ${f(v)}`);
            }}
          />
        )}
      </Sheet>
    </Screen>
  );
}

function HiEditor({ bms, hi, onDone }: { bms: Array<{ id: string; name: string; elevation: number }>; hi?: number; onDone: (v: number) => void }) {
  const [how, setHow] = useState<'bm' | 'direct'>(bms.length ? 'bm' : 'direct');
  const [bmId, setBmId] = useState(bms[0]?.id);
  const [bmElev, setBmElev] = useState<number | undefined>(bms[0]?.elevation);
  const [bs, setBs] = useState<number | undefined>();
  const [direct, setDirect] = useState<number | undefined>(hi);
  const computed = useMemo(() => (bmElev !== undefined && bs !== undefined ? bmElev + bs : undefined), [bmElev, bs]);
  const value = how === 'bm' ? computed : direct;
  return (
    <div className="stack">
      <Segmented<'bm' | 'direct'>
        value={how}
        onChange={setHow}
        options={[
          { value: 'bm', label: 'VA sobre BM' },
          { value: 'direct', label: 'AI conocida' },
        ]}
      />
      {how === 'bm' ? (
        <>
          <div className="chips" style={{ flexWrap: 'wrap' }}>
            {bms.map((b) => (
              <button
                key={b.id}
                className={`chip${bmId === b.id ? ' active' : ''}`}
                onClick={() => {
                  setBmId(b.id);
                  setBmElev(b.elevation);
                }}
              >
                <MapPinned size={14} /> {b.name} · {f(b.elevation)}
              </button>
            ))}
            <button className={`chip${bmId === 'other' ? ' active' : ''}`} onClick={() => setBmId('other')}>
              Otra cota
            </button>
          </div>
          {bmId === 'other' && <NumberInput label="Cota del punto de apoyo" suffix="m" value={bmElev} onChange={setBmElev} />}
          <NumberInput label="Vista atrás (VA)" suffix="m" value={bs} onChange={setBs} autoFocus />
        </>
      ) : (
        <NumberInput label="Altura de instrumento (AI)" suffix="m" value={direct} onChange={setDirect} autoFocus />
      )}
      <div className="lv-kv">
        <span>AI = cota + VA</span>
        <b className="num c-brand">{f(value)}</b>
      </div>
      <button className="btn primary lg block" disabled={value === undefined} onClick={() => value !== undefined && onDone(value)}>
        Usar esta AI
      </button>
    </div>
  );
}
