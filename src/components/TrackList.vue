<template>
  <div class="track-list">
    <ContextMenu ref="menu">
      <div v-show="type !== 'cloudDisk'" class="item-info">
        <img :src="rightClickedArtworkPreviewUrl" alt="" loading="lazy" />
        <div class="info">
          <div class="title">{{ rightClickedTrackComputed.name }}</div>
          <div class="subtitle">{{ rightClickedTrackArtistName }}</div>
        </div>
      </div>
      <hr v-show="type !== 'cloudDisk'" />
      <div class="item" @click="play">{{ $t('contextMenu.play') }}</div>
      <div class="item" @click="addToQueue">{{
        $t('contextMenu.addToQueue')
      }}</div>
      <div
        v-if="
          isTrackDownloadEnabled && type !== 'cloudDisk' && !isExternalMusic
        "
        class="item"
        @click="openDownloadModal"
      >
        {{ $t('contextMenu.downloadTrack') }}
      </div>
      <div
        v-if="isArtworkDownloadEnabled && rightClickedArtworkUrl"
        class="item"
        @click="downloadArtwork"
      >
        {{ $t('contextMenu.downloadArtwork') }}
      </div>
      <div
        v-if="extraContextMenuItem.includes('removeTrackFromQueue')"
        class="item"
        @click="removeTrackFromQueue"
        >{{ $t('contextMenu.removeFromQueue') }}</div
      >
      <hr v-show="type !== 'cloudDisk'" />
      <div
        v-show="
          !isRightClickedTrackLiked && type !== 'cloudDisk' && !isExternalMusic
        "
        class="item"
        @click="like"
      >
        {{ $t('contextMenu.saveToMyLikedSongs') }}
      </div>
      <div
        v-show="
          isRightClickedTrackLiked && type !== 'cloudDisk' && !isExternalMusic
        "
        class="item"
        @click="like"
      >
        {{ $t('contextMenu.removeFromMyLikedSongs') }}
      </div>
      <div
        v-if="extraContextMenuItem.includes('removeTrackFromPlaylist')"
        class="item"
        @click="removeTrackFromPlaylist"
        >{{ $t('contextMenu.removeFromPlaylist') }}</div
      >
      <div
        v-show="type !== 'cloudDisk' && !isExternalMusic"
        class="item"
        @click="addTrackToPlaylist"
        >{{ $t('contextMenu.addToPlaylist') }}</div
      >
      <div
        v-show="type !== 'cloudDisk' && !isExternalMusic"
        class="item"
        @click="copyLink"
        >{{ $t('contextMenu.copyUrl') }}</div
      >
      <div
        v-if="extraContextMenuItem.includes('removeLocalTrack')"
        class="item"
        @click="removeLocalTrack"
        >{{ $t('localMusic.remove') }}</div
      >
      <div
        v-if="extraContextMenuItem.includes('removeTrackFromCloudDisk')"
        class="item"
        @click="removeTrackFromCloudDisk"
        >{{ $t('contextMenu.removeFromCloudDisk') }}</div
      >
    </ContextMenu>

    <div class="track-list-items" :style="listStyles">
      <TrackListItem
        v-for="(track, index) in visibleTracks"
        :key="itemKey === 'id' ? track.id : `${track.id}${index}`"
        :track-prop="track"
        :track-no="index + 1"
        :highlight-playing-track="highlightPlayingTrack"
        :list-type="type"
        :liked-song-ids="likedSongIds"
        :right-clicked-track-id="rightClickedTrack.id"
        :album-object="albumObject"
        @dblclick="playThisList(track.id || track.songId)"
        @click="playOnTouch($event, track)"
        @click.right="openMenu($event, track, index)"
        @play-track="playThisList"
        @like-track="likeATrack"
      />
    </div>
  </div>
</template>

<script>
import { mapActions, mapMutations, mapState } from 'vuex';
import { addOrRemoveTrackFromPlaylist } from '@/api/playlist';
import { cloudDiskTrackDelete } from '@/api/user';
import { isAccountLoggedIn } from '@/utils/auth';
import {
  createSizedCoverUrl,
  resolveCoverImageUrl,
} from '@/utils/coverImageUrl';

import TrackListItem from '@/components/TrackListItem.vue';
import ContextMenu from '@/components/ContextMenu.vue';
import locale from '@/locale';
import { isArtworkDownloadEnabled, isTrackDownloadEnabled } from '@/utils/env';
import { scheduleWhenIdle } from '@/utils/scheduleWhenIdle';
import {
  INITIAL_RENDER_BATCH,
  initialRenderLimit,
  nextRenderLimit,
  isFullyRendered,
  ensureIndexRendered,
} from '@/utils/incrementalRender';

const DEFAULT_TRACK_COVER =
  'https://p2.music.126.net/UeTuwE7pvjBpypWLudqukA==/3132508627578625.jpg';

export default {
  name: 'TrackList',
  components: {
    TrackListItem,
    ContextMenu,
  },
  props: {
    tracks: {
      type: Array,
      default: () => {
        return [];
      },
    },
    type: {
      type: String,
      default: 'tracklist',
    }, // tracklist | album | playlist | cloudDisk
    id: {
      type: [Number, String],
      default: 0,
    },
    dbclickTrackFunc: {
      type: String,
      default: 'default',
    },
    albumObject: {
      type: Object,
      default: () => {
        return {
          artist: {
            name: '',
          },
        };
      },
    },
    extraContextMenuItem: {
      type: Array,
      default: () => {
        return [
          // 'removeTrackFromPlaylist'
          // 'removeTrackFromQueue'
          // 'removeTrackFromCloudDisk'
        ];
      },
    },
    columnNumber: {
      type: Number,
      default: 4,
    },
    highlightPlayingTrack: {
      type: Boolean,
      default: true,
    },
    itemKey: {
      type: String,
      default: 'id',
    },
  },
  emits: ['remove-track'],
  data() {
    return {
      rightClickedTrack: {
        id: 0,
        name: '',
        ar: [{ name: '' }],
        al: { picUrl: '' },
      },
      rightClickedTrackIndex: -1,
      listStyles: {},
      isArtworkDownloadEnabled,
      isTrackDownloadEnabled,
      // Incremental rendering: mount a first batch immediately for a fast first
      // paint, then grow the rendered slice on idle until the whole list is in
      // the DOM. A large playlist no longer mounts thousands of component
      // instances synchronously on navigation.
      renderLimit: INITIAL_RENDER_BATCH,
      cancelGrowRender: null,
    };
  },
  computed: {
    ...mapState(['liked', 'player']),
    likedSongIds() {
      return new Set(this.liked.songs);
    },
    visibleTracks() {
      return isFullyRendered(this.renderLimit, this.tracks.length)
        ? this.tracks
        : this.tracks.slice(0, this.renderLimit);
    },
    isRightClickedTrackLiked() {
      return this.likedSongIds.has(this.rightClickedTrack?.id);
    },
    isExternalMusic() {
      return ['localMusic', 'streaming'].includes(this.type);
    },
    rightClickedTrackComputed() {
      return this.type === 'cloudDisk'
        ? {
            id: 0,
            name: '',
            ar: [{ name: '' }],
            al: { picUrl: '' },
          }
        : this.rightClickedTrack;
    },
    rightClickedArtworkUrl() {
      return resolveCoverImageUrl(this.rightClickedTrack);
    },
    rightClickedArtworkPreviewUrl() {
      return (
        createSizedCoverUrl(this.rightClickedTrack, 224) ||
        createSizedCoverUrl(DEFAULT_TRACK_COVER, 224)
      );
    },
    rightClickedTrackArtistName() {
      const track = this.rightClickedTrackComputed;
      return (
        track?.ar?.[0]?.name ||
        track?.artists?.[0]?.name ||
        track?.artist ||
        track?.simpleSong?.ar?.[0]?.name ||
        ''
      );
    },
  },
  watch: {
    tracks() {
      // A new list (navigation, filter, load-more) resets the slice so the
      // next list also starts small and grows, instead of rendering all at once.
      this.renderLimit = initialRenderLimit(this.tracks.length);
      this.scheduleGrowRender();
    },
  },
  created() {
    if (this.type === 'tracklist') {
      this.listStyles = {
        display: 'grid',
        gap: '4px',
        gridTemplateColumns: `repeat(${this.columnNumber}, 1fr)`,
      };
    }
  },
  mounted() {
    this.scheduleGrowRender();
  },
  beforeUnmount() {
    this.stopGrowRender();
  },
  methods: {
    stopGrowRender() {
      if (this.cancelGrowRender) {
        this.cancelGrowRender();
        this.cancelGrowRender = null;
      }
    },
    scheduleGrowRender() {
      this.stopGrowRender();
      if (isFullyRendered(this.renderLimit, this.tracks.length)) return;
      this.cancelGrowRender = scheduleWhenIdle(
        () => {
          this.cancelGrowRender = null;
          this.renderLimit = nextRenderLimit(
            this.renderLimit,
            this.tracks.length
          );
          this.scheduleGrowRender();
        },
        { fallbackDelay: 16, timeout: 200 }
      );
    },
    // Ensure a target index is rendered before any DOM lookup/scroll relies on
    // it; otherwise a not-yet-grown slice would miss a late track element.
    ensureRendered(index) {
      this.renderLimit = ensureIndexRendered(
        this.renderLimit,
        index,
        this.tracks.length
      );
    },
    ...mapMutations(['updateModal']),
    ...mapActions(['nextTrack', 'showToast', 'likeATrack']),
    playOnTouch(event, track) {
      if (!window.matchMedia('(pointer: coarse)').matches) return;
      if (event.target.closest('a, button')) return;
      this.playThisList(track.id || track.songId);
    },
    openMenu(e, track, index = -1) {
      this.rightClickedTrack = track;
      this.rightClickedTrackIndex = index;
      this.$refs.menu.openMenu(e);
    },
    closeMenu() {
      this.rightClickedTrack = {
        id: 0,
        name: '',
        ar: [{ name: '' }],
        al: { picUrl: '' },
      };
      this.rightClickedTrackIndex = -1;
    },
    getTrackElement(trackID) {
      const normalizedTrackID = String(trackID ?? '');
      const trackIndex = this.tracks.findIndex(
        track => String(track.id || track.songId) === normalizedTrackID
      );
      if (trackIndex < 0) return null;
      // Grow the rendered slice to include the target if a late batch has not
      // reached it yet. The element appears after the next render tick.
      this.ensureRendered(trackIndex);
      return this.$el.querySelectorAll('.track')[trackIndex] || null;
    },
    async scrollToTrack(trackID) {
      const normalizedTrackID = String(trackID ?? '');
      const trackIndex = this.tracks.findIndex(
        track => String(track.id || track.songId) === normalizedTrackID
      );
      if (trackIndex < 0) return false;
      this.ensureRendered(trackIndex);
      await this.$nextTick();
      const trackElement = this.$el.querySelectorAll('.track')[trackIndex];
      if (!trackElement) return false;
      trackElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
      return true;
    },
    playThisList(trackID) {
      if (this.dbclickTrackFunc === 'default') {
        this.playThisListDefault(trackID);
      } else if (this.dbclickTrackFunc === 'none') {
        // do nothing
      } else if (this.dbclickTrackFunc === 'playTrackOnListByID') {
        this.player.playTrackOnListByID(trackID);
      } else if (this.dbclickTrackFunc === 'playPlaylistByID') {
        this.player.playPlaylistByID(this.id, trackID);
      } else if (this.dbclickTrackFunc === 'playAList') {
        let trackIDs = this.tracks.map(t => t.id || t.songId);
        this.player.replacePlaylist(trackIDs, this.id, 'artist', trackID);
      } else if (this.dbclickTrackFunc === 'dailyTracks') {
        let trackIDs = this.tracks.map(t => t.id);
        this.player.replacePlaylist(trackIDs, '/daily/songs', 'url', trackID);
      } else if (this.dbclickTrackFunc === 'playCloudDisk') {
        let trackIDs = this.tracks.map(t => t.id || t.songId);
        this.player.replacePlaylist(trackIDs, this.id, 'cloudDisk', trackID);
      } else if (this.dbclickTrackFunc === 'playPodcast') {
        let trackIDs = this.tracks.map(t => t.id || t.songId);
        this.player.replacePlaylist(trackIDs, this.id, 'podcast', trackID);
      } else if (this.dbclickTrackFunc === 'playLocalHistory') {
        let trackIDs = this.tracks.map(t => t.id || t.songId);
        this.player.replacePlaylist(trackIDs, '/library', 'url', trackID);
      } else if (this.dbclickTrackFunc === 'playLocalMusic') {
        let trackIDs = this.tracks.map(t => t.id);
        this.player.replacePlaylist(trackIDs, 'local-music', 'local', trackID, {
          name: this.$t('localMusic.title'),
        });
      } else if (this.dbclickTrackFunc === 'playStreaming') {
        let trackIDs = this.tracks.map(t => t.id);
        this.player.replacePlaylist(trackIDs, this.id, 'streaming', trackID, {
          name: this.$t('streaming.title'),
        });
      }
    },
    playThisListDefault(trackID) {
      if (this.type === 'playlist') {
        this.player.playPlaylistByID(this.id, trackID);
      } else if (this.type === 'album') {
        this.player.playAlbumByID(this.id, trackID);
      } else if (this.type === 'tracklist') {
        let trackIDs = this.tracks.map(t => t.id);
        this.player.replacePlaylist(trackIDs, this.id, 'artist', trackID);
      }
    },
    play() {
      this.player.addTrackToPlayNext(this.rightClickedTrack.id, true);
    },
    addToQueue() {
      this.player.addTrackToPlayNext(this.rightClickedTrack.id);
    },
    like() {
      this.likeATrack(this.rightClickedTrack.id);
    },
    addTrackToPlaylist() {
      if (!isAccountLoggedIn()) {
        this.showToast(locale.global.t('toast.needToLogin'));
        return;
      }
      this.updateModal({
        modalName: 'addTrackToPlaylistModal',
        key: 'show',
        value: true,
      });
      this.updateModal({
        modalName: 'addTrackToPlaylistModal',
        key: 'selectedTrackID',
        value: this.rightClickedTrack.id,
      });
    },
    openDownloadModal() {
      this.updateModal({
        modalName: 'downloadTrackModal',
        key: 'selectedTrack',
        value: this.rightClickedTrack,
      });
      this.updateModal({
        modalName: 'downloadTrackModal',
        key: 'selectedTracks',
        value: [],
      });
      this.updateModal({
        modalName: 'downloadTrackModal',
        key: 'playlistName',
        value: '',
      });
      this.updateModal({
        modalName: 'downloadTrackModal',
        key: 'show',
        value: true,
      });
    },
    async downloadArtwork() {
      const url = this.rightClickedArtworkUrl;
      if (!url) return;
      const track = this.rightClickedTrack;
      const artist =
        this.rightClickedTrackArtistName ||
        locale.global.t('downloadArtwork.unknownArtist');
      const extension =
        new URL(url, window.location.href).pathname
          .match(/\.(jpe?g|png|webp|gif|avif)$/i)?.[1]
          ?.toLowerCase() || 'jpg';

      try {
        const result = await window.electronAPI.download.saveArtwork({
          url,
          suggestedName: `${artist} - ${track.name} - cover.${extension}`,
        });
        if (result?.status === 'completed') {
          this.showToast(locale.global.t('downloadArtwork.completed'));
        }
      } catch (error) {
        this.showToast(
          locale.global.t('downloadArtwork.failed', {
            error: error?.message || String(error),
          })
        );
      }
    },
    removeTrackFromPlaylist() {
      if (!isAccountLoggedIn()) {
        this.showToast(locale.global.t('toast.needToLogin'));
        return;
      }
      if (
        confirm(
          locale.global.t('contextMenu.removeFromPlaylistConfirm', {
            name: this.rightClickedTrack.name,
          })
        )
      ) {
        let trackID = this.rightClickedTrack.id;
        addOrRemoveTrackFromPlaylist({
          op: 'del',
          pid: this.id,
          tracks: trackID,
        }).then(data => {
          this.showToast(
            data.body.code === 200
              ? locale.global.t('toast.removedFromPlaylist')
              : data.body.message
          );
          this.$parent.removeTrack(trackID);
        });
      }
    },
    removeLocalTrack() {
      this.$emit('remove-track', this.rightClickedTrack.id);
      this.closeMenu();
    },
    copyLink() {
      this.$copyText(
        `https://music.163.com/song?id=${this.rightClickedTrack.id}`
      )
        .then(() => {
          this.showToast(locale.global.t('toast.copied'));
        })
        .catch(err => {
          this.showToast(`${locale.global.t('toast.copyFailed')}${err}`);
        });
    },
    removeTrackFromQueue() {
      this.$store.state.player.removeTrackFromQueue(
        this.rightClickedTrackIndex
      );
    },
    removeTrackFromCloudDisk() {
      if (
        confirm(
          locale.global.t('contextMenu.removeFromCloudDiskConfirm', {
            name: this.rightClickedTrack.songName,
          })
        )
      ) {
        let trackID = this.rightClickedTrack.songId;
        cloudDiskTrackDelete(trackID).then(data => {
          this.showToast(
            data.code === 200
              ? locale.global.t('toast.removedFromCloudDisk')
              : data.message
          );
          let newCloudDisk = this.liked.cloudDisk.filter(
            t => t.songId !== trackID
          );
          this.$store.commit('updateLikedXXX', {
            name: 'cloudDisk',
            data: newCloudDisk,
          });
        });
      }
    },
  },
};
</script>

<style lang="scss" scoped>
@media (max-width: 768px) {
  .track-list-items {
    grid-template-columns: minmax(0, 1fr) !important;
    gap: 2px !important;
  }
}
</style>
