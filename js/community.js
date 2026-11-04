// Community tracks: player-built layouts saved in this browser, plus share
// codes so a track can be sent to someone else (and compete on the same id).

const LIB_KEY = 'polydash_community_tracks';
const DRAFT_KEY = 'polydash_custom_track';   // the layout currently open in the editor
const SHARE_VERSION = 1;

// ---------------------------------------------------------------- storage

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch (e) { return fallback; }
}

function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch (e) { return false; }  // private mode / quota — fail quietly
}

// ---------------------------------------------------------------- geometry helpers

/** Accept {x,z} objects, [x,z] pairs and [x,y,z] triples. Drop junk. */
export function normalizePoints(pts) {
  if (!Array.isArray(pts)) return [];
  const out = [];
  for (const p of pts) {
    let x, z;
    if (Array.isArray(p)) {
      x = Number(p[0]);
      z = Number(p.length > 2 ? p[2] : p[1]);
    } else if (p && typeof p === 'object') {
      x = Number(p.x);
      z = Number(p.z);
    }
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    const prev = out[out.length - 1];
    if (prev && Math.hypot(x - prev.x, z - prev.z) < 1) continue;
    out.push({ x, z });
  }
  if (out.length > 1) {
    const a = out[0], b = out[out.length - 1];
    if (Math.hypot(a.x - b.x, a.z - b.z) < 1) out.pop();
  }
  return out;
}

export function loopLength(points) {
  const pts = normalizePoints(points);
  let len = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    len += Math.hypot(b.x - a.x, b.z - a.z);
  }
  return len * 1.08;   // the smoothed curve is a little longer than the polygon
}

function pointsHash(world) {
  let h = 5381;
  for (const p of world) {
    const s = `${Math.round(p[0])},${Math.round(p[1])},${Math.round(p[2])};`;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

/** Stable id derived from the shape, so a shared track uses one leaderboard. */
export function trackIdFor(points) {
  const world = normalizePoints(points).map(p => [p.x, 0, p.z]);
  return `custom_${pointsHash(world)}`;
}

// ---------------------------------------------------------------- library

export function listTracks() {
  const raw = readJSON(LIB_KEY, []);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(t => t && Array.isArray(t.points))
    .map(t => {
      const points = normalizePoints(t.points);
      return {
        id: t.id || trackIdFor(points),
        name: String(t.name || 'Untitled Track'),
        author: String(t.author || 'Anonymous'),
        points,
        length: Math.round(t.length || loopLength(points)),
        createdAt: t.createdAt || 0,
        updatedAt: t.updatedAt || 0,
      };
    })
    .filter(t => t.points.length >= 4);
}

export function getTrack(id) {
  return listTracks().find(t => t.id === id) || null;
}

/** Add a track, or overwrite it when `id` matches an existing entry. */
export function saveTrack({ id, name, author, points }) {
  const clean = normalizePoints(points);
  if (clean.length < 4) return null;
  const lib = listTracks();
  const targetId = id || trackIdFor(clean);
  const idx = lib.findIndex(t => t.id === targetId);
  const prev = idx >= 0 ? lib[idx] : null;
  const record = {
    id: targetId,
    name: String(name || prev?.name || 'Untitled Track').trim().slice(0, 32) || 'Untitled Track',
    author: String(author || prev?.author || 'Anonymous').trim().slice(0, 20) || 'Anonymous',
    points: clean,
    length: Math.round(loopLength(clean)),
    createdAt: prev?.createdAt || Date.now(),
    updatedAt: Date.now(),
  };
  if (idx >= 0) lib[idx] = record;
  else lib.unshift(record);
  writeJSON(LIB_KEY, lib);
  return record;
}

export function deleteTrack(id) {
  const lib = listTracks().filter(t => t.id !== id);
  writeJSON(LIB_KEY, lib);
  return lib;
}

// ---------------------------------------------------------------- draft (editor)

export function loadDraft() {
  return normalizePoints(readJSON(DRAFT_KEY, null));
}

export function saveDraft(points) {
  writeJSON(DRAFT_KEY, normalizePoints(points));
}

/** Move the pre-library single custom track into the community list (once). */
export function migrateLegacy() {
  try {
    if (localStorage.getItem('polydash_community_migrated')) return null;
  } catch (e) { /* storage blocked — nothing to migrate */ }
  const pts = loadDraft();
  let rec = null;
  if (pts.length >= 4 && !listTracks().some(t => t.id === trackIdFor(pts))) {
    rec = saveTrack({ name: 'My First Track', author: 'You', points: pts });
  }
  try { localStorage.setItem('polydash_community_migrated', '1'); } catch (e) { /* ignore */ }
  return rec;
}

// ---------------------------------------------------------------- share codes

function b64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function b64decode(b64) {
  const bin = atob(String(b64).replace(/\s+/g, ''));
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeShare({ name, author, points }) {
  const payload = {
    v: SHARE_VERSION,
    name: String(name || 'Community Track').slice(0, 32),
    author: String(author || 'Anonymous').slice(0, 20),
    points: normalizePoints(points).map(p => [Math.round(p.x * 10) / 10, Math.round(p.z * 10) / 10]),
  };
  return b64encode(JSON.stringify(payload));
}

/** Accepts both the current payload and the older bare-array codes. */
export function decodeShare(code) {
  if (!code) return null;
  try {
    const data = JSON.parse(b64decode(String(code).trim()));
    if (Array.isArray(data)) {
      const pts = normalizePoints(data);
      return pts.length >= 4 ? { name: 'Imported Track', author: 'Anonymous', points: pts } : null;
    }
    if (data && Array.isArray(data.points)) {
      const pts = normalizePoints(data.points);
      if (pts.length < 4) return null;
      return {
        name: String(data.name || 'Imported Track').slice(0, 32),
        author: String(data.author || 'Anonymous').slice(0, 20),
        points: pts,
      };
    }
    return null;
  } catch (e) { return null; }
}
