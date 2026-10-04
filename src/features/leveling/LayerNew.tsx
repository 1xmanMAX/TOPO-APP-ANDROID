/** 'layer-new' — nuevo control de capas: plantilla, capas, rasante y malla. */
import { useMemo, useState } from 'react';
import { Grid3x3, Layers, Plus } from 'lucide-react';
import { useNav } from '@/app/nav';
import { useProject, useStore } from '@/app/store';
import { PAVEMENT_TEMPLATES, generateControlGrid, instantiateTemplate } from '@/core/pavement';
import type { DesignGrade, PavementLayer } from '@/core/types';
import { Field, NumberInput, Screen, TextInput } from '@/ui/kit';
import { station } from '@/ui/format';
import { GradeEditor, LayersEditor, parseOffsets } from './LayerParts';
import { NoProject } from './shared';

export function LayerNew() {
  const project = useProject();
  const replace = useNav((s) => s.replace);
  const d = new Date();
  const [name, setName] = useState(`Control de capas ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`);
  const [tpl, setTpl] = useState(PAVEMENT_TEMPLATES[0].id);
  const [layers, setLayers] = useState<PavementLayer[]>(() => instantiateTemplate(PAVEMENT_TEMPLATES[0].id));
  const [grade, setGrade] = useState<DesignGrade>(() => ({
    startStation: 0,
    startElevation: project?.benchmarks[0]?.elevation ?? 100,
    longSlope: 0,
    crossSlope: PAVEMENT_TEMPLATES[0].crossSlope,
    crossType: PAVEMENT_TEMPLATES[0].crossType,
  }));
  const [from, setFrom] = useState<number | undefined>(0);
  const [to, setTo] = useState<number | undefined>(100);
  const [every, setEvery] = useState<number | undefined>(20);
  const [offTxt, setOffTxt] = useState('-3.6, 0, 3.6');

  const offsets = parseOffsets(offTxt);
  const grid = useMemo(() => {
    if (from === undefined || to === undefined || !every || every <= 0 || !offsets) return null;
    if (Math.abs(to - from) / every > 2000) return null;
    try {
      return generateControlGrid({ fromStation: from, toStation: to, interval: every, offsets });
    } catch {
      return null;
    }
  }, [from, to, every, offsets?.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!project) return <NoProject back title="Nuevo control" />;

  const tplObj = PAVEMENT_TEMPLATES.find((t) => t.id === tpl);
  const valid = name.trim() !== '' && layers.length > 0 && layers.every((l) => l.name.trim()) && Number.isFinite(grade.startElevation);

  return (
    <Screen title="Nuevo control de capas" subtitle={project.name} back>
      <div className="stack-l">
        <TextInput label="Nombre" value={name} onChange={setName} />

        <div className="stack">
          <h3 className="section-title">Plantilla</h3>
          <div className="lc-tpl-grid">
            {PAVEMENT_TEMPLATES.map((t) => (
              <button
                key={t.id}
                className={`lv-opt lc-tpl${tpl === t.id ? ' active' : ''}`}
                onClick={() => {
                  setTpl(t.id);
                  setLayers(instantiateTemplate(t.id));
                  setGrade((g) => ({ ...g, crossSlope: t.crossSlope, crossType: t.crossType }));
                }}
              >
                <strong>{t.name}</strong>
                <span>{t.layers.map((l) => l.name).join(' · ')}</span>
              </button>
            ))}
          </div>
          {tplObj && <p className="xs faint">{tplObj.description} Fuente: {tplObj.normative}.</p>}
        </div>

        <div className="card stack">
          <div className="row">
            <Layers size={18} className="c-brand" />
            <h3 className="lv-h3">Capas</h3>
          </div>
          <LayersEditor layers={layers} onChange={setLayers} />
        </div>

        <div className="card stack">
          <h3 className="lv-h3">Rasante de proyecto</h3>
          <GradeEditor grade={grade} onChange={setGrade} />
        </div>

        <div className="card stack">
          <div className="row">
            <Grid3x3 size={18} className="c-brand" />
            <h3 className="lv-h3">Malla de puntos de control</h3>
          </div>
          <div className="grid-3">
            <NumberInput label="Desde" suffix="m" value={from} onChange={setFrom} />
            <NumberInput label="Hasta" suffix="m" value={to} onChange={setTo} />
            <NumberInput label="Cada" suffix="m" value={every} onChange={setEvery} />
          </div>
          <Field label="Desplazamientos (m)" hint="Separados por coma o espacio: negativo = izquierda, 0 = eje">
            <input className="input num" value={offTxt} onChange={(e) => setOffTxt(e.target.value)} />
          </Field>
          <p className={`small ${grid ? 'muted' : 'c-warn'}`}>
            {grid
              ? `${grid.length} puntos: ${station(Math.min(from!, to!), 0)} a ${station(Math.max(from!, to!), 0)} en ${offsets!.length} ${offsets!.length === 1 ? 'línea' : 'líneas'}`
              : 'Revisa la malla (intervalo > 0 y desplazamientos válidos)'}
          </p>
        </div>

        <button
          className="btn primary lg block"
          disabled={!valid}
          onClick={() => {
            const id = useStore.getState().createLayerControl({ name: name.trim(), layers, grade, points: grid ?? [] });
            replace({ name: 'layer-control', params: { id } });
          }}
        >
          <Plus size={20} /> Crear control
        </button>
      </div>
    </Screen>
  );
}
