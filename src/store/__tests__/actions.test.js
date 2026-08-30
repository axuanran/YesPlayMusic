import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  likedAlbums: vi.fn(),
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
  likedAlbums: mocks.likedAlbums,
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
    actions.resetLibraryData({ commit: vi.fn() });
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
  it('clears all account-scoped Library data on reset', () => {
    const commit = vi.fn();

    actions.resetLibraryData({ commit });

    expect(commit).toHaveBeenCalledTimes(8);
    expect(commit).toHaveBeenCalledWith('updateLikedXXX', {
      name: 'albums',
      data: [],
    });
    expect(commit).toHaveBeenCalledWith('updateLikedXXX', {
      name: 'playHistory',
      data: {},
    });
  });

  it('deduplicates concurrent and completed Library collection loads', async () => {
    let resolveRequest;
    mocks.likedAlbums.mockReturnValue(
      new Promise(resolve => {
        resolveRequest = resolve;
      })
    );
    const context = {
      state: { data: { user: { userId: 42 } } },
      commit: vi.fn(),
    };

    const first = actions.fetchLikedAlbums(context);
    const second = actions.fetchLikedAlbums(context);
    await Promise.resolve();
    expect(mocks.likedAlbums).toHaveBeenCalledOnce();

    resolveRequest({ data: [{ id: 1 }] });
    await Promise.all([first, second]);
    await actions.fetchLikedAlbums(context);

    expect(mocks.likedAlbums).toHaveBeenCalledOnce();
    expect(context.commit).toHaveBeenCalledWith('updateLikedXXX', {
      name: 'albums',
      data: [{ id: 1 }],
    });
  });

  it('rejects a stale Library response after the active account changes', async () => {
    let resolveRequest;
    mocks.likedAlbums.mockReturnValue(
      new Promise(resolve => {
        resolveRequest = resolve;
      })
    );
    const state = { data: { user: { userId: 42 } } };
    const commit = vi.fn();
    const load = actions.fetchLikedAlbums({ state, commit });
    await Promise.resolve();

    state.data.user = { userId: 84 };
    resolveRequest({ data: [{ id: 1 }] });
    await load;

    expect(commit).not.toHaveBeenCalled();
  });

  it('rejects a pre-logout response after the same account logs in again', async () => {
    let resolveRequest;
    mocks.likedAlbums.mockReturnValue(
      new Promise(resolve => {
        resolveRequest = resolve;
      })
    );
    const state = { data: { user: { userId: 42 } } };
    const commit = vi.fn();
    const load = actions.fetchLikedAlbums({ state, commit });
    await Promise.resolve();

    actions.resetLibraryData({ commit: vi.fn() });
    resolveRequest({ data: [{ id: 1 }] });
    await load;

    expect(commit).not.toHaveBeenCalled();
  });

  it('allows retry after a Library collection request fails', async () => {
    mocks.likedAlbums
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce({ data: [{ id: 2 }] });
    const context = {
      state: { data: { user: { userId: 42 } } },
      commit: vi.fn(),
    };

    await expect(actions.fetchLikedAlbums(context)).rejects.toThrow(
      'network unavailable'
    );
    await actions.fetchLikedAlbums(context);

    expect(mocks.likedAlbums).toHaveBeenCalledTimes(2);
    expect(context.commit).toHaveBeenCalledWith('updateLikedXXX', {
      name: 'albums',
      data: [{ id: 2 }],
    });
  });
});
