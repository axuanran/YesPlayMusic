import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class MockMprisPlayer {
    constructor(options) {
      this.options = options;
      this.handlers = new Map();
      this.objectPath = value => `/org/mpris/MediaPlayer2/${value}`;
      this.removeListener = vi.fn((event, handler) => {
        const handlers = this.handlers.get(event) || [];
        this.handlers.set(
          event,
          handlers.filter(item => item !== handler)
        );
      });
      result.players.push(this);
    }

    on(event, handler) {
      const handlers = this.handlers.get(event) || [];
      handlers.push(handler);
      this.handlers.set(event, handlers);
      return this;
    }

    emit(event, ...args) {
      for (const handler of this.handlers.get(event) || []) handler(...args);
    }
  }

  const result = {
    app: {
      quit: vi.fn(),
    },
    ipcHandlers: new Map(),
    ipcMain: {
      on: vi.fn((channel, handler) => result.ipcHandlers.set(channel, handler)),
      removeListener: vi.fn((channel, handler) => {
        if (result.ipcHandlers.get(channel) === handler) {
          result.ipcHandlers.delete(channel);
        }
      }),
    },
    players: [],
    MockMprisPlayer,
  };

  return result;
});

vi.mock('electron', () => ({
  app: mocks.app,
  ipcMain: mocks.ipcMain,
}));

vi.mock('@jellybrick/mpris-service', () => ({
  default: mocks.MockMprisPlayer,
}));

import { createMpris } from '@/electron/mpris';

const metadata = {
  album: 'Album',
  asText: 'First line\nSecond line',
  artist: ['Artist A', 'Artist B'],
  artwork: 'https://example.com/cover.jpg',
  length: 180,
  title: 'Track',
  trackId: 42,
  url: 'https://music.163.com/song?id=42',
};

describe('MPRIS service', () => {
  let window;

  beforeEach(() => {
    vi.useRealTimers();
    mocks.app.quit.mockClear();
    mocks.ipcHandlers.clear();
    mocks.ipcMain.on.mockClear();
    mocks.ipcMain.removeListener.mockClear();
    mocks.players.length = 0;
    window = {
      isDestroyed: vi.fn(() => false),
      isMinimized: vi.fn(() => false),
      focus: vi.fn(),
      restore: vi.fn(),
      show: vi.fn(),
      webContents: {
        isDestroyed: vi.fn(() => false),
        send: vi.fn(),
      },
    };
  });

  it('publishes playback state and metadata from one IPC channel', () => {
    createMpris(window);
    const player = mocks.players[0];

    expect(player.options).toMatchObject({
      name: 'xump',
      identity: 'XuMP',
      desktopEntry: 'xump',
      supportedInterfaces: ['player'],
    });

    mocks.ipcHandlers.get('mpris:update')(
      {},
      {
        loopStatus: 'one',
        metadata,
        playing: true,
        position: 12,
        rate: 1.25,
        shuffle: true,
        volume: 0.75,
      }
    );

    expect(player.playbackStatus).toBe('Playing');
    expect(player.loopStatus).toBe('Track');
    expect(player.shuffle).toBe(true);
    expect(player.rate).toBe(1.25);
    expect(player.volume).toBe(0.75);
    expect(player.metadata).toEqual({
      'mpris:artUrl': metadata.artwork,
      'mpris:length': 180_000_000,
      'mpris:trackid': '/org/mpris/MediaPlayer2/track/42',
      'xesam:album': metadata.album,
      'xesam:asText': metadata.asText,
      'xesam:artist': metadata.artist,
      'xesam:title': metadata.title,
      'xesam:url': metadata.url,
    });
    expect(player.getPosition()).toBeGreaterThanOrEqual(12_000_000);
  });

  it('updates lyrics only for the current track', () => {
    createMpris(window);
    const player = mocks.players[0];
    const update = mocks.ipcHandlers.get('mpris:update');

    update({}, { metadata: { ...metadata, asText: '' } });
    update(
      {},
      {
        lyrics: {
          text: 'Current lyrics',
          trackId: metadata.trackId,
        },
      }
    );
    expect(player.metadata['xesam:asText']).toBe('Current lyrics');

    update(
      {},
      {
        lyrics: {
          text: 'Stale lyrics',
          trackId: 'old-track',
        },
      }
    );
    expect(player.metadata['xesam:asText']).toBe('Current lyrics');

    update({}, { lyrics: { text: '', trackId: metadata.trackId } });
    expect(player.metadata).not.toHaveProperty('xesam:asText');
  });

  it('applies lyrics that arrive before the initial metadata', () => {
    createMpris(window);
    const player = mocks.players[0];
    const update = mocks.ipcHandlers.get('mpris:update');

    update(
      {},
      {
        lyrics: {
          text: 'Early lyrics',
          trackId: metadata.trackId,
        },
      }
    );
    update({}, { metadata: { ...metadata, asText: '' } });

    expect(player.metadata['xesam:asText']).toBe('Early lyrics');
  });

  it('maps MPRIS controls to explicit renderer commands', () => {
    createMpris(window);
    const player = mocks.players[0];

    player.emit('play');
    player.emit('pause');
    player.emit('playpause');
    player.emit('stop');
    player.emit('next');
    player.emit('previous');
    player.emit('seek', 5_000_000);
    player.emit('position', { position: 20_000_000 });
    player.emit('loopStatus', 'Playlist');
    player.emit('shuffle', true);
    player.emit('volume', 0.4);
    player.emit('rate', 1.5);

    expect(window.webContents.send.mock.calls).toEqual([
      ['mpris:command', { type: 'play' }],
      ['mpris:command', { type: 'pause' }],
      ['mpris:command', { type: 'playPause' }],
      ['mpris:command', { type: 'stop' }],
      ['mpris:command', { type: 'next' }],
      ['mpris:command', { type: 'previous' }],
      ['mpris:command', { offset: 5, type: 'seek' }],
      ['mpris:command', { position: 20, type: 'setPosition' }],
      ['mpris:command', { mode: 'on', type: 'setLoopStatus' }],
      ['mpris:command', { enabled: true, type: 'setShuffle' }],
      ['mpris:command', { type: 'setVolume', volume: 0.4 }],
      ['mpris:command', { rate: 1.5, type: 'setRate' }],
    ]);
  });

  it('interpolates position while playing and freezes it while paused', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-14T00:00:00Z'));
    createMpris(window);
    const player = mocks.players[0];
    const update = mocks.ipcHandlers.get('mpris:update');

    update({}, { playing: true, position: 10 });
    vi.advanceTimersByTime(2500);
    expect(player.getPosition()).toBe(12_500_000);

    update({}, { playing: false, position: 12.5 });
    vi.advanceTimersByTime(2500);
    expect(player.getPosition()).toBe(12_500_000);
  });

  it('keeps Stopped after the asynchronous pause update arrives', () => {
    createMpris(window);
    const player = mocks.players[0];
    const update = mocks.ipcHandlers.get('mpris:update');

    update({}, { playing: false, position: 0, stopped: true });
    update({}, { playing: false, position: 0 });

    expect(player.playbackStatus).toBe('Stopped');
    update({}, { playing: true, position: 0 });
    expect(player.playbackStatus).toBe('Playing');
  });

  it('ignores SetPosition for a stale track', () => {
    createMpris(window);
    const player = mocks.players[0];
    mocks.ipcHandlers.get('mpris:update')({}, { metadata });

    player.emit('position', {
      position: 20_000_000,
      trackId: '/org/mpris/MediaPlayer2/track/old',
    });

    expect(window.webContents.send).not.toHaveBeenCalled();
  });

  it('raises, quits, and removes listeners on dispose', () => {
    window.isMinimized.mockReturnValue(true);
    const service = createMpris(window);
    const player = mocks.players[0];

    player.emit('raise');
    player.emit('quit');
    service.dispose();

    expect(window.restore).toHaveBeenCalledOnce();
    expect(window.show).toHaveBeenCalledOnce();
    expect(window.focus).toHaveBeenCalledOnce();
    expect(mocks.app.quit).toHaveBeenCalledOnce();
    expect(mocks.ipcMain.removeListener).toHaveBeenCalledWith(
      'mpris:update',
      expect.any(Function)
    );
    expect(player.removeListener).toHaveBeenCalledWith(
      'play',
      expect.any(Function)
    );
  });
});
