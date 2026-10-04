import type { ComponentType } from 'react';
import {
  ArrowLeftRight,
  Box,
  Compass,
  Crosshair,
  Earth,
  Globe,
  Pentagon,
  Radar,
  Rows3,
  Spline,
  Target,
  Telescope,
  TrendingDown,
  TrendingUp,
  Waves,
  Waypoints,
  type LucideIcon,
} from 'lucide-react';
import GradeStake, { gradeStakeExample } from './tools/GradeStake';
import PegTest, { pegExample } from './tools/PegTest';
import Stadia, { stadiaExample } from './tools/Stadia';
import Curvature, { curvatureExample } from './tools/Curvature';
import Reciprocal, { reciprocalExample } from './tools/Reciprocal';
import PipeSlope, { pipeExample } from './tools/PipeSlope';
import Inverse, { inverseExample } from './tools/Inverse';
import Radiation, { radiationExample } from './tools/Radiation';
import Utm, { utmExample } from './tools/Utm';
import Intersection, { intersectionExample } from './tools/Intersection';
import Traverse, { traverseExample } from './tools/Traverse';
import Area, { areaExample } from './tools/Area';
import Curve, { curveExample } from './tools/Curve';
import Volume, { volumeExample } from './tools/Volume';
import SlopeConv, { slopeExample } from './tools/SlopeConv';
import AngleConv, { anglesExample } from './tools/AngleConv';

export type ToolSection = 'leveling' | 'coords' | 'geometry' | 'convert';

export interface ToolDef {
  id: string;
  section: ToolSection;
  title: string;
  sub: string;
  icon: LucideIcon;
  /** Palabras extra para el buscador. */
  keywords: string;
  Component: ComponentType;
  /** Datos de ejemplo para "Cargar ejemplo". */
  example: object;
}

export const SECTIONS: Array<{ id: ToolSection; title: string; tone: 'brand' | 'info' | 'accent' | 'ok' }> = [
  { id: 'leveling', title: 'Nivelación', tone: 'brand' },
  { id: 'coords', title: 'Coordenadas', tone: 'info' },
  { id: 'geometry', title: 'Geometría', tone: 'accent' },
  { id: 'convert', title: 'Conversiones', tone: 'ok' },
];

export const TOOLS: ToolDef[] = [
  {
    id: 'grade-stake',
    section: 'leveling',
    title: 'Lectura objetivo / Cota',
    sub: 'AI, lectura de mira y corte/relleno',
    icon: Target,
    keywords: 'cota punto altura instrumento ai hi replanteo rasante corte relleno estaca mira bm vista atras',
    Component: GradeStake,
    example: gradeStakeExample,
  },
  {
    id: 'peg-test',
    section: 'leveling',
    title: 'Prueba de dos estacas',
    sub: 'Error de colimación del nivel',
    icon: Telescope,
    keywords: 'peg test colimacion nivel calibracion wsdot ajuste',
    Component: PegTest,
    example: pegExample,
  },
  {
    id: 'stadia',
    section: 'leveling',
    title: 'Taquimetría',
    sub: 'Distancia y desnivel con tres hilos',
    icon: Rows3,
    keywords: 'estadia hilos estadimetrica distancia superior inferior medio taquimetro',
    Component: Stadia,
    example: stadiaExample,
  },
  {
    id: 'curvature',
    section: 'leveling',
    title: 'Curvatura y refracción',
    sub: 'Corrección por visuales largas',
    icon: Earth,
    keywords: 'curvatura refraccion tierra correccion visual larga',
    Component: Curvature,
    example: curvatureExample,
  },
  {
    id: 'reciprocal',
    section: 'leveling',
    title: 'Nivelación recíproca',
    sub: 'Cruce de ríos y quebradas',
    icon: Waves,
    keywords: 'reciproca rio quebrada cruce desnivel',
    Component: Reciprocal,
    example: reciprocalExample,
  },
  {
    id: 'pipe-slope',
    section: 'leveling',
    title: 'Pendiente de tuberías',
    sub: 'Cotas de fondo, buzones, OS.070',
    icon: TrendingDown,
    keywords: 'tuberia alcantarillado desague buzon fondo invert pendiente os.070 saneamiento drenaje zanja',
    Component: PipeSlope,
    example: pipeExample,
  },
  {
    id: 'inverse',
    section: 'coords',
    title: 'Inverso',
    sub: 'Distancia, azimut y rumbo P1→P2',
    icon: ArrowLeftRight,
    keywords: 'inverso distancia azimut rumbo desnivel pendiente dos puntos',
    Component: Inverse,
    example: inverseExample,
  },
  {
    id: 'radiation',
    section: 'coords',
    title: 'Radiación',
    sub: 'Polar → coordenadas E, N, Z',
    icon: Radar,
    keywords: 'radiacion polar rectangular estacion total azimut distancia punto',
    Component: Radiation,
    example: radiationExample,
  },
  {
    id: 'utm',
    section: 'coords',
    title: 'UTM ↔ Geográficas',
    sub: 'WGS84, zonas 17/18/19 S',
    icon: Globe,
    keywords: 'utm geograficas latitud longitud wgs84 gps factor escala convergencia zona',
    Component: Utm,
    example: utmExample,
  },
  {
    id: 'intersection',
    section: 'coords',
    title: 'Intersecciones',
    sub: 'Azimut–azimut, distancia–distancia',
    icon: Crosshair,
    keywords: 'interseccion azimut distancia circulos visuales',
    Component: Intersection,
    example: intersectionExample,
  },
  {
    id: 'traverse',
    section: 'coords',
    title: 'Poligonal',
    sub: 'Cierre y compensación',
    icon: Waypoints,
    keywords: 'poligonal traverse cierre angular lineal bowditch brujula transito precision compensacion',
    Component: Traverse,
    example: traverseExample,
  },
  {
    id: 'area',
    section: 'geometry',
    title: 'Área y perímetro',
    sub: 'Por coordenadas, m² y ha',
    icon: Pentagon,
    keywords: 'area perimetro poligono hectareas gauss terreno lote',
    Component: Area,
    example: areaExample,
  },
  {
    id: 'curve',
    section: 'geometry',
    title: 'Curva horizontal',
    sub: 'Elementos y deflexiones',
    icon: Spline,
    keywords: 'curva circular horizontal tangente pc pt pi deflexiones replanteo radio',
    Component: Curve,
    example: curveExample,
  },
  {
    id: 'volume',
    section: 'geometry',
    title: 'Volúmenes',
    sub: 'Áreas medias y prismoidal',
    icon: Box,
    keywords: 'volumen corte relleno movimiento tierras secciones metrado prismoidal areas medias',
    Component: Volume,
    example: volumeExample,
  },
  {
    id: 'slope',
    section: 'convert',
    title: 'Pendientes',
    sub: '%, ‰, grados, 1:n, H:V',
    icon: TrendingUp,
    keywords: 'pendiente porcentaje por mil talud grados relacion inclinacion',
    Component: SlopeConv,
    example: slopeExample,
  },
  {
    id: 'angles',
    section: 'convert',
    title: 'Ángulos',
    sub: 'Sexagesimal, decimal, gon, rad',
    icon: Compass,
    keywords: 'angulos grados minutos segundos dms gon centesimal radianes conversion',
    Component: AngleConv,
    example: anglesExample,
  },
];

export const toolById = (id: string) => TOOLS.find((t) => t.id === id);
