const RECOVERABLE_LISTEN_ERRORS = new Set(['EACCES', 'EADDRINUSE']);

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function listen(expressApp, port, host) {
  return new Promise((resolve, reject) => {
    const server = expressApp.listen(port, host);

    const onError = error => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve(server);
    };

    server.once('error', onError);
    server.once('listening', onListening);
  });
}

export async function listenOnAvailablePort(
  expressApp,
  preferredPort,
  host = '127.0.0.1'
) {
  try {
    return await listen(expressApp, preferredPort, host);
  } catch (error) {
    if (!RECOVERABLE_LISTEN_ERRORS.has(error.code)) {
      throw error;
    }
    return listen(expressApp, 0, host);
  }
}

// The packaged renderer loads from http://127.0.0.1:<port>, and that origin
// decides which origin-scoped localStorage holds the login state and
// settings — so this server must NEVER silently bind a different port.
// Retries the preferred port (the previous instance may still be shutting
// down) and throws when it stays busy, instead of falling back to a random
// port that would look like a fresh device on next launch.
export async function listenOnStablePort(
  expressApp,
  preferredPort,
  { host = '127.0.0.1', retries = 20, retryDelayMs = 500 } = {}
) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await listen(expressApp, preferredPort, host);
    } catch (error) {
      if (!RECOVERABLE_LISTEN_ERRORS.has(error.code)) {
        throw error;
      }
      lastError = error;
      if (attempt < retries) {
        await delay(retryDelayMs);
      }
    }
  }
  throw lastError;
}
