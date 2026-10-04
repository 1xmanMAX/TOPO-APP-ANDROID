/** 'level-entry' — captura de campo de una nivelación geométrica. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRightLeft, CheckCheck, CornerDownLeft, Flag, ListPlus, Pencil, Settings2, Trash2, Undo2, X, AlertTriangle } from 'lucide-react';
import type { ScreenProps } from '@/app/feature';
import { go, useNav } from '@/app/nav';
import { useStore } from '@/app/store';
import { vibrate } from '@/app/platform';
import type { LevelObservation, LevelRow, LevelRun, ObsKind } from '@/core/types';
import { computeLevelRun, STADIA_MIDDLE_TOL_M } from '@/core/leveling';
import { Field, NumPad, NumberInput, Screen, Segmented, Sheet, StatusBadge, TextInput, toast } from '@/ui/kit';
import { f, fs, parseNum } from '@/ui/format';
import { KIND_LABEL, KIND_SHORT, NoProject, NotFound, closureStatus, nextName, nextTpName, useRun } from './shared';

type Slot = 'upper' | 'reading' | 'lower' | 'dist' | 'design';

const SLOT_SHORT: Record<Slot, string> = {
  upper: 'Superior',
  reading: 'Medio',
  lower: 'Inferior',
  dist: 'Distancia',
  design: 'Cota proy.',
};

const SLOT_LABEL: Record<Slot, string> = {
  upper: 'Hilo superior',
  reading: 'Hilo medio',
  lower: 'Hilo inferior',
  dist: 'Distancia',
  design: 'Cota proyecto',
};

interface Parsed {
  value?: number;
  note?: string;
  error?: string;
}

/** Interpreta una lectura de mira (m). "1487" sin punto → 1.487 m. */
function parseReading(txt: string, label = 'la lectura'): Parsed {
  if (!txt.trim()) return { error: `Ingresa ${label}` };
  const n = parseNum(txt);
  if (n === undefined) return { error: `Valor no válido en ${label}` };
  if (/^\d{3,4}$/.test(txt.trim()) && n > 5 && n <= 5000) {
    return { value: n / 1000, note: `${txt} → ${f(n / 1000)} m (mm)` };
  }
  if (n < 0 || n > 5) return { error: `Lectura fuera de rango (0–5 m): ${txt}` };
  return { value: n };
}

const cutFillText = (cf: number | undefined) =>
  cf === undefined || !Number.isFinite(cf)
    ? null
    : Math.abs(cf) < 0.0005
      ? { cls: 'c-ok', text: 'En rasante' }
      : { cls: cf > 0 ? 'c-cut' : 'c-fill', text: `${cf > 0 ? 'Cortar' : 'Rellenar'} ${Math.abs(cf).toFixed(3)}` };

/** Sugerencia del siguiente tipo de lectura y nombre de punto. */
function suggest(run: LevelRun): { kind: ObsKind; name: string } {
  const obs = run.observations;
  const last = obs[obs.length - 1];
  if (!last) return { kind: 'BS', name: run.startBM.name };
  if (last.kind === 'FS') return { kind: 'BS', name: last.pointName };
  const lastIS = [...obs].reverse().find((o) => o.kind === 'IS');
  return { kind: 'IS', name: lastIS ? nextName(lastIS.pointName) : '0+000' };
}

function targetBM(run: LevelRun): string | undefined {
  if (run.closure === 'loop') return run.startBM.name;
  if (run.closure === 'known-bm') return run.endBM?.name;
  return undefined;
}

export function LevelEntry({ params }: ScreenProps) {
  const { project, run } = useRun(params.runId as string);
  if (!project) return <NoProject back />;
  if (!run) return <NotFound />;
  return <Entry run={run} />;
}

function Entry({ run }: { run: LevelRun }) {
  const st = useStore.getState;
  const haptics = useStore((s) => s.settings.haptics);
  const result = useMemo(() => computeLevelRun(run), [run]);
  const rows = result.rows;
  const anyDesign = rows.some((r) => r.designElevation !== undefined);
  const panelRef = useRef<HTMLDivElement>(null);

  const initial = useMemo(() => suggest(run), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [kind, setKind] = useState<ObsKind>(initial.kind);
  const [name, setName] = useState(initial.name);
  const [threads, setThreads] = useState(() => run.observations.some((o) => o.upper !== undefined));
  const [slot, setSlot] = useState<Slot>(threads ? 'upper' : 'reading');
  const [vals, setVals] = useState<Record<Slot, string>>({ upper: '', reading: '', lower: '', dist: '', design: '' });
  const [msg, setMsg] = useState<{ tone: 'fail' | 'warn' | 'info'; text: string } | null>(null);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [insertAt, setInsertAt] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // En móvil, deja el teclado completo a la vista al entrar.
  useEffect(() => {
    const el = panelRef.current;
    if (!el || window.innerWidth >= 900) return;
    const nav = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 68;
    const r = el.getBoundingClientRect();
    const overflow = r.bottom - (window.innerHeight - nav - 8);
    if (overflow > 0) window.scrollTo({ top: window.scrollY + Math.min(overflow, r.top - 70) });
  }, []);

  // Autoscroll de la tabla a la última fila.
  useEffect(() => {
    const el = listRef.current;
    if (el && insertAt === null) el.scrollTop = el.scrollHeight;
  }, [rows.length, insertAt]);

  const setVal = (s: Slot, v: string) => {
    setVals((x) => ({ ...x, [s]: v }));
    setMsg(null);
  };

  const chooseKind = (k: ObsKind) => {
    setKind(k);
    const obs = run.observations;
    if (k === 'FS') setName(nextTpName(run));
    else if (k === 'BS') {
      const lastFs = [...obs].reverse().find((o) => o.kind === 'FS');
      setName(lastFs?.pointName ?? run.startBM.name);
    } else {
      const lastIS = [...obs].reverse().find((o) => o.kind === 'IS');
      setName(lastIS ? nextName(lastIS.pointName) : '0+000');
    }
    if (k === 'BS' && slot === 'design') setSlot(threads ? 'upper' : 'reading');
  };

  const startSlot = threads ? 'upper' : 'reading';

  // Vista previa de hilos.
  const up = parseNum(vals.upper);
  const lo = parseNum(vals.lower);
  const mid = parseNum(vals.reading);
  const threadDist = threads && up !== undefined && lo !== undefined ? 100 * Math.abs(up - lo) : undefined;
  const threadDiff = threads && up !== undefined && lo !== undefined && mid !== undefined ? mid - (up + lo) / 2 : undefined;

  // HI vigente para vista previa de la cota.
  const lastRow: LevelRow | undefined = rows[rows.length - 1];
  const stationOpen = lastRow ? lastRow.kind !== 'FS' : false;
  const hiNow = stationOpen ? lastRow?.hi : undefined;
  const previewReading = parseReading(vals.reading).value;
  const previewElev = kind !== 'BS' && hiNow !== undefined && previewReading !== undefined ? hiNow - previewReading : undefined;
  const previewDesign = parseNum(vals.design);

  const resetInputs = () => {
    setVals({ upper: '', reading: '', lower: '', dist: '', design: '' });
    setSlot(startSlot);
  };

  const save = useCallback(() => {
    const pointName = name.trim();
    if (!pointName) return setMsg({ tone: 'fail', text: 'El punto necesita un nombre' });
    const r = parseReading(vals.reading, threads ? 'el hilo medio' : 'la lectura');
    if (r.error) {
      setSlot('reading');
      if (haptics) vibrate(40);
      return setMsg({ tone: 'fail', text: r.error });
    }
    const obs: Omit<LevelObservation, 'id'> = { kind, pointName, reading: r.value! };
    let warn: string | null = r.note ?? null;
    if (threads) {
      const u = parseReading(vals.upper, 'el hilo superior');
      const l = parseReading(vals.lower, 'el hilo inferior');
      if (u.error || l.error) {
        setSlot(u.error ? 'upper' : 'lower');
        return setMsg({ tone: 'fail', text: (u.error ?? l.error)! });
      }
      if (!(u.value! > r.value! && r.value! > l.value!)) {
        return setMsg({ tone: 'fail', text: 'Los hilos deben cumplir superior > medio > inferior' });
      }
      obs.upper = u.value;
      obs.lower = l.value;
      const d = r.value! - (u.value! + l.value!) / 2;
      if (Math.abs(d) > STADIA_MIDDLE_TOL_M) warn = `Hilo medio difiere ${(d * 1000).toFixed(1)} mm del promedio`;
    } else if (vals.dist.trim()) {
      const d = parseNum(vals.dist);
      if (d === undefined || d < 0 || d > 300) {
        setSlot('dist');
        return setMsg({ tone: 'fail', text: 'Distancia no válida (0–300 m)' });
      }
      obs.distance = d;
    }
    if (kind !== 'BS' && vals.design.trim()) {
      const z = parseNum(vals.design);
      if (z === undefined) {
        setSlot('design');
        return setMsg({ tone: 'fail', text: 'Cota de proyecto no válida' });
      }
      obs.designElevation = z;
    }
    if (kind !== 'BS' && !stationOpen && insertAt === null) {
      warn = 'No hay vista atrás abierta: registra primero una VA';
    }

    const runId = run.id;
    const id = insertAt !== null ? st().insertObservation(runId, insertAt, obs) : st().addObservation(runId, obs);
    if (haptics) vibrate(18);
    const label = `${KIND_SHORT[kind]} ${pointName} = ${f(obs.reading)}`;
    toast(insertAt !== null ? `Insertada ${label}` : `Guardada ${label}`, warn ? 'warn' : 'ok', {
      label: 'Deshacer',
      run: () => st().deleteObservation(runId, id),
    });
    setLastSaved(id);
    setMsg(warn ? { tone: 'warn', text: warn } : null);
    resetInputs();

    // Sugerencia siguiente.
    if (insertAt !== null) {
      setInsertAt(null);
      return;
    }
    if (kind === 'BS') {
      setKind('IS');
      const lastIS = [...run.observations].reverse().find((o) => o.kind === 'IS');
      setName(lastIS ? nextName(lastIS.pointName) : '0+000');
    } else if (kind === 'IS') {
      setName(nextName(pointName));
    } else {
      setKind('BS');
      setName(pointName);
    }
  }, [name, vals, threads, kind, run, insertAt, stationOpen, haptics]); // eslint-disable-line react-hooks/exhaustive-deps

  const slots: Slot[] = threads ? ['upper', 'reading', 'lower'] : ['reading', 'dist'];
  if (kind !== 'BS') slots.push('design');

  const enter = () => {
    if (slot === 'upper') return setSlot('reading');
    if (slot === 'reading' && threads) return setSlot('lower');
    if ((slot === 'dist' || slot === 'design') && !vals.reading.trim()) return setSlot('reading');
    save();
  };

  // Teclado físico (escritorio).
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t && ((t.tagName === 'INPUT' && (t as HTMLInputElement).type !== 'checkbox') || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      if (typing) return;
      if (editIdx !== null || e.ctrlKey || e.metaKey || e.altKey) return;
      const v = vals[slot];
      if (/^[0-9]$/.test(e.key)) setVal(slot, v + e.key);
      else if ((e.key === '.' || e.key === ',') && !v.includes('.')) setVal(slot, v + '.');
      else if (e.key === '-' && slot === 'design') setVal(slot, v.startsWith('-') ? v.slice(1) : '-' + v);
      else if (e.key === 'Backspace') setVal(slot, v.slice(0, -1));
      else if (e.key === 'Enter') enter();
      else if (e.key === 'Tab') {
        const i = slots.indexOf(slot);
        setSlot(slots[(i + (e.shiftKey ? slots.length - 1 : 1)) % slots.length]);
      } else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  // ---- Estado en vivo ----
  const { checks, closure } = result;
  const setupNow = stationOpen ? lastRow!.setup : (lastRow?.setup ?? 0) + 1;
  const lastElevRow = [...rows].reverse().find((r) => Number.isFinite(r.elevation));
  const stRows = rows.filter((r) => r.setup === lastRow?.setup);
  const stBS = stRows.find((r) => r.kind === 'BS')?.distance;
  const stFS = stRows.find((r) => r.kind === 'FS')?.distance;
  const stImb = stBS !== undefined && stFS !== undefined ? stBS - stFS : undefined;
  const cumImb = checks.distanceImbalance;
  const hasDist = checks.sumBackDist + checks.sumForeDist > 0;
  const imbAlert = (stImb !== undefined && Math.abs(stImb) > 5) || Math.abs(cumImb) > 10;
  const target = targetBM(run);
  const lastFs = [...rows].reverse().find((r) => r.kind === 'FS');
  const closed = !!target && !!lastFs && lastFs.pointName === target && closure.misclosureMm !== undefined;
  const cStatus = closed ? closureStatus(result) : 'pending';

  const lastSavedRow = lastSaved ? rows.find((r) => r.obsId === lastSaved) : undefined;
  const lastCF = cutFillText(lastSavedRow?.cutFill);

  // Incidencias reales (se omiten las propias de una libreta aún sin cerrar).
  const liveIssues = result.issues.filter(
    (t) => !/no termina con una vista adelante|Comprobación aritmética|Circuito cerrado: el último punto|no es el BM de llegada|no se puede calcular el cierre/i.test(t),
  );

  const goResult = () => useNav.getState().replace({ name: 'level-run', params: { runId: run.id } });

  return (
    <Screen
      title={run.name}
      subtitle={`Captura · ${run.startBM.name} ${f(run.startBM.elevation)}`}
      back
      wide
      actions={
        <>
          <button className="icon-btn" aria-label="Datos de la nivelación" onClick={() => go('level-edit', { runId: run.id })}>
            <Settings2 size={21} />
          </button>
          <button className="btn sm primary" onClick={goResult}>
            <CheckCheck size={17} /> <span className="lv-hide-narrow">Resultado</span>
          </button>
        </>
      }
    >
      <div className="lv-entry">
        <div className="lv-entry-left stack">
          {/* Estado en vivo */}
          <div className="card lv-live">
            <div className="lv-live-grid">
              <div>
                <span>Estación</span>
                <b className="num">{setupNow}</b>
                <small>{stationOpen ? 'abierta' : 'falta VA'}</small>
              </div>
              <div>
                <span>AI vigente</span>
                <b className="num">{f(hiNow)}</b>
                <small>&nbsp;</small>
              </div>
              <div>
                <span>Última cota</span>
                <b className="num">{f(lastElevRow?.elevation)}</b>
                <small className="ellipsis">{lastElevRow?.pointName ?? '—'}</small>
              </div>
              <div>
                <span>ΣVA / ΣVAd</span>
                <b className="num lv-sm">{f(checks.sumBS)}</b>
                <small className="num">{f(checks.sumFS)}</small>
              </div>
            </div>
            <div className="lv-live-foot">
              {hasDist ? (
                <span className={imbAlert ? 'c-warn' : 'faint'}>
                  {imbAlert && <AlertTriangle size={14} />} Desbalance: est. <b className="num">{stImb !== undefined ? fs(stImb, 1) : '—'}</b> m · acum.{' '}
                  <b className="num">{fs(cumImb, 1)}</b> m
                </span>
              ) : (
                <span className="faint">Sin distancias (activa Hilos o ingresa Dist.)</span>
              )}
              {closed ? (
                <StatusBadge status={cStatus} label={`${fs(closure.misclosureMm, 1)} / ±${f(closure.toleranceMm, 1)} mm`} />
              ) : target ? (
                <span className="faint">
                  <Flag size={13} /> Cierra en <b>{target}</b>
                </span>
              ) : (
                <span className="faint">Abierta</span>
              )}
            </div>
          </div>

          {/* Observaciones */}
          <div className="card flush">
            <div className="lv-obs" ref={listRef}>
              {rows.length === 0 ? (
                <p className="lv-obs-empty faint small">
                  Empieza con la vista atrás (VA) sobre <b>{run.startBM.name}</b> (cota {f(run.startBM.elevation)}).
                </p>
              ) : (
                <table className="table lv-obs-table">
                  <thead>
                    <tr>
                      <th>Pto</th>
                      <th className="left">Tipo</th>
                      <th>Lectura</th>
                      <th className="lv-hide-xs">Dist</th>
                      <th>Cota</th>
                      {anyDesign && <th>C/R</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const cf = cutFillText(r.cutFill);
                      const isTp = r.kind === 'FS' || (r.kind === 'BS' && i > 0);
                      return (
                        <tr
                          key={r.obsId}
                          className={`clickable${isTp ? ' tp' : ''}${insertAt === i ? ' lv-insert-mark' : ''}${r.obsId === lastSaved ? ' lv-just' : ''}`}
                          onClick={() => setEditIdx(i)}
                        >
                          <td className="text">
                            <b>{r.pointName}</b>
                          </td>
                          <td className="left text">
                            <span className={`lv-kind k-${r.kind}`}>{KIND_SHORT[r.kind]}</span>
                          </td>
                          <td>{f(r.reading)}</td>
                          <td className="lv-hide-xs faint">{r.distance !== undefined ? r.distance.toFixed(1) : '—'}</td>
                          <td>
                            <b>{r.kind === 'BS' && i > 0 ? '' : f(r.elevation)}</b>
                          </td>
                          {anyDesign && <td className={cf?.cls}>{cf ? (cf.text === 'En rasante' ? '✓' : `${cf.text[0]} ${Math.abs(r.cutFill!).toFixed(3)}`) : ''}</td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
          {liveIssues.length > 0 && (
            <p className="xs c-warn lv-issue-line">
              <AlertTriangle size={13} /> {liveIssues[liveIssues.length - 1]}
            </p>
          )}
        </div>

        {/* Panel de entrada */}
        <div className="lv-entry-panel card" ref={panelRef}>
          {insertAt !== null && (
            <div className="lv-banner">
              <ListPlus size={16} /> Insertando antes de <b>{rows[insertAt]?.pointName}</b>
              <button className="icon-btn" aria-label="Cancelar inserción" onClick={() => setInsertAt(null)}>
                <X size={18} />
              </button>
            </div>
          )}
          <Segmented<ObsKind>
            value={kind}
            onChange={chooseKind}
            options={(['BS', 'IS', 'FS'] as ObsKind[]).map((k) => ({
              value: k,
              label: (
                <span className="lv-seg">
                  <b>{KIND_SHORT[k]}</b> <span>{KIND_LABEL[k].toLowerCase()}</span>
                </span>
              ),
            }))}
          />

          <div className="lv-name-row">
            <label className="lv-name">
              <span>Pto</span>
              <input className="input" aria-label="Nombre del punto" value={name} onChange={(e) => setName(e.target.value)} onFocus={(e) => e.target.select()} />
            </label>
            {kind !== 'FS' ? (
              <button className="btn ghost lv-tp-btn" onClick={() => chooseKind('FS')}>
                <ArrowRightLeft size={18} /> Cambio (VAd)
              </button>
            ) : (
              <div className="chips lv-name-chips">
                {[nextTpName(run), target].filter((x): x is string => !!x).map((n) => (
                  <button key={n} className={`chip${name === n ? ' active' : ''}`} onClick={() => setName(n)}>
                    {n === target ? <Flag size={14} /> : null}
                    {n}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="lv-slots">
            {slots.map((s) => (
              <button key={s} className={`lv-slot${slot === s ? ' active' : ''}`} onClick={() => setSlot(s)}>
                <span>{s === 'reading' && !threads ? 'Lectura' : SLOT_SHORT[s]}</span>
                <b className="num">{vals[s] || (s === 'dist' || s === 'design' ? 'opc.' : '—')}</b>
              </button>
            ))}
            <label className="lv-threads">
              <input
                type="checkbox"
                checked={threads}
                onChange={(e) => {
                  setThreads(e.target.checked);
                  setSlot(e.target.checked ? 'upper' : 'reading');
                }}
              />
              Hilos
            </label>
          </div>

          <div className="reading-display lv-display">
            <span className="lv-display-label">
              {KIND_SHORT[kind]} · {slot === 'reading' && !threads ? 'Lectura' : SLOT_LABEL[slot]}
            </span>
            <span>
              {vals[slot] || <span className="faint">0.000</span>}
              <small>m</small>
            </span>
          </div>

          <div className="lv-preview small">
            {msg ? (
              <span className={`c-${msg.tone === 'info' ? 'brand' : msg.tone}`}>
                <AlertTriangle size={14} /> {msg.text}
              </span>
            ) : threads && (threadDist !== undefined || threadDiff !== undefined) ? (
              <span>
                Dist. <b className="num">{f(threadDist, 1)} m</b>
                {threadDiff !== undefined && (
                  <span className={Math.abs(threadDiff) > STADIA_MIDDLE_TOL_M ? 'c-fail' : 'c-ok'}>
                    {' '}· medio − prom. <b className="num">{fs(threadDiff * 1000, 1)} mm</b>
                  </span>
                )}
              </span>
            ) : previewElev !== undefined ? (
              <span>
                Cota <b className="num">{f(previewElev)}</b>
                {previewDesign !== undefined && (() => {
                  const c = cutFillText(previewElev - previewDesign);
                  return c ? <b className={c.cls}> · {c.text}</b> : null;
                })()}
              </span>
            ) : lastSavedRow ? (
              <span className="faint">
                Último: <b>{lastSavedRow.pointName}</b> cota <b className="num">{f(lastSavedRow.elevation)}</b>
                {lastCF && <b className={lastCF.cls}> · {lastCF.text}</b>}
              </span>
            ) : (
              <span className="faint">
                {kind === 'BS' ? 'Vista atrás sobre punto de cota conocida' : `AI ${f(hiNow)} − lectura = cota`}
              </span>
            )}
          </div>

          <NumPad
            value={vals[slot]}
            onChange={(v) => setVal(slot, v)}
            onEnter={enter}
            enterLabel={slot === 'upper' || (slot === 'reading' && threads) ? 'Siguiente hilo' : 'Siguiente'}
            allowNegative={false}
          />
          <div className="grid-2">
            <button
              className="btn ghost"
              disabled={run.observations.length === 0}
              onClick={() => {
                const last = run.observations[run.observations.length - 1];
                if (!last) return;
                st().deleteObservation(run.id, last.id);
                toast(`Lectura ${last.pointName} borrada`, 'warn', { label: 'Rehacer', run: () => st().insertObservation(run.id, run.observations.length - 1, { ...last }) });
              }}
            >
              <Undo2 size={18} /> Borrar última
            </button>
            <button className="btn accent" onClick={goResult}>
              <CheckCheck size={18} /> <span className="lv-wrap-label">Cerrar y ver resultado</span>
            </button>
          </div>
          <p className="xs faint lv-kbd-hint">
            Teclado: dígitos, <span className="kbd">.</span> <span className="kbd">⌫</span> <span className="kbd">Tab</span> campo <span className="kbd">Enter</span>{' '}
            <CornerDownLeft size={11} />
          </p>
        </div>
      </div>

      <ObsSheet
        run={run}
        index={editIdx}
        onClose={() => setEditIdx(null)}
        onInsertBefore={(i) => {
          setInsertAt(i);
          setEditIdx(null);
          resetInputs();
        }}
      />
    </Screen>
  );
}

/** Hoja para editar / eliminar / insertar antes de una observación. */
function ObsSheet({ run, index, onClose, onInsertBefore }: { run: LevelRun; index: number | null; onClose: () => void; onInsertBefore: (i: number) => void }) {
  const obs = index !== null ? run.observations[index] : undefined;
  return (
    <Sheet open={!!obs} title={obs ? `${KIND_LABEL[obs.kind]} · ${obs.pointName}` : ''} onClose={onClose}>
      {obs && index !== null && <ObsEditor key={obs.id} run={run} obs={obs} index={index} onClose={onClose} onInsertBefore={onInsertBefore} />}
    </Sheet>
  );
}

function ObsEditor({ run, obs, index, onClose, onInsertBefore }: { run: LevelRun; obs: LevelObservation; index: number; onClose: () => void; onInsertBefore: (i: number) => void }) {
  const [d, setD] = useState<LevelObservation>(obs);
  const st = useStore.getState;
  const valid = Number.isFinite(d.reading) && d.reading >= 0 && d.reading <= 5 && d.pointName.trim() !== '';
  return (
    <div className="stack">
      <Segmented<ObsKind>
        value={d.kind}
        onChange={(k) => setD({ ...d, kind: k })}
        options={(['BS', 'IS', 'FS'] as ObsKind[]).map((k) => ({ value: k, label: `${KIND_SHORT[k]} · ${KIND_LABEL[k]}` }))}
      />
      <div className="grid-2">
        <TextInput label="Punto" value={d.pointName} onChange={(v) => setD({ ...d, pointName: v })} />
        <NumberInput label="Lectura (hilo medio)" suffix="m" value={d.reading} onChange={(v) => setD({ ...d, reading: v ?? NaN })} />
        <NumberInput label="Hilo superior" suffix="m" value={d.upper} onChange={(v) => setD({ ...d, upper: v })} />
        <NumberInput label="Hilo inferior" suffix="m" value={d.lower} onChange={(v) => setD({ ...d, lower: v })} />
        <NumberInput label="Distancia" suffix="m" value={d.distance} onChange={(v) => setD({ ...d, distance: v })} />
        <NumberInput label="Cota proyecto" suffix="m" value={d.designElevation} onChange={(v) => setD({ ...d, designElevation: v })} />
      </div>
      <Field label="Nota">
        <input className="input" value={d.note ?? ''} onChange={(e) => setD({ ...d, note: e.target.value || undefined })} />
      </Field>
      {!valid && <p className="small c-fail">La lectura debe estar entre 0 y 5 m y el punto debe tener nombre.</p>}
      <button
        className="btn primary lg block"
        disabled={!valid}
        onClick={() => {
          const { id: _id, ...patch } = d;
          void _id;
          st().updateObservation(run.id, obs.id, { ...patch, pointName: patch.pointName.trim() });
          toast('Lectura actualizada', 'ok', { label: 'Deshacer', run: () => st().updateObservation(run.id, obs.id, obs) });
          onClose();
        }}
      >
        <Pencil size={18} /> Guardar cambios
      </button>
      <div className="grid-2">
        <button className="btn ghost lg" onClick={() => onInsertBefore(index)}>
          <ListPlus size={18} /> Insertar antes
        </button>
        <button
          className="btn danger lg"
          onClick={() => {
            st().deleteObservation(run.id, obs.id);
            const { id: _id, ...rest } = obs;
            void _id;
            toast(`Lectura ${obs.pointName} eliminada`, 'warn', { label: 'Deshacer', run: () => st().insertObservation(run.id, index, rest) });
            onClose();
          }}
        >
          <Trash2 size={18} /> Eliminar
        </button>
      </div>
    </div>
  );
}
