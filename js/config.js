// Cloud service public config (safe to ship in front-end code).
export const CLOUD_CONFIG = {
  endpoint: 'https://polydash-game.app.workbuddy.host',
  publishableKey: 'wbpk_SoRiwg24iRKS2JivBjAZ2b_JLrB2EQFvO0jNVSG9ypm3uwpDTbIWJSn',
};

// The managed database only answers these origins. Anywhere else (GitHub Pages,
// a fork's own domain, file://) the leaderboard falls back to local times
// instead of firing requests the browser would block.
export const CLOUD_ALLOWED_HOSTS = [
  'polydash-game.app.workbuddy.host',
  'localhost',
  '127.0.0.1',
];
