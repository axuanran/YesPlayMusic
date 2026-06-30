import router from '@/router';
import {
  doLogout,
  getCookieString,
  setCookies,
  syncCookiesFromDocument,
} from '@/utils/auth';
import { refreshCookie } from '@/api/auth';
import { env } from '@/utils/env';
import store from '@/store';
import axios from 'axios';

// Token refresh state: prevents concurrent refreshes.
let refreshPromise = null;

function getRequestUrl(config) {
  return config.url || '';
}

function readSettings() {
  try {
    return JSON.parse(localStorage.getItem('settings')) || {};
  } catch {
    return {};
  }
}

function refreshRequestCookies(config) {
  if (!config.params) config.params = {};
  if (!getRequestUrl(config).includes('/login')) {
    const cookie = getCookieString();
    if (cookie) {
      config.params.cookie = cookie;
    } else {
      delete config.params.cookie;
    }
  }
  return config;
}

function runTokenRefresh() {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      console.warn('[refresh] Token expired, trying refresh...');
      const result = await refreshCookie();
      // If refresh itself returns 302, the session is gone — cannot refresh.
      if (result?.code === 302) {
        throw new Error('Refresh returned 302: session invalid');
      }
      // Some API versions return cookie string in response body.
      // Sync both ways: from Set-Cookie headers (document.cookie) and from body.
      if (result?.cookie && typeof result.cookie === 'string') {
        setCookies(result.cookie);
      }
      syncCookiesFromDocument();
      console.log('[refresh] Token refreshed successfully');
    } catch (error) {
      console.warn('[refresh] Token refresh failed, logging out', error);
      store.dispatch('showToast', '登录已过期，请重新登录');
      doLogout();
      if (env.IS_ELECTRON) {
        router.push({ name: 'loginAccount' });
      } else {
        router.push({ name: 'login' });
      }
      throw error;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

let baseURL = '';
// Web 和 Electron 跑在不同端口避免同时启动时冲突
if (env.IS_ELECTRON) {
  if (env.NODE_ENV === 'production') {
    baseURL = env.VUE_APP_ELECTRON_API_URL;
  } else {
    baseURL = env.VUE_APP_ELECTRON_API_URL_DEV;
  }
} else {
  baseURL = env.VUE_APP_NETEASE_API_URL;
}
baseURL = baseURL || '/api';

const service = axios.create({
  baseURL,
  withCredentials: true,
  timeout: 15000,
});

service.interceptors.request.use(function (config) {
  if (!config.params) config.params = {};
  const requestUrl = getRequestUrl(config);
  const settings = readSettings();

  if (baseURL.length) {
    if (!env.IS_ELECTRON && !requestUrl.includes('/login')) {
      const cookie = getCookieString();
      if (cookie && !config.params.cookie) config.params.cookie = cookie;
    }
  } else {
    console.error("You must set up the baseURL in the service's config");
  }

  if (!env.IS_ELECTRON && !requestUrl.includes('/login')) {
    config.params.realIP = '211.161.244.70';
  }

  // Force real_ip
  const enableRealIP = settings.enableRealIP;
  const realIP = settings.realIP;
  if (env.VUE_APP_REAL_IP) {
    config.params.realIP = env.VUE_APP_REAL_IP;
  } else if (enableRealIP) {
    config.params.realIP = realIP;
  }

  const proxy = settings.proxyConfig || {};
  if (['HTTP', 'HTTPS'].includes(proxy.protocol)) {
    config.params.proxy = `${proxy.protocol}://${proxy.server}:${proxy.port}`;
  }

  return config;
});

service.interceptors.response.use(
  async response => {
    const res = response.data;
    if (
      res?.code === 301 &&
      res?.msg === '需要登录' &&
      response.config.url !== '/logout' &&
      !response.config._retried
    ) {
      try {
        await runTokenRefresh();
        response.config._retried = true;
        return service(refreshRequestCookies(response.config));
      } catch {
        return Promise.reject(res);
      }
    }
    return res;
  },
  async error => {
    /** @type {import('axios').AxiosResponse | null} */
    let response;
    let data;
    if (error === 'TypeError: baseURL is undefined') {
      response = error;
      data = error;
      console.error("You must set up the baseURL in the service's config");
    } else if (error.response) {
      response = error.response;
      data = response.data;
    }

    if (
      response &&
      typeof data === 'object' &&
      data.code === 301 &&
      data.msg === '需要登录' &&
      response.config?.url !== '/logout' &&
      !response.config?._retried
    ) {
      try {
        await runTokenRefresh();
        response.config._retried = true;
        return service(refreshRequestCookies(response.config));
      } catch {
        return Promise.reject(data ?? error);
      }
    }

    return Promise.reject(data ?? error);
  }
);

export default service;
