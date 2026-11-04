// Shared WorkBuddy cloud client.
// Only created on hosts the managed backend trusts — everywhere else every
// feature that needs the network quietly degrades to local-only behaviour.

import { CLOUD_CONFIG, CLOUD_ALLOWED_HOSTS } from './config.js';

let cloud = null;
let unreachable = false;

const hostAllowed = typeof location === 'undefined'
  || CLOUD_ALLOWED_HOSTS.includes(location.hostname);

// dev/test escape hatch: `localStorage.polydash_cloud_off = '1'` keeps a run local-only
let disabledByFlag = false;
try {
  disabledByFlag = typeof localStorage !== 'undefined'
    && localStorage.getItem('polydash_cloud_off') === '1';
} catch (e) { /* storage blocked — keep cloud on */ }

try {
  if (!disabledByFlag && hostAllowed && typeof window !== 'undefined' && window.WorkBuddyCloud) {
    cloud = window.WorkBuddyCloud.createWorkBuddyCloud({
      endpoint: CLOUD_CONFIG.endpoint,
      publishableKey: CLOUD_CONFIG.publishableKey,
    });
  }
} catch (e) {
  console.warn('Cloud client init failed — running local only', e);
  cloud = null;
}

export const CLOUD_TIMEOUT_MS = 3500;

/** Resolve with `fallback` if the promise does not settle in time. */
export function withTimeout(promise, ms, fallback) {
  return Promise.race([
    promise,
    new Promise(resolve => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export function cloudClient() {
  return cloud;
}

export function cloudAvailable() {
  return !!cloud && !unreachable;
}

/** Latch off after a failed request so the UI stops waiting on a dead backend. */
export function markCloudUnreachable() {
  unreachable = true;
}

export function resetCloudState() {
  unreachable = false;
}
