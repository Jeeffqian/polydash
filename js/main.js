// App entry: menus, track selection, finish flow, editor wiring.

import { Game } from './game.js';
import { TrackEditor } from './editor.js';
import { TRACKS } from './tracks.js';
import { fetchTop, submitScore, cloudAvailable } from './leaderboard.js';
import {
  normalizePoints, loopLength, trackIdFor, listTracks, getTrack, saveTrack, deleteTrack,
  decodeShare, migrateLegacy, fetchCloudTracks, pushLocalTracks,
} from './community.js';
import { formatTime, show, hide, toast, getBest, setBest, medalFor, MEDAL_ICON, getPlayerName, setPlayerName } from './ui.js';
import { initPhysics } from './physics.js';

const $ = (id) => document.getElementById(id);

let lastDef = null;
// true while test-driving a track built in the editor (ESC goes back to it)
let editing = false;
// set when the in-race ESC handler already dealt with this keypress
let escHandled = false;

// Rapier ships as wasm: load the backend before the Game (and its car body)
// gets constructed. The boot splash stays up until that is done, so nobody can
// click a button that has no listener yet (or stare at a frozen menu).
try {
  await initPhysics();
} catch (err) {
  $('boot-text').textContent = 'physics engine failed to load — check your connection and reload';
  throw err;
}

const game = new Game($('game-canvas'), {
  onEscape: () => {
    escHandled = true;
    if (editing) backToEditor();
    else toMenu();
  },
  onFinish: (result) => showFinish(result),
});

const boot = $('boot');
if (boot) {
  boot.classList.add('fading');
  setTimeout(() => boot.classList.add('hidden'), 260);
}

// ------------------------------------------------------------ navigation

function hideAllOverlays() {
  for (const id of ['menu', 'track-select', 'leaderboard', 'finish', 'editor']) hide($(id));
}

function toMenu() {
  hideAllOverlays();
  show($('menu'));
  hide($('hud'));
}

/** Leave a test drive and go back to the editor with the layout intact. */
function backToEditor() {
  editing = false;
  hide($('hud'));
  hide($('finish'));
  hideAllOverlays();
  show($('editor'));
  editor.draw();
}

// ------------------------------------------------------------ track select

let activeTab = 'official';
let returnTab = 'official';

function setTab(name) {
  activeTab = name === 'community' ? 'community' : 'official';
  for (const key of ['official', 'community']) {
    const on = key === activeTab;
    $(`tab-${key}`).classList.toggle('hidden', !on);
    const btn = document.querySelector(`.tab[data-tab="${key}"]`);
    if (btn) btn.classList.toggle('active', on);
  }
  if (activeTab === 'official') buildOfficialGrid();
  else {
    buildCommunityGrid();
    if (!cloudSynced && cloudAvailable()) void refreshCloudTracks();
  }
}

function toTrackSelect(tab) {
  hideAllOverlays();
  setTab(tab || returnTab);
  show($('track-select'));
}

function startTrack(def, tab) {
  if (!def) { toast('That track could not be loaded.'); return; }
  if (!game.startTrack(def)) { toast('That track could not be built — try the editor.'); return; }
  editing = false;
  if (tab) returnTab = tab;
  hideAllOverlays();
  show($('hud'));
  $('hud-splits').innerHTML = '';
  lastDef = def;
}

// ------------------------------------------------------------ official tracks

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

function buildOfficialGrid() {
  const grid = $('track-grid');
  grid.innerHTML = TRACKS.map(t => cardHtml(t)).join('');
  grid.querySelectorAll('.track-card').forEach(card => {
    card.addEventListener('click', () => {
      const def = TRACKS.find(t => t.id === card.dataset.track);
      if (def) startTrack(def, 'official');
    });
  });
  grid.querySelectorAll('.lb-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openLeaderboard(btn.dataset.lb);
    });
  });
}

// ------------------------------------------------------------ community tracks

function medalsForLength(len) {
  return {
    gold: Math.round(len / 30 * 1000),
    silver: Math.round(len / 25 * 1000),
    bronze: Math.round(len / 20 * 1000),
  };
}

function customDef(pts, meta = {}) {
  const clean = normalizePoints(pts);
  if (clean.length < 4) return null;
  const len = loopLength(clean);
  if (!Number.isFinite(len) || len < 24) return null;
  return {
    id: meta.id || trackIdFor(clean),
    name: meta.name || 'Community Track',
    difficulty: 'Community',
    theme: meta.theme || 'meadow',
    width: 12,
    points: clean.map(p => [p.x, 0, p.z]),
    medals: medalsForLength(len),
  };
}

function communityCardHtml(rec) {
  const best = getBest(rec.id);
  const medal = best != null ? medalFor(best, medalsForLength(rec.length)) : null;
  const bestStr = best != null ? formatTime(best) : '—';
  const cloudTag = rec.cloud ? '<span class="cloud-tag" title="Shared from another device">☁ cloud</span>' : '';
  const actions = rec.cloud
    ? `<button class="btn small lb-btn" data-lb="${rec.id}" title="Leaderboard">🏆</button>`
    : `<button class="btn small lb-btn" data-lb="${rec.id}" title="Leaderboard">🏆</button>
       <button class="btn small edit-btn" data-edit="${rec.id}" title="Edit in editor">✎</button>
       <button class="btn small del-btn" data-del="${rec.id}" title="Delete">🗑</button>`;
  return `
    <div class="track-card" data-track="${rec.id}">
      <div class="diff">by ${escapeHtml(rec.author)} · ${rec.length} m ${cloudTag}</div>
      <h3>${escapeHtml(rec.name)}</h3>
      <div class="meta">
        <span>best: <b>${bestStr}</b> ${medal ? MEDAL_ICON[medal] : ''}</span>
        <span class="card-actions">${actions}</span>
      </div>
    </div>`;
}

// ------------------------------------------------------------ cloud library state

let cloudRecords = [];
let cloudSynced = false;
let cloudBusy = false;

/** Local tracks first (editable), then cloud-only tracks from other devices. */
function communityRecords() {
  const local = listTracks();
  const ids = new Set(local.map(t => t.id));
  return local.concat(cloudRecords.filter(r => !ids.has(r.id)));
}

function findCommunityRecord(id) {
  return getTrack(id) || cloudRecords.find(r => r.id === id) || null;
}

function updateCommunityHint(count) {
  const hint = $('community-hint');
  if (!hint) return;
  if (!cloudAvailable()) {
    hint.textContent = 'Saved in this browser only — open the online build to sync tracks across devices.';
  } else if (cloudBusy) {
    hint.textContent = 'Syncing shared tracks…';
  } else if (cloudSynced) {
    hint.textContent = `Synced · ${count} track${count === 1 ? '' : 's'} shared across your devices (☁ = from the cloud).`;
  }
}

async function refreshCloudTracks() {
  if (!cloudAvailable()) {
    cloudSynced = true;
    if (activeTab === 'community') buildCommunityGrid();
    return;
  }
  if (cloudBusy) return;
  cloudBusy = true;
  if (activeTab === 'community') updateCommunityHint(communityRecords().length);
  const rows = await fetchCloudTracks();
  cloudRecords = rows;
  cloudBusy = false;
  cloudSynced = true;
  if (activeTab === 'community') buildCommunityGrid();
}

function buildCommunityGrid() {
  const grid = $('community-grid');
  const records = communityRecords();
  $('community-count').textContent = records.length;

  grid.innerHTML = records.length
    ? records.map(communityCardHtml).join('')
    : cloudBusy
      ? '<div class="community-empty">Syncing shared tracks…</div>'
      : '<div class="community-empty">No community tracks yet.<br>Build one in the editor, or import a share code below.</div>';

  updateCommunityHint(records.length);

  grid.querySelectorAll('.track-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      playCommunity(card.dataset.track);
    });
  });
  grid.querySelectorAll('.lb-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openLeaderboard(btn.dataset.lb);
    });
  });
  grid.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      editCommunity(btn.dataset.edit);
    });
  });
  grid.querySelectorAll('.del-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      armDelete(btn, btn.dataset.del);
    });
  });
}

function playCommunity(id) {
  const rec = findCommunityRecord(id);
  if (!rec) { toast('That track is no longer saved.'); return; }
  const def = customDef(rec.points, rec);
  if (!def) { toast('That track is too small or broken — open it in the editor.'); return; }
  startTrack(def, 'community');
}

function editCommunity(id) {
  const rec = getTrack(id);
  if (!rec) { toast('Track not found.'); return; }
  hideAllOverlays();
  show($('editor'));
  editor.load(rec);
}

/** Two-step delete: first click arms, second click removes. */
function armDelete(btn, id) {
  if (btn.dataset.armed === '1') {
    deleteTrack(id);
    buildCommunityGrid();
    toast('Track deleted.');
    return;
  }
  btn.dataset.armed = '1';
  btn.textContent = '✕?';
  btn.classList.add('danger');
  setTimeout(() => {
    if (!btn.isConnected) return;
    btn.dataset.armed = '';
    btn.textContent = '🗑';
    btn.classList.remove('danger');
  }, 3000);
}

function importCommunityCode() {
  const input = $('community-code');
  const code = input.value.trim();
  if (!code) { toast('Paste a track code first.'); input.focus(); return; }
  const data = decodeShare(code);
  if (!data) { toast('That code is not a valid PolyDash track.'); return; }
  const existed = !!getTrack(trackIdFor(data.points));
  const rec = saveTrack({ name: data.name, author: data.author, points: data.points });
  if (!rec) { toast('Could not save that track — storage may be full.'); return; }
  input.value = '';
  buildCommunityGrid();
  toast(existed ? `Updated "${rec.name}" — you already had this track.` : `Added "${rec.name}" to community tracks.`);
}

// ------------------------------------------------------------ leaderboard modal

let lbTrackId = null;

async function openLeaderboard(trackId) {
  lbTrackId = trackId;
  const def = TRACKS.find(t => t.id === trackId);
  const rec = def ? null : findCommunityRecord(trackId);
  const label = def ? def.name : rec ? rec.name : 'Community Track';
  $('lb-title').textContent = `${label} — TOP 10`;
  const list = $('lb-list');
  list.innerHTML = '<div class="lb-empty">Loading…</div>';
  show($('leaderboard'));
  const rows = await fetchTop(trackId, 10);
  renderBoard(list, rows);
}

function renderBoard(list, rows) {
  if (!cloudAvailable()) {
    list.innerHTML = '<div class="lb-empty">Online leaderboard is not available on this host.<br>Your best time and ghost still save locally.</div>';
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
  $('btn-to-menu').textContent = editing ? 'BACK TO EDITOR' : 'TRACKS';
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

const editor = new TrackEditor((points, name) => {
  // test drive — keep the editor open behind us so ESC returns to it
  const def = customDef(points, { name: name || 'Test Track' });
  if (!def) {
    $('editor-hint').textContent = 'That layout is too small to drive — spread the corners out and try again.';
    return;
  }
  editing = true;
  hide($('editor'));
  show($('hud'));
  $('hud-splits').innerHTML = '';
  lastDef = def;
  if (!game.startTrack(def)) {
    editing = false;
    hide($('hud'));
    show($('editor'));
    $('editor-hint').textContent = 'That layout could not be built — try spreading the corners out a bit.';
  }
});
editor.onExit = () => { editing = false; toMenu(); };

// ------------------------------------------------------------ buttons & keys

$('btn-play').addEventListener('click', () => toTrackSelect());
$('btn-editor').addEventListener('click', () => {
  hideAllOverlays();
  show($('editor'));
  editor.focusName();
});

// official / community tabs
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => setTab(tab.dataset.tab));
});

$('btn-new-track').addEventListener('click', () => {
  hideAllOverlays();
  show($('editor'));
  editor.reset();
});
$('btn-import-code').addEventListener('click', importCommunityCode);
$('community-code').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') importCommunityCode();
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
  if (editing) backToEditor();
  else toTrackSelect();
});
$('btn-submit-score').addEventListener('click', doSubmit);
$('player-name').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') doSubmit();
});

// ESC while overlays open (when game state is 'menu' the game won't handle it)
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (escHandled) { escHandled = false; return; } // the race already handled it
  if (game.state !== 'menu') return; // game.js handles in-race ESC
  if (!$('leaderboard').classList.contains('hidden')) { hide($('leaderboard')); return; }
  if (!$('finish').classList.contains('hidden')) { hide($('finish')); toTrackSelect(); return; }
  if (!$('track-select').classList.contains('hidden')) { hide($('track-select')); show($('menu')); return; }
  if (!$('editor').classList.contains('hidden')) { hide($('editor')); editor.exit(); return; }
});

// debug/testing hook (also handy in devtools)
window.__game = game;

// boot: pull any pre-library custom track into the community list
migrateLegacy();
wipeLegacyTimes();
toMenu();

/**
 * The car was rebuilt on Rapier (and lap validation was rewritten), so every
 * time recorded before that is not comparable. Clear local bests and ghosts
 * once, guarded by a version key so it never runs twice.
 */
function wipeLegacyTimes() {
  const KEY = 'polydash_times_version';
  const VERSION = '2';
  try {
    if (localStorage.getItem(KEY) === VERSION) return;
    const doomed = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('polydash_best_') || k.startsWith('polydash_ghost_'))) doomed.push(k);
    }
    doomed.forEach(k => localStorage.removeItem(k));
    localStorage.setItem(KEY, VERSION);
  } catch (e) { /* private mode — nothing to clear */ }
}

// boot: share this device's tracks and pull everyone else's (no-op offline)
if (cloudAvailable()) {
  (async () => {
    await pushLocalTracks();
    await refreshCloudTracks();
  })();
} else {
  cloudSynced = true;
}
