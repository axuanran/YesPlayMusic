import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  registerPlugin: vi.fn(() => ({ request: mocks.request })),
}));

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn(url => Promise.resolve(`data:image/mock,${url}`)),
  },
}));

import { requestNeteaseOnAndroid } from '../neteaseApi';

describe('Android native NetEase API adapter', () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.request.mockReset();
    mocks.request.mockResolvedValue({
      status: 200,
      cookies: [],
      data: { code: 200 },
    });
  });

  it('maps song URL requests to the native eapi route', async () => {
    await requestNeteaseOnAndroid({
      url: '/song/url',
      params: { id: '1,2', br: 320000 },
    });

    expect(mocks.request).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: '/api/song/enhance/player/url',
        crypto: 'eapi',
        data: {
          ids: '["1","2"]',
          br: 320000,
        },
      })
    );
  });

  it('passes persisted login cookies to the Android module', async () => {
    localStorage.setItem('cookie-MUSIC_U', 'token');
    localStorage.setItem('cookie-__csrf', 'csrf');

    await requestNeteaseOnAndroid({ url: '/user/account' });

    expect(mocks.request).toHaveBeenCalledWith(
      expect.objectContaining({
        cookie: 'MUSIC_U=token; __csrf=csrf',
      })
    );
  });

  it('creates QR images inside the UI without a server call', async () => {
    const result = await requestNeteaseOnAndroid({
      url: '/login/qr/create',
      params: { key: 'key-1', qrimg: true },
    });

    expect(result).toMatchObject({
      code: 200,
      data: {
        qrurl: 'https://music.163.com/login?codekey=key-1',
      },
    });
    expect(result.data.qrimg).toContain('data:image/mock');
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it('reports routes that have not been ported instead of using a remote API', async () => {
    await expect(
      requestNeteaseOnAndroid({ url: '/unmapped/route' })
    ).rejects.toThrow('尚未适配接口');
    expect(mocks.request).not.toHaveBeenCalled();
  });
});
