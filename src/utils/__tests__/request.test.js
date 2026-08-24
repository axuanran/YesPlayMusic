import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const requestHandlers = [];
  const responseHandlers = [];
  const service = vi.fn();
  service.interceptors = {
    request: {
      use: vi.fn(handler => {
        requestHandlers.push(handler);
      }),
    },
    response: {
      use: vi.fn((successHandler, errorHandler) => {
        responseHandlers.push({ successHandler, errorHandler });
      }),
    },
  };

  return {
    axiosCreate: vi.fn(() => service),
    doLogout: vi.fn(),
    getCookieString: vi.fn(() => ''),
    isResolverEnabled: vi.fn(() => false),
    refreshCookie: vi.fn(),
    requestHandlers,
    responseHandlers,
    service,
    setCookies: vi.fn(),
    syncCookiesFromDocument: vi.fn(),
    syncCookieToResolverWithRetry: vi.fn(),
  };
});

vi.mock('axios', () => ({
  default: {
    create: mocks.axiosCreate,
  },
}));

vi.mock('@/router', () => ({
  default: {
    push: vi.fn(),
  },
}));

vi.mock('@/store', () => ({
  default: {
    dispatch: vi.fn(),
  },
}));

vi.mock('@/api/auth', () => ({
  refreshCookie: mocks.refreshCookie,
}));

vi.mock('@/api/audioResolver', () => ({
  isResolverEnabled: mocks.isResolverEnabled,
  syncCookieToResolverWithRetry: mocks.syncCookieToResolverWithRetry,
}));

vi.mock('@/utils/auth', () => ({
  doLogout: mocks.doLogout,
  getCookieString: mocks.getCookieString,
  setCookies: mocks.setCookies,
  syncCookiesFromDocument: mocks.syncCookiesFromDocument,
}));

vi.mock('@/utils/env', () => ({
  env: {
    IS_ELECTRON: false,
    NODE_ENV: 'development',
    VUE_APP_NETEASE_API_URL: '/api',
  },
  isCapacitor: false,
}));

async function loadRequestInterceptors() {
  vi.resetModules();
  mocks.requestHandlers.length = 0;
  mocks.responseHandlers.length = 0;
  await import('../request');

  return {
    request: mocks.requestHandlers[0],
    responseSuccess: mocks.responseHandlers[0].successHandler,
    responseError: mocks.responseHandlers[0].errorHandler,
  };
}

describe('request service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mocks.getCookieString.mockReturnValue('');
    mocks.isResolverEnabled.mockReturnValue(false);
    mocks.refreshCookie.mockResolvedValue({ code: 200 });
    mocks.syncCookieToResolverWithRetry.mockResolvedValue(true);
  });

  it('does not throw when settings are missing', async () => {
    const { request } = await loadRequestInterceptors();

    expect(() => request({ url: '/playlist/detail' })).not.toThrow();
  });

  it('does not throw when settings are invalid json', async () => {
    localStorage.setItem('settings', '{bad-json');
    const { request } = await loadRequestInterceptors();

    expect(() => request({ url: '/playlist/detail' })).not.toThrow();
  });

  it('applies configured realIP and proxy params', async () => {
    localStorage.setItem(
      'settings',
      JSON.stringify({
        enableRealIP: true,
        realIP: '1.2.3.4',
        proxyConfig: {
          protocol: 'HTTP',
          server: '127.0.0.1',
          port: '7890',
        },
      })
    );
    const { request } = await loadRequestInterceptors();

    const config = request({ url: '/song/url' });

    expect(config.params).toMatchObject({
      realIP: '1.2.3.4',
      proxy: 'HTTP://127.0.0.1:7890',
    });
  });

  it('uses the configured Serverless API immediately', async () => {
    localStorage.setItem(
      'settings',
      JSON.stringify({ neteaseApiUrl: 'https://ncm.example.com/' })
    );
    mocks.getCookieString.mockReturnValue('MUSIC_U=session');
    const { request } = await loadRequestInterceptors();

    const config = request({ url: '/playlist/detail' });

    expect(config.baseURL).toBe('https://ncm.example.com');
    expect(config.withCredentials).toBe(false);
    expect(config.params.cookie).toBe('MUSIC_U=session');

    localStorage.setItem(
      'settings',
      JSON.stringify({ neteaseApiUrl: 'https://ncm-2.example.com' })
    );
    expect(request({ url: '/toplist' }).baseURL).toBe(
      'https://ncm-2.example.com'
    );
  });

  it('keeps failed http responses rejected', async () => {
    const { responseError } = await loadRequestInterceptors();
    const data = { code: 500, message: 'server failed' };

    await expect(
      responseError({
        response: {
          data,
          config: {
            url: '/playlist/detail',
          },
        },
      })
    ).rejects.toBe(data);
  });

  it('syncs refreshed cookies to an enabled resolver before retrying', async () => {
    mocks.getCookieString.mockReturnValue('MUSIC_U=fresh; __csrf=token');
    mocks.isResolverEnabled.mockReturnValue(true);
    mocks.refreshCookie.mockResolvedValue({
      code: 200,
      cookie: 'MUSIC_U=fresh; __csrf=token',
    });
    const { responseSuccess } = await loadRequestInterceptors();

    await responseSuccess({
      data: { code: 301, msg: '需要登录' },
      config: { url: '/playlist/detail' },
    });

    expect(mocks.syncCookiesFromDocument).toHaveBeenCalledTimes(1);
    expect(mocks.syncCookieToResolverWithRetry).toHaveBeenCalledWith(
      'MUSIC_U=fresh; __csrf=token',
      {
        timeoutMs: 8000,
        intervalMs: 1000,
      }
    );
    expect(mocks.service).toHaveBeenCalledWith(
      expect.objectContaining({
        _retried: true,
        params: expect.objectContaining({
          cookie: 'MUSIC_U=fresh; __csrf=token',
        }),
      })
    );
  });

  it('keeps a successful refresh when resolver cookie sync fails', async () => {
    mocks.getCookieString.mockReturnValue('MUSIC_U=fresh');
    mocks.isResolverEnabled.mockReturnValue(true);
    mocks.syncCookieToResolverWithRetry.mockRejectedValue(
      new Error('resolver unavailable')
    );
    const { responseSuccess } = await loadRequestInterceptors();

    await responseSuccess({
      data: { code: 301, msg: '需要登录' },
      config: { url: '/playlist/detail' },
    });

    expect(mocks.doLogout).not.toHaveBeenCalled();
    expect(mocks.service).toHaveBeenCalledTimes(1);
  });
});
