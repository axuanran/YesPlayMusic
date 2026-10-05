import { startMcpHttpServer } from '../../scripts/xump-mcp-http.mjs';

// Built-in MCP (streamable HTTP) server manager. Wraps the transport in
// scripts/xump-mcp-http.mjs but injects an in-process `call` that goes
// through the control server's renderer dispatch instead of the unix socket,
// so it works on every platform (notably Windows, where the socket is off).
//
// Settings live under the `mcpServer` electron-store key as
// `{ enabled, host, port }`; the UI patches them through `settings:patch`
// and ipcMain calls applyConfig() to start/stop/restart the listener.

export const MCP_SERVER_STATUS_CHANNEL = 'mcp-server:status';
export const MCP_SERVER_GET_STATUS_CHANNEL = 'mcp-server:get-status';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 27233;

const isValidHost = value =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 253 &&
  /^[a-zA-Z0-9._:-]+$/.test(value);

const isValidPort = value =>
  Number.isInteger(value) && value >= 1 && value <= 65535;

export const normalizeMcpServerConfig = (value, defaults = {}) => {
  const source = value && typeof value === 'object' ? value : {};
  const fallback = {
    enabled: false,
    host: DEFAULT_HOST,
    port: DEFAULT_PORT,
    ...defaults,
  };
  return {
    enabled: source.enabled === true,
    host: isValidHost(source.host) ? source.host : fallback.host,
    port: isValidPort(source.port) ? source.port : fallback.port,
  };
};

export function createMcpServerManager({ dispatch, log = console.log } = {}) {
  let config = normalizeMcpServerConfig();
  let handle = null;
  // serialize start/stop/restart so an in-flight startup can never race a
  // settings change that arrives right behind it
  let queue = Promise.resolve();

  const status = () => ({
    enabled: config.enabled,
    running: handle !== null,
    host: config.host,
    port: config.port,
    url: handle ? handle.url : null,
  });

  const stop = async () => {
    const closing = handle;
    handle = null;
    if (closing) {
      await closing.close();
      log(`[mcp] server stopped (${config.host}:${config.port})`);
    }
  };

  const start = async () => {
    const started = await startMcpHttpServer({
      host: config.host,
      port: config.port,
      call: dispatch,
    });
    handle = started;
    log(`[mcp] server listening on ${started.url}`);
    return started;
  };

  const applyConfig = next => {
    const run = async () => {
      const normalized = normalizeMcpServerConfig(next);
      const sameEndpoint =
        normalized.host === config.host && normalized.port === config.port;
      config = normalized;
      if (!config.enabled) {
        await stop();
        return status();
      }
      if (handle && sameEndpoint) return status();
      await stop();
      try {
        await start();
      } catch (error) {
        handle = null;
        log(`[mcp] server failed to start: ${error.message}`);
        return { ...status(), error: error.message };
      }
      return status();
    };
    const applied = queue.then(run, run);
    // keep the queue alive even when a caller forgets to handle rejection
    queue = applied.catch(() => {});
    return applied;
  };

  return {
    applyConfig,
    getStatus: status,
    stop: () => applyConfig({ ...config, enabled: false }).then(() => {}),
    // startup helper: apply persisted settings, report but never throw
    startFromSettings(stored) {
      return applyConfig(stored).catch(error => {
        log(`[mcp] server failed to start: ${error.message}`);
        return { ...status(), error: error.message };
      });
    },
    async dispose() {
      await queue;
      await stop();
    },
  };
}
