import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSendSettingsPlugin } from '../sendSettings';

describe('sendSettings store plugin', () => {
  let state;
  let subscriber;
  let updateSettings;
  let store;
  let beforeUnload;

  beforeEach(() => {
    vi.useFakeTimers();
    updateSettings = vi.fn();
    globalThis.window = {
      addEventListener: vi.fn((event, listener) => {
        if (event === 'beforeunload') beforeUnload = listener;
      }),
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
    store = {
      dispatch: vi.fn(),
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

  it('flushes pending settings before the page unloads', () => {
    subscriber(
      { payload: { key: 'appearance' }, type: 'updateSettings' },
      state
    );

    beforeUnload();

    expect(updateSettings).toHaveBeenCalledWith({ appearance: 'auto' });
  });

  it('reports Electron persistence failures without reverting state', () => {
    updateSettings.mockImplementation(() => {
      throw new Error('ipc unavailable');
    });
    state.settings.appearance = 'dark';

    subscriber(
      { payload: { key: 'appearance' }, type: 'updateSettings' },
      state
    );
    vi.runAllTimers();

    expect(state.settings.appearance).toBe('dark');
    expect(store.dispatch).toHaveBeenCalledWith(
      'showToast',
      expect.stringContaining('下次启动可能无法保留')
    );
  });
});
