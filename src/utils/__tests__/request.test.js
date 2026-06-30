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
    getCookieString: vi.fn(() => ''),
    requestHandlers,
    responseHandlers,
    service,
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
  refreshCookie: vi.fn(),
}));

vi.mock('@/utils/auth', () => ({
  doLogout: vi.fn(),
  getCookieString: mocks.getCookieString,
  setCookies: vi.fn(),
  syncCookiesFromDocument: vi.fn(),
}));

vi.mock('@/utils/env', () => ({
  env: {
    IS_ELECTRON: false,
    NODE_ENV: 'development',
    VUE_APP_NETEASE_API_URL: '/api',
  },
}));

async function loadRequestInterceptors() {
  vi.resetModules();
  mocks.requestHandlers.length = 0;
  mocks.responseHandlers.length = 0;
  await import('../request');

  return {
    request: mocks.requestHandlers[0],
    responseError: mocks.responseHandlers[0].errorHandler,
  };
}

describe('request service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mocks.getCookieString.mockReturnValue('');
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
});
