import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSendSettingsPlugin } from '../sendSettings';

describe('sendSettings store plugin', () => {
  let state;
  let subscriber;
  let updateSettings;

  beforeEach(() => {
    vi.useFakeTimers();
    updateSettings = vi.fn();
    globalThis.window = {
      electronAPI: {
        settings: { updateSettings },
      },
    };
    state = {
      settings: {
        appearance: 'auto',
        desktopLyrics: { enabled: true },
      },
    };
    const store = {
      subscribe: vi.fn(callback => {
        subscriber = callback;
      }),
    };
    getSendSettingsPlugin()(store);
  });

  afterEach(() => {
    vi.useRealTimers();
    delete globalThis.window;
  });

  it('ignores unrelated mutations', () => {
    subscriber({ type: 'updateToast' }, state);
    vi.runAllTimers();

    expect(updateSettings).not.toHaveBeenCalled();
  });

  it('sends only the changed setting after the current task', () => {
    subscriber(
      { payload: { key: 'appearance' }, type: 'updateSettings' },
      state
    );

    expect(updateSettings).not.toHaveBeenCalled();
    vi.runAllTimers();

    expect(updateSettings).toHaveBeenCalledTimes(1);
    expect(updateSettings).toHaveBeenCalledWith({ appearance: 'auto' });
  });

  it('coalesces changed keys and sends their latest values', () => {
    subscriber(
      { payload: { key: 'appearance' }, type: 'updateSettings' },
      state
    );
    state.settings.appearance = 'dark';
    subscriber(
      { payload: { key: 'desktopLyrics' }, type: 'updateSettings' },
      state
    );
    vi.runAllTimers();

    expect(updateSettings).toHaveBeenCalledTimes(1);
    expect(updateSettings).toHaveBeenCalledWith({
      appearance: 'dark',
      desktopLyrics: { enabled: true },
    });
  });

  it('includes the plugins object changed with the resolver switch', () => {
    state.settings.useAudioResolver = true;
    state.settings.plugins = {
      'resolver-admin': { enabled: true },
    };

    subscriber(
      { payload: { key: 'useAudioResolver' }, type: 'updateSettings' },
      state
    );
    vi.runAllTimers();

    expect(updateSettings).toHaveBeenCalledWith({
      plugins: {
        'resolver-admin': { enabled: true },
      },
      useAudioResolver: true,
    });
  });
});
