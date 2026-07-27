import { describe, expect, it } from 'vitest';
import { createDiscordPresenceTrack } from '../discordPresencePayload.js';

describe('Discord presence track payload', () => {
  it('copies only cloneable Discord fields from a proxied track', () => {
    const track = new Proxy(
      {
        name: 'Song',
        dt: 180000,
        ar: [{ id: 1, name: 'Artist', extra: () => null }],
        al: { id: 2, name: 'Album', picUrl: 'https://example.test/cover' },
        uncloneable: () => null,
      },
      {}
    );

    const payload = createDiscordPresenceTrack(track);

    expect(payload).toEqual({
      name: 'Song',
      dt: 180000,
      ar: [{ name: 'Artist' }],
      al: {
        name: 'Album',
        picUrl: 'https://example.test/cover',
      },
    });
    expect(() => structuredClone(payload)).not.toThrow();
  });

  it('normalizes missing and invalid fields', () => {
    expect(
      createDiscordPresenceTrack({
        dt: Number.NaN,
        ar: null,
        al: null,
      })
    ).toEqual({
      name: '',
      dt: 0,
      ar: [],
      al: { name: '', picUrl: '' },
    });
  });
});
