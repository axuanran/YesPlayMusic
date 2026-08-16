export function createLazyDiscordRpcClient({
  clientId,
  createClient,
  onConnected = () => {},
  onError = () => {},
}) {
  let client = null;

  const connect = () => {
    if (client) return client;

    let nextClient;
    try {
      nextClient = createClient(clientId);
    } catch (error) {
      onError(error);
      return null;
    }

    client = nextClient;
    nextClient.on('connected', () => {
      if (client === nextClient) onConnected(nextClient);
    });
    nextClient.on('error', error => {
      if (client === nextClient) onError(error);
    });
    return nextClient;
  };

  const disconnect = () => {
    const currentClient = client;
    client = null;
    if (!currentClient) return false;

    try {
      currentClient.disconnect();
    } catch (error) {
      onError(error);
    }
    return true;
  };

  return {
    connect,
    disconnect,
    getClient: () => client,
  };
}
