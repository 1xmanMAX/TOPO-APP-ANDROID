/**
 * Base de los informes PDF: documento A4 vertical con encabezado y pie en
 * cada página, estilos de tabla y bloques reutilizables (datos, cierre, firmas).
 */
import type { jsPDF } from 'jspdf';
import type { UserOptions, RowInput, CellHookData } from 'jspdf-autotable';
import type { Project } from '@/core/types';
import { decimalsOf, dmy, isoDay, pdfText, type ReportHeader } from '../format';

export type RGB = [number, number, number];

export const C = {
  accent: [194, 65, 12] as RGB, // #C2410C
  accentSoft: [255, 237, 213] as RGB,
  ink: [28, 25, 23] as RGB,
  muted: [100, 100, 100] as RGB,
  line: [214, 211, 209] as RGB,
  band: [250, 247, 245] as RGB,
  zebra: [246, 246, 246] as RGB,
  ok: [21, 128, 61] as RGB,
  okSoft: [220, 252, 231] as RGB,
  warn: [180, 83, 9] as RGB,
  warnSoft: [254, 243, 199] as RGB,
  fail: [185, 28, 28] as RGB,
  failSoft: [254, 226, 226] as RGB,
  grey: [120, 113, 108] as RGB,
  greySoft: [237, 237, 237] as RGB,
  white: [255, 255, 255] as RGB,
};

export const PAGE = { w: 210, h: 297, m: 15 };
/** Alto de la franja de encabezado (mm). */
const HEADER_H = 22;
/** Y superior de la franja (dentro del margen superior, para ganar espacio útil). */
const HEADER_Y = PAGE.m - 3;
export const CONTENT_TOP = HEADER_Y + HEADER_H + 7;
export const CONTENT_BOTTOM = PAGE.h - PAGE.m - 6;
export const CONTENT_W = PAGE.w - 2 * PAGE.m;

type AutoTable = (doc: jsPDF, options: UserOptions) => void;

export class ReportDoc {
  y = CONTENT_TOP;
  readonly dec: number;

  private constructor(
    readonly doc: jsPDF,
    private readonly autoTableFn: AutoTable,
    readonly title: string,
    readonly project: Project,
    readonly h: ReportHeader,
  ) {
    this.dec = decimalsOf(h);
  }

  /** Carga jsPDF bajo demanda (no pesa en el arranque de la app). */
  static async create(title: string, project: Project, h: ReportHeader): Promise<ReportDoc> {
    const [{ jsPDF }, at] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    doc.setProperties({
      title: pdfText(`${title} — ${project.name}`),
      subject: pdfText(title),
      author: pdfText(h.engineer || h.company || project.surveyor || 'TOPO APP'),
      creator: 'TOPO APP',
    });
    doc.setFont('helvetica', 'normal');
    return new ReportDoc(doc, at.autoTable as AutoTable, title, project, h);
  }

  /* ----------------------------- utilidades ----------------------------- */

  color(c: RGB, kind: 'text' | 'fill' | 'draw' = 'text'): void {
    if (kind === 'text') this.doc.setTextColor(c[0], c[1], c[2]);
    else if (kind === 'fill') this.doc.setFillColor(c[0], c[1], c[2]);
    else this.doc.setDrawColor(c[0], c[1], c[2]);
  }

  font(size: number, style: 'normal' | 'bold' | 'italic' = 'normal', c: RGB = C.ink): void {
    this.doc.setFont('helvetica', style);
    this.doc.setFontSize(size);
    this.color(c);
  }

  text(s: string, x: number, y: number, opts?: { align?: 'left' | 'center' | 'right'; maxWidth?: number }): void {
    let t = pdfText(s);
    if (opts?.maxWidth) t = this.fit(t, opts.maxWidth);
    this.doc.text(t, x, y, { align: opts?.align ?? 'left' });
  }

  /** Recorta con "…" para que quepa en `w` mm. */
  fit(s: string, w: number): string {
    if (this.doc.getTextWidth(s) <= w) return s;
    let t = s;
    while (t.length > 1 && this.doc.getTextWidth(t + '…') > w) t = t.slice(0, -1);
    return t + '…';
  }

  /** Asegura `need` mm libres; si no, salta de página. */
  ensure(need: number): void {
    if (this.y + need > CONTENT_BOTTOM) this.newPage();
  }

  newPage(): void {
    this.doc.addPage('a4', 'portrait');
    this.y = CONTENT_TOP;
  }

  gap(mm = 4): void {
    this.y += mm;
  }

  /* ------------------------------- bloques ------------------------------ */

  /** Título de sección con barra de acento. */
  section(title: string, sub?: string, need = 24): void {
    this.y += 2;
    this.ensure(need);
    this.color(C.accent, 'fill');
    this.doc.rect(PAGE.m, this.y - 3.6, 1.4, 5, 'F');
    this.font(11, 'bold', C.ink);
    this.text(title, PAGE.m + 3.5, this.y);
    if (sub) {
      const w = this.doc.getTextWidth(pdfText(title));
      this.font(8.5, 'normal', C.muted);
      this.text(sub, PAGE.m + 3.5 + w + 3, this.y, { maxWidth: CONTENT_W - w - 8 });
    }
    this.y += 3;
    this.color(C.line, 'draw');
    this.doc.setLineWidth(0.2);
    this.doc.line(PAGE.m, this.y, PAGE.m + CONTENT_W, this.y);
    this.y += 3.5;
  }

  /** Bloque de datos clave/valor en `cols` columnas. */
  dataGrid(items: [string, string | undefined][], cols = 2): void {
    const list = items.filter(([, v]) => v !== undefined && v !== '');
    const rows = Math.ceil(list.length / cols);
    const rowH = 5.6;
    const h = rows * rowH + 3;
    this.ensure(h);
    this.color(C.band, 'fill');
    this.color(C.line, 'draw');
    this.doc.setLineWidth(0.2);
    this.doc.roundedRect(PAGE.m, this.y, CONTENT_W, h, 1.2, 1.2, 'FD');
    const colW = CONTENT_W / cols;
    const labelW = Math.min(25, colW * 0.36);
    list.forEach(([k, v], i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = PAGE.m + 3 + col * colW;
      const y = this.y + 5 + row * rowH;
      this.font(7.5, 'normal', C.muted);
      this.text(k, x, y, { maxWidth: labelW - 2 });
      this.font(8.5, 'bold', C.ink);
      this.text(v ?? '', x + labelW, y, { maxWidth: colW - labelW - 5 });
    });
    this.y += h + 5;
  }

  /** Tabla con el estilo de la casa. Devuelve la Y final. */
  table(opts: {
    head: RowInput[];
    body: RowInput[];
    foot?: RowInput[];
    columnStyles?: UserOptions['columnStyles'];
    didParseCell?: (d: CellHookData) => void;
    fontSize?: number;
    margin?: { left?: number; right?: number };
    tableWidth?: number | 'auto';
    startY?: number;
  }): number {
    const left = opts.margin?.left ?? PAGE.m;
    const right = opts.margin?.right ?? PAGE.m;
    this.autoTableFn(this.doc, {
      startY: opts.startY ?? this.y,
      head: opts.head,
      body: opts.body,
      foot: opts.foot,
      theme: 'grid',
      margin: { top: CONTENT_TOP, bottom: PAGE.h - CONTENT_BOTTOM, left, right },
      tableWidth: opts.tableWidth ?? 'auto',
      styles: {
        font: 'helvetica',
        fontSize: opts.fontSize ?? 8,
        cellPadding: { top: 1.05, bottom: 1.05, left: 1.6, right: 1.6 },
        lineColor: C.line,
        lineWidth: 0.15,
        textColor: C.ink,
        valign: 'middle',
        overflow: 'linebreak',
      },
      headStyles: { fillColor: C.accent, textColor: C.white, fontStyle: 'bold', halign: 'center', lineColor: C.accent },
      footStyles: { fillColor: C.accentSoft, textColor: C.ink, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: C.zebra },
      columnStyles: opts.columnStyles,
      showHead: 'everyPage',
      rowPageBreak: 'avoid',
      didParseCell: (d) => {
        if (typeof d.cell.raw === 'string' || typeof d.cell.raw === 'number') {
          d.cell.text = d.cell.text.map((t) => pdfText(t));
        }
        opts.didParseCell?.(d);
      },
    });
    const last = (this.doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
    const endY = last?.finalY ?? this.y;
    this.y = endY + 6;
    return endY;
  }

  /** Párrafo con salto de línea automático. */
  paragraph(s: string, size = 8.5, c: RGB = C.ink, indent = 0): void {
    this.font(size, 'normal', c);
    const lines = this.doc.splitTextToSize(pdfText(s), CONTENT_W - indent) as string[];
    const lh = size * 0.42;
    for (const line of lines) {
      this.ensure(lh + 1);
      this.doc.text(line, PAGE.m + indent, this.y);
      this.y += lh;
    }
    this.y += 1.5;
  }

  /** Lista con viñetas. */
  bullets(items: string[], c: RGB = C.ink): void {
    for (const it of items) {
      this.ensure(5);
      this.color(C.accent, 'fill');
      this.doc.circle(PAGE.m + 1.5, this.y - 1.1, 0.7, 'F');
      this.paragraph(it, 8.5, c, 4);
    }
  }

  /** Tarjetas KPI en una fila. */
  kpis(items: { label: string; value: string; sub?: string; tone?: RGB }[]): void {
    const h = 22;
    this.ensure(h + 4);
    const gap = 4;
    const w = (CONTENT_W - gap * (items.length - 1)) / items.length;
    items.forEach((k, i) => {
      const x = PAGE.m + i * (w + gap);
      this.color(C.band, 'fill');
      this.color(C.line, 'draw');
      this.doc.setLineWidth(0.2);
      this.doc.roundedRect(x, this.y, w, h, 1.5, 1.5, 'FD');
      this.color(k.tone ?? C.accent, 'fill');
      this.doc.rect(x, this.y + 1.5, 1.2, h - 3, 'F');
      this.font(7.5, 'normal', C.muted);
      this.text(k.label.toUpperCase(), x + 4, this.y + 5.5, { maxWidth: w - 6 });
      this.font(17, 'bold', k.tone ?? C.ink);
      this.text(k.value, x + 4, this.y + 14, { maxWidth: w - 6 });
      if (k.sub) {
        this.font(7, 'normal', C.muted);
        this.text(k.sub, x + 4, this.y + 19, { maxWidth: w - 6 });
      }
    });
    this.y += h + 6;
  }

  /** Bloque de firmas (Topógrafo / Residente / Supervisor). */
  signatures(extra?: string): void {
    const h = 32;
    this.ensure(h + (extra ? 5 : 0));
    this.y += 2;
    if (extra) {
      this.font(8, 'normal', C.muted);
      this.text(extra, PAGE.m, this.y);
      this.y += 4;
    }
    const roles: [string, string[]][] = [
      ['Topógrafo', [this.h.engineer ? this.h.engineer : this.project.surveyor ?? '', this.h.cip ? `CIP N° ${this.h.cip}` : '']],
      ['Ingeniero Residente', ['Nombre:', 'CIP N°:']],
      ['Ingeniero Supervisor', ['Nombre:', 'CIP N°:']],
    ];
    const gap = 8;
    const w = (CONTENT_W - 2 * gap) / 3;
    const lineY = this.y + 15;
    roles.forEach(([role, lines], i) => {
      const x = PAGE.m + i * (w + gap);
      this.color(C.ink, 'draw');
      this.doc.setLineWidth(0.3);
      this.doc.line(x + 3, lineY, x + w - 3, lineY);
      this.font(8.5, 'bold', C.ink);
      this.text(role, x + w / 2, lineY + 4.5, { align: 'center' });
      this.font(7.5, 'normal', C.muted);
      lines.filter(Boolean).forEach((l, j) => this.text(l, x + w / 2, lineY + 8.5 + j * 3.6, { align: 'center', maxWidth: w }));
    });
    this.y = lineY + 15;
  }

  /* -------------------------- encabezado y pie --------------------------- */

  private drawHeader(): void {
    const { doc, project, h } = this;
    const x0 = PAGE.m;
    const y0 = HEADER_Y;
    const w = CONTENT_W;
    this.color(C.band, 'fill');
    doc.rect(x0, y0, w, HEADER_H, 'F');
    this.color(C.accent, 'fill');
    doc.rect(x0, y0 + HEADER_H - 1.2, w, 1.2, 'F');
    doc.rect(x0, y0, 1.6, HEADER_H - 1.2, 'F');

    let tx = x0 + 5;
    if (h.logoDataUrl) {
      try {
        const props = doc.getImageProperties(h.logoDataUrl);
        const lh = HEADER_H - 6;
        const lw = Math.min(30, (props.width / props.height) * lh);
        doc.addImage(h.logoDataUrl, x0 + 4, y0 + 2.4, lw, lh);
        tx = x0 + 4 + lw + 4;
      } catch {
        /* logo no válido: se omite */
      }
    }
    const rightW = 34;
    const maxW = x0 + w - rightW - tx - 2;
    this.font(12.5, 'bold', C.accent);
    this.text(this.title.toUpperCase(), tx, y0 + 6.3, { maxWidth: maxW });
    this.font(9.5, 'bold', C.ink);
    this.text(project.name, tx, y0 + 11.2, { maxWidth: maxW });
    this.font(7.5, 'normal', C.muted);
    const l3 = [project.client && `Cliente: ${project.client}`, project.location && `Ubicación: ${project.location}`]
      .filter(Boolean)
      .join('   ·   ');
    if (l3) this.text(l3, tx, y0 + 15, { maxWidth: maxW });
    if (h.company) {
      this.font(7.5, 'bold', C.ink);
      this.text(h.company, tx, y0 + 18.6, { maxWidth: maxW });
    }
    const rx = x0 + w - 3;
    this.font(11, 'bold', C.accent);
    this.text('TOPO APP', rx, y0 + 7, { align: 'right' });
    this.font(7.5, 'normal', C.muted);
    this.text('Fecha de emisión', rx, y0 + 12.5, { align: 'right' });
    this.font(9, 'bold', C.ink);
    this.text(dmy(isoDay()), rx, y0 + 16.5, { align: 'right' });
  }

  private drawFooter(page: number, total: number): void {
    const { doc } = this;
    const y = PAGE.h - PAGE.m + 2;
    this.color(C.line, 'draw');
    doc.setLineWidth(0.2);
    doc.line(PAGE.m, y - 4, PAGE.m + CONTENT_W, y - 4);
    this.font(7.5, 'normal', C.muted);
    this.text('Generado con TOPO APP', PAGE.m, y);
    this.text(this.title, PAGE.w / 2, y, { align: 'center', maxWidth: 90 });
    this.font(7.5, 'bold', C.ink);
    this.text(`Página ${page} de ${total}`, PAGE.m + CONTENT_W, y, { align: 'right' });
  }

  /** Dibuja encabezado/pie en todas las páginas y devuelve el PDF. */
  finish(): Blob {
    const total = this.doc.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
      this.doc.setPage(p);
      this.drawHeader();
      this.drawFooter(p, total);
    }
    const buf = this.doc.output('arraybuffer');
    return new Blob([buf], { type: 'application/pdf' });
  }
}

/** Estilo de celda de estado (fondo suave + texto del tono). */
export function statusCell(d: CellHookData, tone: RGB, soft: RGB): void {
  d.cell.styles.fillColor = soft;
  d.cell.styles.textColor = tone;
  d.cell.styles.fontStyle = 'bold';
  d.cell.styles.halign = 'center';
}
