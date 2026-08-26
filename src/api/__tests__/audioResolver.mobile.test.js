import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  clearAudioProviderCache: vi.fn(),
}));

vi.mock('axios', () => ({
  default: {
    create: vi.fn(),
  },
}));

vi.mock('@/plugins/providers/audio/registry', () => ({
  clearAudioProviderCache: mocks.clearAudioProviderCache,
}));

vi.mock('@/utils/env', () => ({
  isCapacitor: true,
  isElectron: false,
}));

import {
  getResolverConfig,
  isResolverEnabled,
  normalizeEmbeddedResolverConfig,
  updateResolverConfig,
} from '../audioResolver.js';

describe('Android embedded resolver configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    delete globalThis.yesplaymusicStore;
  });

  afterEach(() => {
    delete globalThis.yesplaymusicStore;
  });

  it('normalizes missing mobile controls to usable defaults', () => {
    expect(normalizeEmbeddedResolverConfig({})).toEqual({
      audio: {
        cacheTtl: 300,
        fallbackToLegacy: true,
        mobile: {
          neteaseEnabled: true,
          outerUrlFallback: true,
        },
      },
    });
  });

  it('reads the resolver enabled state from the live Vuex settings', () => {
    localStorage.setItem(
      'settings',
      JSON.stringify({ useAudioResolver: false })
    );
    globalThis.yesplaymusicStore = {
      state: {
        settings: {
          useAudioResolver: true,
        },
      },
    };

    expect(isResolverEnabled()).toBe(true);
  });

  it('persists mobile config through updateSettings and clears stale cache', async () => {
    const settings = {
      useAudioResolver: true,
    };
    const commit = vi.fn((type, payload) => {
      expect(type).toBe('updateSettings');
      settings[payload.key] = payload.value;
    });
    globalThis.yesplaymusicStore = {
      state: { settings },
      commit,
    };

    const requested = {
      audio: {
        cacheTtl: 0,
        fallbackToLegacy: false,
        mobile: {
          neteaseEnabled: false,
          outerUrlFallback: true,
        },
      },
    };

    await expect(updateResolverConfig(requested)).resolves.toEqual({
      ok: true,
      config: requested,
      embedded: true,
    });
    expect(commit).toHaveBeenCalledWith('updateSettings', {
      key: 'embeddedResolverConfig',
      value: requested,
    });
    expect(mocks.clearAudioProviderCache).toHaveBeenCalledTimes(1);
    await expect(getResolverConfig()).resolves.toEqual({
      ok: true,
      config: requested,
      embedded: true,
    });
  });
});
