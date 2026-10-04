import { useState } from 'react';
import { LocateFixed } from 'lucide-react';
import { Kpi, NumberInput, Segmented, toast } from '@/ui/kit';
import { useProject } from '@/app/store';
import { getPhonePosition } from '@/app/platform';
import { centralMeridian, combinedScaleFactor, elevationFactor, latLonToUtm, utmToLatLon, zoneFromLon } from '@/core/geo';
import { AngleInput, Formula, HowTo, InputCard, Notice, ResultCard, ToolActions, Waiting, angValue, dms, n, toAng, useToolState, type Ang } from '../ui/shared';

type Zone = '17' | '18' | '19';

interface S {
  dir: 'geo' | 'utm';
  lat?: Ang;
  lon?: Ang;
  zoneMode: 'auto' | Zone;
  E?: number;
  N?: number;
  zone?: Zone;
  h?: number;
}

export const utmDefaults: S = { dir: 'geo', zoneMode: 'auto', lat: { neg: true }, lon: { neg: true } };
export const utmExample: S = {
  dir: 'geo',
  lat: { d: 12, m: 2, s: 46.95, neg: true },
  lon: { d: 77, m: 2, s: 34.05, neg: true },
  zoneMode: 'auto',
  h: 150,
};

const ZONES: Array<{ value: Zone; label: string }> = [
  { value: '17', label: '17 S' },
  { value: '18', label: '18 S' },
  { value: '19', label: '19 S' },
];

export default function Utm() {
  const [s, set] = useToolState<S>(utmDefaults);
  const project = useProject();
  const [locating, setLocating] = useState(false);
  const projZone = String(project?.crs.zone ?? 18) as Zone;
  const utmZone: Zone = s.zone ?? (['17', '18', '19'].includes(projZone) ? projZone : '18');

  let out:
    | { kind: 'utm'; E: number; N: number; zone: number; k: number; conv: number; lat: number; lon: number }
    | { kind: 'geo'; lat: number; lon: number; k: number; conv: number; zone: number }
    | null = null;
  let error: string | undefined;
  let warn: string | undefined;

  if (s.dir === 'geo') {
    const lat = angValue(s.lat).deg;
    const lon = angValue(s.lon).deg;
    if (lat !== undefined && lon !== undefined) {
      if (Math.abs(lat) > 80 || Math.abs(lon) > 180) error = 'Latitud o longitud fuera de rango (|φ| ≤ 80°, |λ| ≤ 180°).';
      else {
        const zone = s.zoneMode === 'auto' ? zoneFromLon(lon) : Number(s.zoneMode);
        const r = latLonToUtm(lat, lon, zone);
        out = { kind: 'utm', E: r.E, N: r.N, zone, k: r.scaleFactor, conv: r.convergence, lat, lon };
        if (Math.abs(lon - centralMeridian(zone)) > 3.5) warn = `El punto está fuera de la zona ${zone} (a ${n(Math.abs(lon - centralMeridian(zone)), 2)}° del meridiano central): la deformación crece.`;
        if (r.hemisphere === 'N') warn = 'El punto está en el hemisferio norte (N UTM sin falso norte).';
      }
    }
  } else if (s.E !== undefined && s.N !== undefined) {
    if (s.E < 100000 || s.E > 900000 || s.N < 0 || s.N > 10000000) error = 'Coordenadas fuera del rango UTM (E entre 100 000 y 900 000; N hasta 10 000 000).';
    else {
      const zone = Number(utmZone);
      const r = utmToLatLon(s.E, s.N, zone, 'S');
      out = { kind: 'geo', lat: r.lat, lon: r.lon, k: r.scaleFactor, conv: r.convergence, zone };
    }
  }

  const kh = s.h !== undefined ? elevationFactor(s.h) : undefined;
  const csf = out && s.h !== undefined ? combinedScaleFactor(out.k, s.h) : undefined;

  const useGps = async () => {
    setLocating(true);
    try {
      const fix = await getPhonePosition();
      set({
        dir: 'geo',
        lat: toAng(fix.lat, fix.lat < 0),
        lon: toAng(fix.lon, fix.lon < 0),
        h: fix.alt !== undefined ? Math.round(fix.alt * 10) / 10 : s.h,
      });
      toast(`Posición obtenida (±${Math.round(fix.accuracy)} m)`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo obtener la posición', 'fail');
    } finally {
      setLocating(false);
    }
  };

  const latLonText = (lat: number, lon: number) =>
    `${dms(Math.abs(lat), 3)} ${lat < 0 ? 'S' : 'N'}, ${dms(Math.abs(lon), 3)} ${lon < 0 ? 'W' : 'E'}`;

  const copy = out
    ? out.kind === 'utm'
      ? `WGS84 / UTM ${out.zone}S\nE = ${n(out.E)}\nN = ${n(out.N)}\nk = ${n(out.k, 8)} · γ = ${dms(out.conv, 1)}`
      : `Lat = ${dms(Math.abs(out.lat), 4)} ${out.lat < 0 ? 'S' : 'N'} (${n(out.lat, 8)})\nLon = ${dms(Math.abs(out.lon), 4)} ${out.lon < 0 ? 'W' : 'E'} (${n(out.lon, 8)})`
    : null;

  return (
    <div className="stack-l">
      <Segmented
        value={s.dir}
        onChange={(dir) => set({ dir })}
        options={[
          { value: 'geo', label: 'Geográficas → UTM' },
          { value: 'utm', label: 'UTM → Geográficas' },
        ]}
      />

      {s.dir === 'geo' ? (
        <InputCard
          title="Geográficas WGS84"
          aside={
            <button className="btn ghost sm" onClick={useGps} disabled={locating}>
              <LocateFixed size={18} /> {locating ? 'Buscando…' : 'Usar mi GPS'}
            </button>
          }
        >
          <AngleInput label="Latitud φ" value={s.lat} onChange={(lat) => set({ lat })} hemis={['N', 'S']} />
          <AngleInput label="Longitud λ" value={s.lon} onChange={(lon) => set({ lon })} hemis={['E', 'W']} />
          <p className="hint">G° M' S" o grados decimales en la primera casilla. Toca N/S, E/W para cambiar el hemisferio.</p>
          <div className="field">
            <span className="field-label">Zona</span>
            <Segmented value={s.zoneMode} onChange={(zoneMode) => set({ zoneMode })} options={[{ value: 'auto', label: 'Auto' }, ...ZONES]} />
          </div>
        </InputCard>
      ) : (
        <InputCard title="UTM WGS84 (hemisferio sur)">
          <div className="field">
            <span className="field-label">Zona</span>
            <Segmented value={utmZone} onChange={(zone) => set({ zone })} options={ZONES} />
          </div>
          <div className="grid-2">
            <NumberInput label="Este (E)" value={s.E} onChange={(E) => set({ E })} suffix="m" />
            <NumberInput label="Norte (N)" value={s.N} onChange={(N) => set({ N })} suffix="m" />
          </div>
        </InputCard>
      )}

      <InputCard title="Factor combinado (opcional)">
        <NumberInput label="Altura / cota media" value={s.h} onChange={(h) => set({ h })} suffix="m" hint="Para el factor de elevación y el factor combinado" />
      </InputCard>

      {error ? (
        <Notice tone="fail">{error}</Notice>
      ) : !out ? (
        <Waiting>{s.dir === 'geo' ? 'Ingresa latitud y longitud, o usa el GPS del teléfono.' : 'Ingresa las coordenadas Este y Norte.'}</Waiting>
      ) : (
        <>
          {warn && <Notice>{warn}</Notice>}
          {out.kind === 'utm' ? (
            <ResultCard label={`UTM zona ${out.zone} S · WGS84`} value={null} tone="brand">
              <div className="tl-xyz">
                <div>
                  <span>E</span>
                  <b>{n(out.E)}</b>
                </div>
                <div>
                  <span>N</span>
                  <b>{n(out.N)}</b>
                </div>
              </div>
            </ResultCard>
          ) : (
            <ResultCard label="Geográficas WGS84" value={null} tone="brand" sub={`${n(out.lat, 8)}°, ${n(out.lon, 8)}°`}>
              <div className="tl-xyz">
                <div>
                  <span>φ</span>
                  <b>
                    {dms(Math.abs(out.lat), 3)} {out.lat < 0 ? 'S' : 'N'}
                  </b>
                </div>
                <div>
                  <span>λ</span>
                  <b>
                    {dms(Math.abs(out.lon), 3)} {out.lon < 0 ? 'W' : 'E'}
                  </b>
                </div>
              </div>
            </ResultCard>
          )}
          <div className="grid-2 tl-kpis">
            <Kpi label="Factor de escala k" value={n(out.k, 8)} sub={`MC ${centralMeridian(out.zone)}°`} />
            <Kpi label="Convergencia γ" value={dms(out.conv, 1)} sub="Norte geográfico → cuadrícula" />
            {kh !== undefined && <Kpi label="Factor elevación" value={n(kh, 8)} sub="R / (R + h)" />}
            {csf !== undefined && <Kpi label="Factor combinado" value={n(csf, 8)} sub={`${n((csf - 1) * 1e6, 0)} ppm · ${n((csf - 1) * 1000, 1)} mm/km`} tone="brand" />}
          </div>
          {out.kind === 'utm' && <p className="small muted mono">{latLonText(out.lat, out.lon)}</p>}
        </>
      )}

      <ToolActions
        copy={copy}
        points={out && out.kind === 'utm' ? [{ name: '', x: out.E, y: out.N, z: s.h, note: `UTM ${out.zone}S desde geográficas` }] : out ? undefined : null}
      />

      <HowTo source="Karney (2011), series de Krüger hasta n⁶ sobre WGS84; IGN Perú. Error < 1 mm dentro de la zona.">
        <Formula>{`WGS84: a = 6 378 137 m, f = 1/298.257223563
k₀ = 0.9996 · Falso Este 500 000 · Falso Norte 10 000 000 (S)
Meridiano central = 6·zona − 183° (17S −81°, 18S −75°, 19S −69°)
Factor de elevación = R / (R + h),  R = 6 371 000 m
Factor combinado = k · R / (R + h)
Distancia UTM = Distancia topográfica · factor combinado`}</Formula>
      </HowTo>
    </div>
  );
}
