import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const listeners = new Map();
  return {
    listeners,
    plugin: {
      addListener: vi.fn((event, listener) => {
        listeners.set(event, listener);
        return Promise.resolve({ remove: vi.fn() });
      }),
      getState: vi.fn(() => Promise.resolve({ token: 0, playing: false })),
      load: vi.fn(() => Promise.resolve({ token: 7, playing: false })),
      play: vi.fn(() => Promise.resolve({ token: 7, playing: true })),
      pause: vi.fn(() => Promise.resolve()),
      stop: vi.fn(() => Promise.resolve()),
      cache: vi.fn(() => Promise.resolve({ started: true })),
      setCacheEnabled: vi.fn(() => Promise.resolve({ enabled: true })),
      queueNext: vi.fn(() => Promise.resolve({ queuedMediaId: '43' })),
      clearNext: vi.fn(() => Promise.resolve()),
      seek: vi.fn(() => Promise.resolve()),
      setVolume: vi.fn(() => Promise.resolve()),
      setPlaybackRate: vi.fn(() => Promise.resolve()),
    },
  };
});

vi.mock('@capacitor/core', () => ({
  registerPlugin: vi.fn(() => mocks.plugin),
}));

import AndroidAudioEngine from '../AndroidAudioEngine';

describe('AndroidAudioEngine', () => {
  beforeEach(() => {
    mocks.listeners.clear();
    vi.clearAllMocks();
    mocks.plugin.getState.mockResolvedValue({ token: 0, playing: false });
    mocks.plugin.load.mockResolvedValue({ token: 7, playing: false });
    mocks.plugin.play.mockResolvedValue({ token: 7, playing: true });
    globalThis.yesplaymusicStore = undefined;
    globalThis.__yesplaymusicLastPlaybackError__ = undefined;
    try {
      localStorage.setItem(
        'settings',
        JSON.stringify({
          musicQuality: 'exhigh',
          automaticallyCacheSongs: true,
        })
      );
      localStorage.removeItem('android-last-playback-error');
    } catch {
      // Some non-browser test environments do not expose localStorage.
    }
  });

  it('loads metadata and cache policy before starting native playback', async () => {
    const engine = new AndroidAudioEngine();
    engine.load('https://example.test/song.mp3', 7, {
      id: '42',
      title: 'Track',
      artist: 'Artist',
      duration: 180,
    });
    await engine.play();

    expect(mocks.plugin.load).toHaveBeenCalledWith({
      source: 'https://example.test/song.mp3',
      token: 7,
      reuseIfSame: true,
      reuseActiveSession: true,
      track: {
        id: '42',
        title: 'Track',
        artist: 'Artist',
        album: '',
        artwork: '',
        duration: 180,
        quality: 'exhigh',
        cacheEnabled: true,
        cacheKey: 'track:v2:42:exhigh',
      },
    });
    expect(mocks.plugin.play).toHaveBeenCalledOnce();
  });

  it('mirrors native progress into the synchronous player API', async () => {
    const onTimeUpdate = vi.fn();
    const engine = new AndroidAudioEngine({ onTimeUpdate });
    engine.load('https://example.test/song.mp3', 7);
    await engine._ready;

    mocks.listeners.get('timeUpdate')({
      token: 7,
      playing: true,
      position: 12.5,
      duration: 200,
    });

    expect(engine.playing()).toBe(true);
    expect(engine.currentTime()).toBe(12.5);
    expect(engine.duration()).toBe(200);
    expect(onTimeUpdate).toHaveBeenCalledWith(7);
  });

  it('forwards headset next and previous commands to Player callbacks', async () => {
    const onNext = vi.fn();
    const onPrevious = vi.fn();
    const engine = new AndroidAudioEngine({ onNext, onPrevious });
    engine.load('https://example.test/song.mp3', 7);
    await engine._ready;

    mocks.listeners.get('command')({ token: 7, action: 'next' });
    mocks.listeners.get('command')({ token: 7, action: 'previous' });

    expect(onNext).toHaveBeenCalledWith(7);
    expect(onPrevious).toHaveBeenCalledWith(7);
  });

  it('ignores callbacks from superseded audio tokens', async () => {
    const onEnded = vi.fn();
    const engine = new AndroidAudioEngine({ onEnded });
    engine.load('https://example.test/song.mp3', 7);
    await engine._ready;

    mocks.listeners.get('ended')({ token: 6, position: 180 });

    expect(onEnded).not.toHaveBeenCalled();
  });

  it('restores native volume and playback rate on initial connection', async () => {
    mocks.plugin.getState.mockResolvedValueOnce({
      token: 0,
      playing: false,
      volume: 0.4,
      playbackRate: 1.25,
    });
    const engine = new AndroidAudioEngine();

    await engine._ready;

    expect(engine.volume()).toBe(0.4);
    expect(engine.playbackRate()).toBe(1.25);
  });

  it('preserves normalized native error details', async () => {
    const onError = vi.fn();
    const engine = new AndroidAudioEngine({ onError });
    engine.load('https://example.test/song.mp3', 7);
    await engine._ready;

    mocks.listeners.get('error')({
      token: 7,
      code: 4,
      nativeCode: 4005,
      kind: 'unsupported',
      message: 'Unsupported format',
    });

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 4,
        nativeCode: 4005,
        kind: 'unsupported',
      }),
      7
    );
  });

  it('shows actionable diagnostics for native network failures', async () => {
    const onError = vi.fn();
    const dispatch = vi.fn();
    globalThis.yesplaymusicStore = { dispatch };
    const engine = new AndroidAudioEngine({ onError });
    engine.load('https://m1.music.126.net/song.mp3?token=secret', 7);
    await engine._ready;

    mocks.listeners.get('error')({
      token: 7,
      code: 2,
      nativeCode: 2004,
      httpStatus: 403,
      kind: 'network',
      message: 'Source error',
      cause: 'InvalidResponseCodeException',
      detail: 'Response code: 403',
      source: 'https://m1.music.126.net/song.mp3?token=secret',
    });

    expect(dispatch).toHaveBeenCalledWith(
      'showToast',
      expect.stringContaining('HTTP 403')
    );
    expect(dispatch).toHaveBeenCalledWith(
      'showToast',
      expect.stringContaining('Media3 2004')
    );
    expect(dispatch).toHaveBeenCalledWith(
      'showToast',
      expect.stringContaining('https://m1.music.126.net')
    );
    expect(globalThis.__yesplaymusicLastPlaybackError__).toEqual(
      expect.objectContaining({
        nativeCode: 2004,
        httpStatus: 403,
        kind: 'network',
        cause: 'InvalidResponseCodeException',
        sourceHost: 'https://m1.music.126.net',
      })
    );
    expect(onError).toHaveBeenCalledOnce();
  });

  it('reports bridge load failures and does not call native play afterward', async () => {
    const dispatch = vi.fn();
    globalThis.yesplaymusicStore = { dispatch };
    mocks.plugin.load.mockRejectedValueOnce(
      new Error('controller unavailable')
    );
    const engine = new AndroidAudioEngine();

    engine.load('https://example.test/song.mp3', 7, { id: '42' });
    await engine.play();

    expect(mocks.plugin.play).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith(
      'showToast',
      expect.stringContaining('controller unavailable')
    );
    expect(globalThis.__yesplaymusicLastPlaybackError__).toEqual(
      expect.objectContaining({
        kind: 'bridge',
        phase: 'load',
      })
    );
  });

  it('keeps the native position when reconnecting to the same track', async () => {
    mocks.plugin.load.mockResolvedValueOnce({
      token: 7,
      playing: false,
      position: 48,
      duration: 180,
      reused: true,
    });
    const engine = new AndroidAudioEngine();

    engine.load('https://example.test/song.mp3', 7, { id: '42' });
    engine.seek(5);
    await engine._loadPromise;
    await Promise.resolve();

    expect(engine.currentTime()).toBe(48);
    expect(mocks.plugin.seek).not.toHaveBeenCalled();
  });

  it('only requests native-session reuse for the first load', async () => {
    const engine = new AndroidAudioEngine();

    await engine.load('https://example.test/one.mp3', 7, { id: '1' });
    await engine.load('https://example.test/two.mp3', 8, { id: '2' });

    expect(mocks.plugin.load).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        reuseIfSame: true,
        reuseActiveSession: true,
      })
    );
    expect(mocks.plugin.load).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        reuseIfSame: false,
        reuseActiveSession: false,
      })
    );
  });

  it('prefetches tracks with a quality-scoped native cache key', async () => {
    const engine = new AndroidAudioEngine();

    await engine.cacheSource('https://example.test/expiring.mp3', {
      id: 42,
      name: 'Track',
      cacheQuality: 'lossless',
    });

    expect(mocks.plugin.cache).toHaveBeenCalledWith({
      source: 'https://example.test/expiring.mp3',
      cacheKey: 'track:v2:42:lossless',
      track: expect.objectContaining({
        id: '42',
        quality: 'lossless',
        cacheKey: 'track:v2:42:lossless',
      }),
    });
  });

  it('uses different cache keys for different qualities of the same track', async () => {
    const engine = new AndroidAudioEngine();

    await engine.cacheSource('https://example.test/standard.mp3', {
      id: 42,
      cacheQuality: 'standard',
    });
    await engine.cacheSource('https://example.test/lossless.flac', {
      id: 42,
      cacheQuality: 'lossless',
    });

    expect(mocks.plugin.cache).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ cacheKey: 'track:v2:42:standard' })
    );
    expect(mocks.plugin.cache).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ cacheKey: 'track:v2:42:lossless' })
    );
  });

  it('does not start a second download for the currently playing source', async () => {
    const engine = new AndroidAudioEngine();
    const track = { id: 42, name: 'Track' };

    engine.load('https://example.test/song.mp3', 7, track);
    const result = await engine.cacheSource(
      'https://example.test/song.mp3',
      track
    );

    expect(result).toEqual({
      writeThrough: true,
      cacheKey: 'track:v2:42:exhigh',
    });
    expect(mocks.plugin.cache).not.toHaveBeenCalled();
  });

  it('skips native prefetch when automatic caching is disabled', async () => {
    try {
      localStorage.setItem(
        'settings',
        JSON.stringify({
          musicQuality: 'exhigh',
          automaticallyCacheSongs: false,
        })
      );
    } catch {
      // Some non-browser test environments do not expose localStorage.
    }
    const engine = new AndroidAudioEngine();

    await engine.cacheSource('https://example.test/song.mp3', { id: 42 });

    expect(mocks.plugin.cache).not.toHaveBeenCalled();
  });

  it('skips native prefetch when the track has no stable id', async () => {
    const engine = new AndroidAudioEngine();

    await engine.cacheSource('https://example.test/song.mp3');

    expect(mocks.plugin.cache).not.toHaveBeenCalled();
  });

  it('queues the next resolved source with native metadata and cache identity', async () => {
    const engine = new AndroidAudioEngine();
    const track = {
      id: 43,
      name: 'Next Track',
      ar: [{ name: 'Next Artist' }],
      al: { name: 'Next Album', picUrl: 'https://example.test/cover.jpg' },
      dt: 210000,
    };

    await engine.queueNextSource('https://example.test/next.mp3', track);

    expect(mocks.plugin.queueNext).toHaveBeenCalledWith({
      source: 'https://example.test/next.mp3',
      track: {
        id: '43',
        title: 'Next Track',
        artist: 'Next Artist',
        album: 'Next Album',
        artwork: 'https://example.test/cover.jpg',
        duration: 210,
        quality: 'exhigh',
        cacheEnabled: true,
        cacheKey: 'track:v2:43:exhigh',
      },
    });
  });

  it('maps native media transitions back to the queued UI track', async () => {
    const onTrackTransition = vi.fn();
    const engine = new AndroidAudioEngine({ onTrackTransition });
    const track = { id: 43, name: 'Next Track' };
    await engine.queueNextSource('https://example.test/next.mp3', track);
    await engine._ready;

    mocks.listeners.get('mediaItemTransition')({
      token: 0,
      mediaId: '43',
      reason: 'auto',
      source: 'https://example.test/next.mp3',
    });

    expect(onTrackTransition).toHaveBeenCalledWith(
      {
        mediaId: '43',
        reason: 'auto',
        source: 'https://example.test/next.mp3',
        track,
      },
      0
    );
  });

  it('adopts a different active native track on first reconnect', async () => {
    mocks.plugin.load.mockResolvedValueOnce({
      token: 7,
      playing: true,
      mediaId: '99',
      source: 'https://example.test/native.mp3',
      reused: true,
    });
    const onTrackTransition = vi.fn();
    const engine = new AndroidAudioEngine({ onTrackTransition });

    await engine.load('https://example.test/stale.mp3', 7, { id: '42' });

    expect(onTrackTransition).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaId: '99',
        reason: 'resume',
        source: 'https://example.test/native.mp3',
      }),
      7
    );
  });
});
