const CLIENT_NAME = 'YesPlayMusic';
const DEVICE_NAME = 'Desktop';
const CLIENT_VERSION = '0.4.0';
const TICKS_PER_MILLISECOND = 10000;

function assertSuccessful(response, operation) {
  if (response.ok) return;
  const error = new Error(`${operation} failed (${response.status})`);
  error.status = response.status;
  throw error;
}

export function normalizeStreamingServerUrl(serverUrl) {
  const url = new URL(serverUrl);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only HTTP and HTTPS streaming servers are supported');
  }
  if (url.username || url.password) {
    throw new Error('Credentials must not be embedded in the server URL');
  }
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

function createApiUrl(connection, apiPath, query = {}) {
  const url = new URL(`${connection.serverUrl}/emby/${apiPath}`);
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });
  return url;
}

function createAuthorizationHeader(deviceId, token = '', userId = '') {
  const values = [
    `Client="${CLIENT_NAME}"`,
    `Device="${DEVICE_NAME}"`,
    `DeviceId="${deviceId}"`,
    `Version="${CLIENT_VERSION}"`,
  ];
  if (userId) values.push(`UserId="${userId}"`);
  if (token) values.push(`Token="${token}"`);
  return `Emby ${values.join(', ')}`;
}

function createHeaders(connection, includeJson = false) {
  const headers = {
    'X-Emby-Authorization': createAuthorizationHeader(
      connection.deviceId,
      connection.accessToken,
      connection.userId
    ),
    'X-Emby-Token': connection.accessToken,
  };
  if (includeJson) headers['Content-Type'] = 'application/json';
  return headers;
}

function getArtistNames(item) {
  if (Array.isArray(item.Artists) && item.Artists.length) {
    return item.Artists.slice(0, 16).map(name => String(name).slice(0, 256));
  }
  if (item.AlbumArtist) return [String(item.AlbumArtist).slice(0, 256)];
  return ['Unknown Artist'];
}

export function mapEmbyItemToTrack(item, connection, baseUrl) {
  const artists = getArtistNames(item);
  const duration = Number(item.RunTimeTicks) / TICKS_PER_MILLISECOND;
  const itemId = String(item.Id).slice(0, 512);
  const albumName = item.Album ? String(item.Album).slice(0, 512) : 'Streaming';
  const imageItemId =
    item.PrimaryImageItemId ||
    item.AlbumId ||
    (item.ImageTags?.Primary ? itemId : '');
  const resourceBase = `${baseUrl}/streaming/${encodeURIComponent(
    connection.id
  )}/items/${encodeURIComponent(itemId)}`;

  return {
    id: `stream:${connection.id}:${itemId}`,
    name: item.Name ? String(item.Name).slice(0, 512) : 'Unknown Track',
    ar: artists.map(name => ({ id: 0, name })),
    artists: artists.map(name => ({ id: 0, name })),
    al: {
      id: 0,
      name: albumName,
      picUrl: imageItemId
        ? `${baseUrl}/streaming/${encodeURIComponent(
            connection.id
          )}/items/${encodeURIComponent(imageItemId)}/image`
        : '',
    },
    album: {
      id: 0,
      name: albumName,
      picUrl: imageItemId
        ? `${baseUrl}/streaming/${encodeURIComponent(
            connection.id
          )}/items/${encodeURIComponent(imageItemId)}/image`
        : '',
    },
    dt: Number.isFinite(duration) && duration > 0 ? duration : 0,
    duration: Number.isFinite(duration) && duration > 0 ? duration : 0,
    no: Number(item.IndexNumber) || 0,
    alia: [],
    tns: [],
    playable: true,
    streaming: true,
    streamingProvider: connection.provider,
    streamingConnectionId: connection.id,
    streamingItemId: itemId,
    sourceUrl: `${resourceBase}/audio`,
  };
}

export function createEmbyAdapter({ fetchImpl = fetch } = {}) {
  const fetchJson = async (connection, apiPath, query = {}) => {
    const response = await fetchImpl(createApiUrl(connection, apiPath, query), {
      headers: createHeaders(connection),
      redirect: 'error',
    });
    assertSuccessful(response, apiPath);
    return response.json();
  };

  const authenticate = async ({ serverUrl, username, password, deviceId }) => {
    const normalizedServerUrl = normalizeStreamingServerUrl(serverUrl);
    const connection = { serverUrl: normalizedServerUrl, deviceId };
    const response = await fetchImpl(
      createApiUrl(connection, 'Users/AuthenticateByName'),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Emby-Authorization': createAuthorizationHeader(deviceId),
        },
        body: JSON.stringify({ Username: username, Pw: password }),
        redirect: 'error',
      }
    );
    assertSuccessful(response, 'Authentication');
    const result = await response.json();
    if (!result.AccessToken || !result.User?.Id) {
      throw new Error('Streaming server returned incomplete credentials');
    }
    return {
      serverUrl: normalizedServerUrl,
      accessToken: result.AccessToken,
      userId: result.User.Id,
      username: result.User.Name || username,
      serverId: result.ServerId || result.User.ServerId || '',
      serverName: result.User.ServerName || '',
    };
  };

  const getLibraries = async connection => {
    const result = await fetchJson(
      connection,
      `Users/${encodeURIComponent(connection.userId)}/Views`
    );
    return (result.Items || [])
      .filter(
        item =>
          !item.CollectionType ||
          ['music', 'boxsets'].includes(
            String(item.CollectionType).toLowerCase()
          )
      )
      .map(item => ({
        id: item.Id,
        name: item.Name,
        collectionType: item.CollectionType || '',
      }));
  };

  const getTracks = async (
    connection,
    { parentId = '', search = '', startIndex = 0, limit = 100 } = {}
  ) => {
    const result = await fetchJson(
      connection,
      `Users/${encodeURIComponent(connection.userId)}/Items`,
      {
        ParentId: parentId,
        Recursive: true,
        IncludeItemTypes: 'Audio',
        Fields:
          'Album,AlbumId,AlbumArtist,Artists,RunTimeTicks,IndexNumber,ImageTags,PrimaryImageItemId',
        SortBy: 'SortName',
        SortOrder: 'Ascending',
        SearchTerm: search,
        StartIndex: startIndex,
        Limit: limit,
      }
    );
    return {
      items: result.Items || [],
      total: Number(result.TotalRecordCount) || 0,
    };
  };

  const getTrack = (connection, itemId) =>
    fetchJson(
      connection,
      `Users/${encodeURIComponent(connection.userId)}/Items/${encodeURIComponent(
        itemId
      )}`
    );

  const logout = async connection => {
    const response = await fetchImpl(
      createApiUrl(connection, 'Sessions/Logout'),
      {
        method: 'POST',
        headers: createHeaders(connection),
        redirect: 'error',
      }
    );
    assertSuccessful(response, 'Logout');
  };

  const createAudioUrl = (connection, itemId) =>
    createApiUrl(connection, `Audio/${encodeURIComponent(itemId)}/stream`, {
      static: true,
    });

  const createImageUrl = (connection, itemId) =>
    createApiUrl(
      connection,
      `Items/${encodeURIComponent(itemId)}/Images/Primary`,
      { maxWidth: 512, quality: 90 }
    );

  const createRequestHeaders = connection => createHeaders(connection);

  return {
    authenticate,
    createAudioUrl,
    createImageUrl,
    createRequestHeaders,
    getLibraries,
    getTrack,
    getTracks,
    logout,
  };
}
