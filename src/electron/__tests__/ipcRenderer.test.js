import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/store', () => ({
  default: {
    state: {
      player: {},
    },
  },
}));

import { handleMprisCommand } from '@/electron/ipcRenderer';
import { castState } from '@/utils/cast';

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

// While a device is selected the audible renderer is the remote one: commands
// that arrive from the desktop-lyrics overlay / MPRIS must reach it instead of
// the muted local <audio> element (which is what "the volume slider only
// controls local playback" used to mean).
describe('MPRIS renderer commands while casting', () => {
  let player;

  beforeEach(() => {
    player = createPlayer();
    // the daemon is not running in tests: answer every request successfully so
    // the optimistic state mirrors (markActive) still run
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          json: () => Promise.resolve({ ok: true, data: null }),
        })
      )
    );
    castState.selected = ['upnp:test'];
    castState.volume = 1;
    castState.statuses = { 'upnp:test': { state: 'playing', position_ms: 0 } };
    castState.active = { 'upnp:test': true };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    castState.selected = [];
    castState.statuses = {};
    castState.active = {};
  });

  it('moves the device volume, never the local element', () => {
    handleMprisCommand(player, { type: 'setVolume', volume: 0.4 });

    expect(castState.volume).toBe(0.4);
    expect(player.volume).toBeUndefined();
  });

  it('seeks the device timeline instead of the local clock', () => {
    castState.statuses['upnp:test'].position_ms = 30000;

    handleMprisCommand(player, { type: 'seek', offset: -5 });

    expect(castState.statuses['upnp:test'].position_ms).toBe(25000);
    // the muted conductor follows in seconds, guarded off the track end
    expect(player.progress).toBe(25);
  });

  it('pauses the device for a pause command', async () => {
    handleMprisCommand(player, { type: 'pause' });
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(castState.active['upnp:test']).toBe(false);
    expect(player.volume).toBeUndefined();
  });
});
