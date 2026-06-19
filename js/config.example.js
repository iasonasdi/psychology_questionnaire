/**
 * Base config (committed). Do not put secrets here.
 *
 * Local dev: create js/config.js (gitignored) with:
 *   CONFIG.GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/.../exec';
 *
 * Production: GitHub Actions writes js/config.js during deploy.
 */
var CONFIG = {
  GOOGLE_SCRIPT_URL: '',
};
