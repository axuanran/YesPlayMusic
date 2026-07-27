<template>
  <div class="track-list">
    <ContextMenu ref="menu">
      <div v-show="type !== 'cloudDisk'" class="item-info">
        <img
          :src="resizeImage(rightClickedTrackComputed.al.picUrl, 224)"
          loading="lazy"
        />
        <div class="info">
          <div class="title">{{ rightClickedTrackComputed.name }}</div>
          <div class="subtitle">{{ rightClickedTrackComputed.ar[0].name }}</div>
        </div>
      </div>
      <hr v-show="type !== 'cloudDisk'" />
      <div class="item" @click="play">{{ $t('contextMenu.play') }}</div>
      <div class="item" @click="addToQueue">{{
        $t('contextMenu.addToQueue')
      }}</div>
      <div
        v-if="isElectron && type !== 'cloudDisk' && !isExternalMusic"
        class="item"
        @click="openDownloadModal"
      >
        {{ $t('contextMenu.downloadTrack') }}
      </div>
      <div
        v-if="extraContextMenuItem.includes('removeTrackFromQueue')"
        class="item"
        @click="removeTrackFromQueue"
        >从队列删除</div
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
        >从歌单中删除</div
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
        >从云盘中删除</div
      >
    </ContextMenu>

    <div :style="listStyles">
      <TrackListItem
        v-for="(track, index) in tracks"
        :key="itemKey === 'id' ? track.id : `${track.id}${index}`"
        :track-prop="track"
        :track-no="index + 1"
        :highlight-playing-track="highlightPlayingTrack"
        :list-type="type"
        :liked-song-ids="liked.songs"
        :right-clicked-track-id="rightClickedTrack.id"
        :album-object="albumObject"
        @dblclick="playThisList(track.id || track.songId)"
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

import TrackListItem from '@/components/TrackListItem.vue';
import ContextMenu from '@/components/ContextMenu.vue';
import locale from '@/locale';
import { isElectron } from '@/utils/env';

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
      isElectron,
    };
  },
  computed: {
    ...mapState(['liked', 'player']),
    isRightClickedTrackLiked() {
      return this.liked.songs.includes(this.rightClickedTrack?.id);
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
  methods: {
    ...mapMutations(['updateModal']),
    ...mapActions(['nextTrack', 'showToast', 'likeATrack']),
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
    scrollToTrack(trackID) {
      const trackIndex = this.tracks.findIndex(
        track => (track.id || track.songId) === trackID
      );
      if (trackIndex < 0) return false;

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
        this.showToast(locale.t('toast.needToLogin'));
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
        key: 'show',
        value: true,
      });
    },
    removeTrackFromPlaylist() {
      if (!isAccountLoggedIn()) {
        this.showToast(locale.t('toast.needToLogin'));
        return;
      }
      if (confirm(`确定要从歌单删除 ${this.rightClickedTrack.name}？`)) {
        let trackID = this.rightClickedTrack.id;
        addOrRemoveTrackFromPlaylist({
          op: 'del',
          pid: this.id,
          tracks: trackID,
        }).then(data => {
          this.showToast(
            data.body.code === 200
              ? locale.t('toast.removedFromPlaylist')
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
          this.showToast(locale.t('toast.copied'));
        })
        .catch(err => {
          this.showToast(`${locale.t('toast.copyFailed')}${err}`);
        });
    },
    removeTrackFromQueue() {
      this.$store.state.player.removeTrackFromQueue(
        this.rightClickedTrackIndex
      );
    },
    removeTrackFromCloudDisk() {
      if (confirm(`确定要从云盘删除 ${this.rightClickedTrack.songName}？`)) {
        let trackID = this.rightClickedTrack.songId;
        cloudDiskTrackDelete(trackID).then(data => {
          this.showToast(
            data.code === 200 ? '已将此歌曲从云盘删除' : data.message
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

<style lang="scss" scoped></style>
