/**
 * Genera los informes de ejemplo del proyecto demo en docs/ejemplos/.
 * Uso: npx tsx scripts/generate-sample-reports.ts
 * Si existe `pdftoppm` (poppler), también crea un PNG de la primera página.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDemoProject } from '../src/app/demo';
import { layerControlPdf, levelRunPdf, pointsPdf, projectSummaryPdf, projectXlsx, type ReportHeader } from '../src/report';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'ejemplos');
mkdirSync(out, { recursive: true });

const project = createDemoProject();
const h: ReportHeader = { company: 'Consorcio Vial Los Álamos', engineer: 'Ing. Max Antony', cip: '000000', decimals: 3 };

const jobs: [string, () => Promise<Blob> | Blob][] = [
  ['libreta-nivelacion.pdf', () => levelRunPdf(project, project.levelRuns[0].id, h)],
  ['protocolo-capas.pdf', () => layerControlPdf(project, project.layerControls[0].id, h)],
  ['cuadro-puntos.pdf', () => pointsPdf(project, h)],
  ['informe-control-topografico.pdf', () => projectSummaryPdf(project, h)],
  ['proyecto.xlsx', () => projectXlsx(project, h)],
];

let hasPdftoppm = true;
try {
  execFileSync('pdftoppm', ['-v'], { stdio: 'ignore' });
} catch {
  hasPdftoppm = false;
}

for (const [name, make] of jobs) {
  const blob = await make();
  const file = join(out, name);
  writeFileSync(file, Buffer.from(await blob.arrayBuffer()));
  console.log(`✔ ${name} (${(blob.size / 1024).toFixed(0)} KB)`);
  if (hasPdftoppm && name.endsWith('.pdf')) {
    execFileSync('pdftoppm', ['-png', '-r', '110', '-f', '1', '-l', '1', '-singlefile', file, file.replace(/\.pdf$/, '')]);
    console.log(`  └ ${name.replace(/\.pdf$/, '.png')}`);
  }
}
