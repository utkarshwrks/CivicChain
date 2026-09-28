/**
 * gen-android-assets.mjs — render the CivicChain logo into Android launcher
 * icons + splash screens (uses the locally installed Chrome via puppeteer-core).
 *   node scripts/gen-android-assets.mjs
 */
import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const RES = path.resolve('frontend/android/app/src/main/res');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BG = '#07080a';

// Diamond mark from the favicon: saffron outline, green core.
const mark = (size, pad = 0.2) => {
  const s = size * (1 - pad * 2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <g transform="translate(${size / 2} ${size / 2})">
      <rect x="${-s * 0.33}" y="${-s * 0.33}" width="${s * 0.66}" height="${s * 0.66}" transform="rotate(45)" fill="none" stroke="#FF9A3A" stroke-width="${s * 0.075}" rx="${s * 0.03}"/>
      <rect x="${-s * 0.13}" y="${-s * 0.13}" width="${s * 0.26}" height="${s * 0.26}" fill="#19c37d" rx="${s * 0.02}"/>
    </g></svg>`;
};

const html = (w, h, inner, bg = BG, round = false) => `<!doctype html><html><body style="margin:0;background:transparent">
  <div style="width:${w}px;height:${h}px;background:${bg};display:flex;align-items:center;justify-content:center;overflow:hidden;${round ? 'border-radius:50%;' : ''}">${inner}</div></body></html>`;

const splashInner = (w, h) => {
  const m = Math.round(Math.min(w, h) * 0.34);
  return `<div style="display:flex;flex-direction:column;align-items:center;gap:${Math.round(m * 0.12)}px;font-family:Helvetica,Arial,sans-serif">
    ${mark(m, 0.08)}
    <div style="font-weight:700;font-size:${Math.round(m * 0.28)}px;color:#f4f1ea;letter-spacing:-0.02em">Civic<span style="color:#FF9A3A">Chain</span></div>
  </div>`;
};

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
const page = await browser.newPage();
async function render(file, w, h, content) {
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  await page.setContent(content);
  await page.screenshot({ path: file, omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } });
}

const DENS = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, f] of Object.entries(DENS)) {
  const icon = Math.round(48 * f);
  const fg = Math.round(108 * f);
  await render(`${RES}/mipmap-${d}/ic_launcher.png`, icon, icon, html(icon, icon, mark(icon, 0.12)).replace('display:flex', 'border-radius:22%;display:flex'));
  await render(`${RES}/mipmap-${d}/ic_launcher_round.png`, icon, icon, html(icon, icon, mark(icon, 0.16), BG, true));
  // Adaptive foreground: artwork inside the 66% safe zone.
  await render(`${RES}/mipmap-${d}/ic_launcher_foreground.png`, fg, fg, html(fg, fg, mark(fg, 0.26), 'transparent'));
}
for (const dir of fs.readdirSync(RES).filter((x) => x.startsWith('drawable'))) {
  const file = path.join(RES, dir, 'splash.png');
  if (!fs.existsSync(file)) continue;
  const [w, h] = execSync(`sips -g pixelWidth -g pixelHeight "${file}"`).toString().match(/\d+/g).slice(-2).map(Number);
  await render(file, w, h, html(w, h, splashInner(w, h)));
}
fs.writeFileSync(`${RES}/values/ic_launcher_background.xml`,
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BG}</color>\n</resources>\n`);
await browser.close();
console.log('Android icons + splash screens generated');
