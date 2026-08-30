<template>
  <div v-show="show" class="playlist">
    <div
      v-if="specialPlaylistInfo === undefined && !isLikeSongsPage"
      class="playlist-info"
    >
      <Cover
        :id="playlist.id"
        :image-url="resizeImage(playlist.coverImgUrl, 1024)"
        :show-play-button="true"
        :always-show-shadow="true"
        :click-cover-to-play="true"
        :fixed-size="288"
        type="playlist"
        :cover-hover="false"
        :play-button-size="18"
        @click.right="openMenu"
      />
      <div class="info">
        <div class="title" @click.right="openMenu"
          ><span v-if="playlist.privacy === 10" class="lock-icon">
            <svg-icon icon-class="lock" /></span
          >{{ playlist.name }}</div
        >
        <div class="artist">
          Playlist by
          <span
            v-if="
              [
                5277771961, 5277965913, 5277969451, 5277778542, 5278068783,
              ].includes(playlist.id)
            "
            style="font-weight: 600"
            >Apple Music</span
          >
          <a
            v-else
            :href="`https://music.163.com/#/user/home?id=${playlist.creator.userId}`"
            target="blank"
            >{{ playlist.creator.nickname }}</a
          >
        </div>
        <div class="date-and-count">
          {{ $t('playlist.updatedAt') }}
          {{ formatDate(playlist.updateTime) }} ·
          {{ playlist.trackCount }}
          {{ $t('common.songs') }}
        </div>
        <div class="description" @click="toggleFullDescription">
          {{ playlist.description }}
        </div>
        <div class="buttons">
          <ButtonTwoTone icon-class="play" @click="playPlaylistByID()">
            {{ $t('common.play') }}
          </ButtonTwoTone>
          <ButtonTwoTone
            v-if="playlist.creator.userId !== data.user.userId"
            :icon-class="playlist.subscribed ? 'heart-solid' : 'heart'"
            :icon-button="true"
            :horizontal-padding="0"
            :color="playlist.subscribed ? 'blue' : 'grey'"
            :text-color="playlist.subscribed ? '#335eea' : ''"
            :background-color="
              playlist.subscribed ? 'var(--color-secondary-bg)' : ''
            "
            @click="likePlaylist"
          >
          </ButtonTwoTone>
          <ButtonTwoTone
            icon-class="more"
            :icon-button="true"
            :horizontal-padding="0"
            color="grey"
            @click="openMenu"
          >
          </ButtonTwoTone>
        </div>
      </div>
    </div>

    <div v-if="specialPlaylistInfo !== undefined" class="special-playlist">
      <div
        class="title"
        :class="specialPlaylistInfo.gradient"
        @click.right="openMenu"
      >
        {{ specialPlaylistInfo.name }}
      </div>
      <div class="subtitle"
        >{{ playlist.englishTitle }} · {{ playlist.updateFrequency }}
      </div>

      <div class="buttons">
        <ButtonTwoTone
          class="play-button"
          icon-class="play"
          color="grey"
          @click="playPlaylistByID()"
        >
          {{ $t('common.play') }}
        </ButtonTwoTone>
        <ButtonTwoTone
          v-if="playlist.creator.userId !== data.user.userId"
          :icon-class="playlist.subscribed ? 'heart-solid' : 'heart'"
          :icon-button="true"
          :horizontal-padding="0"
          :color="playlist.subscribed ? 'blue' : 'grey'"
          :text-color="playlist.subscribed ? '#335eea' : ''"
          :background-color="
            playlist.subscribed ? 'var(--color-secondary-bg)' : ''
          "
          @click="likePlaylist"
        >
        </ButtonTwoTone>
        <ButtonTwoTone
          icon-class="more"
          :icon-button="true"
          :horizontal-padding="0"
          color="grey"
          @click="openMenu"
        >
        </ButtonTwoTone>
      </div>
    </div>

    <div
      v-if="displaySearchInPlaylist && !isLikeSongsPage"
      class="search-box playlist-search-box"
    >
      <div class="container" :class="{ active: inputFocus }">
        <svg-icon icon-class="search" />
        <div class="input">
          <input
            v-model.trim="inputSearchKeyWords"
            v-focus
            :placeholder="inputFocus ? '' : $t('playlist.search')"
            @input="inputDebounce()"
            @focus="inputFocus = true"
            @blur="inputFocus = false"
          />
        </div>
      </div>
    </div>

    <div v-if="isLikeSongsPage" class="user-info">
      <h1>
        <img
          class="avatar"
          :src="resizeImage(data.user.avatarUrl)"
          loading="lazy"
        />
        {{ data.user.nickname }}{{ $t('library.sLikedSongs') }}
      </h1>
      <div class="search-box-likepage" @click="searchInPlaylist()">
        <div class="container" :class="{ active: inputFocus }">
          <svg-icon icon-class="search" />
          <div class="input" :style="{ width: searchInputWidth }">
            <input
              v-if="displaySearchInPlaylist"
              v-model.trim="inputSearchKeyWords"
              v-focus
              :placeholder="inputFocus ? '' : $t('playlist.search')"
              @input="inputDebounce()"
              @focus="inputFocus = true"
              @blur="inputFocus = false"
            />
          </div>
        </div>
      </div>
    </div>

    <transition name="locate-button">
      <ButtonTwoTone
        v-if="showLocateCurrentTrackButton"
        class="locate-current-track-button"
        icon-class="locate"
        :icon-button="true"
        shape="round"
        color="grey"
        :title="$t('playlist.locateCurrentTrack')"
        :aria-label="$t('playlist.locateCurrentTrack')"
        @click="scrollToCurrentTrack"
      />
    </transition>

    <TrackList
      :id="playlist.id"
      ref="trackList"
      :tracks="filteredTracks"
      type="playlist"
      :extra-context-menu-item="
        isUserOwnPlaylist ? ['removeTrackFromPlaylist'] : []
      "
    />

    <div class="load-more">
      <ButtonTwoTone
        v-show="hasMore"
        color="grey"
        :loading="loadingMore"
        @click="loadMore(100)"
        >{{ $t('explore.loadMore') }}</ButtonTwoTone
      >
    </div>

    <Modal
      :show="showFullDescription"
      :close="toggleFullDescription"
      :show-footer="false"
      :click-outside-hide="true"
      title="歌单介绍"
      >{{ playlist.description }}</Modal
    >

    <ContextMenu ref="playlistMenu">
      <div class="item" @click="likePlaylist(true)">{{
        playlist.subscribed
          ? $t('contextMenu.removeFromLibrary')
          : $t('contextMenu.saveToLibrary')
      }}</div>
      <div class="item" @click="searchInPlaylist()">{{
        $t('contextMenu.searchInPlaylist')
      }}</div>
      <div
        v-if="isDownloadEnabled && playlist.trackIds.length > 0"
        class="item"
        @click="openPlaylistDownload"
      >
        {{ $t('contextMenu.downloadPlaylist') }}
      </div>
      <div
        v-if="playlist.creator.userId === data.user.userId"
        class="item"
        @click="editPlaylist"
        >编辑歌单信息</div
      >
      <div
        v-if="playlist.creator.userId === data.user.userId"
        class="item"
        @click="deletePlaylist"
        >删除歌单</div
      >
    </ContextMenu>
  </div>
</template>

<script>
import { mapMutations, mapActions, mapState } from 'vuex';
import NProgress from 'nprogress';
import {
  getPlaylistDetail,
  subscribePlaylist,
  deletePlaylist,
} from '@/api/playlist';
import { getTrackDetail } from '@/api/track';
import { isAccountLoggedIn } from '@/utils/auth';
import nativeAlert from '@/utils/nativeAlert';
import locale from '@/locale';
import { isDownloadEnabled, isElectron } from '@/utils/env';

import ButtonTwoTone from '@/components/ButtonTwoTone.vue';
import ContextMenu from '@/components/ContextMenu.vue';
import TrackList from '@/components/TrackList.vue';
import Cover from '@/components/Cover.vue';
import Modal from '@/components/Modal.vue';

const specialPlaylist = {
  2829816518: { name: '欧美私人订制', gradient: 'gradient-pink-purple-blue' },
  2890490211: { name: '助眠鸟鸣声', gradient: 'gradient-green' },
  5089855855: { name: '夜的胡思乱想', gradient: 'gradient-moonstone-blue' },
  2888212971: { name: '全球百大DJ', gradient: 'gradient-orange-red' },
  2829733864: { name: '睡眠伴侣', gradient: 'gradient-midnight-blue' },
  2829844572: { name: '洗澡时听的歌', gradient: 'gradient-yellow' },
  2920647537: {
    name: '还是会想你',
    gradient: 'gradient-dark-blue-midnight-blue',
  },
  2890501416: { name: '助眠白噪声', gradient: 'gradient-sky-blue' },
  5217150082: { name: '摇滚唱片行', gradient: 'gradient-yellow-red' },
  2829961453: { name: '古风音乐大赏', gradient: 'gradient-fog' },
  4923261701: { name: 'Trance', gradient: 'gradient-light-red-light-blue ' },
  5212729721: { name: '欧美点唱机', gradient: 'gradient-indigo-pink-yellow' },
  3103434282: { name: '甜蜜少女心', gradient: 'gradient-pink' },
  2829896389: { name: '日系私人订制', gradient: 'gradient-yellow-pink' },
  2829779628: { name: '运动随身听', gradient: 'gradient-orange-red' },
  2860654884: { name: '独立女声精选', gradient: 'gradient-sharp-blue' },
  898150: { name: '浪漫婚礼专用', gradient: 'gradient-pink' },
  2638104052: { name: '牛奶泡泡浴', gradient: 'gradient-fog' },
  5317236517: { name: '后朋克精选', gradient: 'gradient-pink-purple-blue' },
  2821115454: { name: '一周原创发现', gradient: 'gradient-blue-purple' },
  2829883282: { name: '华语私人雷达', gradient: 'gradient-yellow-red' },
  3136952023: { name: '私人雷达', gradient: 'gradient-radar' },
};

export default {
  name: 'Playlist',
  components: { Cover, ButtonTwoTone, TrackList, Modal, ContextMenu },
  directives: {
    focus: {
      mounted(el) {
        el.focus();
      },
    },
  },
  data() {
    return {
      show: false,
      playlist: {
        id: 0,
        coverImgUrl: '',
        creator: { userId: '' },
        trackIds: [],
      },
      showFullDescription: false,
      tracks: [],
      loadingMore: false,
      hasMore: false,
      lastLoadedTrackIndex: 9,
      displaySearchInPlaylist: false,
      searchKeyWords: '',
      inputSearchKeyWords: '',
      inputFocus: false,
      debounceTimeout: null,
      searchInputWidth: '0px',
      loadMorePromise: null,
      locatingCurrentTrack: false,
      currentTrackVisible: false,
      currentTrackVisibilityObserver: null,
      isElectron,
      isDownloadEnabled,
    };
  },
  computed: {
    ...mapState(['player', 'data']),
    isLikeSongsPage() {
      return this.$route.name === 'likedSongs';
    },
    specialPlaylistInfo() {
      return specialPlaylist[this.playlist.id];
    },
    isUserOwnPlaylist() {
      return (
        this.playlist.creator.userId === this.data.user.userId &&
        this.playlist.id !== this.data.likedSongPlaylistID
      );
    },
    currentTrackID() {
      void this.$store.state.playerTrackVersion;
      return this.player.displayTrackID;
    },
    isCurrentPlaylist() {
      void this.$store.state.playerVersion;
      return (
        this.player.playlistSource?.type === 'playlist' &&
        String(this.player.playlistSource.id) === String(this.playlist.id)
      );
    },
    currentTrackIndex() {
      if (!this.isCurrentPlaylist) return -1;
      return this.playlist.trackIds.findIndex(
        track => String(track.id) === String(this.currentTrackID)
      );
    },
    showLocateCurrentTrackButton() {
      return this.currentTrackIndex >= 0 && !this.currentTrackVisible;
    },
    filteredTracks() {
      const keyword = this.searchKeyWords.toLowerCase();
      return this.tracks.filter(
        track =>
          (track.name && track.name.toLowerCase().includes(keyword)) ||
          (track.al?.name && track.al.name.toLowerCase().includes(keyword)) ||
          track.ar?.some(
            artist => artist.name && artist.name.toLowerCase().includes(keyword)
          )
      );
    },
  },
  watch: {
    currentTrackID() {
      this.refreshCurrentTrackVisibility();
    },
    filteredTracks() {
      this.refreshCurrentTrackVisibility();
    },
    isCurrentPlaylist() {
      this.refreshCurrentTrackVisibility();
    },
  },
  created() {
    if (this.$route.name === 'likedSongs') {
      this.loadData(this.data.likedSongPlaylistID);
    } else {
      this.loadData(this.$route.params.id);
    }
    setTimeout(() => {
      if (!this.show) NProgress.start();
    }, 1000);
  },
  mounted() {
    this.refreshCurrentTrackVisibility();
  },
  beforeUnmount() {
    this.currentTrackVisibilityObserver?.disconnect();
    if (this.debounceTimeout) clearTimeout(this.debounceTimeout);
  },
  methods: {
    ...mapMutations(['appendTrackToPlayerList', 'updateModal']),
    ...mapActions(['playFirstTrackOnList', 'playTrackOnListByID', 'showToast']),
    playPlaylistByID(trackID = 'first') {
      const trackIDs = this.playlist.trackIds.map(t => t.id);
      this.$store.state.player.replacePlaylist(
        trackIDs,
        this.playlist.id,
        'playlist',
        trackID,
        { name: this.playlist.name, coverImgUrl: this.playlist.coverImgUrl }
      );
    },
    likePlaylist(toast = false) {
      if (!isAccountLoggedIn()) {
        this.showToast(locale.global.t('toast.needToLogin'));
        return;
      }
      subscribePlaylist({
        id: this.playlist.id,
        t: this.playlist.subscribed ? 2 : 1,
      }).then(data => {
        if (data.code === 200) {
          this.playlist.subscribed = !this.playlist.subscribed;
          if (toast === true) {
            this.showToast(
              this.playlist.subscribed ? '已保存到音乐库' : '已从音乐库删除'
            );
          }
        }
        getPlaylistDetail(this.id, true).then(data => {
          this.playlist = data.playlist;
        });
      });
    },
    loadData(id, next = undefined) {
      this.id = id;
      getPlaylistDetail(this.id, true)
        .then(data => {
          this.playlist = data.playlist;
          this.tracks = data.playlist.tracks;
          NProgress.done();
          if (next !== undefined) next();
          this.show = true;
          this.lastLoadedTrackIndex = data.playlist.tracks.length - 1;
          return data;
        })
        .then(() => {
          if (this.playlist.trackCount > this.tracks.length) {
            this.loadingMore = true;
            this.loadMore();
          }
        });
    },
    loadMore(loadNum = 100) {
      if (this.loadMorePromise) return this.loadMorePromise;
      let trackIDs = this.playlist.trackIds.filter((t, index) => {
        return (
          index > this.lastLoadedTrackIndex &&
          index <= this.lastLoadedTrackIndex + loadNum
        );
      });
      trackIDs = trackIDs.map(t => t.id);
      if (trackIDs.length === 0) return Promise.resolve();

      this.loadingMore = true;
      this.loadMorePromise = getTrackDetail(trackIDs.join(','))
        .then(data => {
          this.tracks.push(...data.songs);
          this.lastLoadedTrackIndex += trackIDs.length;
          this.hasMore =
            this.lastLoadedTrackIndex + 1 !== this.playlist.trackIds.length;
        })
        .finally(() => {
          this.loadingMore = false;
          this.loadMorePromise = null;
        });
      return this.loadMorePromise;
    },
    async scrollToCurrentTrack() {
      const targetIndex = this.currentTrackIndex;
      if (targetIndex < 0 || this.locatingCurrentTrack) return;
      this.locatingCurrentTrack = true;
      try {
        if (this.searchKeyWords || this.inputSearchKeyWords) {
          this.searchKeyWords = '';
          this.inputSearchKeyWords = '';
        }
        if (this.loadMorePromise) await this.loadMorePromise;
        if (targetIndex > this.lastLoadedTrackIndex) {
          await this.loadMore(targetIndex - this.lastLoadedTrackIndex);
        }
        await this.$nextTick();
        this.$refs.trackList?.scrollToTrack(this.currentTrackID);
      } finally {
        this.locatingCurrentTrack = false;
      }
    },
    refreshCurrentTrackVisibility() {
      this.currentTrackVisibilityObserver?.disconnect();
      this.currentTrackVisibilityObserver = null;
      this.currentTrackVisible = false;
      if (this.currentTrackIndex < 0) return;
      this.$nextTick(() => {
        const observedTrackID = String(this.currentTrackID);
        const trackElement =
          this.$refs.trackList?.getTrackElement(observedTrackID);
        if (!trackElement || typeof IntersectionObserver === 'undefined')
          return;
        const scrollContainer = document.querySelector('main');
        this.currentTrackVisibilityObserver = new IntersectionObserver(
          entries => {
            if (
              !this.isCurrentPlaylist ||
              String(this.currentTrackID) !== observedTrackID
            ) {
              return;
            }
            this.currentTrackVisible = entries[0]?.isIntersecting === true;
          },
          {
            root: scrollContainer,
            rootMargin: '-64px 0px -64px 0px',
            threshold: 0.25,
          }
        );
        this.currentTrackVisibilityObserver.observe(trackElement);
      });
    },
    openMenu(e) {
      this.$refs.playlistMenu.openMenu(e);
    },
    async openPlaylistDownload() {
      NProgress.start();
      try {
        if (this.loadMorePromise) await this.loadMorePromise;
        while (this.lastLoadedTrackIndex < this.playlist.trackIds.length - 1) {
          const previousIndex = this.lastLoadedTrackIndex;
          await this.loadMore(100);
          if (this.lastLoadedTrackIndex === previousIndex) break;
        }
        const tracksById = new Map(
          this.tracks.map(track => [String(track.id), track])
        );
        const tracks = this.playlist.trackIds
          .map(track => tracksById.get(String(track.id)))
          .filter(Boolean);
        if (tracks.length === 0) {
          this.showToast(this.$t('downloadTrack.emptyPlaylist'));
          return;
        }
        this.updateModal({
          modalName: 'downloadTrackModal',
          key: 'selectedTrack',
          value: null,
        });
        this.updateModal({
          modalName: 'downloadTrackModal',
          key: 'selectedTracks',
          value: tracks,
        });
        this.updateModal({
          modalName: 'downloadTrackModal',
          key: 'playlistName',
          value: this.playlist.name || this.$t('downloadTrack.playlistTitle'),
        });
        this.updateModal({
          modalName: 'downloadTrackModal',
          key: 'show',
          value: true,
        });
      } catch (error) {
        console.error('[track-download] failed to prepare playlist', error);
        this.showToast(
          this.$t('downloadTrack.prepareFailed', {
            error: error?.message || String(error),
          })
        );
      } finally {
        NProgress.done();
      }
    },
    deletePlaylist() {
      if (!isAccountLoggedIn()) {
        this.showToast(locale.global.t('toast.needToLogin'));
        return;
      }
      const confirmation = confirm(`确定要删除歌单 ${this.playlist.name}？`);
      if (confirmation === true) {
        deletePlaylist(this.playlist.id).then(data => {
          if (data.code === 200) {
            nativeAlert(`已删除歌单 ${this.playlist.name}`);
            this.$router.go(-1);
          } else {
            nativeAlert('发生错误');
          }
        });
      }
    },
    editPlaylist() {
      nativeAlert('此功能开发中');
    },
    async searchInPlaylist() {
      this.displaySearchInPlaylist =
        !this.displaySearchInPlaylist || this.isLikeSongsPage;
      if (this.displaySearchInPlaylist === false) {
        this.searchKeyWords = '';
        this.inputSearchKeyWords = '';
        return;
      }

      this.searchInputWidth = '172px';
      await this.$nextTick();

      try {
        if (this.loadMorePromise) await this.loadMorePromise;
        while (this.lastLoadedTrackIndex < this.playlist.trackIds.length - 1) {
          const previousIndex = this.lastLoadedTrackIndex;
          await this.loadMore(100);
          if (this.lastLoadedTrackIndex === previousIndex) break;
        }
      } catch (error) {
        console.debug('[playlist-search] failed to load all tracks', error);
      }
    },
    removeTrack(trackID) {
      if (!isAccountLoggedIn()) {
        this.showToast(locale.global.t('toast.needToLogin'));
        return;
      }
      this.tracks = this.tracks.filter(t => t.id !== trackID);
    },
    inputDebounce() {
      if (this.debounceTimeout) clearTimeout(this.debounceTimeout);
      this.debounceTimeout = setTimeout(() => {
        this.searchKeyWords = this.inputSearchKeyWords;
      }, 300);
    },
    toggleFullDescription() {
      this.showFullDescription = !this.showFullDescription;
      this.$store.commit('enableScrolling', !this.showFullDescription);
    },
  },
};
</script>

<style lang="scss" scoped>
.playlist {
  margin-top: 32px;
}

.locate-current-track-button {
  position: fixed;
  right: 32px;
  bottom: 88px;
  z-index: 90;
  margin-right: 0;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.14);
}

.locate-button-enter-active {
  transition:
    opacity 0.24s ease-out,
    transform 0.32s cubic-bezier(0.22, 1, 0.36, 1);
}
.locate-button-leave-active {
  transition:
    opacity 0.18s ease-in,
    transform 0.2s ease-in;
}
.locate-button-enter-from,
.locate-button-leave-to {
  opacity: 0;
  transform: translateY(18px) scale(0.88);
}

@media (max-width: 834px) {
  .locate-current-track-button {
    right: 20px;
    bottom: 84px;
  }
}

.playlist-info {
  display: flex;
  margin-bottom: 72px;
  position: relative;
  .info {
    display: flex;
    flex-direction: column;
    justify-content: center;
    flex: 1;
    margin-left: 56px;
    .title {
      font-size: 36px;
      font-weight: 700;
      color: var(--color-text);
      .lock-icon {
        opacity: 0.28;
        color: var(--color-text);
        margin-right: 8px;
        .svg-icon {
          height: 26px;
          width: 26px;
        }
      }
    }
    .artist {
      font-size: 18px;
      opacity: 0.88;
      color: var(--color-text);
      margin-top: 24px;
    }
    .date-and-count {
      font-size: 14px;
      opacity: 0.68;
      color: var(--color-text);
      margin-top: 2px;
    }
    .description {
      font-size: 14px;
      opacity: 0.68;
      color: var(--color-text);
      margin-top: 24px;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 3;
      overflow: hidden;
      cursor: pointer;
      &:hover {
        transition: opacity 0.3s;
        opacity: 0.88;
      }
    }
    .buttons {
      margin-top: 32px;
      display: flex;
      button {
        margin-right: 16px;
      }
    }
  }
}

.special-playlist {
  margin-top: 192px;
  margin-bottom: 128px;
  border-radius: 1.25em;
  text-align: center;
  @keyframes letterSpacing4 {
    from {
      letter-spacing: 0px;
    }
    to {
      letter-spacing: 4px;
    }
  }
  @keyframes letterSpacing1 {
    from {
      letter-spacing: 0px;
    }
    to {
      letter-spacing: 1px;
    }
  }
  .title {
    font-size: 84px;
    line-height: 1.05;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 4px;
    animation-duration: 0.8s;
    animation-name: letterSpacing4;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
  .subtitle {
    font-size: 18px;
    letter-spacing: 1px;
    margin: 28px 0 54px 0;
    animation-duration: 0.8s;
    animation-name: letterSpacing1;
    text-transform: uppercase;
    color: var(--color-text);
  }
  .buttons {
    margin-top: 32px;
    display: flex;
    justify-content: center;
    button {
      margin-right: 16px;
    }
  }
}

.gradient-test {
  background-image: linear-gradient(to left, #92fe9d 0%, #00c9ff 100%);
}
[data-theme='dark'] .gradient-radar {
  background-image: linear-gradient(to left, #92fe9d 0%, #00c9ff 100%);
}
.gradient-radar {
  background-image: linear-gradient(to left, #0ba360 0%, #3cba92 100%);
}
.gradient-blue-purple {
  background-image: linear-gradient(
    45deg,
    #89c4f5 0%,
    #6284ff 42%,
    #ff0000 100%
  );
}
.gradient-sharp-blue {
  background-image: linear-gradient(45deg, #00c6fb 0%, #005bea 100%);
}
.gradient-yellow-pink {
  background-image: linear-gradient(45deg, #f6d365 0%, #fda085 100%);
}
.gradient-pink {
  background-image: linear-gradient(45deg, #ee9ca7 0%, #ffdde1 100%);
}
.gradient-indigo-pink-yellow {
  background-image: linear-gradient(
    43deg,
    #4158d0 0%,
    #c850c0 46%,
    #ffcc70 100%
  );
}
.gradient-light-red-light-blue {
  background-image: linear-gradient(
    225deg,
    hsl(190, 30%, 50%) 0%,
    #081abb 38%,
    #ec3841 58%,
    hsl(13, 99%, 49%) 100%
  );
}
.gradient-fog {
  background:
    linear-gradient(-180deg, #bcc5ce 0%, #929ead 98%),
    radial-gradient(
      at top left,
      rgba(255, 255, 255, 0.3) 0%,
      rgba(0, 0, 0, 0.3) 100%
    );
  background-blend-mode: screen;
}
.gradient-red {
  background-image: linear-gradient(213deg, #ff0844 0%, #ffb199 100%);
}
.gradient-sky-blue {
  background-image: linear-gradient(147deg, #48c6ef 0%, #6f86d6 100%);
}
.gradient-dark-blue-midnight-blue {
  background-image: linear-gradient(213deg, #09203f 0%, #537895 100%);
}
.gradient-yellow-red {
  background: linear-gradient(147deg, #fec867 0%, #f72c61 100%);
}
.gradient-yellow {
  background: linear-gradient(147deg, #fceb02 0%, #fec401 100%);
}
.gradient-midnight-blue {
  background-image: linear-gradient(-20deg, #2b5876 0%, #4e4376 100%);
}
.gradient-orange-red {
  background-image: linear-gradient(147deg, #ffe53b 0%, #ff2525 74%);
}
.gradient-moonstone-blue {
  background-image: linear-gradient(
    147deg,
    hsl(200, 34%, 8%) 0%,
    hsl(204, 35%, 38%) 50%,
    hsl(200, 34%, 18%) 100%
  );
}
.gradient-pink-purple-blue {
  background-image: linear-gradient(
    to right,
    #ff3cac 0%,
    #784ba0 50%,
    #2b86c5 100%
  ) !important;
}
.gradient-green {
  background-image: linear-gradient(
    90deg,
    #c6f6d5,
    #68d391,
    #38b2ac
  ) !important;
}

.user-info {
  h1 {
    font-size: 42px;
    position: relative;
    color: var(--color-text);
    .avatar {
      height: 44px;
      margin-right: 12px;
      vertical-align: -7px;
      border-radius: 50%;
      border: rgba(0, 0, 0, 0.2);
    }
  }
}

.search-box {
  display: flex;
  justify-content: flex-end;
  -webkit-app-region: no-drag;
  .container {
    display: flex;
    align-items: center;
    width: 200px;
    height: 36px;
    background: var(--color-secondary-bg-for-transparent);
    border-radius: 8px;
  }
  .input {
    flex: 1 1 auto;
    min-width: 0;
  }
  .svg-icon {
    height: 15px;
    width: 15px;
    color: var(--color-text);
    opacity: 0.28;
    margin-left: 8px;
    margin-right: 4px;
  }
  input {
    box-sizing: border-box;
    width: 100%;
    font-size: 16px;
    border: none;
    outline: none;
    background: transparent;
    font-weight: 600;
    color: var(--color-text);
  }
  .active {
    background: var(--color-primary-bg-for-transparent);
    input,
    .svg-icon {
      opacity: 1;
      color: var(--color-primary);
    }
  }
}

.playlist-search-box {
  position: static;
  width: 100%;
  margin: -48px 0 24px;
}
.special-playlist + .playlist-search-box {
  margin-top: -96px;
}

[data-theme='dark'] {
  .search-box .active,
  .search-box-likepage .active {
    input,
    .svg-icon {
      color: var(--color-text);
    }
  }
}

.search-box-likepage {
  display: flex;
  position: absolute;
  right: 12vw;
  top: 95px;
  justify-content: flex-end;
  -webkit-app-region: no-drag;
  .input {
    transition: all 0.5s;
  }
  .container {
    display: flex;
    align-items: center;
    height: 32px;
    background: var(--color-secondary-bg-for-transparent);
    border-radius: 8px;
  }
  .svg-icon {
    height: 15px;
    width: 15px;
    color: var(--color-text);
    opacity: 0.28;
    margin-left: 8px;
    margin-right: 8px;
  }
  input {
    font-size: 16px;
    border: none;
    outline: none;
    background: transparent;
    width: 96%;
    font-weight: 600;
    color: var(--color-text);
  }
  .active {
    background: var(--color-primary-bg-for-transparent);
    input,
    .svg-icon {
      opacity: 1;
      color: var(--color-primary);
    }
  }
}

@media (max-width: 1336px) {
  .search-box-likepage {
    right: 8vw;
  }
}

.load-more {
  display: flex;
  justify-content: center;
  margin-top: 32px;
}

@media (max-width: 768px) {
  .playlist {
    margin-top: 8px;
  }
  .playlist-info {
    margin-bottom: 36px;
    flex-direction: column;
    align-items: center;
    :deep(.cover-container) {
      width: min(58vw, 220px) !important;
      height: min(58vw, 220px) !important;
    }
    .info {
      width: 100%;
      margin: 24px 0 0;
      align-items: center;
      text-align: center;
      .title {
        font-size: 28px;
        line-height: 1.15;
      }
      .artist {
        margin-top: 14px;
        font-size: 15px;
      }
      .description {
        margin-top: 14px;
      }
      .buttons {
        margin-top: 22px;
      }
    }
  }
  .special-playlist {
    margin: 64px 0;
    .title {
      font-size: 48px;
    }
  }
  .playlist-search-box,
  .special-playlist + .playlist-search-box {
    box-sizing: border-box;
    margin: -18px 0 18px;
  }
  .playlist-search-box .container {
    width: 100%;
    height: 42px;
    border-radius: 10px;
  }
  .playlist-search-box input {
    font-size: 16px;
    min-height: 40px;
  }
  .locate-current-track-button {
    right: 18px;
    bottom: calc(144px + env(safe-area-inset-bottom));
  }
  .search-box-likepage {
    position: static;
    margin-bottom: 18px;
  }
}
</style>
