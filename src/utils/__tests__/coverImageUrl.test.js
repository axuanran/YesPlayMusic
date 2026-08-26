import { describe, expect, it } from 'vitest';
import { createSizedCoverUrl, resolveCoverImageUrl } from '../coverImageUrl';

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

  it('upgrades remote HTTP and protocol-relative covers to HTTPS', () => {
    expect(createSizedCoverUrl('http://example.com/cover.jpg', 320)).toBe(
      'https://example.com/cover.jpg?param=320y320'
    );
    expect(resolveCoverImageUrl('//p1.music.126.net/cover.jpg')).toBe(
      'https://p1.music.126.net/cover.jpg'
    );
  });

  it('resolves web and Android Netease response shapes', () => {
    expect(resolveCoverImageUrl({ al: { picUrl: 'http://a/1.jpg' } })).toBe(
      'https://a/1.jpg'
    );
    expect(
      resolveCoverImageUrl({ album: { picUrl: 'http://a/2.jpg' } })
    ).toBe('https://a/2.jpg');
    expect(
      resolveCoverImageUrl({ simpleSong: { al: { picUrl: 'http://a/3.jpg' } } })
    ).toBe('https://a/3.jpg');
    expect(resolveCoverImageUrl({ coverImgUrl: 'http://a/4.jpg' })).toBe(
      'https://a/4.jpg'
    );
  });

  it('replaces an existing Netease size parameter instead of duplicating it', () => {
    expect(
      createSizedCoverUrl('https://p1.music.126.net/cover.jpg?param=100y100', 640)
    ).toBe('https://p1.music.126.net/cover.jpg?param=640y640');
    expect(
      createSizedCoverUrl(
        'https://p1.music.126.net/cover.jpg?foo=1&param=100y100',
        640
      )
    ).toBe('https://p1.music.126.net/cover.jpg?foo=1&param=640y640');
  });
});
