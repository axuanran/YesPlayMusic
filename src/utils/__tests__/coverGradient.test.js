import { describe, expect, it, vi } from 'vitest';

import { createCachedCoverGradientLoader } from '../coverGradient';

describe('cover gradient cache', () => {
  it('coalesces concurrent extraction and reuses the resolved gradient', async () => {
    const extract = vi.fn().mockResolvedValue('gradient');
    const load = createCachedCoverGradientLoader(extract);

    const first = load('cover.jpg', 'vibrant');
    const second = load('cover.jpg', 'vibrant');

    await expect(Promise.all([first, second])).resolves.toEqual([
      'gradient',
      'gradient',
    ]);
    await expect(load('cover.jpg', 'vibrant')).resolves.toBe('gradient');
    expect(extract).toHaveBeenCalledOnce();
  });

  it('does not reuse a rejected extraction', async () => {
    const extract = vi
      .fn()
      .mockRejectedValueOnce(new Error('decode failed'))
      .mockResolvedValueOnce('recovered');
    const load = createCachedCoverGradientLoader(extract);

    await expect(load('cover.jpg')).rejects.toThrow('decode failed');
    await expect(load('cover.jpg')).resolves.toBe('recovered');
    expect(extract).toHaveBeenCalledTimes(2);
  });

  it('evicts the least recently used entry at the configured bound', async () => {
    const extract = vi.fn(url => Promise.resolve(`gradient:${url}`));
    const load = createCachedCoverGradientLoader(extract, 2);

    await load('one.jpg');
    await load('two.jpg');
    await load('one.jpg');
    await load('three.jpg');
    await load('two.jpg');

    expect(extract).toHaveBeenCalledTimes(4);
  });
});
