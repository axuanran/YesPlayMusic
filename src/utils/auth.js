import Cookies from 'js-cookie';
import { logout } from '@/api/auth';
import store from '@/store';
import { clearCookieFromResolver } from '@/api/audioResolver';

const cookieAttributes = new Set([
  'domain',
  'expires',
  'httponly',
  'max-age',
  'path',
  'samesite',
  'secure',
]);

export function normalizeCookieString(string) {
  const cookies = string.includes(';;')
    ? string.split(';;')
    : string.split(';');

  return cookies
    .map(cookie => {
      const [rawKey, ...rawValue] = cookie.trim().split('=');
      const key = rawKey?.trim();
      const value = rawValue.join('=').trim();

      if (!key || !value || cookieAttributes.has(key.toLowerCase())) {
        return null;
      }

      return `${key}=${value}`;
    })
    .filter(Boolean)
    .join('; ');
}

export function setCookies(string) {
  const cookies = normalizeCookieString(string).split(';');

  cookies.forEach(cookie => {
    const [rawKey, ...rawValue] = cookie.trim().split('=');
    const key = rawKey?.trim();
    const value = rawValue.join('=').trim();

    if (!key || !value || cookieAttributes.has(key.toLowerCase())) return;

    document.cookie = `${key}=${value}; path=/`;
    localStorage.setItem(`cookie-${key}`, value);
  });
}

export function getCookie(key) {
  return Cookies.get(key) ?? localStorage.getItem(`cookie-${key}`);
}

export function getCookieString() {
  return Object.keys(localStorage)
    .filter(key => key.startsWith('cookie-'))
    .map(key => `${key.replace('cookie-', '')}=${localStorage.getItem(key)}`)
    .join('; ');
}

export function removeCookie(key) {
  Cookies.remove(key);
  localStorage.removeItem(`cookie-${key}`);
}

// MUSIC_U 只有在账户登录的情况下才有
export function isLoggedIn() {
  return getCookie('MUSIC_U') !== undefined;
}

// 账号登录
export function isAccountLoggedIn() {
  return (
    getCookie('MUSIC_U') !== undefined &&
    store.state.data.loginMode === 'account'
  );
}

// 用户名搜索（用户数据为只读）
export function isUsernameLoggedIn() {
  return store.state.data.loginMode === 'username';
}

// 账户登录或者用户名搜索都判断为登录，宽松检查
export function isLooseLoggedIn() {
  return isAccountLoggedIn() || isUsernameLoggedIn();
}

export function doLogout() {
  logout();
  removeCookie('MUSIC_U');
  removeCookie('__csrf');
  // Clear cookie from resolver backend
  clearCookieFromResolver();
  // 更新状态仓库中的用户信息
  store.commit('updateData', { key: 'user', value: {} });
  // 更新状态仓库中的登录状态
  store.commit('updateData', { key: 'loginMode', value: null });
  // 更新状态仓库中的喜欢列表
  store.commit('updateData', { key: 'likedSongPlaylistID', value: undefined });
}

/**
 * Sync cookies from document.cookie to localStorage after token refresh.
 * The browser receives updated cookies via Set-Cookie headers,
 * but getCookieString() reads from localStorage which is stale.
 */
export function syncCookiesFromDocument() {
  const pairs = document.cookie.split(';');
  for (const pair of pairs) {
    const [rawKey, ...rawValue] = pair.trim().split('=');
    const key = rawKey?.trim();
    const value = rawValue.join('=').trim();
    if (!key || !value) continue;
    // MUSIC_U and __csrf are the auth cookies we care about
    if (key === 'MUSIC_U' || key === '__csrf') {
      localStorage.setItem(`cookie-${key}`, value);
    }
  }
}

/**
 * Restore auth cookies from localStorage into document.cookie on app start.
 * Electron requests rely on the browser cookie jar, while we persist copies in localStorage.
 */
export function hydrateCookiesToDocument() {
  Object.keys(localStorage)
    .filter(key => key.startsWith('cookie-'))
    .forEach(key => {
      const cookieKey = key.replace('cookie-', '');
      const value = localStorage.getItem(key);
      if (!cookieKey || !value) return;
      document.cookie = `${cookieKey}=${value}; path=/`;
    });
}
