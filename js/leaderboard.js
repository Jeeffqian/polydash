// Online leaderboard backed by the WorkBuddy cloud database.
// Table `leaderboard`: track_id, player_name, time_ms, created_at
// Public read + public insert (validated by RLS policy).

import { CLOUD_CONFIG } from './config.js';

let cloud = null;
try {
  if (typeof window !== 'undefined' && window.WorkBuddyCloud) {
    cloud = window.WorkBuddyCloud.createWorkBuddyCloud({
      endpoint: CLOUD_CONFIG.endpoint,
      publishableKey: CLOUD_CONFIG.publishableKey,
    });
  }
} catch (e) {
  console.warn('Leaderboard disabled: cloud client init failed', e);
  cloud = null;
}

export function cloudAvailable() {
  return !!cloud;
}

export async function fetchTop(trackId, limit = 10) {
  if (!cloud) return [];
  try {
    const { data, error } = await cloud.database
      .from('leaderboard')
      .select('id, track_id, player_name, time_ms, created_at')
      .eq('track_id', trackId)
      .order('time_ms', { ascending: true })
      .limit(limit);
    if (error) {
      console.warn('Leaderboard fetch failed:', error.message);
      return [];
    }
    return data || [];
  } catch (e) {
    console.warn('Leaderboard fetch failed:', e);
    return [];
  }
}

// Returns { ok, rank } — rank is the position in the track top list, or null.
export async function submitScore(trackId, playerName, timeMs) {
  if (!cloud) return { ok: false, rank: null, error: 'offline' };
  const name = (playerName || '').trim().slice(0, 24) || 'Anonymous';
  if (!Number.isFinite(timeMs) || timeMs <= 0 || timeMs >= 3600000) {
    return { ok: false, rank: null, error: 'invalid time' };
  }
  try {
    const { error } = await cloud.database
      .from('leaderboard')
      .insert({ track_id: trackId, player_name: name, time_ms: Math.round(timeMs) });
    if (error) {
      console.warn('Score submit failed:', error.message);
      return { ok: false, rank: null, error: error.message };
    }
    // Determine rank: count strictly better times.
    const { count, error: cntErr } = await cloud.database
      .from('leaderboard')
      .select('*', { count: 'exact', head: true })
      .eq('track_id', trackId)
      .lt('time_ms', Math.round(timeMs));
    const better = cntErr ? 0 : (count || 0);
    return { ok: true, rank: better + 1, error: null };
  } catch (e) {
    console.warn('Score submit failed:', e);
    return { ok: false, rank: null, error: String(e && e.message || e) };
  }
}
