import { registerPlugin } from '@capacitor/core';
import md5 from 'md5';
import QRCode from 'qrcode';

const NeteaseApi = registerPlugin('NeteaseApi');
const CHECK_TOKEN =
  '9ca17ae2e6ffcda170e2e6ee8af14fbabdb988f225b3868eb2c15a879b9a83d274a790ac8ff54a97b889d5d42af0feaec3b92af58cff99c470a7eafd88f75e839a9ea7c14e909da883e83fb692a3abdb6b92adee9e';

const plan = (uri, data = {}, crypto = 'eapi', extra = {}) => ({
  uri,
  data,
  crypto,
  ...extra,
});

function getPersistedCookieString() {
  const knownKeys = [
    'cookie-MUSIC_U',
    'cookie-MUSIC_A',
    'cookie-__csrf',
    'cookie-MUSIC_R_T',
    'cookie-MUSIC_A_T',
    'cookie-NMTID',
  ].filter(key => localStorage.getItem(key));
  const indexedKeys = Array.from(
    { length: localStorage.length || 0 },
    (_, index) => localStorage.key(index)
  ).filter(Boolean);
  const keys = new Set([
    ...knownKeys,
    ...indexedKeys,
    ...Object.keys(localStorage),
  ]);
  return Array.from(keys)
    .filter(key => key.startsWith('cookie-'))
    .map(key => `${key.slice(7)}=${localStorage.getItem(key)}`)
    .join('; ');
}

function normalizeBoolean(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

export async function openNeteaseWebLoginOnAndroid() {
  const result = await NeteaseApi.openWebLogin();
  return result?.cookie || '';
}

function readConfigData(data) {
  if (!data) return {};
  if (data instanceof URLSearchParams)
    return Object.fromEntries(data.entries());
  if (typeof FormData !== 'undefined' && data instanceof FormData) {
    throw new Error('Android 内置网易云 API 暂不支持云盘文件上传');
  }
  return typeof data === 'object' ? data : {};
}

function buildQuery(config) {
  return {
    ...readConfigData(config.data),
    ...(config.params || {}),
  };
}

async function buildPlan(path, q) {
  switch (path) {
    case '/album':
      return plan(`/api/v1/album/${q.id}`, {}, 'weapi');
    case '/album/detail/dynamic':
      return plan('/api/album/detail/dynamic', { id: q.id }, 'weapi');
    case '/album/new':
      return plan(
        '/api/album/new',
        {
          limit: q.limit || 30,
          offset: q.offset || 0,
          total: true,
          area: q.area || 'ALL',
        },
        'weapi'
      );
    case '/album/sub':
      return plan(
        `/api/album/${q.t == 1 ? 'sub' : 'unsub'}`,
        { id: q.id },
        'weapi'
      );
    case '/album/sublist':
      return plan(
        '/api/album/sublist',
        { limit: q.limit || 25, offset: q.offset || 0, total: true },
        'weapi'
      );
    case '/artist/album':
      return plan(
        `/api/artist/albums/${q.id}`,
        { limit: q.limit || 30, offset: q.offset || 0, total: true },
        'weapi'
      );
    case '/artist/mv':
      return plan(
        '/api/artist/mvs',
        { artistId: q.id, limit: q.limit, offset: q.offset, total: true },
        'weapi'
      );
    case '/artist/sub': {
      const action = q.t == 1 ? 'sub' : 'unsub';
      return plan(
        `/api/artist/${action}`,
        { artistId: q.id, artistIds: `[${q.id}]` },
        'weapi'
      );
    }
    case '/artist/sublist':
      return plan(
        '/api/artist/sublist',
        { limit: q.limit || 25, offset: q.offset || 0, total: true },
        'weapi'
      );
    case '/artists':
      return plan(`/api/v1/artist/${q.id}`, {}, 'weapi');
    case '/cloud':
      throw new Error('Android 第一版暂不支持云盘文件上传');
    case '/cloudsearch':
      return plan('/api/cloudsearch/pc', {
        s: q.keywords,
        type: q.type || 1,
        limit: q.limit || 30,
        offset: q.offset || 0,
        total: true,
      });
    case '/daily_signin':
      return plan('/api/point/dailyTask', { type: q.type || 0 });
    case '/dj/detail':
      return plan('/api/djradio/v2/get', { id: q.rid }, 'weapi');
    case '/dj/program':
      return plan(
        '/api/dj/program/byradio',
        {
          radioId: q.rid,
          limit: q.limit || 30,
          offset: q.offset || 0,
          asc: normalizeBoolean(q.asc),
        },
        'weapi'
      );
    case '/dj/recommend':
      return plan('/api/djradio/recommend/v1', {}, 'weapi');
    case '/fm_trash':
      return plan(
        '/api/radio/trash/add',
        { songId: q.id, alg: 'RT', time: q.time || 25 },
        'weapi'
      );
    case '/like':
      return plan(
        '/api/radio/like',
        {
          alg: 'itembased',
          trackId: q.id,
          like: q.like !== false && q.like !== 'false',
          time: '3',
        },
        'weapi'
      );
    case '/likelist':
      return plan('/api/song/like/get', { uid: q.uid });
    case '/login':
      return plan('/api/w/login', {
        type: '0',
        https: 'true',
        username: q.email,
        password: q.md5_password || md5(q.password || ''),
        rememberLogin: 'true',
      });
    case '/login/cellphone':
      return plan(
        '/api/w/login/cellphone',
        {
          type: '1',
          https: 'true',
          phone: q.phone,
          countrycode: q.countrycode || '86',
          ...(q.captcha
            ? { captcha: q.captcha }
            : { password: q.md5_password || md5(q.password || '') }),
          remember: 'true',
        },
        'weapi'
      );
    case '/login/qr/key':
      return plan('/api/login/qrcode/unikey', { type: 3 }, 'eapi', {
        transform: data => ({ code: 200, data }),
      });
    case '/login/qr/create': {
      let qrurl = `https://music.163.com/login?codekey=${q.key}`;
      const qrimg = q.qrimg ? await QRCode.toDataURL(qrurl) : '';
      return { local: { code: 200, data: { qrurl, qrimg } } };
    }
    case '/login/qr/check':
      return plan('/api/login/qrcode/client/login', { key: q.key, type: 3 });
    case '/login/refresh':
      return plan('/api/login/token/refresh');
    case '/logout':
      return plan('/api/logout');
    case '/lyric':
      return plan('/api/song/lyric', {
        id: q.id,
        tv: -1,
        lv: -1,
        rv: -1,
        kv: -1,
        _nmclfl: 1,
      });
    case '/mv/detail':
      return plan('/api/v1/mv/detail', { id: q.mvid }, 'weapi');
    case '/mv/sub': {
      const action = q.t == 1 ? 'sub' : 'unsub';
      return plan(
        `/api/mv/${action}`,
        { mvId: q.mvid, mvIds: `["${q.mvid}"]` },
        'weapi'
      );
    }
    case '/mv/sublist':
      return plan(
        '/api/cloudvideo/allvideo/sublist',
        { limit: q.limit || 25, offset: q.offset || 0, total: true },
        'weapi'
      );
    case '/mv/url':
      return plan(
        '/api/song/enhance/play/mv/url',
        { id: q.id, r: q.r || 1080 },
        'weapi'
      );
    case '/personal_fm':
      return plan('/api/v1/radio/get', {}, 'weapi');
    case '/personalized':
      return plan(
        '/api/personalized/playlist',
        { limit: q.limit || 30, total: true, n: 1000 },
        'weapi'
      );
    case '/playlist/catlist':
      return plan('/api/playlist/catalogue');
    case '/playlist/create':
      return plan(
        '/api/playlist/create',
        { name: q.name, privacy: q.privacy || '0', type: q.type || 'NORMAL' },
        'weapi'
      );
    case '/playlist/delete':
      return plan('/api/playlist/remove', { ids: `[${q.id}]` }, 'weapi');
    case '/playlist/detail':
      return plan('/api/v6/playlist/detail', {
        id: q.id,
        n: 100000,
        s: q.s || 8,
      });
    case '/playlist/subscribe':
      return plan(`/api/playlist/${q.t == 1 ? 'subscribe' : 'unsubscribe'}`, {
        id: q.id,
        ...(q.t == 1 ? { checkToken: CHECK_TOKEN } : {}),
      });
    case '/playlist/tracks':
      return plan('/api/playlist/manipulate/tracks', {
        op: q.op,
        pid: q.pid,
        trackIds: JSON.stringify(String(q.tracks).split(',')),
        imme: 'true',
      });
    case '/playmode/intelligence/list':
      return plan('/api/playmode/intelligence/list', {
        songId: q.id,
        type: 'fromPlayOne',
        playlistId: q.pid,
        startMusicId: q.sid || q.id,
        count: q.count || 1,
      });
    case '/recommend/resource':
      return plan('/api/v1/discovery/recommend/resource', {}, 'weapi');
    case '/recommend/songs':
      return plan(
        '/api/v3/discovery/recommend/songs',
        { afresh: q.afresh },
        'weapi'
      );
    case '/scrobble': {
      const common = {
        id: q.id,
        sourceId: q.sourceid,
        type: 'song',
        mainsite: '1',
        mainsiteWeb: '1',
        content: `id=${q.sourceid}`,
      };
      return {
        requests: [
          plan('/api/feedback/weblog', {
            logs: JSON.stringify([
              { action: 'startplay', json: { ...common, sourceId: undefined } },
            ]),
          }),
          plan('/api/feedback/weblog', {
            logs: JSON.stringify([
              {
                action: 'play',
                json: {
                  ...common,
                  download: 0,
                  end: 'playend',
                  time: q.time,
                  wifi: 0,
                  source: 'list',
                },
              },
            ]),
          }),
        ],
        transform: results => ({
          code: 200,
          data: 'success',
          details: results,
        }),
      };
    }
    case '/simi/artist':
      return plan('/api/discovery/simiArtist', { artistid: q.id }, 'weapi');
    case '/simi/mv':
      return plan('/api/discovery/simiMV', { mvid: q.mvid }, 'weapi');
    case '/song/detail': {
      const ids = String(q.ids).split(/\s*,\s*/);
      return plan(
        '/api/v3/song/detail',
        { c: `[${ids.map(id => `{"id":${id}}`).join(',')}]` },
        'weapi'
      );
    }
    case '/song/url': {
      const ids = String(q.id).split(',');
      return plan(
        '/api/song/enhance/player/url',
        { ids: JSON.stringify(ids), br: Number.parseInt(q.br || 999000, 10) },
        'eapi',
        {
          transform(data) {
            if (Array.isArray(data.data)) {
              data.data.sort(
                (a, b) => ids.indexOf(String(a.id)) - ids.indexOf(String(b.id))
              );
            }
            return data;
          },
        }
      );
    }
    case '/top/playlist':
      return plan(
        '/api/playlist/list',
        {
          cat: q.cat || '全部',
          order: q.order || 'hot',
          limit: q.limit || 50,
          offset: q.offset || 0,
          total: true,
        },
        'weapi'
      );
    case '/top/playlist/highquality':
      return plan(
        '/api/playlist/highquality/list',
        {
          cat: q.cat || '全部',
          limit: q.limit || 50,
          lasttime: q.before || 0,
          total: true,
        },
        'weapi'
      );
    case '/top/song':
      return plan(
        '/api/v1/discovery/new/songs',
        { areaId: q.type || 0, total: true },
        'weapi'
      );
    case '/toplist':
      return plan('/api/toplist');
    case '/toplist/artist':
      return plan(
        '/api/toplist/artist',
        { type: q.type || 1, limit: 100, offset: 0, total: true },
        'weapi'
      );
    case '/user/account':
      return plan('/api/nuser/account/get', {}, 'weapi');
    case '/user/cloud':
      return plan(
        '/api/v1/cloud/get',
        { limit: q.limit || 30, offset: q.offset || 0 },
        'weapi'
      );
    case '/user/cloud/del':
      return plan('/api/cloud/del', { songIds: [q.id] }, 'weapi');
    case '/user/cloud/detail':
      return plan(
        '/api/v1/cloud/get/byids',
        { songIds: String(q.id).replace(/\s/g, '').split(',') },
        'weapi'
      );
    case '/user/detail':
      return plan(`/api/v1/user/detail/${q.uid}`, {}, 'weapi');
    case '/user/playlist':
      return plan(
        '/api/user/playlist',
        {
          uid: q.uid,
          limit: q.limit || 30,
          offset: q.offset || 0,
          includeVideo: true,
        },
        'weapi'
      );
    case '/user/record':
      return plan(
        '/api/v1/play/record',
        { uid: q.uid, type: q.type || 0 },
        'weapi'
      );
    case '/api':
      return plan(q.uri, q.data || {}, q.crypto || 'eapi');
    default:
      throw new Error(`Android 内置网易云 API 尚未适配接口：${path}`);
  }
}

async function executePlan(requestPlan, config, query) {
  const cookie = query.cookie || getPersistedCookieString();
  const result = await NeteaseApi.request({
    uri: requestPlan.uri,
    crypto: requestPlan.crypto,
    data: requestPlan.data,
    cookie,
    realIP: query.realIP || '',
    timeout: config.timeout || 15000,
  });
  let data = result.data || {};
  if (Array.isArray(result.cookies) && result.cookies.length) {
    data.cookie = result.cookies.join(';');
  }
  return requestPlan.transform ? requestPlan.transform(data) : data;
}

export async function requestNeteaseOnAndroid(config) {
  if (config.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const path = String(config.url || '').split('?')[0];
  const query = buildQuery(config);
  const requestPlan = await buildPlan(path, query);
  if (requestPlan.local) return requestPlan.local;

  let data;
  if (requestPlan.requests) {
    const results = [];
    for (const item of requestPlan.requests) {
      results.push(await executePlan(item, config, query));
    }
    data = requestPlan.transform
      ? requestPlan.transform(results)
      : results.at(-1);
  } else {
    data = await executePlan(requestPlan, config, query);
  }

  if (config.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  return data;
}
