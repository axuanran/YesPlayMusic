import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  userLikedSongsIDs: vi.fn(),
}));

vi.mock('@/utils/auth', () => ({
  isAccountLoggedIn: vi.fn(() => true),
  isLooseLoggedIn: vi.fn(() => true),
}));

vi.mock('@/api/track', () => ({
  getTrackDetail: vi.fn(),
  likeATrack: vi.fn(),
}));

vi.mock('@/api/playlist', () => ({
  getPlaylistDetail: vi.fn(),
}));

vi.mock('@/api/user', () => ({
  cloudDisk: vi.fn(),
  likedAlbums: vi.fn(),
  likedArtists: vi.fn(),
  likedMVs: vi.fn(),
  userAccount: vi.fn(),
  userLikedSongsIDs: mocks.userLikedSongsIDs,
  userPlayHistory: vi.fn(),
  userPlaylist: vi.fn(),
}));

import actions from '@/store/actions';

describe('store actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches liked song IDs with a scalar user ID', async () => {
    mocks.userLikedSongsIDs.mockResolvedValue({
      ids: [11, 22],
    });
    const commit = vi.fn();

    await actions.fetchLikedSongs({
      state: {
        data: {
          user: {
            userId: 42,
          },
        },
      },
      commit,
    });

    expect(mocks.userLikedSongsIDs).toHaveBeenCalledWith(42);
    expect(commit).toHaveBeenCalledWith('updateLikedXXX', {
      name: 'songs',
      data: [11, 22],
    });
  });
});
