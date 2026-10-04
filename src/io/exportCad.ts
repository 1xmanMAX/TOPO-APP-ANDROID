/**
 * Exportadores CAD/SIG: DXF R12 (AC1009), KML 2.2 y LandXML 1.2.
 */
import type { CRS, Project, SurveyPoint } from '@/core/types';
import { utmToLatLon } from '@/core/geo';
import { isNum, nowIso, xmlEscape } from './common';

/* ------------------------------------------------------------------ */
/* DXF R12                                                             */
/* ------------------------------------------------------------------ */

export interface DxfContour {
  elevation: number;
  lines: [number, number][][];
  major?: boolean;
}

export interface DxfOptions {
  textHeight?: number;
  includeContours?: DxfContour[];
}

/** Nombre de capa válido y ASCII. */
export function dxfLayerName(s: string): string {
  const t = s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9_$-]/g, '_')
    .slice(0, 31);
  return t || 'SIN_NOMBRE';
}

/** Texto DXF: caracteres no ASCII como \U+XXXX. */
function dxfText(s: string): string {
  return [...s.replace(/[\r\n]+/g, ' ')]
    .map((ch) => {
      const c = ch.codePointAt(0)!;
      return c < 128 ? ch : `\\U+${c.toString(16).toUpperCase().padStart(4, '0')}`;
    })
    .join('');
}

const n4 = (v: number) => (Number.isFinite(v) ? v.toFixed(4) : '0.0');

/** Proyecto a DXF R12 ASCII: POINT 3D y TEXT (nombre, cota) por capas de código; BMs en capa propia. */
export function exportDxf(project: Project, opts: DxfOptions = {}): string {
  const h = opts.textHeight && opts.textHeight > 0 ? opts.textHeight : 0.25;
  const out: string[] = [];
  const g = (code: number, value: string | number) => out.push(String(code), String(value));

  // Capas: nombre → color ACI.
  const layers = new Map<string, number>();
  const ptLayer = (p: SurveyPoint) => {
    const name = `PTS_${dxfLayerName(p.code || 'SIN_CODIGO')}`.slice(0, 31);
    if (!layers.has(name)) layers.set(name, (layers.size % 6) + 1);
    return name;
  };
  const pts = project.points.filter((p) => isNum(p.x) && isNum(p.y));
  pts.forEach(ptLayer);
  layers.set('TXT_NOMBRE', 7);
  layers.set('TXT_COTA', 3);
  const bms = project.benchmarks.filter((b) => isNum(b.x) && isNum(b.y));
  if (bms.length) {
    layers.set('BM', 1);
    layers.set('BM_TXT', 1);
  }
  const contours = opts.includeContours ?? [];
  if (contours.some((c) => c.major)) layers.set('CURVAS_MAYORES', 30);
  if (contours.some((c) => !c.major)) layers.set('CURVAS_MENORES', 8);

  // Extensión.
  const xs = [...pts.map((p) => p.x), ...bms.map((b) => b.x!)];
  const ys = [...pts.map((p) => p.y), ...bms.map((b) => b.y!)];
  for (const c of contours) for (const l of c.lines) for (const [x, y] of l) xs.push(x), ys.push(y);
  const ext = xs.length
    ? [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
    : [0, 0, 0, 0];

  g(0, 'SECTION');
  g(2, 'HEADER');
  g(9, '$ACADVER');
  g(1, 'AC1009');
  g(9, '$EXTMIN');
  g(10, n4(ext[0]));
  g(20, n4(ext[1]));
  g(9, '$EXTMAX');
  g(10, n4(ext[2]));
  g(20, n4(ext[3]));
  g(0, 'ENDSEC');

  g(0, 'SECTION');
  g(2, 'TABLES');
  g(0, 'TABLE');
  g(2, 'LTYPE');
  g(70, 1);
  g(0, 'LTYPE');
  g(2, 'CONTINUOUS');
  g(70, 0);
  g(3, 'Solid line');
  g(72, 65);
  g(73, 0);
  g(40, '0.0');
  g(0, 'ENDTAB');
  g(0, 'TABLE');
  g(2, 'LAYER');
  g(70, layers.size + 1);
  for (const [name, color] of [['0', 7] as [string, number], ...layers]) {
    g(0, 'LAYER');
    g(2, name);
    g(70, 0);
    g(62, color);
    g(6, 'CONTINUOUS');
  }
  g(0, 'ENDTAB');
  g(0, 'ENDSEC');

  g(0, 'SECTION');
  g(2, 'ENTITIES');
  const text = (layer: string, x: number, y: number, z: number, height: number, value: string) => {
    g(0, 'TEXT');
    g(8, layer);
    g(10, n4(x));
    g(20, n4(y));
    g(30, n4(z));
    g(40, n4(height));
    g(1, dxfText(value));
  };
  for (const p of pts) {
    const z = isNum(p.z) ? p.z : 0;
    g(0, 'POINT');
    g(8, ptLayer(p));
    g(10, n4(p.x));
    g(20, n4(p.y));
    g(30, n4(z));
    text('TXT_NOMBRE', p.x + h * 0.5, p.y + h * 0.5, z, h, p.name);
    if (isNum(p.z)) text('TXT_COTA', p.x + h * 0.5, p.y - h * 1.2, z, h * 0.8, p.z.toFixed(3));
  }
  for (const b of bms) {
    g(0, 'POINT');
    g(8, 'BM');
    g(10, n4(b.x!));
    g(20, n4(b.y!));
    g(30, n4(b.elevation));
    text('BM_TXT', b.x! + h * 0.5, b.y! + h * 0.5, b.elevation, h, `${b.name} ${b.elevation.toFixed(3)}`);
  }
  for (const c of contours) {
    const layer = c.major ? 'CURVAS_MAYORES' : 'CURVAS_MENORES';
    for (const l of c.lines) {
      if (l.length < 2) continue;
      const closed = l.length > 2 && l[0][0] === l[l.length - 1][0] && l[0][1] === l[l.length - 1][1];
      const verts = closed ? l.slice(0, -1) : l;
      g(0, 'POLYLINE');
      g(8, layer);
      g(66, 1);
      g(10, '0.0');
      g(20, '0.0');
      g(30, n4(c.elevation));
      g(70, closed ? 1 : 0);
      for (const [x, y] of verts) {
        g(0, 'VERTEX');
        g(8, layer);
        g(10, n4(x));
        g(20, n4(y));
        g(30, n4(c.elevation));
      }
      g(0, 'SEQEND');
      g(8, layer);
    }
  }
  g(0, 'ENDSEC');
  g(0, 'EOF');
  return out.join('\r\n') + '\r\n';
}

/* ------------------------------------------------------------------ */
/* KML                                                                 */
/* ------------------------------------------------------------------ */

/** Puntos UTM a KML 2.2 (lon,lat,cota). */
export function exportKml(points: SurveyPoint[], crs: CRS, name = 'Levantamiento'): string {
  const pm: string[] = [];
  for (const p of points) {
    if (!isNum(p.x) || !isNum(p.y)) continue;
    const ll = utmToLatLon(p.x, p.y, crs.zone, crs.hemisphere);
    if (!Number.isFinite(ll.lat) || !Number.isFinite(ll.lon)) continue;
    const z = isNum(p.z) ? `,${p.z.toFixed(3)}` : '';
    const data = [
      `<Data name="Este"><value>${p.x.toFixed(3)}</value></Data>`,
      `<Data name="Norte"><value>${p.y.toFixed(3)}</value></Data>`,
      isNum(p.z) ? `<Data name="Cota"><value>${p.z.toFixed(3)}</value></Data>` : '',
      p.code ? `<Data name="Codigo"><value>${xmlEscape(p.code)}</value></Data>` : '',
    ].join('');
    pm.push(
      `      <Placemark><name>${xmlEscape(p.name)}</name>` +
        (p.code ? `<description>${xmlEscape(p.code)}</description>` : '') +
        `<styleUrl>#pt</styleUrl><ExtendedData>${data}</ExtendedData>` +
        `<Point><coordinates>${ll.lon.toFixed(8)},${ll.lat.toFixed(8)}${z}</coordinates></Point></Placemark>`,
    );
  }
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<kml xmlns="http://www.opengis.net/kml/2.2">',
    '  <Document>',
    `    <name>${xmlEscape(name)}</name>`,
    '    <Style id="pt"><IconStyle><scale>0.8</scale></IconStyle></Style>',
    '    <Folder><name>Puntos</name>',
    ...pm,
    '    </Folder>',
    '  </Document>',
    '</kml>',
    '',
  ].join('\n');
}

/* ------------------------------------------------------------------ */
/* LandXML 1.2                                                         */
/* ------------------------------------------------------------------ */

export interface LandXmlOptions {
  surface?: { points: { x: number; y: number; z: number }[]; triangles: number[] };
}

/** Proyecto a LandXML 1.2: CgPoints (N E Z) y superficie TIN opcional. */
export function exportLandXml(project: Project, opts: LandXmlOptions = {}): string {
  const now = nowIso();
  const { zone, hemisphere } = project.crs;
  const epsg = (hemisphere === 'S' ? 32700 : 32600) + zone;
  const c = (v: number) => v.toFixed(4);
  const used = new Map<string, number>();
  const unique = (name: string) => {
    const k = used.get(name) ?? 0;
    used.set(name, k + 1);
    return k ? `${name}_${k + 1}` : name;
  };
  const cg: string[] = [];
  for (const b of project.benchmarks) {
    if (!isNum(b.x) || !isNum(b.y)) continue;
    cg.push(
      `    <CgPoint name="${xmlEscape(unique(b.name))}" code="BM" pntSurv="control"` +
        (b.description ? ` desc="${xmlEscape(b.description)}"` : '') +
        `>${c(b.y)} ${c(b.x)} ${c(b.elevation)}</CgPoint>`,
    );
  }
  for (const p of project.points) {
    if (!isNum(p.x) || !isNum(p.y)) continue;
    const coords = isNum(p.z) ? `${c(p.y)} ${c(p.x)} ${c(p.z)}` : `${c(p.y)} ${c(p.x)}`;
    cg.push(
      `    <CgPoint name="${xmlEscape(unique(p.name))}"` +
        (p.code ? ` code="${xmlEscape(p.code)}"` : '') +
        (p.note ? ` desc="${xmlEscape(p.note)}"` : '') +
        ` pntSurv="sideshot">${coords}</CgPoint>`,
    );
  }
  const out: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<LandXML xmlns="http://www.landxml.org/schema/LandXML-1.2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"' +
      ' xsi:schemaLocation="http://www.landxml.org/schema/LandXML-1.2 http://www.landxml.org/schema/LandXML-1.2/LandXML-1.2.xsd"' +
      ` version="1.2" date="${now.slice(0, 10)}" time="${now.slice(11, 19)}" language="Spanish" readOnly="false">`,
    '  <Units>',
    '    <Metric linearUnit="meter" areaUnit="squareMeter" volumeUnit="cubicMeter" angularUnit="decimal degrees" directionUnit="decimal degrees"/>',
    '  </Units>',
    `  <CoordinateSystem name="WGS 84 / UTM zone ${zone}${hemisphere}" epsgCode="${epsg}"/>`,
    `  <Project name="${xmlEscape(project.name)}"/>`,
    '  <Application name="TOPO APP" manufacturer="TOPO APP" version="1.0"/>',
  ];
  if (cg.length) out.push('  <CgPoints name="Puntos">', ...cg, '  </CgPoints>');
  const s = opts.surface;
  if (s && s.points.length >= 3 && s.triangles.length >= 3) {
    out.push('  <Surfaces>', '    <Surface name="TN">', '      <Definition surfType="TIN">', '        <Pnts>');
    s.points.forEach((p, i) => out.push(`          <P id="${i + 1}">${c(p.y)} ${c(p.x)} ${c(p.z)}</P>`));
    out.push('        </Pnts>', '        <Faces>');
    for (let i = 0; i + 2 < s.triangles.length; i += 3) {
      out.push(`          <F>${s.triangles[i] + 1} ${s.triangles[i + 1] + 1} ${s.triangles[i + 2] + 1}</F>`);
    }
    out.push('        </Faces>', '      </Definition>', '    </Surface>', '  </Surfaces>');
  }
  out.push('</LandXML>', '');
  return out.join('\n');
}
