// Genera iconos de lanzador y splash de Android a partir del logotipo SVG.
// Uso: node scripts/gen-android-assets.mjs  (requiere Chromium de Playwright)
import { chromium } from 'playwright-core';
import { readdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const RES = 'android/app/src/main/res';
const exe = process.env.CHROMIUM_PATH ?? findChromium();

function findChromium() {
  const base = '/opt/pw-browsers';
  const dir = existsSync(base) && readdirSync(base).find((d) => d.startsWith('chromium-'));
  return dir ? `${base}/${dir}/chrome-linux/chrome` : undefined;
}

const glyph = (stroke = 3.4) => `
  <path d="M10 44c8-10 14-14 22-14s14 4 22 14" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="3" stroke-linecap="round"/>
  <path d="M14 36c6-8 11-11 18-11s12 3 18 11" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="3" stroke-linecap="round"/>
  <path d="M32 12l9 14H23z" fill="#fff"/>
  <path d="M32 26v24M26 50h12" stroke="#fff" stroke-width="${stroke}" stroke-linecap="round"/>`;
const grad = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e8590c"/><stop offset="1" stop-color="#ff9f4a"/></linearGradient></defs>`;

const svgs = {
  square: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${grad}<rect width="64" height="64" rx="14" fill="url(#g)"/>${glyph()}</svg>`,
  round: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${grad}<circle cx="32" cy="32" r="32" fill="url(#g)"/><g transform="translate(5.5 5.5) scale(.83)">${glyph()}</g></svg>`,
  // Primer plano adaptativo: 108dp con zona segura central de 66dp
  fg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108"><g transform="translate(26 26) scale(.875)">${glyph()}</g></svg>`,
  splash: (w, h) => {
    const s = Math.min(w, h) * 0.28;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${grad}<rect width="${w}" height="${h}" fill="#0b1220"/><g transform="translate(${(w - s) / 2} ${(h - s) / 2 - s * 0.15}) scale(${s / 64})"><rect width="64" height="64" rx="16" fill="url(#g)"/>${glyph()}</g><text x="${w / 2}" y="${h / 2 + s * 0.7}" fill="#fff" font-family="Arial, sans-serif" font-weight="800" font-size="${s * 0.26}" text-anchor="middle">TOPO APP</text></svg>`;
  },
};

const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage();

async function render(svg, w, h, out, transparent = true) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${w}" height="${h}" `)}</body></html>`);
  await page.screenshot({ path: out, omitBackground: transparent, clip: { x: 0, y: 0, width: w, height: h } });
}

for (const [d, k] of Object.entries(densities)) {
  await render(svgs.square, 48 * k, 48 * k, `${RES}/mipmap-${d}/ic_launcher.png`);
  await render(svgs.round, 48 * k, 48 * k, `${RES}/mipmap-${d}/ic_launcher_round.png`);
  await render(svgs.fg, 108 * k, 108 * k, `${RES}/mipmap-${d}/ic_launcher_foreground.png`);
}

for (const dir of readdirSync(RES).filter((d) => d.startsWith('drawable'))) {
  const f = `${RES}/${dir}/splash.png`;
  if (!existsSync(f)) continue;
  const dims = execSync(`file ${f}`).toString().match(/(\d+) x (\d+)/);
  const [w, h] = dims ? [Number(dims[1]), Number(dims[2])] : [480, 800];
  const svg = svgs.splash(w, h);
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
  await page.screenshot({ path: f, clip: { x: 0, y: 0, width: w, height: h } });
}

await render(svgs.square, 512, 512, 'docs/img/icon-512.png');
await browser.close();
console.log('Iconos y splash generados.');
