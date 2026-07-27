import { describe, expect, it, vi } from 'vitest';

vi.mock('@/locale', () => ({
  default: {
    global: { locale: 'en' },
  },
}));

import { filters } from '../filters.js';

describe('image resizing filter', () => {
  it('keeps local music artwork on the loopback HTTP origin', () => {
    const artwork = 'http://127.0.0.1:3210/local-music/local%3Atrack/artwork';

    expect(filters.resizeImage(artwork, 224)).toBe(`${artwork}?param=224y224`);
  });

  it('keeps streaming artwork on the credential-hiding proxy origin', () => {
    const artwork =
      'http://127.0.0.1:3210/streaming/connection/items/item/image';

    expect(filters.resizeImage(artwork, 512)).toBe(`${artwork}?param=512y512`);
  });

  it('continues upgrading remote artwork to HTTPS', () => {
    expect(filters.resizeImage('http://example.com/cover.jpg', 224)).toBe(
      'https://example.com/cover.jpg?param=224y224'
    );
  });
});
