import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveCacheDir } from '../storagePaths.js';

describe('resolveCacheDir', () => {
  it('uses ~/.cache on Linux by default', () => {
    expect(
      resolveCacheDir({
        platform: 'linux',
        env: {},
        homeDir: '/home/tester',
      })
    ).toBe(path.join('/home/tester', '.cache', 'YesPlayMusic', 'resolver'));
  });

  it('honors XDG_CACHE_HOME on Linux', () => {
    expect(
      resolveCacheDir({
        platform: 'linux',
        env: { XDG_CACHE_HOME: '/var/cache/tester' },
        homeDir: '/home/tester',
      })
    ).toBe(path.join('/var/cache/tester', 'YesPlayMusic', 'resolver'));
  });

  it('uses LOCALAPPDATA on Windows by default', () => {
    expect(
      resolveCacheDir({
        platform: 'win32',
        env: { LOCALAPPDATA: String.raw`D:\LocalAppData` },
        homeDir: String.raw`C:\Users\tester`,
      })
    ).toBe(path.join(String.raw`D:\LocalAppData`, 'YesPlayMusic', 'resolver'));
  });

  it('allows a custom cache directory on Windows', () => {
    expect(
      resolveCacheDir({
        platform: 'win32',
        env: {},
        homeDir: String.raw`C:\Users\tester`,
        customDir: String.raw`E:\YPM-cache`,
      })
    ).toBe(String.raw`E:\YPM-cache`);
  });

  it('allows the environment to override the configured directory', () => {
    expect(
      resolveCacheDir({
        platform: 'win32',
        env: { YPM_RESOLVER_CACHE_DIR: String.raw`F:\YPM-cache` },
        customDir: String.raw`E:\YPM-cache`,
      })
    ).toBe(String.raw`F:\YPM-cache`);
  });
});
