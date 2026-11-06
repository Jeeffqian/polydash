// Rapier physics loader. The wasm backend is loaded lazily via initPhysics()
// before any Car is constructed:
//   - Node (tests): resolves @dimforge/rapier3d-compat from node_modules
//   - Browser: dynamic-imports the ESM build from the CDN, with a fallback
// The namespace is handed out through getRapier() so a failed primary source
// can be swapped for the fallback before anything touches the physics.

let rapier = null;
let ready = null;

const CDN_URLS = [
  'https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.14.0/rapier.es.js',
  'https://unpkg.com/@dimforge/rapier3d-compat@0.14.0/rapier.es.js',
];

function pickNamespace(mod) {
  if (!mod) return null;
  if (mod.init) return mod;                  // module namespace (ESM) / CJS exports
  if (mod.default && mod.default.init) return mod.default; // bundled default export
  return null;
}

async function loadRapier() {
  // 1. bare specifier: node_modules in Node, import map in the browser
  try {
    const ns = pickNamespace(await import('@dimforge/rapier3d-compat'));
    if (ns) return ns;
  } catch (e) { /* fall through to the CDNs */ }
  // 2. CDN fallbacks (keeps the game alive if one CDN is down)
  let lastErr = null;
  for (const url of CDN_URLS) {
    try {
      const ns = pickNamespace(await import(url));
      if (ns) return ns;
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('Rapier failed to load from every source');
}

/** Load and start the Rapier wasm backend. Idempotent; returns a promise. */
export function initPhysics() {
  if (!ready) {
    ready = loadRapier()
      .then(ns => { rapier = ns; return ns.init(); })
      .then(() => undefined);
  }
  return ready;
}

/** The initialised Rapier namespace. Throws if initPhysics() has not resolved. */
export function getRapier() {
  if (!rapier || !rapier.init) {
    throw new Error('Physics backend not ready — await initPhysics() before building a world');
  }
  return rapier;
}
