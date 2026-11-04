// Online leaderboard backed by the WorkBuddy cloud database.
// Table `leaderboard`: track_id, player_name, time_ms, created_at
// Public read + public insert (validated by RLS policy).

import {
  cloudClient, cloudAvailable as cloudReady, markCloudUnreachable,
  withTimeout, CLOUD_TIMEOUT_MS,
} from './cloud.js';

const TIMEOUT_MS = CLOUD_TIMEOUT_MS;

export function cloudAvailable() {
  return cloudReady();
}

export async function fetchTop(trackId, limit = 10) {
  const cloud = cloudClient();
  if (!cloud || !cloudAvailable()) return [];
  try {
    const query = cloud.database
      .from('leaderboard')
      .select('id, track_id, player_name, time_ms, created_at')
      .eq('track_id', trackId)
      .order('time_ms', { ascending: true })
      .limit(limit);
    const res = await withTimeout(query, TIMEOUT_MS, { timedOut: true });
    if (res && res.timedOut) {
      markCloudUnreachable();
      return [];
    }
    const { data, error } = res;
    if (error) {
      console.warn('Leaderboard fetch failed:', error.message);
      markCloudUnreachable();
      return [];
    }
    return data || [];
  } catch (e) {
    console.warn('Leaderboard fetch failed:', e);
    markCloudUnreachable();
    return [];
  }
}

// Returns { ok, rank } — rank is the position in the track top list, or null.
export async function submitScore(trackId, playerName, timeMs) {
  const cloud = cloudClient();
  if (!cloud || !cloudAvailable()) return { ok: false, rank: null, error: 'offline' };
  const name = (playerName || '').trim().slice(0, 24) || 'Anonymous';
  if (!Number.isFinite(timeMs) || timeMs <= 0 || timeMs >= 3600000) {
    return { ok: false, rank: null, error: 'invalid time' };
  }
  try {
    const insert = cloud.database
      .from('leaderboard')
      .insert({ track_id: trackId, player_name: name, time_ms: Math.round(timeMs) });
    const res = await withTimeout(insert, TIMEOUT_MS, { timedOut: true });
    if (res && res.timedOut) {
      markCloudUnreachable();
      return { ok: false, rank: null, error: 'offline' };
    }
    if (res.error) {
      console.warn('Score submit failed:', res.error.message);
      return { ok: false, rank: null, error: res.error.message };
    }
    // Determine rank: count strictly better times.
    const countQuery = cloud.database
      .from('leaderboard')
      .select('*', { count: 'exact', head: true })
      .eq('track_id', trackId)
      .lt('time_ms', Math.round(timeMs));
    const cnt = await withTimeout(countQuery, TIMEOUT_MS, { timedOut: true });
    const better = (!cnt || cnt.timedOut || cnt.error) ? 0 : (cnt.count || 0);
    return { ok: true, rank: better + 1, error: null };
  } catch (e) {
    console.warn('Score submit failed:', e);
    return { ok: false, rank: null, error: String(e && e.message || e) };
  }
}
