import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, LocateFixed, Save, Satellite, Timer, CircleCheck, CircleX, Smartphone } from 'lucide-react';
import type { ScreenProps } from '@/app/feature';
import { useNav } from '@/app/nav';
import { useProject, useStore } from '@/app/store';
import { getPhonePosition, vibrate, type PhoneFix } from '@/app/platform';
import { latLonToUtm, zoneFromLon } from '@/core/geo';
import { EmptyState, Screen, TextInput, Toggle, toast } from '@/ui/kit';
import { f } from '@/ui/format';
import { frequentCodes, nextPointName } from './util';

const AVG_MS = 10000;

type Quality = { tone: 'ok' | 'warn' | 'fail'; label: string };
function quality(acc: number | undefined): Quality | null {
  if (acc === undefined) return null;
  if (acc <= 5) return { tone: 'ok', label: 'Buena' };
  if (acc <= 15) return { tone: 'warn', label: 'Regular' };
  return { tone: 'fail', label: 'Baja' };
}

/** Promedio ponderado (1/σ²) de lecturas; precisión ≈ 1/√Σw acotada por la mejor lectura. */
function average(fixes: PhoneFix[]): PhoneFix | null {
  if (!fixes.length) return null;
  let sw = 0, lat = 0, lon = 0, alt = 0, swAlt = 0;
  for (const p of fixes) {
    const w = 1 / Math.max(p.accuracy, 0.5) ** 2;
    sw += w;
    lat += p.lat * w;
    lon += p.lon * w;
    if (p.alt !== undefined) {
      alt += p.alt * w;
      swAlt += w;
    }
  }
  const best = Math.min(...fixes.map((p) => p.accuracy));
  return {
    lat: lat / sw,
    lon: lon / sw,
    alt: swAlt ? alt / swAlt : undefined,
    // Los errores del GPS del teléfono están correlacionados: no bajar de la mitad de la mejor lectura.
    accuracy: Math.max(1 / Math.sqrt(sw), best / 2),
  };
}

export default function PhoneGps(_: ScreenProps) {
  const project = useProject();
  const back = useNav((s) => s.back);
  const [live, setLive] = useState<PhoneFix | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [avg, setAvg] = useState<{ fix: PhoneFix; n: number } | null>(null);
  const [avgStart, setAvgStart] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const buf = useRef<PhoneFix[]>([]);
  const avgStartRef = useRef<number | null>(null);
  const [name, setName] = useState(() => (project ? nextPointName(project.points) : '1'));
  const [code, setCode] = useState('');
  const [useAlt, setUseAlt] = useState(false);

  // watchPosition propio de esta pantalla
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setErr('Este dispositivo no tiene GPS disponible.');
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const fix: PhoneFix = {
          lat: p.coords.latitude,
          lon: p.coords.longitude,
          alt: p.coords.altitude ?? undefined,
          accuracy: p.coords.accuracy,
        };
        setErr(null);
        setLive(fix);
        if (avgStartRef.current !== null) buf.current.push(fix);
      },
      (e) => setErr(e.code === 1 ? 'Permiso de ubicación denegado. Actívalo en los ajustes del teléfono.' : e.message || 'Sin señal GPS'),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  useEffect(() => {
    avgStartRef.current = avgStart;
    if (avgStart === null) return;
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n - avgStart >= AVG_MS) {
        clearInterval(t);
        const r = average(buf.current);
        setAvgStart(null);
        if (r) {
          setAvg({ fix: r, n: buf.current.length });
          vibrate(30);
          toast(`Promedio de ${buf.current.length} lecturas`, 'ok');
        } else toast('No llegaron lecturas durante el promedio', 'warn');
      }
    }, 200);
    return () => clearInterval(t);
  }, [avgStart]);

  const startAvg = () => {
    buf.current = live ? [live] : [];
    setAvg(null);
    setNow(Date.now());
    setAvgStart(Date.now());
  };

  const oneShot = async () => {
    try {
      const p = await getPhonePosition();
      setLive(p);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const fix = avg?.fix ?? live;
  const utm = useMemo(() => {
    if (!fix || !project) return null;
    try {
      const u = latLonToUtm(fix.lat, fix.lon, project.crs.zone);
      return { ...u, natZone: zoneFromLon(fix.lon) };
    } catch {
      return null;
    }
  }, [fix, project]);

  if (!project) {
    return (
      <Screen title="GPS del teléfono" back>
        <EmptyState icon={<Smartphone size={30} />} title="Sin proyecto activo" />
      </Screen>
    );
  }

  const q = quality(live?.accuracy);
  const codes = frequentCodes(project.points, 6);
  const dup = project.points.some((p) => p.name.trim() === name.trim());
  const zoneMismatch = utm && utm.natZone !== project.crs.zone;
  const hemiMismatch = utm && utm.hemisphere !== project.crs.hemisphere;
  const progress = avgStart !== null ? Math.min(1, (now - avgStart) / AVG_MS) : 0;

  const save = () => {
    if (!utm || !fix || dup || !name.trim()) return;
    useStore.getState().addPoints([
      {
        name: name.trim(),
        code: code.trim().toUpperCase() || undefined,
        x: utm.E,
        y: utm.N,
        z: useAlt && fix.alt !== undefined ? Math.round(fix.alt * 1000) / 1000 : undefined,
        source: 'phone-gps',
        precision: Math.round(fix.accuracy * 10) / 10,
        note: avg ? `Promedio de ${avg.n} lecturas GPS` : 'Lectura GPS única',
      },
    ]);
    toast(`Punto ${name.trim()} guardado (±${f(fix.accuracy, 1)} m)`);
    back();
  };

  const QIcon = q?.tone === 'ok' ? CircleCheck : q?.tone === 'warn' ? AlertTriangle : CircleX;

  return (
    <Screen title="GPS del teléfono" subtitle={`UTM ${project.crs.zone}${project.crs.hemisphere} · WGS84`} back>
      <div className="stack-l">
        <div className="pt-gps-warn" role="note">
          <AlertTriangle size={20} />
          <span>
            <strong>Precisión de metros: solo para croquis/referencia.</strong> No usar para replanteo ni control de cotas.
          </span>
        </div>

        <div className={`card pt-gps-meter tone-${q?.tone ?? 'neutral'}`} aria-live="polite">
          {err ? (
            <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
              <CircleX size={36} className="c-fail" />
              <strong>{err}</strong>
              <button className="btn ghost" onClick={oneShot}>
                <LocateFixed size={18} /> Reintentar
              </button>
            </div>
          ) : !live ? (
            <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
              <Satellite size={36} className="pt-pulse" />
              <strong>Buscando señal GPS…</strong>
              <span className="small muted">Sal a cielo abierto y espera unos segundos.</span>
            </div>
          ) : (
            <>
              <span className="pt-gps-label">Precisión actual</span>
              <span className="pt-gps-acc num">
                ±{live.accuracy < 10 ? f(live.accuracy, 1) : f(live.accuracy, 0)}
                <small> m</small>
              </span>
              {q && (
                <span className={`badge ${q.tone}`}>
                  <QIcon size={14} /> {q.label}
                </span>
              )}
            </>
          )}
        </div>

        {live && (
          <div className="card stack">
            <div className="row-between">
              <span className="section-title" style={{ margin: 0 }}>
                {avg ? `Promedio · ${avg.n} lecturas` : 'Lectura en vivo'}
              </span>
              {avg && <span className="badge ok">±{f(avg.fix.accuracy, 1)} m</span>}
            </div>
            <div className="grid-2 pt-result-grid">
              <div>
                <span>Este</span>
                <strong className="num">{utm ? f(utm.E, 3) : '—'}</strong>
              </div>
              <div>
                <span>Norte</span>
                <strong className="num">{utm ? f(utm.N, 3) : '—'}</strong>
              </div>
              <div>
                <span>Latitud</span>
                <strong className="num">{fix ? fix.lat.toFixed(7) : '—'}°</strong>
              </div>
              <div>
                <span>Longitud</span>
                <strong className="num">{fix ? fix.lon.toFixed(7) : '—'}°</strong>
              </div>
            </div>
            {(zoneMismatch || hemiMismatch) && (
              <div className="pt-gps-warn small">
                <AlertTriangle size={18} />
                <span>
                  {zoneMismatch
                    ? `Tu posición está en la zona ${utm!.natZone}, pero el proyecto usa la zona ${project.crs.zone}. Se convierte forzando la zona ${project.crs.zone}.`
                    : `El hemisferio calculado (${utm!.hemisphere}) difiere del del proyecto (${project.crs.hemisphere}).`}
                </span>
              </div>
            )}
            {avgStart !== null ? (
              <div className="stack" style={{ gap: 6 }}>
                <div className="meter" aria-label="Progreso del promedio">
                  <span style={{ width: `${progress * 100}%`, background: 'var(--accent)' }} />
                </div>
                <span className="small muted">
                  Promediando… {Math.ceil((AVG_MS - (now - avgStart)) / 1000)} s · {buf.current.length} lecturas. No muevas el teléfono.
                </span>
              </div>
            ) : (
              <button className="btn accent lg block" onClick={startAvg}>
                <Timer size={20} /> {avg ? 'Volver a promediar 10 s' : 'Promediar 10 s'}
              </button>
            )}
          </div>
        )}

        <div className="card stack">
          <div className="grid-2">
            <TextInput label="Nombre" value={name} onChange={setName} />
            <TextInput label="Código" value={code} onChange={(v) => setCode(v.toUpperCase())} placeholder="Libre" />
          </div>
          {dup && <span className="small c-fail">Ya existe un punto con ese nombre.</span>}
          <div className="chips">
            {codes.map((c) => (
              <button key={c} className={`chip${code === c ? ' active' : ''}`} onClick={() => setCode(code === c ? '' : c)}>
                {c}
              </button>
            ))}
          </div>
          <Toggle
            checked={useAlt}
            onChange={setUseAlt}
            label={
              <span>
                Usar altitud GPS como cota{' '}
                <span className="xs muted">({fix?.alt !== undefined ? `${f(fix.alt, 1)} m, elipsoidal, ±10 m o más` : 'no disponible'})</span>
              </span>
            }
          />
        </div>

        <button className="btn primary lg block" disabled={!utm || dup || !name.trim() || avgStart !== null} onClick={save}>
          <Save size={20} /> Guardar punto
        </button>
      </div>
    </Screen>
  );
}
