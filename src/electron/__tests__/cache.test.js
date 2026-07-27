import { describe, expect, it, vi } from 'vitest';
import { clearSessionDiskCache } from '@/electron/cache';

describe('clearSessionDiskCache', () => {
  it('clears HTTP and origin-scoped storage caches without cookies', async () => {
    const targetSession = {
      clearCache: vi.fn().mockResolvedValue(),
      clearStorageData: vi.fn().mockResolvedValue(),
    };

    await expect(
      clearSessionDiskCache(
        targetSession,
        'http://127.0.0.1:27233/src/renderer/#/settings'
      )
    ).resolves.toEqual({ cleared: true });

    expect(targetSession.clearCache).toHaveBeenCalledOnce();
    expect(targetSession.clearStorageData).toHaveBeenCalledWith({
      origin: 'http://127.0.0.1:27233',
      storages: [
        'indexdb',
        'filesystem',
        'shadercache',
        'serviceworkers',
        'cachestorage',
      ],
    });
  });

  it('fails when the session cache API is unavailable', async () => {
    await expect(clearSessionDiskCache({}, 'invalid')).rejects.toThrow(
      'Electron session cache API is unavailable'
    );
  });
});
