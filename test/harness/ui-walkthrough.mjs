/**
 * ui-walkthrough.mjs — drives the rehearsal stack in headless Chrome and saves
 * screenshots of every step (local rehearsal only).
 *   node test/harness/ui-walkthrough.mjs [outDir]
 */
import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const BASE = process.env.HARNESS_URL || 'http://localhost:3101';
const OUT = process.argv[2] || 'harness-shots';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FIX = path.resolve('test/fixtures');
fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await page.setViewport({ width: 1440, height: 900 });

const shot = async (name, full = false) => { await new Promise((r) => setTimeout(r, 600)); await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: full }); console.log('📸', name); };
const clickText = async (sel, text) => {
  const ok = await page.evaluate((s, t) => {
    const el = [...document.querySelectorAll(s)].find((e) => e.textContent.trim().includes(t));
    if (el) { el.click(); return true; } return false;
  }, sel, text);
  if (!ok) throw new Error(`not found: ${sel} "${text}"`);
};
const nav = (t) => clickText('.nav-tab', t);

async function submitPhoto(file, city = 'JABALPUR') {
  await nav('Submit');
  await page.waitForSelector('[data-testid=file-input]');
  const input = await page.$('[data-testid=file-input]');
  await input.uploadFile(path.join(FIX, file));
  await page.waitForSelector('.field-select option[value=JABALPUR]');
  await page.select('.field-select', city);
  await page.$eval('.field-input', (el) => { el.value = ''; });
  await page.click('.field-input', { clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.type('.field-input', 'Near Civic Centre');
  await clickText('button', 'Submit Report');
  await page.waitForSelector('[data-testid^=nrc-]', { timeout: 60_000 });
}

await page.goto(BASE, { waitUntil: 'networkidle2' });
await shot('01-home-hero');
await page.evaluate(() => document.querySelector('#download')?.scrollIntoView());
await shot('02-home-apk-section');
await page.evaluate(() => window.scrollTo(0, 0));

await clickText('.btn-connect', 'Connect Wallet');
await page.waitForSelector('.modal-panel');
await shot('03-wallet-modal');
await clickText('button', 'Generate Wallet');
await page.waitForFunction(() => document.body.innerText.includes('Wallet Created!'), { timeout: 20_000 });
await shot('04-wallet-created');
await clickText('button', 'Enter CivicChain');
await page.waitForSelector('.wallet-chip');

await submitPhoto('pothole3.png');
await shot('05-submit-success', true);

await submitPhoto('pothole3.png');
await shot('06-submit-duplicate');
await submitPhoto('floortiles.png');
await shot('07-submit-not-civic');
await submitPhoto('flood.png', 'BHOPAL');

await nav('Profile');
await page.waitForSelector('[data-testid=collection-grid]', { timeout: 20_000 });
await shot('08-profile-collection', true);

await nav('Explorer');
await page.waitForSelector('[data-testid=nft-grid]', { timeout: 20_000 });
await shot('09-explorer', true);
await clickText('.seg-tab', 'Mint transactions');
await shot('10-explorer-table');

await nav('Feed');
await page.waitForSelector('button.nft-badge.minted', { timeout: 20_000 });
await shot('11-feed', true);
await page.click('button.nft-badge.minted');
await page.waitForSelector('.nft-modal');
await page.waitForFunction(() => document.body.innerText.includes('Verified on'), { timeout: 20_000 }).catch(() => {});
await shot('12-nft-modal');
await page.keyboard.press('Escape');

await nav('Analytics');
await new Promise((r) => setTimeout(r, 1500));
await shot('13-analytics', true);

await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
await nav('Home').catch(() => {});
await page.goto(BASE, { waitUntil: 'networkidle2' });
await shot('14-mobile-home');
await page.click('.nav-burger');
await shot('15-mobile-nav');

console.log('\nConsole errors:', errors.length ? errors : 'none');
await browser.close();
