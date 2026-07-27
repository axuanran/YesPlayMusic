export const STREAMING_CONNECTIONS_CHANGED =
  'yesplaymusic:streaming-connections-changed';

export function publishStreamingConnections(connections) {
  window.dispatchEvent(
    new CustomEvent(STREAMING_CONNECTIONS_CHANGED, {
      detail: Array.isArray(connections) ? connections : [],
    })
  );
}
