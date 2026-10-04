/** Catálogo estático de funciones de la app para la paleta de comandos. */
import type { TabId } from '@/app/nav';

export type ActionGroup = 'Nivelación' | 'Puntos' | 'Cálculos' | 'Informes' | 'Proyecto';

export interface AppAction {
  id: string;
  title: string;
  group: ActionGroup;
  /** Palabras clave adicionales para la búsqueda. */
  keywords?: string;
  /** Pantalla destino; si falta, solo cambia a la raíz de `tab`. */
  route?: string;
  params?: Record<string, unknown>;
  tab: TabId;
  /** Entre las sugeridas cuando la búsqueda está vacía. */
  top?: boolean;
}

const TOOLS: Array<[string, string, string]> = [
  ['inverse', 'Inverso: distancia y azimut', 'rumbo acimut entre dos puntos coordenadas'],
  ['radiation', 'Radiación', 'polar azimut distancia replanteo coordenadas'],
  ['utm', 'UTM ↔ Geográficas', 'conversion latitud longitud wgs84 zona 17 18 19 coordenadas'],
  ['area', 'Área y perímetro', 'superficie poligono gauss hectareas'],
  ['slope', 'Pendiente', 'porcentaje gradiente desnivel inclinacion'],
  ['angles', 'Conversión de ángulos', 'sexagesimal centesimal gon radianes grados dms'],
  ['peg-test', 'Prueba de dos estacas', 'colimacion calibracion nivel error peg test'],
  ['stadia', 'Taquimetría (estadía)', 'hilos estadimetricos distancia taquimetrica'],
  ['curvature', 'Curvatura y refracción', 'esfericidad correccion tierra'],
  ['reciprocal', 'Nivelación recíproca', 'rio quebrada cruce reciproca'],
  ['grade-stake', 'Calcular cota / lectura para estacar', 'cota de proyecto lectura mira corte relleno replanteo'],
  ['pipe-slope', 'Pendiente de tubería', 'desague alcantarillado buzon colector cota de fondo'],
  ['traverse', 'Poligonal', 'compensacion cierre angular brujula transito'],
  ['curve', 'Curva circular', 'replanteo curva horizontal pc pi pt tangente'],
  ['intersection', 'Intersección', 'interseccion de rumbos distancias'],
  ['volume', 'Volumen de corte y relleno', 'movimiento de tierras metrado secciones'],
];

export const ACTIONS: AppAction[] = [
  { id: 'level-new', title: 'Nueva nivelación', group: 'Nivelación', keywords: 'libreta crear cota', route: 'level-new', tab: 'leveling', top: true },
  { id: 'level-quick', title: 'Nivelación rápida', group: 'Nivelación', keywords: 'libreta rapida campo', route: 'level-new', params: { quick: true }, tab: 'leveling' },
  { id: 'level-list', title: 'Libretas de nivelación', group: 'Nivelación', keywords: 'lista libretas cierres', tab: 'leveling' },
  { id: 'layer-new', title: 'Nuevo control de capas', group: 'Nivelación', keywords: 'pavimento subrasante base carpeta vereda', route: 'layer-new', tab: 'leveling', top: true },
  { id: 'benchmarks', title: 'Bancos de nivel (BMs)', group: 'Proyecto', keywords: 'bm cota referencia hito', route: 'benchmarks', tab: 'home' },

  { id: 'point-new', title: 'Nuevo punto', group: 'Puntos', keywords: 'coordenadas agregar', route: 'point-edit', tab: 'points', top: true },
  { id: 'point-list', title: 'Lista de puntos', group: 'Puntos', keywords: 'planta coordenadas', tab: 'points' },
  { id: 'surface', title: 'Superficie y curvas de nivel', group: 'Puntos', keywords: 'tin mdt triangulacion volumen', route: 'surface', tab: 'points' },
  { id: 'phone-gps', title: 'Punto con GPS del teléfono', group: 'Puntos', keywords: 'gps ubicacion celular', route: 'phone-gps', tab: 'points' },

  ...TOOLS.map(
    ([id, title, keywords]): AppAction => ({
      id: `tool-${id}`,
      title,
      group: 'Cálculos',
      keywords: `calculo herramienta ${keywords}`,
      route: 'tool',
      params: { id },
      tab: 'tools',
      top: id === 'grade-stake' || id === 'utm',
    }),
  ),
  { id: 'tools', title: 'Todas las herramientas de cálculo', group: 'Cálculos', keywords: 'calculos', tab: 'tools' },

  { id: 'import', title: 'Importar datos', group: 'Informes', keywords: 'leica gsi trimble dini sokkia sdr topcon nmea csv archivo', route: 'import', tab: 'reports', top: true },
  { id: 'export', title: 'Exportar datos', group: 'Informes', keywords: 'csv excel xlsx kml', route: 'export', tab: 'reports' },
  { id: 'export-dxf', title: 'Exportar DXF', group: 'Informes', keywords: 'autocad civil 3d cad', route: 'export', tab: 'reports' },
  { id: 'export-csv', title: 'Exportar CSV / Excel', group: 'Informes', keywords: 'xlsx hoja de calculo puntos', route: 'export', tab: 'reports' },
  { id: 'export-kml', title: 'Exportar KML (Google Earth)', group: 'Informes', keywords: 'google earth mapa', route: 'export', tab: 'reports' },
  { id: 'report-summary', title: 'Informe PDF del proyecto', group: 'Informes', keywords: 'resumen reporte pdf', route: 'report', params: { kind: 'summary' }, tab: 'reports', top: true },
  { id: 'report-level', title: 'Informe de nivelación (PDF)', group: 'Informes', keywords: 'libreta reporte pdf cierre', route: 'report', params: { kind: 'level' }, tab: 'reports' },
  { id: 'report-layer', title: 'Informe de control de capas (PDF)', group: 'Informes', keywords: 'pavimento reporte pdf', route: 'report', params: { kind: 'layer' }, tab: 'reports' },
  { id: 'report-points', title: 'Informe de puntos (PDF)', group: 'Informes', keywords: 'cuadro de coordenadas reporte', route: 'report', params: { kind: 'points' }, tab: 'reports' },

  { id: 'projects', title: 'Proyectos', group: 'Proyecto', keywords: 'cambiar abrir respaldo importar exportar', route: 'projects', tab: 'home' },
  { id: 'project-new', title: 'Nuevo proyecto', group: 'Proyecto', keywords: 'crear', route: 'project-edit', tab: 'home' },
  { id: 'settings', title: 'Ajustes', group: 'Proyecto', keywords: 'tema oscuro claro sol decimales membrete configuracion', route: 'settings', tab: 'home' },
];

/** Normaliza para búsqueda: minúsculas, sin tildes. */
export function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Puntaje simple: todas las palabras deben aparecer; prefijo en el título puntúa más. */
export function score(query: string, title: string, extra = ''): number {
  const q = norm(query).trim();
  if (!q) return 1;
  const t = norm(title);
  const hay = `${t} ${norm(extra)}`;
  const words = q.split(/\s+/);
  if (!words.every((w) => hay.includes(w))) return 0;
  let s = 1;
  if (t.startsWith(q)) s += 4;
  else if (t.includes(q)) s += 2;
  if (words.every((w) => t.includes(w))) s += 1;
  return s;
}
