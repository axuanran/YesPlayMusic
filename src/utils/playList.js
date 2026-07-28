import router from '../router';
import state from '../store/state';
import {
  recommendPlaylist,
  dailyRecommendPlaylist,
  getPlaylistDetail,
} from '@/api/playlist';
import { isAccountLoggedIn } from '@/utils/auth';

export function hasListSource() {
  return !state.player.isPersonalFM && state.player.playlistSource.id !== 0;
}

export function goToListSource() {
  router.push({ path: getListSourcePath() });
}

export function getListSourcePath() {
  if (state.player.playlistSource.id === state.data.likedSongPlaylistID) {
    return '/library/liked-songs';
  } else if (state.player.playlistSource.type === 'url') {
    return state.player.playlistSource.id;
  } else if (state.player.playlistSource.type === 'cloudDisk') {
    return '/library';
  } else {
    return `/${state.player.playlistSource.type}/${state.player.playlistSource.id}`;
  }
}

export async function getRecommendPlayList(limit, removePrivateRecommand) {
  if (isAccountLoggedIn()) {
    const [dailyResult, publicResult] = await Promise.allSettled([
      dailyRecommendPlaylist(),
      recommendPlaylist({ limit }),
    ]);

    let recommend =
      dailyResult.status === 'fulfilled' &&
      Array.isArray(dailyResult.value?.recommend)
        ? dailyResult.value.recommend
        : [];
    if (recommend.length) {
      if (removePrivateRecommand) recommend = recommend.slice(1);
      await replaceRecommendResult(recommend);
    }

    const publicPlaylists =
      publicResult.status === 'fulfilled' &&
      Array.isArray(publicResult.value?.result)
        ? publicResult.value.result
        : [];
    const playlists = recommend.concat(publicPlaylists).slice(0, limit);
    if (playlists.length === 0) {
      throw (
        (dailyResult.status === 'rejected' && dailyResult.reason) ||
        (publicResult.status === 'rejected' && publicResult.reason) ||
        new Error('Recommended playlists response is empty')
      );
    }
    return playlists;
  } else {
    const response = await recommendPlaylist({ limit });
    return Array.isArray(response?.result) ? response.result : [];
  }
}

async function replaceRecommendResult(recommend) {
  await Promise.all(
    recommend.map(async item => {
      if (specialPlaylist.includes(item.id)) {
        try {
          const data = await getPlaylistDetail(item.id, true);
          const playlist = data.playlist;
          if (playlist) {
            item.name = playlist.name;
            item.picUrl = playlist.coverImgUrl;
          }
        } catch (error) {
          console.warn(
            `[playlist] Failed to refresh special playlist ${item.id}`,
            error
          );
        }
      }
    })
  );
}

const specialPlaylist = [3136952023, 2829883282, 2829816518, 2829896389];
