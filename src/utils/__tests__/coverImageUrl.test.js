import { describe, expect, it } from 'vitest';
import { createSizedCoverUrl } from '../coverImageUrl';

describe('cover image URLs', () => {
  it('keeps loopback media URLs on HTTP', () => {
    expect(
      createSizedCoverUrl(
        'http://127.0.0.1:20201/local-music/local%3Atrack/artwork?v=1',
        320
      )
    ).toBe(
      'http://127.0.0.1:20201/local-music/local%3Atrack/artwork?v=1&param=320y320'
    );
    expect(
      createSizedCoverUrl('http://localhost:20201/local-music/artwork', 320)
    ).toBe('http://localhost:20201/local-music/artwork?param=320y320');
  });

  it('upgrades remote HTTP covers to HTTPS', () => {
    expect(createSizedCoverUrl('http://example.com/cover.jpg', 320)).toBe(
      'https://example.com/cover.jpg?param=320y320'
    );
  });
});
