import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COOKIE_PATH = path.join(__dirname, 'cookie.json');

let _cookie = null;

/**
 * Load cookie from file
 * @returns {string|null}
 */
export function loadCookie() {
  if (_cookie !== null) return _cookie;
  try {
    const raw = fs.readFileSync(COOKIE_PATH, 'utf-8');
    const data = JSON.parse(raw);
    _cookie = data.cookie || null;
  } catch {
    _cookie = null;
  }
  return _cookie;
}

/**
 * Save cookie to file
 * @param {string} cookie
 */
export function saveCookie(cookie) {
  _cookie = cookie;
  fs.writeFileSync(COOKIE_PATH, JSON.stringify({ cookie, updatedAt: Date.now() }, null, 2), 'utf-8');
}

/**
 * Clear stored cookie
 */
export function clearCookie() {
  _cookie = null;
  try {
    fs.unlinkSync(COOKIE_PATH);
  } catch {
    // ignore
  }
}

/**
 * Check if cookie is available
 * @returns {boolean}
 */
export function hasCookie() {
  return !!loadCookie();
}
