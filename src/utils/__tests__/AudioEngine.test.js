import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import AudioEngine from '../AudioEngine';

class FakeAudio {
  constructor() {
    this.currentTime = 0;
    this.duration = 180;
    this.ended = false;
    this.paused = true;
    this.volume = 1;
  }

  addEventListener() {}
  load() {}
  pause() {
    this.paused = true;
  }
}

describe('AudioEngine fades', () => {
  let animationFrames;

  beforeEach(() => {
    vi.useFakeTimers();
    animationFrames = [];
    vi.stubGlobal('Audio', FakeAudio);
    vi.stubGlobal('requestAnimationFrame', callback => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
    vi.spyOn(performance, 'now').mockReturnValue(0);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('prevents a stale fade from overwriting a newer volume intent', async () => {
    const engine = new AudioEngine();
    const staleFade = engine.fade(1, 0, 200);

    await engine.fade(0, 1, 0);
    animationFrames.shift()(200);
    await staleFade;

    expect(engine.volume()).toBe(1);
  });

  it('cancels an active fade when a new source loads', async () => {
    const engine = new AudioEngine();
    const staleFade = engine.fade(1, 0, 200);

    engine.load('https://example.test/next.mp3', 2);
    engine.volume(0.7);
    animationFrames.shift()(200);
    await staleFade;

    expect(engine.volume()).toBe(0.7);
  });
});
