import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cacheLyric: vi.fn(),
  cacheTrackDetail: vi.fn(),
  getLyricFromCache: vi.fn(),
  getTrackDetailFromCache: vi.fn(),
  request: vi.fn(),
}));

vi.mock('@/store', () => ({
  default: { state: { settings: { musicQuality: 'exhigh' } } },
}));

vi.mock('@/utils/request', () => ({
  default: mocks.request,
}));

vi.mock('@/utils/db', () => ({
  cacheLyric: mocks.cacheLyric,
  cacheTrackDetail: mocks.cacheTrackDetail,
  getLyricFromCache: mocks.getLyricFromCache,
  getTrackDetailFromCache: mocks.getTrackDetailFromCache,
}));

vi.mock('@/utils/common', () => ({
  mapTrackPlayableStatus: vi.fn(songs => songs),
}));

async function loadTrackApi() {
  vi.resetModules();
  return import('../track');
}

describe('track lyric requests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getLyricFromCache.mockResolvedValue(undefined);
    mocks.request.mockResolvedValue({ lrc: { lyric: 'latest' } });
  });

  it('uses one network request on a cold cache miss', async () => {
    const { getLyric } = await loadTrackApi();

    await expect(getLyric(42)).resolves.toEqual({
      lrc: { lyric: 'latest' },
    });

    expect(mocks.request).toHaveBeenCalledOnce();
    expect(mocks.cacheLyric).toHaveBeenCalledWith(42, {
      lrc: { lyric: 'latest' },
    });
  });

  it('returns cached lyrics while refreshing once in the background', async () => {
    mocks.getLyricFromCache.mockResolvedValue({ lrc: { lyric: 'cached' } });
    const { getLyric } = await loadTrackApi();

    await expect(getLyric(42)).resolves.toEqual({
      lrc: { lyric: 'cached' },
    });
    await vi.waitFor(() => expect(mocks.request).toHaveBeenCalledOnce());
  });

  it('coalesces concurrent requests for the same lyric ID', async () => {
    let resolveRequest;
    mocks.request.mockReturnValue(
      new Promise(resolve => {
        resolveRequest = resolve;
      })
    );
    const { getLyric } = await loadTrackApi();

    const first = getLyric(42);
    const second = getLyric('42');
    await vi.waitFor(() => expect(mocks.request).toHaveBeenCalledOnce());
    resolveRequest({ lrc: { lyric: 'latest' } });

    await expect(Promise.all([first, second])).resolves.toEqual([
      { lrc: { lyric: 'latest' } },
      { lrc: { lyric: 'latest' } },
    ]);
  });

  it('allows retry after a failed lyric request', async () => {
    mocks.request
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce({ lrc: { lyric: 'retry' } });
    const { getLyric } = await loadTrackApi();

    await expect(getLyric(42)).rejects.toThrow('network unavailable');
    await expect(getLyric(42)).resolves.toEqual({
      lrc: { lyric: 'retry' },
    });

    expect(mocks.request).toHaveBeenCalledTimes(2);
  });
});
