// App entry: menus, track selection, finish flow, editor wiring.

import { Game } from './game.js';
import { TrackEditor } from './editor.js';
import { TRACKS } from './tracks.js';
import { fetchTop, submitScore, cloudAvailable } from './leaderboard.js';
import { formatTime, show, hide, toast, getBest, setBest, medalFor, MEDAL_ICON, getPlayerName, setPlayerName } from './ui.js';

const $ = (id) => document.getElementById(id);

const game = new Game($('game-canvas'), {
  onEscape: () => toMenu(),
  onFinish: (result) => showFinish(result),
});

// custom track id from its points (so different custom tracks don't mix times)
function customTrackId(points) {
  let h = 5381;
  for (const p of points) {
    const s = `${Math.round(p[0])},${Math.round(p[1])},${Math.round(p[2])};`;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return `custom_${(h >>> 0).toString(36)}`;
}

let lastDef = null;

// ------------------------------------------------------------ navigation

function hideAllOverlays() {
  for (const id of ['menu', 'track-select', 'leaderboard', 'finish', 'editor']) hide($(id));
}

function toMenu() {
  hideAllOverlays();
  show($('menu'));
  hide($('hud'));
}

function toTrackSelect() {
  hideAllOverlays();
  buildTrackGrid();
  show($('track-select'));
}

function startTrack(def) {
  hideAllOverlays();
  show($('hud'));
  $('hud-splits').innerHTML = '';
  lastDef = def;
  game.startTrack(def);
}

// ------------------------------------------------------------ track grid

function cardHtml(def) {
  const best = getBest(def.id);
  const medal = best != null ? medalFor(best, def.medals) : null;
  const bestStr = best != null ? formatTime(best) : '—';
  return `
    <div class="track-card" data-track="${def.id}">
      <div class="diff">${def.difficulty}</div>
      <h3>${def.name}</h3>
      <div class="meta">
        <span>best: <b>${bestStr}</b> ${medal ? MEDAL_ICON[medal] : ''}</span>
        <button class="btn small lb-btn" data-lb="${def.id}" title="Leaderboard">🏆</button>
      </div>
    </div>`;
}

function buildTrackGrid() {
  const grid = $('track-grid');
  grid.innerHTML = '';

  grid.innerHTML = TRACKS.map(t => cardHtml(t)).join('') + customCardHtml();

  grid.querySelectorAll('.track-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.lb-btn')) return;
      const id = card.dataset.track;
      if (id === 'custom') {
        const pts = loadCustomPoints();
        if (!pts) { toast('No custom track yet — build one in the editor!'); return; }
        startTrack(customDef(pts));
      } else {
        startTrack(TRACKS.find(t => t.id === id));
      }
    });
  });
  grid.querySelectorAll('.lb-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openLeaderboard(btn.dataset.lb);
    });
  });
}

function loadCustomPoints() {
  try {
    const raw = localStorage.getItem('polydash_custom_track');
    if (!raw) return null;
    const pts = JSON.parse(raw);
    return Array.isArray(pts) && pts.length >= 4 ? pts : null;
  } catch (e) { return null; }
}

function customDef(pts) {
  const world = pts.map(p => [p.x, 0, p.z]);
  // rough length from the polygon through the points (curve is a bit longer)
  let len = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    len += Math.hypot(b.x - a.x, b.z - a.z);
  }
  len *= 1.08;
  return {
    id: customTrackId(world),
    name: 'Custom Track',
    difficulty: 'Custom',
    theme: 'meadow',
    width: 12,
    points: world,
    medals: {
      gold: Math.round(len / 30 * 1000),
      silver: Math.round(len / 25 * 1000),
      bronze: Math.round(len / 20 * 1000),
    },
  };
}

function customCardHtml() {
  const pts = loadCustomPoints();
  const ptsDef = pts ? customDef(pts) : null;
  return cardHtml(ptsDef || { id: 'custom', name: 'Custom Track', difficulty: 'Custom', medals: { gold: 1, silver: 2, bronze: 3 } }, true)
    .replace('<h3>Custom Track</h3>', `<h3>Custom Track${pts ? '' : ' <small style="color:var(--muted)">(empty)</small>'}</h3>`);
}

// ------------------------------------------------------------ leaderboard modal

let lbTrackId = null;

async function openLeaderboard(trackId) {
  lbTrackId = trackId;
  const def = TRACKS.find(t => t.id === trackId);
  $('lb-title').textContent = def ? `${def.name} — TOP 10` : 'TOP 10';
  const list = $('lb-list');
  list.innerHTML = '<div class="lb-empty">Loading…</div>';
  show($('leaderboard'));
  const rows = await fetchTop(trackId, 10);
  renderBoard(list, rows);
}

function renderBoard(list, rows) {
  if (!cloudAvailable()) {
    list.innerHTML = '<div class="lb-empty">Online leaderboard unavailable (offline).</div>';
    return;
  }
  if (!rows.length) {
    list.innerHTML = '<div class="lb-empty">No times yet — be the first!</div>';
    return;
  }
  list.innerHTML = rows.map((r, i) => `
    <div class="lb-row">
      <span class="rank r${i + 1}">${i + 1}</span>
      <span class="name">${escapeHtml(r.player_name)}</span>
      <span class="time">${formatTime(r.time_ms)}</span>
    </div>`).join('');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ------------------------------------------------------------ finish flow

let finishResult = null;
let submitted = false;

function showFinish(result) {
  finishResult = result;
  submitted = false;

  const prevBest = getBest(result.trackId);
  const isNewRecord = prevBest == null || result.timeMs < prevBest;
  if (isNewRecord) {
    setBest(result.trackId, result.timeMs);
    $('finish-title').textContent = 'NEW RECORD!';
  } else {
    $('finish-title').textContent = 'FINISH!';
  }

  const medal = medalFor(result.timeMs, result.medals);
  $('finish-medal').textContent = medal ? MEDAL_ICON[medal] : '🏁';
  $('finish-time').textContent = formatTime(result.timeMs);

  const details = [];
  if (prevBest != null && !isNewRecord) {
    details.push(`+${formatTime(result.timeMs - prevBest)} vs your best`);
  }
  if (result.ghostSaved) details.push('ghost updated — race your past self!');
  if (result.splits.length) {
    details.push('splits: ' + result.splits.map(s => formatTime(s)).join(' / '));
  }
  $('finish-details').textContent = details.join(' · ');

  const nameInput = $('player-name');
  nameInput.value = getPlayerName();
  const submitBtn = $('btn-submit-score');
  submitBtn.disabled = !cloudAvailable();
  submitBtn.textContent = cloudAvailable() ? 'SUBMIT' : 'OFFLINE';

  const board = $('finish-board');
  board.innerHTML = '<div class="lb-empty">Loading leaderboard…</div>';
  show($('finish'));
  hide($('hud'));

  fetchTop(result.trackId, 10).then(rows => renderBoard(board, rows));
}

async function doSubmit() {
  if (submitted || !finishResult) return;
  const name = $('player-name').value.trim().slice(0, 24) || 'Anonymous';
  setPlayerName(name);
  const btn = $('btn-submit-score');
  btn.disabled = true;
  btn.textContent = '…';
  const res = await submitScore(finishResult.trackId, name, finishResult.timeMs);
  if (res.ok) {
    submitted = true;
    btn.textContent = `SUBMITTED #${res.rank}`;
    toast(`Score submitted — ranked #${res.rank}!`);
    fetchTop(finishResult.trackId, 10).then(rows => renderBoard($('finish-board'), rows));
  } else {
    btn.disabled = false;
    btn.textContent = 'SUBMIT';
    toast(res.error === 'offline' ? 'Leaderboard unavailable (offline).' : 'Submit failed — try again.');
  }
}

// ------------------------------------------------------------ editor wiring

const editor = new TrackEditor((points) => {
  // test drive
  hide($('editor'));
  show($('hud'));
  $('hud-splits').innerHTML = '';
  lastDef = customDef(points);
  game.startTrack(lastDef);
});
editor.onExit = () => toMenu();

// ------------------------------------------------------------ buttons & keys

$('btn-play').addEventListener('click', toTrackSelect);
$('btn-editor').addEventListener('click', () => {
  hideAllOverlays();
  show($('editor'));
});
document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => hide($(btn.dataset.close)));
});
$('btn-retry').addEventListener('click', () => {
  hide($('finish'));
  show($('hud'));
  game.restart();
});
$('btn-to-menu').addEventListener('click', () => {
  hide($('finish'));
  toTrackSelect();
});
$('btn-submit-score').addEventListener('click', doSubmit);
$('player-name').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') doSubmit();
});

// ESC while overlays open (when game state is 'menu' the game won't handle it)
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (game.state !== 'menu') return; // game.js handles in-race ESC
  if (!$('leaderboard').classList.contains('hidden')) { hide($('leaderboard')); return; }
  if (!$('finish').classList.contains('hidden')) { hide($('finish')); toTrackSelect(); return; }
  if (!$('track-select').classList.contains('hidden')) { hide($('track-select')); show($('menu')); return; }
  if (!$('editor').classList.contains('hidden')) { hide($('editor')); editor.exit(); return; }
});

// debug/testing hook (also handy in devtools)
window.__game = game;

// boot
toMenu();
