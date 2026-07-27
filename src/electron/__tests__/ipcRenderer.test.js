import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/store', () => ({
  default: {
    state: {
      player: {},
    },
  },
}));

import { handleMprisCommand } from '@/electron/ipcRenderer';

const createPlayer = () => ({
  isPersonalFM: false,
  pause: vi.fn(),
  play: vi.fn(),
  playing: false,
  playNextFMTrack: vi.fn(),
  playNextTrack: vi.fn(),
  playOrPause: vi.fn(),
  playPrevTrack: vi.fn(),
  seek: vi.fn(() => 10),
  updateMprisState: vi.fn(),
});

describe('MPRIS renderer commands', () => {
  let player;

  beforeEach(() => {
    player = createPlayer();
  });

  it('keeps play and pause idempotent', () => {
    handleMprisCommand(player, { type: 'play' });
    expect(player.play).toHaveBeenCalledOnce();

    player.playing = true;
    handleMprisCommand(player, { type: 'play' });
    handleMprisCommand(player, { type: 'pause' });
    expect(player.play).toHaveBeenCalledOnce();
    expect(player.pause).toHaveBeenCalledOnce();
  });

  it('applies seek, loop, shuffle, volume, and rate values', () => {
    handleMprisCommand(player, { offset: -3, type: 'seek' });
    handleMprisCommand(player, { mode: 'one', type: 'setLoopStatus' });
    handleMprisCommand(player, { enabled: true, type: 'setShuffle' });
    handleMprisCommand(player, { type: 'setVolume', volume: 2 });
    handleMprisCommand(player, { type: 'setRate', rate: 1.5 });

    expect(player.seek).toHaveBeenLastCalledWith(7);
    expect(player.repeatMode).toBe('one');
    expect(player.shuffle).toBe(true);
    expect(player.volume).toBe(1);
    expect(player.playbackRate).toBe(1.5);
    expect(player.updateMprisState.mock.calls).toEqual([
      [{ loopStatus: 'one' }],
      [{ shuffle: true }],
    ]);
  });

  it('reports stopped state after resetting playback', () => {
    handleMprisCommand(player, { type: 'stop' });

    expect(player.pause).toHaveBeenCalledOnce();
    expect(player.seek).toHaveBeenCalledWith(0);
    expect(player.updateMprisState).toHaveBeenCalledWith({
      playing: false,
      position: 0,
      stopped: true,
    });
  });

  it('routes next through personal FM when active', () => {
    player.isPersonalFM = true;
    handleMprisCommand(player, { type: 'next' });

    expect(player.playNextFMTrack).toHaveBeenCalledOnce();
    expect(player.playNextTrack).not.toHaveBeenCalled();
  });
});
