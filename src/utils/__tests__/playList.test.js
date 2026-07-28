import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  dailyRecommendPlaylist: vi.fn(),
  getPlaylistDetail: vi.fn(),
  isAccountLoggedIn: vi.fn(),
  recommendPlaylist: vi.fn(),
}));

vi.mock('@/router', () => ({
  default: {
    push: vi.fn(),
  },
}));

vi.mock('@/store/state', () => ({
  default: {
    data: {
      likedSongPlaylistID: 0,
    },
    player: {
      isPersonalFM: false,
      playlistSource: {
        id: 0,
      },
    },
  },
}));

vi.mock('@/api/playlist', () => ({
  dailyRecommendPlaylist: mocks.dailyRecommendPlaylist,
  getPlaylistDetail: mocks.getPlaylistDetail,
  recommendPlaylist: mocks.recommendPlaylist,
}));

vi.mock('@/utils/auth', () => ({
  isAccountLoggedIn: mocks.isAccountLoggedIn,
}));

import { getRecommendPlayList } from '@/utils/playList';

describe('getRecommendPlayList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isAccountLoggedIn.mockReturnValue(true);
  });

  it('falls back to public recommendations when daily recommendations fail', async () => {
    const publicPlaylists = [{ id: 1 }, { id: 2 }];
    mocks.dailyRecommendPlaylist.mockRejectedValue(new Error('unauthorized'));
    mocks.recommendPlaylist.mockResolvedValue({
      result: publicPlaylists,
    });

    await expect(getRecommendPlayList(10, false)).resolves.toEqual(
      publicPlaylists
    );
  });

  it('keeps daily recommendations when public recommendations fail', async () => {
    const dailyPlaylists = [{ id: 3 }, { id: 4 }];
    mocks.dailyRecommendPlaylist.mockResolvedValue({
      recommend: dailyPlaylists,
    });
    mocks.recommendPlaylist.mockRejectedValue(new Error('network error'));

    await expect(getRecommendPlayList(10, false)).resolves.toEqual(
      dailyPlaylists
    );
  });

  it('rejects when neither endpoint returns recommendations', async () => {
    mocks.dailyRecommendPlaylist.mockResolvedValue({
      code: 301,
    });
    mocks.recommendPlaylist.mockResolvedValue({
      code: 500,
    });

    await expect(getRecommendPlayList(10, false)).rejects.toThrow(
      'Recommended playlists response is empty'
    );
  });

  it('returns an empty list for malformed anonymous responses', async () => {
    mocks.isAccountLoggedIn.mockReturnValue(false);
    mocks.recommendPlaylist.mockResolvedValue({
      code: 500,
    });

    await expect(getRecommendPlayList(10, false)).resolves.toEqual([]);
  });
});
