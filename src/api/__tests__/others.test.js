import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  mapTrackPlayableStatus: vi.fn(tracks => tracks),
  request: vi.fn(),
}));

vi.mock('@/utils/request', () => ({
  default: mocks.request,
}));

vi.mock('@/utils/common', () => ({
  mapTrackPlayableStatus: mocks.mapTrackPlayableStatus,
}));

import { search } from '@/api/others';

describe('search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses cloud search instead of the legacy search endpoint', async () => {
    const response = {
      code: 200,
      result: {
        playlists: [],
      },
    };
    mocks.request.mockResolvedValue(response);

    await expect(
      search({
        keywords: 'lulala',
        limit: 16,
        type: 1000,
      })
    ).resolves.toBe(response);

    expect(mocks.request).toHaveBeenCalledWith({
      url: '/cloudsearch',
      method: 'get',
      params: {
        keywords: 'lulala',
        limit: 16,
        type: 1000,
      },
    });
  });

  it('maps playable status for song search results', async () => {
    const songs = [{ id: 1 }, { id: 2 }];
    const mappedSongs = [{ id: 1, playable: true }];
    mocks.mapTrackPlayableStatus.mockReturnValue(mappedSongs);
    mocks.request.mockResolvedValue({
      code: 200,
      result: {
        songs,
      },
    });

    const response = await search({
      keywords: 'lulala',
      type: 1,
    });

    expect(mocks.mapTrackPlayableStatus).toHaveBeenCalledWith(songs);
    expect(response.result.songs).toBe(mappedSongs);
  });

  it('forwards per-search timeout and cancellation options', async () => {
    const controller = new AbortController();
    mocks.request.mockResolvedValue({ code: 200, result: {} });

    await search(
      {
        keywords: 'progressive',
        type: 10,
      },
      {
        signal: controller.signal,
        timeout: 8000,
      }
    );

    expect(mocks.request).toHaveBeenCalledWith({
      url: '/cloudsearch',
      method: 'get',
      params: {
        keywords: 'progressive',
        type: 10,
      },
      signal: controller.signal,
      timeout: 8000,
    });
  });
});
