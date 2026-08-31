import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import saveToLocalStorage from '../localStorage';

describe('localStorage store plugin', () => {
  let state;
  let subscriber;
  let store;
  let beforeUnload;

  beforeEach(() => {
    vi.useFakeTimers();
    globalThis.window = {
      addEventListener: vi.fn((event, listener) => {
        if (event === 'beforeunload') beforeUnload = listener;
      }),
    };
    localStorage.clear();
    state = {
      settings: { appearance: 'auto' },
      data: { user: { nickname: 'test' } },
    };
    store = {
      dispatch: vi.fn(),
      state,
      subscribe: vi.fn(callback => {
        subscriber = callback;
      }),
    };
    vi.spyOn(localStorage, 'setItem');
    saveToLocalStorage(store);
  });

  afterEach(() => {
    vi.useRealTimers();
    delete globalThis.window;
  });

  it('does not persist settings or data for unrelated mutations', () => {
    subscriber({ type: 'updateToast' }, state);
    vi.runAllTimers();

    expect(localStorage.setItem).not.toHaveBeenCalled();
  });

  it('persists a settings mutation after the current task', () => {
    state.settings.appearance = 'dark';
    subscriber({ type: 'updateSettings' }, state);

    expect(localStorage.setItem).not.toHaveBeenCalled();
    vi.runAllTimers();

    expect(localStorage.setItem).toHaveBeenCalledTimes(1);
    expect(localStorage.setItem).toHaveBeenCalledWith(
      'settings',
      JSON.stringify(state.settings)
    );
  });

  it('coalesces consecutive settings mutations into one write', () => {
    subscriber({ type: 'updateSettings' }, state);
    state.settings.appearance = 'dark';
    subscriber({ type: 'updateSettings' }, state);
    vi.runAllTimers();

    expect(localStorage.setItem).toHaveBeenCalledTimes(1);
    expect(localStorage.setItem).toHaveBeenCalledWith(
      'settings',
      JSON.stringify({ appearance: 'dark' })
    );
  });

  it('skips a repeated successful value', () => {
    state.settings.appearance = 'dark';
    subscriber({ type: 'updateSettings' }, state);
    vi.runAllTimers();
    subscriber({ type: 'updateSettings' }, state);
    vi.runAllTimers();

    expect(localStorage.setItem).toHaveBeenCalledTimes(1);
  });

  it('retries an unchanged value after a failed write', () => {
    vi.mocked(localStorage.setItem)
      .mockImplementationOnce(() => {
        throw new Error('quota exceeded');
      })
      .mockImplementation(() => {});
    state.settings.appearance = 'dark';

    subscriber({ type: 'updateSettings' }, state);
    vi.runAllTimers();
    subscriber({ type: 'updateSettings' }, state);
    vi.runAllTimers();

    expect(localStorage.setItem).toHaveBeenCalledTimes(2);
  });

  it('writes data only when data changes', () => {
    subscriber({ type: 'updateData' }, state);
    vi.runAllTimers();

    expect(localStorage.setItem).toHaveBeenCalledTimes(1);
    expect(localStorage.setItem).toHaveBeenCalledWith(
      'data',
      JSON.stringify(state.data)
    );
  });

  it('flushes pending state before the page unloads', () => {
    state.settings.appearance = 'dark';
    subscriber({ type: 'updateSettings' }, state);

    beforeUnload();

    expect(localStorage.setItem).toHaveBeenCalledWith(
      'settings',
      JSON.stringify(state.settings)
    );
  });
  it('deduplicates errors until a successful persistence cycle', () => {
    let shouldFail = true;
    vi.mocked(localStorage.setItem).mockImplementation(() => {
      if (shouldFail) throw new Error('quota exceeded');
    });

    subscriber({ type: 'updateSettings' }, state);
    vi.runAllTimers();
    subscriber({ type: 'updateData' }, state);
    vi.runAllTimers();
    expect(store.dispatch).toHaveBeenCalledTimes(1);

    shouldFail = false;
    subscriber({ type: 'updateSettings' }, state);
    vi.runAllTimers();
    shouldFail = true;
    subscriber({ type: 'updateData' }, state);
    vi.runAllTimers();

    expect(store.dispatch).toHaveBeenCalledTimes(2);
  });

  it('reports persistence failures without rolling back current state', () => {
    const error = new Error('quota exceeded');
    vi.mocked(localStorage.setItem).mockImplementation(() => {
      throw error;
    });
    state.settings.appearance = 'dark';

    subscriber({ type: 'updateSettings' }, state);
    vi.runAllTimers();

    expect(state.settings.appearance).toBe('dark');
    expect(store.dispatch).toHaveBeenCalledWith(
      'showToast',
      expect.stringContaining('下次启动可能无法保留')
    );
  });
});
