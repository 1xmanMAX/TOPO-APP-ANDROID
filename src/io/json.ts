/**
 * Respaldo del proyecto en JSON (.topo.json): {app:'topo-app', version:1, project}.
 */
import type { Project } from '@/core/types';
import { uid } from '@/core/id';
import { nowIso } from './common';

export const BACKUP_APP = 'topo-app';
export const BACKUP_VERSION = 1;

export function projectToJson(project: Project): string {
  return JSON.stringify({ app: BACKUP_APP, version: BACKUP_VERSION, project }, null, 2);
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Lee y valida un respaldo. Lanza Error con mensaje en español si es inválido. */
export function projectFromJson(text: string): Project {
  let data: unknown;
  try {
    data = JSON.parse(String(text ?? '').replace(/^﻿/, ''));
  } catch {
    throw new Error('El archivo no es un JSON válido');
  }
  if (!isObj(data)) throw new Error('El respaldo no contiene un objeto JSON');
  let p: unknown = data;
  if ('project' in data || 'app' in data) {
    if (data.app !== undefined && data.app !== BACKUP_APP) throw new Error('El archivo no es un respaldo de TOPO APP');
    if (typeof data.version === 'number' && data.version > BACKUP_VERSION) {
      throw new Error(`Versión de respaldo no soportada (${data.version}); actualice la aplicación`);
    }
    p = data.project;
  }
  if (!isObj(p)) throw new Error('El respaldo no contiene un proyecto');
  if (typeof p.name !== 'string' || !p.name.trim()) throw new Error('El proyecto no tiene nombre');

  const crs = p.crs;
  if (!isObj(crs)) throw new Error('El proyecto no tiene sistema de coordenadas (crs)');
  if (!isFiniteNum(crs.zone) || crs.zone < 1 || crs.zone > 60 || !Number.isInteger(crs.zone)) {
    throw new Error('Zona UTM inválida en el sistema de coordenadas');
  }
  if (crs.hemisphere !== 'N' && crs.hemisphere !== 'S') throw new Error('Hemisferio inválido (debe ser N o S)');

  for (const k of ['benchmarks', 'points', 'levelRuns', 'layerControls'] as const) {
    if (p[k] === undefined) p[k] = [];
    else if (!Array.isArray(p[k])) throw new Error(`El campo "${k}" debe ser una lista`);
  }
  (p.points as unknown[]).forEach((pt, i) => {
    if (!isObj(pt) || typeof pt.name !== 'string' || !isFiniteNum(pt.x) || !isFiniteNum(pt.y)) {
      throw new Error(`Punto ${i + 1} inválido: requiere nombre y coordenadas x, y numéricas`);
    }
    if (pt.z !== undefined && pt.z !== null && !isFiniteNum(pt.z)) throw new Error(`Punto ${pt.name}: cota inválida`);
    if (pt.z === null) delete pt.z;
    if (typeof pt.id !== 'string') pt.id = uid('pt_');
  });
  (p.benchmarks as unknown[]).forEach((b, i) => {
    if (!isObj(b) || typeof b.name !== 'string' || !isFiniteNum(b.elevation)) {
      throw new Error(`BM ${i + 1} inválido: requiere nombre y cota numérica`);
    }
    if (typeof b.id !== 'string') b.id = uid('bm_');
  });
  (p.levelRuns as unknown[]).forEach((r, i) => {
    if (!isObj(r) || !Array.isArray(r.observations) || !isObj(r.startBM)) {
      throw new Error(`Nivelación ${i + 1} inválida: faltan observaciones o BM de inicio`);
    }
    r.observations.forEach((o, j) => {
      if (!isObj(o) || (o.kind !== 'BS' && o.kind !== 'IS' && o.kind !== 'FS') || typeof o.pointName !== 'string') {
        throw new Error(`Nivelación "${String(r.name ?? i + 1)}": observación ${j + 1} inválida`);
      }
    });
  });

  const now = nowIso();
  if (typeof p.id !== 'string' || !p.id) p.id = uid('prj_');
  if (typeof p.createdAt !== 'string') p.createdAt = now;
  if (typeof p.updatedAt !== 'string') p.updatedAt = p.createdAt;
  crs.datum = 'WGS84';
  return p as unknown as Project;
}
