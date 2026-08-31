import { describe, expect, it, vi } from 'vitest';

import { createCoverWarmup } from '../coverWarmup';

describe('createCoverWarmup', () => {
  it('coalesces concurrent and successful repeated sized cover requests', async () => {
    const loadUrl = vi.fn(url => Promise.resolve(url));
    const warm = createCoverWarmup(loadUrl, { sizes: [224, 512] });

    await Promise.all([
      warm('https://example.test/cover.jpg'),
      warm('https://example.test/cover.jpg'),
    ]);
    await warm('https://example.test/cover.jpg');

    expect(loadUrl).toHaveBeenCalledTimes(2);
    expect(loadUrl).toHaveBeenCalledWith(
      'https://example.test/cover.jpg?param=224y224'
    );
    expect(loadUrl).toHaveBeenCalledWith(
      'https://example.test/cover.jpg?param=512y512'
    );
  });

  it('removes failed requests so they can retry', async () => {
    const loadUrl = vi
      .fn()
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValue('ok');
    const warm = createCoverWarmup(loadUrl, { sizes: [224] });

    await expect(warm('https://example.test/cover.jpg')).rejects.toThrow(
      'network unavailable'
    );
    await expect(warm('https://example.test/cover.jpg')).resolves.toEqual([
      'ok',
    ]);

    expect(loadUrl).toHaveBeenCalledTimes(2);
  });

  it('evicts the least recently used sized URL at the configured bound', async () => {
    const loadUrl = vi.fn(url => Promise.resolve(url));
    const warm = createCoverWarmup(loadUrl, {
      maxEntries: 2,
      sizes: [224],
    });

    await warm('https://example.test/one.jpg');
    await warm('https://example.test/two.jpg');
    await warm('https://example.test/three.jpg');
    await warm('https://example.test/one.jpg');

    expect(loadUrl).toHaveBeenCalledTimes(4);
  });
});
