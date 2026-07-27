const RECOVERABLE_LISTEN_ERRORS = new Set(['EACCES', 'EADDRINUSE']);

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
