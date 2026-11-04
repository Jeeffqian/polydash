// Small UI helpers shared across modules.

export function formatTime(ms) {
  if (ms == null || !isFinite(ms)) return '--:--.---';
  const t = Math.max(0, Math.round(ms));
  const m = Math.floor(t / 60000);
  const s = Math.floor((t % 60000) / 1000);
  const mm = t % 1000;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(mm).padStart(3, '0')}`;
}

export function show(el) { el.classList.remove('hidden'); }
export function hide(el) { el.classList.add('hidden'); }

let toastTimer = null;
export function toast(msg, ms = 2200) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  show(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => hide(el), ms);
}

export function getBest(trackId) {
  try {
    const v = localStorage.getItem(`polydash_best_${trackId}`);
    return v == null ? null : Number(v);
  } catch (e) { return null; }
}

export function setBest(trackId, ms) {
  try { localStorage.setItem(`polydash_best_${trackId}`, String(ms)); } catch (e) { /* ignore */ }
}

export function getPlayerName() {
  try { return localStorage.getItem('polydash_player_name') || ''; } catch (e) { return ''; }
}

export function setPlayerName(name) {
  try { localStorage.setItem('polydash_player_name', name); } catch (e) { /* ignore */ }
}

export function medalFor(ms, medals) {
  if (ms == null || !medals) return null;
  if (ms <= medals.gold) return 'gold';
  if (ms <= medals.silver) return 'silver';
  if (ms <= medals.bronze) return 'bronze';
  return null;
}

export const MEDAL_ICON = { gold: '🥇', silver: '🥈', bronze: '🥉' };
