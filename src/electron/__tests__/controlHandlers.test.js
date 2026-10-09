import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/electron/ipcRenderer', () => ({
  handleMprisCommand: vi.fn(),
}));

const apiMocks = vi.hoisted(() => ({
  search: vi.fn(),
  getLyric: vi.fn(),
  dailyRecommendTracks: vi.fn(),
}));

vi.mock('@/api/others', () => ({ search: apiMocks.search }));
vi.mock('@/api/track', () => ({ getLyric: apiMocks.getLyric }));
vi.mock('@/api/playlist', () => ({
  dailyRecommendTracks: apiMocks.dailyRecommendTracks,
}));

import { handleMprisCommand } from '@/electron/ipcRenderer';
import { createControlHandlers } from '@/electron/controlHandlers';

const createPlayer = () => ({
  addTrackToPlayNext: vi.fn(),
  current: 2,
  currentTrack: {
    id: 111,
    name: '晴天',
    ar: [{ name: '周杰伦' }],
    al: { name: '叶惠美' },
    dt: 269000,
  },
  isPersonalFM: false,
  list: [111, 222, 333],
  playAlbumByID: vi.fn(),
  playArtistByID: vi.fn(),
  playPlaylistByID: vi.fn(),
  playTrackOnListByID: vi.fn(),
  playlistSource: { type: 'playlist', id: 42 },
  playNextList: [999],
  playing: true,
  progress: 12.5,
  repeatMode: 'off',
  replacePlaylist: vi.fn(),
  shuffle: false,
  volume: 0.4,
});

const createStore = () => ({
  dispatch: vi.fn(),
  state: { liked: { songs: [111] } },
});

describe('control handlers', () => {
  let player;
  let store;
  let handlers;

  beforeEach(() => {
    player = createPlayer();
    store = createStore();
    handlers = createControlHandlers({ player, store });
    handleMprisCommand.mockClear();
    apiMocks.search.mockReset();
    apiMocks.getLyric.mockReset();
    apiMocks.dailyRecommendTracks.mockReset();
  });

  it('reports a compact status without dumping the queue', () => {
    const status = handlers.status();
    expect(status).toMatchObject({
      playing: true,
      positionMs: 12500,
      queue: { playlistTotal: 3, priorityTotal: 1 },
      currentTrack: { id: 111, artists: ['周杰伦'], durationMs: 269000 },
    });
    expect(status).not.toHaveProperty('list');
  });

  it('validates transport commands strictly', () => {
    handlers.control({ type: 'next' });
    expect(handleMprisCommand).toHaveBeenCalledWith(player, { type: 'next' });

    expect(() => handlers.control({ type: 'teleport' })).toThrow(/unsupported/);
    expect(() => handlers.control({ type: 'setVolume', volume: 4 })).toThrow(
      /between 0 and 1/
    );
    expect(() => handlers.control({ type: 'next', fast: true })).toThrow(
      /does not accept/
    );
    expect(() =>
      handlers.control({ type: 'setShuffle', enabled: 'yes' })
    ).toThrow(/boolean/);
  });

  it('jumps inside the queue and plays foreign tracks on their own', async () => {
    await handlers.play({ id: 222 });
    expect(player.playTrackOnListByID).toHaveBeenCalledWith(222);
    expect(player.replacePlaylist).not.toHaveBeenCalled();

    await handlers.play({ id: '8675309' });
    // source id 0 is the player's "no list source" sentinel, so no dead link
    expect(player.replacePlaylist).toHaveBeenCalledWith(
      [8675309],
      0,
      'single',
      8675309
    );
  });

  it('leaves personal FM when a concrete track is requested', async () => {
    player.isPersonalFM = true;
    await handlers.play({ id: 222 });
    expect(player.playTrackOnListByID).not.toHaveBeenCalled();
    expect(player.replacePlaylist).toHaveBeenCalledWith(
      [222],
      0,
      'single',
      222
    );
  });

  it('accepts exactly one play target and reports acceptance, not success', async () => {
    await expect(handlers.play({ id: 1, albumId: 2 })).rejects.toThrow(
      /exactly one/
    );
    await expect(handlers.play({})).rejects.toThrow(/exactly one/);
    await expect(handlers.play({ id: -1 })).rejects.toThrow(/positive integer/);
    await expect(handlers.play({ id: 12 })).resolves.toEqual({
      accepted: true,
      target: { type: 'track', id: 12 },
    });
    await expect(handlers.play({ playlistId: 42 })).resolves.toEqual({
      accepted: true,
      target: { type: 'playlist', id: 42 },
    });
    expect(player.playPlaylistByID).toHaveBeenCalledWith(42);
  });

  it('marks superseded playback requests instead of racing them', async () => {
    const slow = handlers.play({ playlistId: 1 });
    const fast = handlers.play({ id: 222 });
    await expect(fast).resolves.toMatchObject({ accepted: true });
    await expect(slow).resolves.toEqual({ accepted: false, superseded: true });
    expect(player.playPlaylistByID).not.toHaveBeenCalled();
  });

  it('enqueues into the priority queue only', async () => {
    await expect(handlers.enqueue({ id: 222 })).resolves.toEqual({
      accepted: true,
      queued: [222],
      position: 'priority',
    });
    expect(player.addTrackToPlayNext).toHaveBeenCalledWith(222);
    await handlers.enqueue({ ids: [333, 444] });
    expect(player.addTrackToPlayNext).toHaveBeenCalledWith(444);
    await expect(handlers.enqueue({})).rejects.toThrow(/needs id or ids/);
    await expect(handlers.enqueue({ id: 1, mode: 'last' })).rejects.toThrow(
      /does not accept "mode"/
    );
  });

  it('paginates the queue independently for playlist and priority entries', () => {
    player.list = Array.from({ length: 300 }, (_, index) => index + 1);
    const first = handlers.queue({ limit: 100 });
    expect(first.playlist).toMatchObject({
      total: 300,
      offset: 0,
      limit: 100,
      nextOffset: 100,
    });
    expect(first.playlist.items).toHaveLength(100);
    const second = handlers.queue({ offset: 200, limit: 100 });
    expect(second.playlist.nextOffset).toBeNull();
    expect(second.playlist.items).toHaveLength(100);
    expect(() => handlers.queue({ limit: 257 })).toThrow(/between 1 and 256/);
  });

  it('converts lyric timestamps from seconds to milliseconds', async () => {
    // the real parser (not mocked here) returns seconds - the control API is
    // milliseconds, and this is the regression test for that mismatch
    apiMocks.getLyric.mockResolvedValue({
      lrc: { lyric: '[00:01.00]first\n[01:00.00]late' },
      tlyric: { lyric: '[01:00.00]late translation' },
    });
    const lyrics = await handlers.lyrics({ id: 111 });
    expect(lyrics.synced).toBe(true);
    expect(lyrics.items).toEqual([
      { timeMs: 1000, text: 'first', translation: undefined },
      { timeMs: 60000, text: 'late', translation: 'late translation' },
    ]);
  });

  it('sets likes explicitly and reports the real outcome', async () => {
    store.dispatch.mockResolvedValue({ id: 111, liked: true });
    await expect(handlers.like({ id: 111, liked: true })).resolves.toEqual({
      accepted: true,
      id: 111,
      liked: true,
      stale: false,
    });
    expect(store.dispatch).toHaveBeenCalledWith('setTrackLiked', {
      id: 111,
      liked: true,
    });

    // no toggling: the caller has to say what it wants
    await expect(handlers.like({ id: 111 })).rejects.toThrow(
      /liked must be true or false/
    );
    await expect(handlers.like({ id: -1, liked: true })).rejects.toThrow(
      /positive integer/
    );
    await expect(
      handlers.like({ id: 1, liked: true, extra: 1 })
    ).rejects.toThrow(/does not accept/);
  });

  it('propagates the error code when a like fails', async () => {
    const error = Object.assign(new Error('此操作需要登录网易云账号'), {
      code: 'not_logged_in',
    });
    store.dispatch.mockRejectedValue(error);
    await expect(handlers.like({ id: 111, liked: true })).rejects.toMatchObject(
      {
        code: 'not_logged_in',
      }
    );
  });

  it('paginates daily recommendations', async () => {
    apiMocks.dailyRecommendTracks.mockResolvedValue({
      data: {
        dailySongs: Array.from({ length: 7 }, (_, index) => ({
          id: index + 1,
          name: `song ${index + 1}`,
          ar: [{ name: '周杰伦' }],
          al: { name: 'album' },
          dt: 1000,
        })),
      },
    });
    const page = await handlers.recommend({ offset: 2, limit: 3 });
    expect(page).toMatchObject({
      total: 7,
      offset: 2,
      limit: 3,
      nextOffset: 5,
    });
    expect(page.items.map(item => item.id)).toEqual([3, 4, 5]);
    await expect(handlers.recommend({ limit: 257 })).rejects.toThrow(
      /between 1 and 256/
    );
  });

  it('paginates lyrics and search results', async () => {
    apiMocks.getLyric.mockResolvedValue({});
    apiMocks.search.mockResolvedValue({
      result: {
        songs: Array.from({ length: 12 }, (_, index) => ({
          id: index + 1,
          name: `song ${index + 1}`,
          ar: [{ name: 'artist' }],
          al: { name: 'album' },
        })),
      },
    });
    const search = await handlers.search({
      keywords: 'x',
      limit: 5,
      offset: 5,
    });
    expect(search).toMatchObject({
      type: 'song',
      total: 12,
      offset: 5,
      limit: 5,
      nextOffset: 10,
    });
    expect(search.items.map(item => item.id)).toEqual([6, 7, 8, 9, 10]);
    await expect(handlers.search({ keywords: 'x', limit: 51 })).rejects.toThrow(
      /between 1 and 50/
    );
    await expect(handlers.search({ keywords: '' })).rejects.toThrow(
      /non-empty/
    );
    await expect(
      handlers.search({ keywords: 'x', type: 'lyric' })
    ).rejects.toThrow(/type must be one of/);
    await expect(handlers.search({ keywords: 'x', extra: 1 })).rejects.toThrow(
      /does not accept/
    );
  });

  it('validates and dispatches queue move/clear controls', () => {
    handlers.control({ type: 'queueMove', queue: 'priority', from: 0, to: 2 });
    expect(handleMprisCommand).toHaveBeenCalledWith(player, {
      type: 'queueMove',
      queue: 'priority',
      from: 0,
      to: 2,
    });

    handlers.control({ type: 'queueClear', queue: 'upcoming' });
    expect(handleMprisCommand).toHaveBeenCalledWith(player, {
      type: 'queueClear',
      queue: 'upcoming',
    });

    expect(() =>
      handlers.control({ type: 'queueMove', queue: 'playlist', from: 0, to: 1 })
    ).toThrow(/priority/);
    expect(() =>
      handlers.control({
        type: 'queueMove',
        queue: 'priority',
        from: -1,
        to: 0,
      })
    ).toThrow(/priority/);
    expect(() =>
      handlers.control({ type: 'queueClear', queue: 'all' })
    ).toThrow(/priority.*upcoming/);
  });

  describe('assistant surface', () => {
    let assistant;
    let windowStub;

    beforeEach(() => {
      assistant = {
        getPreferences: vi.fn(),
        addRule: vi.fn(),
        removeRule: vi.fn(),
        recordFeedback: vi.fn(),
        listFeedback: vi.fn(),
      };
      windowStub = { electronAPI: { assistant } };
      vi.stubGlobal('window', windowStub);
    });

    it('returns an empty profile when the store bridge is missing', async () => {
      vi.stubGlobal('window', {});
      const profile = await handlers['preferences.get']();
      expect(profile.preferences).toEqual({
        longTerm: [],
        temporary: [],
        session: [],
      });
    });

    it('adds and removes preference rules through the bridge', async () => {
      assistant.addRule.mockResolvedValue({
        id: 'r1',
        rule: '不要现场版',
        source: 'explicit',
      });
      const added = await handlers['preferences.patch']({
        layer: 'longTerm',
        rule: { rule: '不要现场版' },
      });
      expect(added).toMatchObject({ accepted: true, layer: 'longTerm' });
      expect(assistant.addRule).toHaveBeenCalledWith({
        layer: 'longTerm',
        rule: { rule: '不要现场版' },
      });

      assistant.removeRule.mockResolvedValue(true);
      const removed = await handlers['preferences.remove']({
        layer: 'longTerm',
        id: 'r1',
      });
      expect(removed).toEqual({ accepted: true, removed: true });

      await expect(
        handlers['preferences.patch']({ layer: 'forever', rule: { rule: 'x' } })
      ).rejects.toThrow(/longTerm, temporary or session/);
      await expect(
        handlers['preferences.patch']({ layer: 'longTerm', rule: {} })
      ).rejects.toThrow(/non-empty/);
    });

    it('records feedback and lists it with a cursor', async () => {
      assistant.recordFeedback.mockResolvedValue({ type: 'text', at: 1 });
      const accepted = await handlers.feedback({ text: '少点慢歌' });
      expect(accepted.accepted).toBe(true);
      expect(assistant.recordFeedback).toHaveBeenCalledWith({
        type: 'text',
        text: '少点慢歌',
        trackId: undefined,
      });

      await expect(handlers.feedback({ type: 'explode' })).rejects.toThrow(
        /type must be one of/
      );
      await expect(handlers.feedback({})).rejects.toThrow(
        /type must be one of/
      );
      await expect(
        handlers.feedback({ type: 'text', text: '   ' })
      ).rejects.toThrow(/non-empty/);

      assistant.listFeedback.mockResolvedValue([{ type: 'skip' }]);
      const list = await handlers['feedback.list']({ since: 100, limit: 5 });
      expect(list).toEqual({ entries: [{ type: 'skip' }], since: 100 });
      expect(assistant.listFeedback).toHaveBeenCalledWith({
        since: 100,
        limit: 5,
      });
    });
  });
});
