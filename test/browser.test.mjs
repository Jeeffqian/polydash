// Browser smoke test: load the game, drive it through menu → track → finish
// flow with an AI driver, capturing every console error / page error.
// Run: node test/browser.test.mjs  (needs a local static server on :8932)
import puppeteer from 'puppeteer-core';

const CHROME_PATHS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];
import { existsSync } from 'node:fs';
const executablePath = CHROME_PATHS.find(p => existsSync(p));
if (!executablePath) { console.error('No Chrome/Edge found'); process.exit(1); }

const URL_ = process.env.GAME_URL || 'http://localhost:8932/';
const errors = [];

const browser = await puppeteer.launch({
  executablePath,
  headless: 'new',
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--no-sandbox', '--window-size=1280,800'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });

page.on('console', (msg) => {
  if (msg.type() === 'error' || msg.type() === 'warning') {
    errors.push(`[console.${msg.type()}] ${msg.text()}`);
  }
});
page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`));
page.on('requestfailed', (req) => {
  // CDN hiccups shouldn't fail the test if the app handles them, but report
  errors.push(`[requestfailed] ${req.url()} — ${req.failure()?.errorText}`);
});

await page.goto(URL_, { waitUntil: 'networkidle2', timeout: 30000 });
await new Promise(r => setTimeout(r, 2500));

// menu visible?
const menuVisible = await page.$eval('#menu', el => !el.classList.contains('hidden'));
console.log('menu visible:', menuVisible);

// open track select
await page.click('#btn-play');
await new Promise(r => setTimeout(r, 400));
const cards = await page.$$eval('.track-card', els => els.length);
console.log('track cards:', cards);

// start first official track
await page.click('.track-card');
await new Promise(r => setTimeout(r, 500));
const hudVisible = await page.$eval('#hud', el => !el.classList.contains('hidden'));
console.log('hud visible:', hudVisible);

// countdown → race
await new Promise(r => setTimeout(r, 3600));
const state1 = await page.evaluate(() => document.querySelector('#hud-timer').textContent);
console.log('timer after countdown:', state1);

// drive with AI-ish inputs: hold W and alternate steering to survive corners
let maxSpeed = 0, timerStart = null, timerEnd = null;
const drive = page.evaluate(async () => {
  const g = window.__game;
  const iv = setInterval(() => {
    const t = performance.now() * 0.001;
    const steer = Math.sin(t * 1.7) > 0 ? 'KeyA' : 'KeyD';
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: steer, bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: steer === 'KeyA' ? 'KeyD' : 'KeyA', bubbles: true }));
  }, 50);
  window.__pdIv = iv;
  // sample speed + timer for 15 s
  window.__pdSamples = [];
  const sampleIv = setInterval(() => {
    window.__pdSamples.push({ t: g ? g.raceTime : -1, kmh: g ? g.car.kmh : -1 });
  }, 500);
  window.__pdSampleIv = sampleIv;
});
await new Promise(r => setTimeout(r, 15000));
const samples = await page.evaluate(() => {
  clearInterval(window.__pdIv);
  clearInterval(window.__pdSampleIv);
  return window.__pdSamples;
});
maxSpeed = Math.max(...samples.map(s => s.kmh));
timerStart = samples[0]?.t; timerEnd = samples[samples.length - 1]?.t;
console.log('race timer advanced:', timerStart?.toFixed(1), '→', timerEnd?.toFixed(1), 'ms');
console.log('max speed reached:', Math.round(maxSpeed), 'km/h');
if (!(timerEnd > timerStart + 8000)) errors.push('[assert] race timer did not advance during drive');
if (maxSpeed < 30) errors.push(`[assert] car did not accelerate (max ${Math.round(maxSpeed)} km/h)`);

// check game state didn't crash: canvas still there, HUD still visible
const stillOk = await page.$eval('#hud', el => !el.classList.contains('hidden'));
console.log('hud still visible:', stillOk);

// open the leaderboard modal for track 1
await page.keyboard.press('Escape'); // back to menu
await new Promise(r => setTimeout(r, 600));
const menuBack = await page.$eval('#menu', el => !el.classList.contains('hidden'));
console.log('back at menu:', menuBack);

// editor open/close
await page.click('#btn-editor');
await new Promise(r => setTimeout(r, 400));
const editorVisible = await page.$eval('#editor', el => !el.classList.contains('hidden'));
console.log('editor visible:', editorVisible);
// place 5 points then test drive
await page.evaluate(() => {
  const canvas = document.getElementById('editor-canvas');
  const rect = canvas.getBoundingClientRect();
  const pts = [[0.3, 0.3], [0.7, 0.3], [0.7, 0.7], [0.4, 0.7], [0.25, 0.5]];
  for (const [fx, fy] of pts) {
    canvas.dispatchEvent(new PointerEvent('pointerdown', {
      clientX: rect.left + fx * rect.width, clientY: rect.top + fy * rect.height, bubbles: true,
    }));
  }
});
await page.click('#ed-test');
await new Promise(r => setTimeout(r, 1200));
const customHud = await page.$eval('#hud', el => !el.classList.contains('hidden'));
console.log('custom track hud visible:', customHud);

// filter errors: ignore benign ones
const benign = [
  /favicon/i,
  /net::ERR_/i,      // network flake reporting (also caught by requestfailed)
];
const realErrors = errors.filter(e => !benign.some(re => re.test(e)));
console.log('\n--- captured issues ---');
if (realErrors.length === 0) console.log('NONE — no console errors or page errors');
else realErrors.forEach(e => console.log(e));

await browser.close();
process.exit(realErrors.length === 0 ? 0 : 1);
