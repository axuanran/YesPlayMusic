// import store, { state, dispatch, commit } from "@/store";
import { isAccountLoggedIn, isLooseLoggedIn } from '@/utils/auth';
import { likeATrack } from '@/api/track';
import { getPlaylistDetail } from '@/api/playlist';
import { getTrackDetail } from '@/api/track';
import {
  userPlaylist,
  userPlayHistory,
  userLikedSongsIDs,
  likedAlbums,
  likedArtists,
  likedMVs,
  cloudDisk,
  userAccount,
} from '@/api/user';
const libraryCollectionLoads = new Map();
const loadedLibraryCollections = new Set();
let libraryGeneration = 0;

function createLibraryRequestGuard(state) {
  const userId = String(state.data.user?.userId || '');
  const generation = libraryGeneration;
  return () =>
    generation === libraryGeneration &&
    String(state.data.user?.userId || '') === userId;
}

function fetchLibraryCollection({ state, commit }, { name, request }) {
  if (!isAccountLoggedIn()) return Promise.resolve();
  const userId = String(state.data.user?.userId || '');
  const generation = libraryGeneration;
  if (!userId) return Promise.resolve();
  const cacheKey = `${userId}:${name}`;
  if (loadedLibraryCollections.has(cacheKey)) return Promise.resolve();
  if (libraryCollectionLoads.has(cacheKey)) {
    return libraryCollectionLoads.get(cacheKey);
  }

  const load = Promise.resolve()
    .then(request)
    .then(result => {
      if (
        generation !== libraryGeneration ||
        String(state.data.user?.userId || '') !== userId
      ) {
        return result;
      }
      if (result?.data !== undefined) {
        commit('updateLikedXXX', { name, data: result.data });
        loadedLibraryCollections.add(cacheKey);
      }
      return result;
    })
    .finally(() => {
      if (libraryCollectionLoads.get(cacheKey) === load) {
        libraryCollectionLoads.delete(cacheKey);
      }
    });
  libraryCollectionLoads.set(cacheKey, load);
  return load;
}

export default {
  showToast({ state, commit }, text) {
    if (state.toast.timer !== null) {
      clearTimeout(state.toast.timer);
      commit('updateToast', { show: false, text: '', timer: null });
    }
    commit('updateToast', {
      show: true,
      text,
      timer: setTimeout(() => {
        commit('updateToast', {
          show: false,
          text: state.toast.text,
          timer: null,
        });
      }, 3200),
    });
  },
  likeATrack({ state, commit, dispatch }, id) {
    if (!isAccountLoggedIn()) {
      dispatch('showToast', '此操作需要登录网易云账号');
      return;
    }
    let like = true;
    if (state.liked.songs.includes(id)) like = false;
    likeATrack({ id, like })
      .then(() => {
        if (like === false) {
          commit('updateLikedXXX', {
            name: 'songs',
            data: state.liked.songs.filter(d => d !== id),
          });
        } else {
          let newLikeSongs = state.liked.songs;
          newLikeSongs.push(id);
          commit('updateLikedXXX', {
            name: 'songs',
            data: newLikeSongs,
          });
        }
        dispatch('fetchLikedSongsWithDetails');
      })
      .catch(() => {
        dispatch('showToast', '操作失败，专辑下架或版权锁定');
      });
  },
  fetchLikedSongs: ({ state, commit }) => {
    if (!isLooseLoggedIn()) return;
    const isCurrentRequest = createLibraryRequestGuard(state);
    if (isAccountLoggedIn()) {
      return userLikedSongsIDs(state.data.user.userId).then(result => {
        if (isCurrentRequest() && result.ids) {
          commit('updateLikedXXX', {
            name: 'songs',
            data: result.ids,
          });
        }
      });
    } else {
      // TODO:搜索ID登录的用户
    }
  },
  fetchLikedSongsWithDetails: ({ state, commit }) => {
    if (!state.data.likedSongPlaylistID) return Promise.resolve();
    const isCurrentRequest = createLibraryRequestGuard(state);
    return getPlaylistDetail(state.data.likedSongPlaylistID, true).then(
      result => {
        if (!result.playlist?.trackIds?.length) return;
        return getTrackDetail(
          result.playlist.trackIds
            .slice(0, 12)
            .map(t => t.id)
            .join(',')
        ).then(result => {
          if (!isCurrentRequest()) return;
          commit('updateLikedXXX', {
            name: 'songsWithDetails',
            data: result.songs,
          });
        });
      }
    );
  },
  fetchLikedPlaylist: ({ state, commit }) => {
    if (!isLooseLoggedIn()) return;
    const isCurrentRequest = createLibraryRequestGuard(state);
    if (isAccountLoggedIn()) {
      return userPlaylist({
        uid: state.data.user?.userId,
        limit: 2000, // 最多只加载2000个歌单（等有用户反馈问题再修）
        timestamp: new Date().getTime(),
      }).then(result => {
        if (!isCurrentRequest()) return [];
        const playlists = Array.isArray(result.playlist) ? result.playlist : [];
        commit('updateLikedXXX', {
          name: 'playlists',
          data: playlists,
        });
        if (playlists.length > 0) {
          // 更新用户”喜欢的歌曲“歌单ID
          commit('updateData', {
            key: 'likedSongPlaylistID',
            value: playlists[0].id,
          });
        }
        return playlists;
      });
    } else {
      // TODO:搜索ID登录的用户
    }
  },
  fetchLikedAlbums: context =>
    fetchLibraryCollection(context, {
      name: 'albums',
      request: () => likedAlbums({ limit: 2000 }),
    }),
  fetchLikedArtists: context =>
    fetchLibraryCollection(context, {
      name: 'artists',
      request: () => likedArtists({ limit: 2000 }),
    }),
  fetchLikedMVs: context =>
    fetchLibraryCollection(context, {
      name: 'mvs',
      request: () => likedMVs({ limit: 1000 }),
    }),
  fetchCloudDisk: context =>
    fetchLibraryCollection(context, {
      name: 'cloudDisk',
      request: () => cloudDisk({ limit: 1000 }),
    }),
  resetLibraryData: ({ commit }) => {
    libraryCollectionLoads.clear();
    loadedLibraryCollections.clear();
    libraryGeneration += 1;
    for (const name of [
      'songs',
      'songsWithDetails',
      'playlists',
      'albums',
      'artists',
      'mvs',
      'cloudDisk',
      'playHistory',
    ]) {
      commit('updateLikedXXX', {
        name,
        data: name === 'playHistory' ? {} : [],
      });
    }
  },
  fetchPlayHistory: ({ state, commit }) => {
    if (!isAccountLoggedIn()) return;
    const isCurrentRequest = createLibraryRequestGuard(state);
    return Promise.all([
      userPlayHistory({ uid: state.data.user?.userId, type: 0 }),
      userPlayHistory({ uid: state.data.user?.userId, type: 1 }),
    ]).then(result => {
      if (!isCurrentRequest()) return;
      const data = {};
      const dataType = { 0: 'allData', 1: 'weekData' };
      if (result[0] && result[1]) {
        for (let i = 0; i < result.length; i++) {
          const songData = result[i][dataType[i]].map(item => {
            const song = item.song;
            song.playCount = item.playCount;
            return song;
          });
          data[[dataType[i]]] = songData;
        }
        commit('updateLikedXXX', {
          name: 'playHistory',
          data,
        });
      }
    });
  },
  fetchUserProfile: ({ commit }) => {
    if (!isAccountLoggedIn()) return;
    return userAccount().then(result => {
      if (result?.code === 200) {
        commit('updateData', { key: 'user', value: result.profile });
      }
      return result;
    });
  },
};
