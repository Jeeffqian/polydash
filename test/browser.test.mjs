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
// keep the smoke test local-only: never write test tracks/scores to the shared DB
await page.evaluateOnNewDocument(() => {
  try { localStorage.setItem('polydash_cloud_off', '1'); } catch (e) {}
});

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
const cards = await page.$$eval('#track-grid .track-card', els => els.length);
console.log('official track cards:', cards);
if (cards !== 6) errors.push(`[assert] expected 6 official tracks, got ${cards}`);

// start first official track
await page.click('.track-card');
await new Promise(r => setTimeout(r, 500));
const hudVisible = await page.$eval('#hud', el => !el.classList.contains('hidden'));
console.log('hud visible:', hudVisible);

// countdown → race
await new Promise(r => setTimeout(r, 3600));
const state1 = await page.evaluate(() => document.querySelector('#hud-timer').textContent);
console.log('timer after countdown:', state1);

// Drive deterministically: headless software GL only manages a few frames per
// second, so step the game loop by hand with a fixed 1/60 delta and steer
// toward the centreline. This still exercises the real page, real Rapier and
// the real input path — it just does not depend on wall-clock frame pacing.
const driveStats = await page.evaluate(() => {
  const g = window.__game;
  let guard = 0;
  while (g.state !== 'racing' && guard++ < 600) g.tick();
  const realGetDelta = g.clock.getDelta.bind(g.clock);
  g.clock.getDelta = () => 1 / 60;
  let maxKmh = 0;
  const t0 = g.raceTime;
  for (let i = 0; i < 600; i++) {
    const info = g.track.lookup(g.car.pos.x, g.car.pos.z);
    const ahead = g.track.samples[(info.index + 18) % g.track.N].p;
    let dYaw = Math.atan2(ahead.x - g.car.pos.x, ahead.z - g.car.pos.z) - g.car.yaw;
    while (dYaw > Math.PI) dYaw -= Math.PI * 2;
    while (dYaw < -Math.PI) dYaw += Math.PI * 2;
    g.keys = { KeyW: true, KeyA: dYaw > 0.03, KeyD: dYaw < -0.03 };
    g.tick();
    maxKmh = Math.max(maxKmh, g.car.kmh);
    if (!Number.isFinite(g.car.pos.x)) break;
  }
  g.clock.getDelta = realGetDelta;
  g.keys = {};
  return {
    maxKmh,
    raceMs: g.raceTime - t0,
    finite: Number.isFinite(g.car.pos.x + g.car.pos.y + g.car.pos.z),
    state: g.state,
  };
});
console.log('drive:', JSON.stringify({ ...driveStats, maxKmh: Math.round(driveStats.maxKmh) }));
if (!(driveStats.raceMs > 8000)) errors.push('[assert] race timer did not advance during drive');
if (driveStats.maxKmh < 100) errors.push(`[assert] car did not accelerate (max ${Math.round(driveStats.maxKmh)} km/h)`);
if (!driveStats.finite) errors.push('[assert] car position went NaN while driving');

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
if (!customHud) errors.push('[assert] editor test drive did not show the HUD');

// the test drive must actually build a drivable track (this used to be NaN)
const custom = await page.evaluate(() => {
  const g = window.__game;
  if (!g || !g.track) return { built: false };
  const p = g.track.startPos;
  return {
    built: true,
    id: g.track.id,
    length: g.track.length,
    startFinite: Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z),
    carFinite: Number.isFinite(g.car.pos.x) && Number.isFinite(g.car.pos.z),
    kids: g.trackGroup ? g.trackGroup.children.length : 0,
  };
});
console.log('custom track:', JSON.stringify(custom));
if (!custom.built) errors.push('[assert] editor test drive built no track');
if (!(custom.length > 50)) errors.push(`[assert] custom track length is ${custom.length}`);
if (!custom.startFinite || !custom.carFinite) errors.push('[assert] custom track has NaN positions');
if (!(custom.kids > 10)) errors.push('[assert] custom track scene is empty');

// ESC from a test drive goes back to the editor, not the main menu
await page.keyboard.press('Escape');
await new Promise(r => setTimeout(r, 600));
const backToEditor = await page.evaluate(() => ({
  editor: !document.getElementById('editor').classList.contains('hidden'),
  menu: !document.getElementById('menu').classList.contains('hidden'),
}));
console.log('esc from test drive →', JSON.stringify(backToEditor));
if (!backToEditor.editor) errors.push('[assert] ESC from test drive did not return to the editor');

// save it to the community library, then check both tabs
await page.click('#ed-name');
await page.type('#ed-name', 'Browser Test Loop');
await page.click('#ed-save');
await new Promise(r => setTimeout(r, 300));
const saveHint = await page.$eval('#editor-hint', el => el.textContent);
console.log('save hint:', saveHint);
if (!/saved/i.test(saveHint)) errors.push('[assert] SAVE to community did not confirm');

await page.click('#ed-exit');
await new Promise(r => setTimeout(r, 500));

// PLAY opens track select: OFFICIAL tab must list exactly the 6 built-ins
await page.click('#btn-play');
await new Promise(r => setTimeout(r, 400));
const tabs = await page.evaluate(() => ({
  official: document.querySelectorAll('#track-grid .track-card').length,
  active: document.querySelector('.tab.active')?.dataset.tab,
  communityVisible: !document.getElementById('tab-community').classList.contains('hidden'),
}));
console.log('tabs:', JSON.stringify(tabs));
if (tabs.official !== 6) errors.push(`[assert] official tab has ${tabs.official} cards, expected 6`);
if (tabs.active !== 'official') errors.push('[assert] PLAY did not open the official tab');
if (tabs.communityVisible) errors.push('[assert] both tabs visible at once');

// COMMUNITY tab must show the track saved from the editor
await page.click('.tab[data-tab="community"]');
await new Promise(r => setTimeout(r, 300));
const community = await page.evaluate(() => {
  const cards = Array.from(document.querySelectorAll('#community-grid .track-card'));
  return {
    count: cards.length,
    badge: document.getElementById('community-count').textContent,
    first: cards[0] ? { id: cards[0].dataset.track, text: cards[0].innerText.replace(/\n/g, ' | ') } : null,
    officialHidden: document.getElementById('tab-official').classList.contains('hidden'),
  };
});
console.log('community tab:', JSON.stringify(community));
if (!(community.count >= 1)) errors.push('[assert] community tab did not list the saved track');
if (!community.officialHidden) errors.push('[assert] official grid still visible on community tab');
if (community.first && !/Browser Test Loop/.test(community.first.text)) {
  errors.push('[assert] community card is missing the saved name');
}

// playing a community track must build a real track
await page.click('#community-grid .track-card');
await new Promise(r => setTimeout(r, 1500));
const fromList = await page.evaluate(() => {
  const g = window.__game;
  return { hasTrack: !!g.track, length: g.track ? g.track.length : 0, name: g.track ? g.track.name : '' };
});
console.log('community track from list:', JSON.stringify(fromList));
if (!(fromList.length > 50)) errors.push('[assert] community track card did not load the saved track');

// returning from it lands back on the community tab
await page.keyboard.press('Escape');
await new Promise(r => setTimeout(r, 600));
await page.click('#btn-play');
await new Promise(r => setTimeout(r, 400));
const remembered = await page.$eval('.tab.active', el => el.dataset.tab);
console.log('tab remembered after playing:', remembered);
if (remembered !== 'community') errors.push(`[assert] track select reopened on ${remembered}, expected community`);

// a share code can be imported into the community library
const shareCode = await page.evaluate(() => {
  const rec = JSON.parse(localStorage.getItem('polydash_community_tracks'))[0];
  // shift the layout so it is a genuinely new track, not an update
  return btoa(JSON.stringify({ v: 1, name: 'Imported Loop', author: 'Tester', points: rec.points.map(p => [p.x + 12, p.z - 9]) }));
});
await page.evaluate((code) => {
  const input = document.getElementById('community-code');
  input.value = code;
  document.getElementById('btn-import-code').click();
}, shareCode);
await new Promise(r => setTimeout(r, 400));
const afterImport = await page.evaluate(() => ({
  count: document.querySelectorAll('#community-grid .track-card').length,
  badge: document.getElementById('community-count').textContent,
}));
console.log('after import:', JSON.stringify(afterImport));
if (afterImport.count !== 2) errors.push(`[assert] importing a share code left ${afterImport.count} community tracks, expected 2`);

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
