import { describe, expect, it, vi } from 'vitest';
import {
  createEmbyAdapter,
  mapEmbyItemToTrack,
  normalizeStreamingServerUrl,
} from '../streaming/embyAdapter.js';

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  };
}

describe('Emby streaming adapter', () => {
  it('normalizes server URLs and rejects embedded credentials', () => {
    expect(normalizeStreamingServerUrl('http://localhost:8096/')).toBe(
      'http://localhost:8096'
    );
    expect(() =>
      normalizeStreamingServerUrl('ftp://localhost/media')
    ).toThrow();
    expect(() =>
      normalizeStreamingServerUrl('https://user:pass@example.com')
    ).toThrow();
  });

  it('authenticates without exposing the password in the URL', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        AccessToken: 'secret-token',
        ServerId: 'server-id',
        User: {
          Id: 'user-id',
          Name: 'alice',
          ServerName: 'Home Emby',
        },
      })
    );
    const adapter = createEmbyAdapter({ fetchImpl });

    const result = await adapter.authenticate({
      serverUrl: 'http://localhost:8096',
      username: 'alice',
      password: 'password',
      deviceId: 'device-id',
    });

    const [requestUrl, options] = fetchImpl.mock.calls[0];
    expect(requestUrl.toString()).toBe(
      'http://localhost:8096/emby/Users/AuthenticateByName'
    );
    expect(requestUrl.toString()).not.toContain('password');
    expect(JSON.parse(options.body)).toEqual({
      Username: 'alice',
      Pw: 'password',
    });
    expect(result).toMatchObject({
      accessToken: 'secret-token',
      userId: 'user-id',
      serverName: 'Home Emby',
    });
  });

  it('maps Emby audio items to the shared player model', () => {
    const track = mapEmbyItemToTrack(
      {
        Id: 'item-id',
        Name: 'Streamed Song',
        Artists: ['Artist'],
        Album: 'Album',
        AlbumId: 'album-id',
        RunTimeTicks: 1805000000,
        IndexNumber: 2,
      },
      {
        id: 'connection-id',
        provider: 'emby',
      },
      'http://127.0.0.1:3210'
    );

    expect(track).toMatchObject({
      id: 'stream:connection-id:item-id',
      name: 'Streamed Song',
      ar: [{ id: 0, name: 'Artist' }],
      al: { id: 0, name: 'Album' },
      dt: 180500,
      no: 2,
      playable: true,
      streaming: true,
    });
    expect(track.sourceUrl).not.toContain('secret');
    expect(track.al.picUrl).toContain('/items/album-id/image');
  });
});
