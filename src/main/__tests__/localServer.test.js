import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { listenOnAvailablePort } from '../localServer.js';

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
