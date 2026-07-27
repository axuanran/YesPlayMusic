import { describe, expect, it, vi } from 'vitest';
import {
  createStreamingService,
  parseStreamingTrackId,
} from '../streaming/service.js';

function createStore() {
  const values = new Map();
  return {
    get: vi.fn((key, fallback) =>
      values.has(key) ? values.get(key) : fallback
    ),
    set: vi.fn((key, value) => values.set(key, value)),
  };
}

function createAdapter() {
  return {
    authenticate: vi.fn().mockResolvedValue({
      serverUrl: 'http://localhost:8096',
      accessToken: 'secret-token',
      userId: 'user-id',
      username: 'alice',
      serverId: 'server-id',
      serverName: 'Home Server',
    }),
    getLibraries: vi.fn().mockResolvedValue([{ id: 'music', name: 'Music' }]),
    getTracks: vi.fn().mockResolvedValue({
      items: [
        {
          Id: 'item-id',
          Name: 'Song',
          Artists: ['Artist'],
          RunTimeTicks: 600000000,
        },
      ],
      total: 1,
    }),
    getTrack: vi.fn().mockResolvedValue({
      Id: 'item-id',
      Name: 'Song',
      Artists: ['Artist'],
      RunTimeTicks: 600000000,
    }),
    createAudioUrl: vi.fn(),
    createImageUrl: vi.fn(),
    createRequestHeaders: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
  };
}

describe('streaming service', () => {
  it('stores secrets in the main process but returns sanitized connections', async () => {
    const store = createStore();
    const adapter = createAdapter();
    const service = createStreamingService({
      store,
      baseUrl: 'http://127.0.0.1:3210',
      idFactory: vi
        .fn()
        .mockReturnValueOnce('connection-id')
        .mockReturnValueOnce('device-id'),
      adapterFactories: {
        emby: () => adapter,
      },
    });

    const connection = await service.connect({
      provider: 'emby',
      name: '',
      serverUrl: 'http://localhost:8096',
      username: 'alice',
      password: 'password',
    });

    expect(connection).toEqual({
      id: 'connection-id',
      provider: 'emby',
      name: 'Home Server',
      serverUrl: 'http://localhost:8096',
      username: 'alice',
      serverName: 'Home Server',
    });
    expect(JSON.stringify(connection)).not.toContain('secret-token');
    const storedConnection = store.set.mock.calls.at(-1)[1][0];
    expect(storedConnection.accessToken).toBe('secret-token');
    expect(storedConnection.deviceId).toBe('device-id');

    await expect(service.disconnect('connection-id')).resolves.toEqual([]);
    expect(adapter.logout).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: 'secret-token' })
    );
  });

  it('lists libraries and maps paged tracks through an adapter', async () => {
    const store = createStore();
    const adapter = createAdapter();
    const service = createStreamingService({
      store,
      baseUrl: 'http://127.0.0.1:3210',
      idFactory: vi
        .fn()
        .mockReturnValueOnce('connection-id')
        .mockReturnValueOnce('device-id'),
      adapterFactories: { emby: () => adapter },
    });
    await service.connect({
      provider: 'emby',
      serverUrl: 'http://localhost:8096',
      username: 'alice',
      password: '',
    });

    await expect(service.getLibraries('connection-id')).resolves.toEqual([
      { id: 'music', name: 'Music' },
    ]);
    const result = await service.getTracks({
      connectionId: 'connection-id',
      parentId: 'music',
      search: ' song ',
      startIndex: 0,
      limit: 500,
    });

    expect(adapter.getTracks).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        parentId: 'music',
        search: 'song',
        limit: 200,
      })
    );
    expect(result.total).toBe(1);
    expect(result.tracks[0].id).toBe('stream:connection-id:item-id');
    await expect(
      service.getTrack('stream:connection-id:item-id')
    ).resolves.toMatchObject({ name: 'Song', streaming: true });
  });

  it('parses only valid streaming track IDs', () => {
    expect(parseStreamingTrackId('stream:connection:item')).toEqual({
      connectionId: 'connection',
      itemId: 'item',
    });
    expect(parseStreamingTrackId('local:item')).toBeNull();
    expect(parseStreamingTrackId('stream:missing')).toBeNull();
  });
});
