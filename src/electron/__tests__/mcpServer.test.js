import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createMcpServerManager,
  normalizeMcpServerConfig,
} from '@/electron/mcpServer';

vi.mock('../../../scripts/xump-mcp-http.mjs', () => ({
  startMcpHttpServer: vi.fn(),
}));

import { startMcpHttpServer } from '../../../scripts/xump-mcp-http.mjs';

const mockedStart = vi.mocked(startMcpHttpServer);

const fakeHandle = url => ({
  url,
  close: vi.fn().mockResolvedValue(undefined),
});

describe('normalizeMcpServerConfig', () => {
  it('falls back to loopback defaults for garbage input', () => {
    expect(normalizeMcpServerConfig(null)).toEqual({
      enabled: false,
      host: '127.0.0.1',
      port: 27233,
    });
    expect(normalizeMcpServerConfig('nope')).toEqual({
      enabled: false,
      host: '127.0.0.1',
      port: 27233,
    });
    expect(
      normalizeMcpServerConfig({ enabled: 1, host: '', port: -5 })
    ).toEqual({
      enabled: false,
      host: '127.0.0.1',
      port: 27233,
    });
  });

  it('keeps valid values and rejects bad ones individually', () => {
    expect(
      normalizeMcpServerConfig({ enabled: true, host: '0.0.0.0', port: 3000 })
    ).toEqual({ enabled: true, host: '0.0.0.0', port: 3000 });
    expect(normalizeMcpServerConfig({ host: 'bad host!' })).toMatchObject({
      host: '127.0.0.1',
    });
    expect(normalizeMcpServerConfig({ port: 70000 })).toMatchObject({
      port: 27233,
    });
  });
});

describe('mcp server manager', () => {
  let manager;
  const logs = [];
  const dispatch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    logs.length = 0;
    manager = createMcpServerManager({
      dispatch,
      log: message => logs.push(message),
    });
  });

  afterEach(async () => {
    await manager.dispose();
  });

  it('starts the transport with the configured endpoint and injected dispatch', async () => {
    mockedStart.mockResolvedValue(fakeHandle('http://127.0.0.1:27233/mcp'));
    const status = await manager.applyConfig({
      enabled: true,
      host: '127.0.0.1',
      port: 27233,
    });
    expect(mockedStart).toHaveBeenCalledWith({
      host: '127.0.0.1',
      port: 27233,
      call: dispatch,
    });
    expect(status).toEqual({
      enabled: true,
      running: true,
      host: '127.0.0.1',
      port: 27233,
      url: 'http://127.0.0.1:27233/mcp',
    });
  });

  it('does not start when disabled and stops a running server on disable', async () => {
    const closing = fakeHandle('http://127.0.0.1:27233/mcp');
    mockedStart.mockResolvedValue(closing);

    await manager.applyConfig({ enabled: false });
    expect(mockedStart).not.toHaveBeenCalled();

    await manager.applyConfig({ enabled: true });
    expect(manager.getStatus().running).toBe(true);

    const status = await manager.applyConfig({ enabled: false });
    expect(closing.close).toHaveBeenCalled();
    expect(status.running).toBe(false);
    expect(status.url).toBeNull();
  });

  it('restarts only when the endpoint changes', async () => {
    mockedStart.mockResolvedValue(fakeHandle('http://127.0.0.1:27233/mcp'));
    await manager.applyConfig({ enabled: true });
    expect(mockedStart).toHaveBeenCalledTimes(1);

    // toggling unrelated state (same endpoint) keeps the listener
    await manager.applyConfig({
      enabled: true,
      host: '127.0.0.1',
      port: 27233,
    });
    expect(mockedStart).toHaveBeenCalledTimes(1);

    await manager.applyConfig({ enabled: true, host: '127.0.0.1', port: 3000 });
    expect(mockedStart).toHaveBeenCalledTimes(2);
    expect(mockedStart).toHaveBeenLastCalledWith({
      host: '127.0.0.1',
      port: 3000,
      call: dispatch,
    });
  });

  it('reports startup failures without throwing', async () => {
    mockedStart.mockRejectedValue(new Error('listen EADDRINUSE'));
    const status = await manager.applyConfig({
      enabled: true,
      host: '127.0.0.1',
      port: 27233,
    });
    expect(status).toMatchObject({
      enabled: true,
      running: false,
      url: null,
      error: 'listen EADDRINUSE',
    });
    expect(logs.join('\n')).toContain('EADDRINUSE');
  });

  it('applies stored settings on startup and no-ops when disabled', async () => {
    mockedStart.mockResolvedValue(fakeHandle('http://127.0.0.1:27233/mcp'));
    const idle = await manager.startFromSettings({ enabled: false });
    expect(idle.running).toBe(false);
    expect(mockedStart).not.toHaveBeenCalled();

    const started = await manager.startFromSettings({
      enabled: true,
      host: '0.0.0.0',
      port: 4000,
    });
    expect(started.running).toBe(true);
    expect(started.url).toBe('http://127.0.0.1:27233/mcp');
  });

  it('dispose waits for startup then closes the listener', async () => {
    const handle = fakeHandle('http://127.0.0.1:27233/mcp');
    mockedStart.mockResolvedValue(handle);
    const starting = manager.startFromSettings({ enabled: true });
    await manager.dispose();
    await starting;
    expect(handle.close).toHaveBeenCalled();
    expect(manager.getStatus().running).toBe(false);
  });
});
