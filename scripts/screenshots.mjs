// Genera las capturas del README con el proyecto de ejemplo.
// Uso: npm run build && node scripts/screenshots.mjs
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { readdirSync, existsSync, mkdirSync } from 'node:fs';

const OUT = 'docs/img/screens';
mkdirSync(OUT, { recursive: true });
const PORT = 4789;
const URL = `http://127.0.0.1:${PORT}/`;

function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = '/opt/pw-browsers';
  const dir = existsSync(base) && readdirSync(base).find((d) => d.startsWith('chromium-'));
  return dir ? `${base}/${dir}/chrome-linux/chrome` : undefined;
}

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--host', '127.0.0.1', '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));

const browser = await chromium.launch({ executablePath: findChromium() });

async function session(theme, viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, colorScheme: theme === 'dark' ? 'dark' : 'light' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  await page.goto(URL);
  await page.evaluate((t) => {
    const s = window.__topo.useStore.getState();
    if (!s.projects.length) s.loadDemo();
    s.setSettings({ theme: t, company: 'Consorcio Vial Los Álamos', engineer: 'Ing. Max', cip: '123456' });
  }, theme);
  await page.waitForTimeout(400);
  return { ctx, page };
}

const nav = (page, name, params = {}, tab) =>
  page.evaluate(([n, p, t]) => {
    const { useNav, go } = window.__topo;
    useNav.getState().resetTab(t ?? useNav.getState().tab);
    if (t) useNav.getState().setTab(t);
    if (n) go(n, p, t);
  }, [name, params, tab]);

const tab = (page, t) =>
  page.evaluate((t) => {
    const { useNav } = window.__topo;
    useNav.getState().resetTab(t);
    useNav.setState({ tab: t });
  }, t);

const project = (page) => page.evaluate(() => {
  const s = window.__topo.useStore.getState();
  return s.projects.find((p) => p.id === s.activeProjectId);
});

async function shot(page, name, before) {
  if (before) await before();
  await page.waitForTimeout(700);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('✓', name);
}

// ---- Móvil, tema claro ----
{
  const { ctx, page } = await session('light', { width: 412, height: 915 });
  const p = await project(page);
  const run = p.levelRuns[0];
  const lc = p.layerControls[0];

  await shot(page, 'inicio', () => tab(page, 'home'));
  await shot(page, 'nivelacion', () => tab(page, 'leveling'));
  await shot(page, 'captura', () => nav(page, 'level-entry', { runId: run.id }, 'leveling'));
  await shot(page, 'resultado', () => nav(page, 'level-run', { runId: run.id }, 'leveling'));
  await shot(page, 'perfil', async () => {
    await nav(page, 'level-run', { runId: run.id }, 'leveling');
    await page.waitForTimeout(300);
    await page.getByRole('tab', { name: /Perfil/i }).first().click().catch(() => {});
  });
  await shot(page, 'capas', () => nav(page, 'layer-control', { id: lc.id }, 'leveling'));
  await shot(page, 'planta', async () => {
    await tab(page, 'points');
    await page.waitForTimeout(300);
    await page.getByRole('tab', { name: /Planta/i }).first().click().catch(() => {});
  });
  await shot(page, 'calculos', () => tab(page, 'tools'));
  await shot(page, 'herramienta', () => nav(page, 'tool', { id: 'peg-test' }, 'tools'));
  await shot(page, 'informes', () => tab(page, 'reports'));
  await shot(page, 'importar', () => nav(page, 'import', {}, 'reports'));
  await shot(page, 'superficie', () => nav(page, 'surface', {}, 'points'));
  await ctx.close();
}

// ---- Móvil, tema oscuro ----
{
  const { ctx, page } = await session('dark', { width: 412, height: 915 });
  const p = await project(page);
  await shot(page, 'inicio-oscuro', () => tab(page, 'home'));
  await shot(page, 'resultado-oscuro', () => nav(page, 'level-run', { runId: p.levelRuns[0].id }, 'leveling'));
  await ctx.close();
}

// ---- Escritorio ----
{
  const { ctx, page } = await session('light', { width: 1366, height: 860 });
  const p = await project(page);
  await shot(page, 'escritorio', () => nav(page, 'level-run', { runId: p.levelRuns[0].id }, 'leveling'));
  await ctx.close();
}

await browser.close();
server.kill();
