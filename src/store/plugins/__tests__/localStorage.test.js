import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import saveToLocalStorage from '../localStorage';

describe('localStorage store plugin', () => {
  let state;
  let subscriber;
  let store;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    state = {
      settings: { appearance: 'auto' },
      data: { user: { nickname: 'test' } },
    };
    store = {
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

  it('writes data only when data changes', () => {
    subscriber({ type: 'updateData' }, state);
    vi.runAllTimers();

    expect(localStorage.setItem).toHaveBeenCalledTimes(1);
    expect(localStorage.setItem).toHaveBeenCalledWith(
      'data',
      JSON.stringify(state.data)
    );
  });
});
