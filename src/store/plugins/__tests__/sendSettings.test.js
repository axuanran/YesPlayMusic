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

  it('sends settings only after the current task', () => {
    subscriber({ type: 'updateSettings' }, state);

    expect(updateSettings).not.toHaveBeenCalled();
    vi.runAllTimers();

    expect(updateSettings).toHaveBeenCalledTimes(1);
    expect(updateSettings).toHaveBeenCalledWith(state.settings);
  });

  it('coalesces consecutive setting updates and sends the latest state', () => {
    subscriber({ type: 'updateSettings' }, state);
    state.settings.appearance = 'dark';
    subscriber({ type: 'updateSettings' }, state);
    vi.runAllTimers();

    expect(updateSettings).toHaveBeenCalledTimes(1);
    expect(updateSettings).toHaveBeenCalledWith({
      appearance: 'dark',
      desktopLyrics: { enabled: true },
    });
  });
});
