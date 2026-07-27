import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { createEmbyAdapter, mapEmbyItemToTrack } from './embyAdapter.js';

export const STREAMING_CONNECTIONS_STORE_KEY = 'streaming.connections';
export const STREAMING_TRACK_ID_PREFIX = 'stream:';
export const STREAMING_PROVIDERS = ['emby', 'jellyfin'];

const MAX_CONNECTIONS = 16;
const MAX_PAGE_SIZE = 200;
const PROXY_HEADERS = [
  'accept-ranges',
  'cache-control',
  'content-length',
  'content-range',
  'content-type',
  'etag',
  'last-modified',
];

const isRecord = value =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const isBoundedString = (value, maxLength = 2048) =>
  typeof value === 'string' && value.length > 0 && value.length <= maxLength;

function getStoredConnections(store) {
  const connections = store.get(STREAMING_CONNECTIONS_STORE_KEY, []);
  if (!Array.isArray(connections)) return [];
  return connections.filter(
    connection =>
      isRecord(connection) &&
      isBoundedString(connection.id, 128) &&
      STREAMING_PROVIDERS.includes(connection.provider) &&
      isBoundedString(connection.serverUrl) &&
      isBoundedString(connection.accessToken, 8192) &&
      isBoundedString(connection.userId, 256)
  );
}

function toPublicConnection(connection) {
  return {
    id: connection.id,
    provider: connection.provider,
    name: connection.name,
    serverUrl: connection.serverUrl,
    username: connection.username,
    serverName: connection.serverName,
  };
}

export function parseStreamingTrackId(trackId) {
  if (
    typeof trackId !== 'string' ||
    !trackId.startsWith(STREAMING_TRACK_ID_PREFIX)
  ) {
    return null;
  }
  const parts = trackId.split(':');
  if (parts.length !== 3 || !parts[1] || !parts[2]) return null;
  return { connectionId: parts[1], itemId: parts[2] };
}

function copyProxyHeaders(upstream, response) {
  PROXY_HEADERS.forEach(header => {
    const value = upstream.headers.get(header);
    if (value) response.set(header, value);
  });
}

async function proxyResponse(upstream, response) {
  response.status(upstream.status);
  copyProxyHeaders(upstream, response);
  if (!upstream.body) {
    response.end();
    return;
  }
  Readable.fromWeb(upstream.body).pipe(response);
}

export function createStreamingService({
  store,
  baseUrl,
  fetchImpl = fetch,
  idFactory = randomUUID,
  adapterFactories = {
    emby: createEmbyAdapter,
    jellyfin: createEmbyAdapter,
  },
} = {}) {
  const adapters = new Map();
  const getBaseUrl = () =>
    typeof baseUrl === 'function' ? baseUrl() : baseUrl;
  const getAdapter = provider => {
    if (!adapters.has(provider)) {
      const factory = adapterFactories[provider];
      if (!factory)
        throw new Error(`Unsupported streaming provider: ${provider}`);
      adapters.set(provider, factory({ fetchImpl }));
    }
    return adapters.get(provider);
  };
  const findConnection = connectionId =>
    getStoredConnections(store).find(item => item.id === connectionId) || null;

  const listConnections = () =>
    getStoredConnections(store).map(toPublicConnection);

  const connect = async input => {
    if (
      !isRecord(input) ||
      !STREAMING_PROVIDERS.includes(input.provider) ||
      !isBoundedString(input.serverUrl) ||
      !isBoundedString(input.username, 256) ||
      typeof input.password !== 'string' ||
      input.password.length > 4096
    ) {
      throw new Error('Invalid streaming connection');
    }
    const connections = getStoredConnections(store);
    if (connections.length >= MAX_CONNECTIONS) {
      throw new Error('Streaming connection limit reached');
    }
    const id = idFactory();
    const deviceId = idFactory();
    const authenticated = await getAdapter(input.provider).authenticate({
      serverUrl: input.serverUrl,
      username: input.username,
      password: input.password,
      deviceId,
    });
    const connection = {
      id,
      deviceId,
      provider: input.provider,
      ...authenticated,
      name: (
        (typeof input.name === 'string' && input.name.trim()) ||
        authenticated.serverName ||
        input.username
      ).slice(0, 128),
      username: String(authenticated.username || input.username).slice(0, 256),
      serverName: String(authenticated.serverName || '').slice(0, 128),
    };
    store.set(STREAMING_CONNECTIONS_STORE_KEY, [...connections, connection]);
    return toPublicConnection(connection);
  };

  const disconnect = async connectionId => {
    const connection = findConnection(connectionId);
    if (connection) {
      try {
        await getAdapter(connection.provider).logout(connection);
      } catch {
        // Local removal must still work when the server is offline.
      }
    }
    store.set(
      STREAMING_CONNECTIONS_STORE_KEY,
      getStoredConnections(store).filter(item => item.id !== connectionId)
    );
    return listConnections();
  };

  const getLibraries = async connectionId => {
    const connection = findConnection(connectionId);
    if (!connection) throw new Error('Streaming connection not found');
    return getAdapter(connection.provider).getLibraries(connection);
  };

  const getTracks = async ({
    connectionId,
    parentId = '',
    search = '',
    startIndex = 0,
    limit = 100,
  }) => {
    const connection = findConnection(connectionId);
    if (!connection) throw new Error('Streaming connection not found');
    const safeLimit = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Number(limit) || 100)
    );
    const safeStartIndex = Math.max(0, Number(startIndex) || 0);
    const result = await getAdapter(connection.provider).getTracks(connection, {
      parentId: typeof parentId === 'string' ? parentId : '',
      search: typeof search === 'string' ? search.trim().slice(0, 256) : '',
      startIndex: safeStartIndex,
      limit: safeLimit,
    });
    return {
      tracks: result.items
        .filter(item => isRecord(item) && isBoundedString(item.Id, 512))
        .slice(0, safeLimit)
        .map(item => mapEmbyItemToTrack(item, connection, getBaseUrl())),
      total: result.total,
    };
  };

  const getTrack = async trackId => {
    const parsed = parseStreamingTrackId(trackId);
    if (!parsed) return null;
    const connection = findConnection(parsed.connectionId);
    if (!connection) return null;
    const item = await getAdapter(connection.provider).getTrack(
      connection,
      parsed.itemId
    );
    return mapEmbyItemToTrack(item, connection, getBaseUrl());
  };

  const proxy = async (connectionId, itemId, resource, request, response) => {
    const connection = findConnection(connectionId);
    if (!connection || !isBoundedString(itemId, 512)) {
      response.sendStatus(404);
      return;
    }
    const adapter = getAdapter(connection.provider);
    const upstreamUrl =
      resource === 'audio'
        ? adapter.createAudioUrl(connection, itemId)
        : adapter.createImageUrl(connection, itemId);
    const headers = adapter.createRequestHeaders(connection);
    if (resource === 'audio' && request.headers.range) {
      headers.Range = request.headers.range;
    }
    try {
      const upstream = await fetchImpl(upstreamUrl, {
        headers,
        redirect: 'error',
      });
      await proxyResponse(upstream, response);
    } catch {
      if (!response.headersSent) response.sendStatus(502);
      else response.destroy();
    }
  };

  return {
    connect,
    disconnect,
    getLibraries,
    getTrack,
    getTracks,
    listConnections,
    proxy,
  };
}

export function registerStreamingRoutes(expressApp, service) {
  expressApp.get(
    '/streaming/:connectionId/items/:itemId/audio',
    (request, response) =>
      service.proxy(
        request.params.connectionId,
        request.params.itemId,
        'audio',
        request,
        response
      )
  );
  expressApp.get(
    '/streaming/:connectionId/items/:itemId/image',
    (request, response) =>
      service.proxy(
        request.params.connectionId,
        request.params.itemId,
        'image',
        request,
        response
      )
  );
}
