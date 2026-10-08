import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { listenOnAvailablePort, listenOnStablePort } from '../localServer.js';

function createServer() {
  const server = new EventEmitter();
  server.off = server.removeListener;
  return server;
}

describe('listenOnAvailablePort', () => {
  it('uses the preferred port when it is available', async () => {
    const server = createServer();
    const expressApp = {
      listen: vi.fn(() => {
        queueMicrotask(() => server.emit('listening'));
        return server;
      }),
    };

    await expect(listenOnAvailablePort(expressApp, 27232)).resolves.toBe(
      server
    );
    expect(expressApp.listen).toHaveBeenCalledWith(27232, '127.0.0.1');
  });

  it.each(['EACCES', 'EADDRINUSE'])(
    'falls back to an ephemeral port after %s',
    async code => {
      const rejectedServer = createServer();
      const fallbackServer = createServer();
      const expressApp = {
        listen: vi
          .fn()
          .mockImplementationOnce(() => {
            queueMicrotask(() =>
              rejectedServer.emit(
                'error',
                Object.assign(new Error(code), { code })
              )
            );
            return rejectedServer;
          })
          .mockImplementationOnce(() => {
            queueMicrotask(() => fallbackServer.emit('listening'));
            return fallbackServer;
          }),
      };

      await expect(listenOnAvailablePort(expressApp, 27232)).resolves.toBe(
        fallbackServer
      );
      expect(expressApp.listen).toHaveBeenNthCalledWith(2, 0, '127.0.0.1');
    }
  );

  it('does not hide unexpected listen errors', async () => {
    const server = createServer();
    const error = Object.assign(new Error('failed'), { code: 'ENETDOWN' });
    const expressApp = {
      listen: vi.fn(() => {
        queueMicrotask(() => server.emit('error', error));
        return server;
      }),
    };

    await expect(listenOnAvailablePort(expressApp, 27232)).rejects.toBe(error);
    expect(expressApp.listen).toHaveBeenCalledTimes(1);
  });
});

describe('listenOnStablePort', () => {
  const FAST = { retries: 2, retryDelayMs: 1 };

  function appFailingTimes(times) {
    let calls = 0;
    const servers = [];
    const expressApp = {
      listen: vi.fn(() => {
        calls += 1;
        const server = createServer();
        servers.push(server);
        queueMicrotask(() => {
          if (calls <= times) {
            server.emit(
              'error',
              Object.assign(new Error('EADDRINUSE'), { code: 'EADDRINUSE' })
            );
          } else {
            server.emit('listening');
          }
        });
        return server;
      }),
    };
    return { expressApp, servers };
  }

  it('uses the preferred port when it is available', async () => {
    const server = createServer();
    const expressApp = {
      listen: vi.fn(() => {
        queueMicrotask(() => server.emit('listening'));
        return server;
      }),
    };

    await expect(listenOnStablePort(expressApp, 27232, FAST)).resolves.toBe(
      server
    );
    expect(expressApp.listen).toHaveBeenCalledWith(27232, '127.0.0.1');
  });

  it('retries the preferred port while it stays busy, never port 0', async () => {
    const { expressApp, servers } = appFailingTimes(2);

    const result = await listenOnStablePort(expressApp, 27232, FAST);
    expect(result).toBe(servers[2]);
    expect(expressApp.listen).toHaveBeenCalledTimes(3);
    for (const call of expressApp.listen.mock.calls) {
      expect(call).toEqual([27232, '127.0.0.1']);
    }
  });

  it('rejects after exhausting retries', async () => {
    const { expressApp } = appFailingTimes(99);

    await expect(
      listenOnStablePort(expressApp, 27232, FAST)
    ).rejects.toMatchObject({ code: 'EADDRINUSE' });
    expect(expressApp.listen).toHaveBeenCalledTimes(3);
  });

  it('does not retry unexpected listen errors', async () => {
    const server = createServer();
    const error = Object.assign(new Error('failed'), { code: 'ENETDOWN' });
    const expressApp = {
      listen: vi.fn(() => {
        queueMicrotask(() => server.emit('error', error));
        return server;
      }),
    };

    await expect(listenOnStablePort(expressApp, 27232, FAST)).rejects.toBe(
      error
    );
    expect(expressApp.listen).toHaveBeenCalledTimes(1);
  });
});
