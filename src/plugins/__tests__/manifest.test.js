import { describe, expect, it, vi } from 'vitest';
import { normalizePluginManifest, validatePluginManifest } from '../manifest';

describe('plugin manifest', () => {
  it('normalizes optional defaults', () => {
    expect(
      normalizePluginManifest({
        id: 'demo',
        name: 'Demo',
        version: '1.0.0',
        type: 'builtin',
      })
    ).toMatchObject({
      enabledByDefault: false,
      routes: [],
    });
  });

  it('rejects missing required fields', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(validatePluginManifest({ id: 'demo' })).toBe(false);
  });

  it('rejects duplicate ids', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const seenIds = new Set();
    const plugin = {
      id: 'demo',
      name: 'Demo',
      version: '1.0.0',
      type: 'builtin',
    };

    expect(validatePluginManifest(plugin, seenIds)).toBe(true);
    expect(validatePluginManifest(plugin, seenIds)).toBe(false);
  });
});
