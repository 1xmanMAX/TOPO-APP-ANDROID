import { useMemo, useState } from 'react';
import { Crosshair, Globe, PenLine, Save, Trash2, Plus } from 'lucide-react';
import type { ScreenProps } from '@/app/feature';
import { useNav } from '@/app/nav';
import { useProject, useStore } from '@/app/store';
import type { SurveyPoint } from '@/core/types';
import { radiateFromStation, type StationShot } from '@/core/cogo';
import { parseAngle, formatDms } from '@/core/units';
import { utmToLatLon } from '@/core/geo';
import { EmptyState, Field, NumberInput, Screen, Segmented, Select, TextInput, confirmDialog, toast } from '@/ui/kit';
import { f } from '@/ui/format';
import { SOURCE_LABEL, frequentCodes, nextPointName } from './util';

type Mode = 'coords' | 'radiation';

/** Configuración de estación que se conserva entre radiaciones sucesivas. */
interface StationCfg {
  stationMode: 'point' | 'coords';
  stationId: string;
  sx?: number;
  sy?: number;
  sz?: number;
  orientMode: 'azimuth' | 'point';
  azText: string;
  backId: string;
  hzBackText: string;
  hi?: number;
}
let lastStation: StationCfg | null = null;

function AngleInput({
  label,
  value,
  onChange,
  hint,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  placeholder?: string;
}) {
  const parsed = value.trim() ? parseAngle(value) : null;
  const bad = value.trim() !== '' && parsed === null;
  return (
    <Field
      label={label}
      hint={bad ? <span className="c-fail">Formato no válido (ej.: 125°30'15" o 125 30 15)</span> : parsed !== null ? formatDms(parsed, 0) : hint}
    >
      <input
        className="input num"
        inputMode="text"
        value={value}
        placeholder={placeholder ?? `0°00'00"`}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={bad}
      />
    </Field>
  );
}

export default function PointEdit({ params }: ScreenProps) {
  const project = useProject();
  const back = useNav((s) => s.back);
  const id = typeof params.id === 'string' ? params.id : undefined;
  const existing = project?.points.find((p) => p.id === id);

  const [mode, setMode] = useState<Mode>(params.mode === 'radiation' && !existing ? 'radiation' : 'coords');
  const [name, setName] = useState(existing?.name ?? (project ? nextPointName(project.points) : '1'));
  const [code, setCode] = useState(existing?.code ?? '');
  const [x, setX] = useState<number | undefined>(existing?.x);
  const [y, setY] = useState<number | undefined>(existing?.y);
  const [z, setZ] = useState<number | undefined>(existing?.z);
  const [note, setNote] = useState(existing?.note ?? '');

  // Radiación
  const pointsWithXY = project?.points ?? [];
  const firstId = pointsWithXY[0]?.id ?? '';
  const st0: StationCfg = lastStation ?? {
    stationMode: pointsWithXY.length ? 'point' : 'coords',
    stationId: firstId,
    orientMode: pointsWithXY.length > 1 ? 'point' : 'azimuth',
    azText: '',
    backId: pointsWithXY[1]?.id ?? '',
    hzBackText: '0',
    hi: 1.5,
  };
  const [st, setSt] = useState<StationCfg>(st0);
  const upd = (p: Partial<StationCfg>) => setSt((s) => ({ ...s, ...p }));
  const [hzText, setHzText] = useState('');
  const [vzText, setVzText] = useState('90');
  const [sd, setSd] = useState<number | undefined>();
  const [hr, setHr] = useState<number | undefined>(1.5);

  const codes = useMemo(() => (project ? frequentCodes(project.points) : []), [project]);

  const shot: { res?: StationShot; err?: string } = useMemo(() => {
    if (mode !== 'radiation' || !project) return {};
    const stPt = st.stationMode === 'point' ? project.points.find((p) => p.id === st.stationId) : undefined;
    const station =
      st.stationMode === 'point'
        ? stPt && { x: stPt.x, y: stPt.y, z: stPt.z }
        : st.sx !== undefined && st.sy !== undefined
          ? { x: st.sx, y: st.sy, z: st.sz }
          : undefined;
    if (!station) return { err: 'Define la estación' };
    const hz = parseAngle(hzText);
    const vz = parseAngle(vzText);
    if (hz === null) return { err: 'Ingresa el ángulo horizontal (Hz)' };
    if (vz === null) return { err: 'Ingresa el ángulo cenital' };
    if (sd === undefined || sd <= 0) return { err: 'Ingresa la distancia inclinada' };
    let backsight: { x: number; y: number } | undefined;
    let backAz: number | undefined;
    if (st.orientMode === 'point') {
      const b = project.points.find((p) => p.id === st.backId);
      if (!b) return { err: 'Elige el punto de orientación' };
      if (b.id === st.stationId && st.stationMode === 'point') return { err: 'La orientación no puede ser la misma estación' };
      backsight = { x: b.x, y: b.y };
    } else {
      const a = parseAngle(st.azText);
      if (a === null) return { err: 'Ingresa el azimut de orientación' };
      backAz = a;
    }
    try {
      const res = radiateFromStation({
        station,
        backsight,
        backAzimuthDeg: backAz,
        hzBacksight: parseAngle(st.hzBackText) ?? 0,
        hiInstr: st.hi ?? 0,
        hz,
        vz,
        slopeDist: sd,
        targetHeight: hr ?? 0,
      });
      return { res };
    } catch (e) {
      return { err: (e as Error).message };
    }
  }, [mode, project, st, hzText, vzText, sd, hr]);

  const fx = mode === 'radiation' ? shot.res?.x : x;
  const fy = mode === 'radiation' ? shot.res?.y : y;
  const fz = mode === 'radiation' ? shot.res?.z : z;

  const latlon = useMemo(() => {
    if (!project || fx === undefined || fy === undefined) return null;
    try {
      const ll = utmToLatLon(fx, fy, project.crs.zone, project.crs.hemisphere);
      return Number.isFinite(ll.lat) && Math.abs(ll.lat) <= 90 ? ll : null;
    } catch {
      return null;
    }
  }, [project, fx, fy]);

  if (!project) {
    return (
      <Screen title="Punto" back>
        <EmptyState icon={<PenLine size={30} />} title="Sin proyecto activo" />
      </Screen>
    );
  }
  if (id && !existing) {
    return (
      <Screen title="Punto" back>
        <EmptyState icon={<PenLine size={30} />} title="Punto no encontrado" text="Puede que haya sido eliminado." />
      </Screen>
    );
  }

  const dup = project.points.some((p) => p.name.trim() === name.trim() && p.id !== existing?.id);
  const canSave = name.trim() !== '' && fx !== undefined && fy !== undefined && !dup;

  const save = (again: boolean) => {
    if (!canSave || fx === undefined || fy === undefined) return;
    const base: Omit<SurveyPoint, 'id' | 'createdAt'> = {
      name: name.trim(),
      code: code.trim().toUpperCase() || undefined,
      x: fx,
      y: fy,
      z: fz,
      source: mode === 'radiation' ? 'total-station' : existing?.source ?? 'manual',
      note: note.trim() || undefined,
      precision: existing?.precision,
    };
    if (mode === 'radiation') {
      lastStation = st;
      const obs = `Hz ${hzText.trim()} · V ${vzText.trim()} · DI ${f(sd, 3)} · hi ${f(st.hi, 3)} · hp ${f(hr, 3)}`;
      base.note = [note.trim(), obs].filter(Boolean).join(' | ');
    }
    if (existing) {
      useStore.getState().updatePoint(existing.id, base);
      toast(`Punto ${base.name} actualizado`);
      back();
      return;
    }
    useStore.getState().addPoints([base]);
    toast(`Punto ${base.name} guardado`);
    if (again) {
      const pts = useStore.getState().projects.find((p) => p.id === project.id)?.points ?? [];
      setName(nextPointName(pts));
      setHzText('');
      setSd(undefined);
      setNote('');
      if (mode === 'coords') {
        setX(undefined);
        setY(undefined);
        setZ(undefined);
      }
    } else back();
  };

  const remove = async () => {
    if (!existing) return;
    const ok = await confirmDialog({ title: `Eliminar ${existing.name}`, text: 'El punto se quitará del proyecto.', okLabel: 'Eliminar', danger: true });
    if (!ok) return;
    useStore.getState().deletePoints([existing.id]);
    toast(`Punto ${existing.name} eliminado`, 'ok', { label: 'Deshacer', run: () => useStore.getState().addPoints([existing]) });
    back();
  };

  const pointOptions = project.points.map((p) => ({ value: p.id, label: `${p.name}${p.code ? ` · ${p.code}` : ''}` }));

  return (
    <Screen
      title={existing ? `Punto ${existing.name}` : 'Nuevo punto'}
      subtitle={existing ? SOURCE_LABEL[existing.source] : `UTM ${project.crs.zone}${project.crs.hemisphere} · WGS84`}
      back
      actions={
        existing && (
          <button className="icon-btn pt-danger" aria-label="Eliminar punto" onClick={remove}>
            <Trash2 size={21} />
          </button>
        )
      }
    >
      <div className="stack-l pt-form">
        {!existing && (
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: 'coords', label: <span className="pt-seg"><PenLine size={16} /> Coordenadas</span> },
              { value: 'radiation', label: <span className="pt-seg"><Crosshair size={16} /> Radiación</span> },
            ]}
          />
        )}

        <div className="card stack">
          <div className="grid-2">
            <TextInput label="Nombre" value={name} onChange={setName} />
            <TextInput label="Código" value={code} onChange={(v) => setCode(v.toUpperCase())} placeholder="Libre" />
          </div>
          {dup && <span className="small c-fail">Ya existe un punto con ese nombre.</span>}
          <div className="chips" role="group" aria-label="Códigos frecuentes">
            {codes.map((c) => (
              <button key={c} className={`chip${code === c ? ' active' : ''}`} onClick={() => setCode(code === c ? '' : c)}>
                {c}
              </button>
            ))}
          </div>
        </div>

        {mode === 'coords' ? (
          <div className="card stack">
            <div className="md-grid-2 pt-coords">
              <NumberInput label="Este (X)" value={x} onChange={setX} suffix="m" placeholder="279420.000" />
              <NumberInput label="Norte (Y)" value={y} onChange={setY} suffix="m" placeholder="8667310.000" />
            </div>
            <NumberInput label="Cota (Z)" value={z} onChange={setZ} suffix="m" hint="Opcional" />
          </div>
        ) : (
          <>
            <div className="card stack">
              <div className="section-title">Estación</div>
              <Segmented
                value={st.stationMode}
                onChange={(v) => upd({ stationMode: v })}
                options={[
                  { value: 'point', label: 'Punto existente' },
                  { value: 'coords', label: 'Coordenadas' },
                ]}
              />
              {st.stationMode === 'point' ? (
                pointOptions.length ? (
                  <Select label="Punto de estación" value={st.stationId} options={pointOptions} onChange={(v) => upd({ stationId: v })} />
                ) : (
                  <p className="small muted">No hay puntos: ingresa coordenadas.</p>
                )
              ) : (
                <div className="grid-3 pt-coords">
                  <NumberInput label="Este" value={st.sx} onChange={(v) => upd({ sx: v })} />
                  <NumberInput label="Norte" value={st.sy} onChange={(v) => upd({ sy: v })} />
                  <NumberInput label="Cota" value={st.sz} onChange={(v) => upd({ sz: v })} />
                </div>
              )}
              <NumberInput label="Altura de instrumento" value={st.hi} onChange={(v) => upd({ hi: v })} suffix="m" />
            </div>

            <div className="card stack">
              <div className="section-title">Orientación</div>
              <Segmented
                value={st.orientMode}
                onChange={(v) => upd({ orientMode: v })}
                options={[
                  { value: 'point', label: 'Punto de referencia' },
                  { value: 'azimuth', label: 'Azimut' },
                ]}
              />
              {st.orientMode === 'point' ? (
                <Select label="Vista atrás (punto)" value={st.backId} options={pointOptions} onChange={(v) => upd({ backId: v })} />
              ) : (
                <AngleInput label="Azimut a la vista atrás" value={st.azText} onChange={(v) => upd({ azText: v })} />
              )}
              <AngleInput label="Hz leído en la vista atrás" value={st.hzBackText} onChange={(v) => upd({ hzBackText: v })} hint="Normalmente 0°00'00&quot;" />
            </div>

            <div className="card stack">
              <div className="section-title">Observación al punto</div>
              <div className="grid-2">
                <AngleInput label="Ángulo Hz" value={hzText} onChange={setHzText} />
                <AngleInput label="Ángulo cenital" value={vzText} onChange={setVzText} placeholder={`90°00'00"`} />
              </div>
              <div className="grid-2">
                <NumberInput label="Dist. inclinada" value={sd} onChange={setSd} suffix="m" />
                <NumberInput label="Altura de prisma" value={hr} onChange={setHr} suffix="m" />
              </div>
            </div>
          </>
        )}

        <div className="card stack pt-result" aria-live="polite">
          {mode === 'radiation' && (shot.err ? <span className="small c-warn">{shot.err}</span> : shot.res && (
            <div className="xs muted num">
              Az {formatDms(shot.res.azimuth, 0)} · DH {f(shot.res.horizontalDist, 3)} m · ΔZ {f(shot.res.dz, 3)} m
            </div>
          ))}
          <div className="grid-3 pt-result-grid">
            <div>
              <span>Este</span>
              <strong className="num">{f(fx, 3)}</strong>
            </div>
            <div>
              <span>Norte</span>
              <strong className="num">{f(fy, 3)}</strong>
            </div>
            <div>
              <span>Cota</span>
              <strong className="num">{f(fz, 3)}</strong>
            </div>
          </div>
          <div className="row xs muted" style={{ gap: 6 }}>
            <Globe size={14} />
            {latlon ? (
              <span className="num">
                Lat {latlon.lat.toFixed(7)}° · Lon {latlon.lon.toFixed(7)}°
              </span>
            ) : (
              <span>Lat/Lon: ingresa Este y Norte</span>
            )}
          </div>
        </div>

        <TextInput label="Nota" value={note} onChange={setNote} placeholder="Opcional" />

        <div className={existing ? '' : 'grid-2'}>
          {!existing && (
            <button className="btn ghost lg" disabled={!canSave} onClick={() => save(true)}>
              <Plus size={20} /> Guardar y otro
            </button>
          )}
          <button className="btn primary lg block" disabled={!canSave} onClick={() => save(false)}>
            <Save size={20} /> Guardar
          </button>
        </div>
      </div>
    </Screen>
  );
}
