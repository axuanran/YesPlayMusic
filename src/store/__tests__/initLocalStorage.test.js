import { describe, expect, it, vi } from 'vitest';

vi.mock('@/api/audioResolver', () => ({
  getCurrentPageResolverURL: vi.fn(() => '/resolver-api'),
}));

import initLocalStorage from '../initLocalStorage.js';

describe('initial settings', () => {
  it('enables the audio resolver without enabling optional integrations', () => {
    expect(initLocalStorage.settings).toMatchObject({
      enableAmllWsProtocol: false,
      enableDiscordRichPresence: false,
      useAudioResolver: true,
    });
  });
});
