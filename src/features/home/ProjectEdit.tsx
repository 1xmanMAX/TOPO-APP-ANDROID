import { useState } from 'react';
import { Save } from 'lucide-react';
import type { ScreenProps } from '@/app/feature';
import { useNav } from '@/app/nav';
import { useStore } from '@/app/store';
import { Field, Screen, Segmented, TextInput, toast } from '@/ui/kit';

type Zone = '17' | '18' | '19';

export default function ProjectEdit({ params }: ScreenProps) {
  const id = typeof params.id === 'string' ? params.id : undefined;
  const existing = useStore((s) => (id ? s.projects.find((p) => p.id === id) : undefined));
  const createProject = useStore((s) => s.createProject);
  const updateProject = useStore((s) => s.updateProject);
  const isNew = !existing;

  const [name, setName] = useState(existing?.name ?? '');
  const [client, setClient] = useState(existing?.client ?? '');
  const [location, setLocation] = useState(existing?.location ?? '');
  const [surveyor, setSurveyor] = useState(existing?.surveyor ?? '');
  const [instrument, setInstrument] = useState(existing?.instrument ?? '');
  const [zone, setZone] = useState<Zone>(String(existing?.crs.zone ?? 18) as Zone);
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [tried, setTried] = useState(false);

  const save = () => {
    setTried(true);
    const n = name.trim();
    if (!n) {
      toast('Escribe un nombre para el proyecto', 'warn');
      return;
    }
    const data = {
      name: n,
      client: client.trim() || undefined,
      location: location.trim() || undefined,
      surveyor: surveyor.trim() || undefined,
      instrument: instrument.trim() || undefined,
      notes: notes.trim() || undefined,
      crs: { zone: Number(zone), hemisphere: 'S' as const, datum: 'WGS84' as const },
    };
    if (existing) {
      updateProject(existing.id, data);
      toast('Proyecto guardado');
      useNav.getState().back();
    } else {
      createProject(data);
      toast('Proyecto creado');
      useNav.getState().resetTab('home');
    }
  };

  return (
    <Screen back title={isNew ? 'Nuevo proyecto' : 'Editar proyecto'} subtitle={isNew ? undefined : existing?.name}>
      <div className="stack-l hm-form">
        <div className="card stack">
          <Field label="Nombre del proyecto *" hint={tried && !name.trim() ? 'Obligatorio' : undefined}>
            <input
              className="input"
              value={name}
              autoFocus={isNew}
              placeholder="Ej. Av. Los Álamos — Pavimentación"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
              style={tried && !name.trim() ? { borderColor: 'var(--fail)' } : undefined}
            />
          </Field>
          <TextInput label="Cliente" value={client} onChange={setClient} placeholder="Ej. Municipalidad de…" />
          <TextInput label="Ubicación" value={location} onChange={setLocation} placeholder="Distrito, provincia" />
        </div>

        <div className="card stack">
          <div className="md-grid-2 stack">
            <TextInput label="Topógrafo" value={surveyor} onChange={setSurveyor} placeholder="Nombre" />
            <TextInput label="Instrumento" value={instrument} onChange={setInstrument} placeholder="Ej. Sokkia B40" />
          </div>
          <Field label="Zona UTM (WGS84, hemisferio sur)" hint="Perú: 17S costa norte · 18S centro · 19S sur y oriente">
            <Segmented<Zone>
              value={zone}
              onChange={setZone}
              options={[
                { value: '17', label: '17S' },
                { value: '18', label: '18S' },
                { value: '19', label: '19S' },
              ]}
            />
          </Field>
          <Field label="Notas">
            <textarea
              className="input"
              value={notes}
              placeholder="Alcance, frentes de trabajo, observaciones…"
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
        </div>

        <button className="btn primary lg block" onClick={save}>
          <Save size={20} /> {isNew ? 'Crear proyecto' : 'Guardar cambios'}
        </button>
      </div>
    </Screen>
  );
}
