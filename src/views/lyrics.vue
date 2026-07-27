<template>
  <transition name="slide-up">
    <div
      class="lyrics-page"
      :class="{ 'no-lyric': noLyric }"
      :data-theme="theme"
    >
      <div
        v-if="
          (settings.lyricsBackground === 'blur') |
            (settings.lyricsBackground === 'dynamic')
        "
        class="lyrics-background"
        :class="{
          'dynamic-background': settings.lyricsBackground === 'dynamic',
        }"
      >
        <div
          class="top-right"
          :style="{ backgroundImage: `url(${bgImageUrl})` }"
        />
        <div
          class="bottom-left"
          :style="{ backgroundImage: `url(${bgImageUrl})` }"
        />
      </div>
      <div
        v-if="settings.lyricsBackground === true"
        class="gradient-background"
        :style="{ background }"
      ></div>

      <div class="left-side">
        <div>
          <div v-if="settings.showLyricsTime" class="date">
            {{ date }}
          </div>
          <div class="cover">
            <div class="cover-container">
              <img :src="imageUrl" loading="lazy" />
              <div
                class="shadow"
                :style="{ backgroundImage: `url(${imageUrl})` }"
              ></div>
            </div>
          </div>
          <div class="controls">
            <div class="top-part">
              <div class="track-info">
                <div class="title" :title="currentTrack.name">
                  <router-link
                    v-if="hasList()"
                    :to="`${getListPath()}`"
                    @click="toggleLyrics"
                    >{{ currentTrack.name }}
                  </router-link>
                  <span v-else>
                    {{ currentTrack.name }}
                  </span>
                </div>
                <div class="subtitle">
                  <router-link
                    v-if="artist.id !== 0"
                    :to="`/artist/${artist.id}`"
                    @click="toggleLyrics"
                    >{{ artist.name }}
                  </router-link>
                  <span v-else>
                    {{ artist.name }}
                  </span>
                  <span v-if="album.id !== 0">
                    -
                    <router-link
                      :to="`/album/${album.id}`"
                      :title="album.name"
                      @click="toggleLyrics"
                      >{{ album.name }}
                    </router-link>
                  </span>
                </div>
              </div>
              <div class="top-right">
                <div class="volume-control" @wheel.prevent="handleVolumeWheel">
                  <button-icon :title="$t('player.mute')" @click="mute">
                    <svg-icon v-show="volume > 0.5" icon-class="volume" />
                    <svg-icon v-show="volume === 0" icon-class="volume-mute" />
                    <svg-icon
                      v-show="volume <= 0.5 && volume !== 0"
                      icon-class="volume-half"
                    />
                  </button-icon>
                  <div class="volume-bar">
                    <vue-slider
                      v-model="volume"
                      :min="0"
                      :max="1"
                      :interval="0.01"
                      :drag-on-click="true"
                      :duration="0"
                      tooltip="none"
                      :dot-size="12"
                    ></vue-slider>
                  </div>
                </div>
                <div class="buttons">
                  <button-icon
                    :title="$t('player.like')"
                    @click="likeATrack(player.currentTrack.id)"
                  >
                    <svg-icon
                      :icon-class="
                        player.isCurrentTrackLiked ? 'heart-solid' : 'heart'
                      "
                    />
                  </button-icon>
                  <button-icon
                    :title="$t('contextMenu.addToPlaylist')"
                    @click="addToPlaylist"
                  >
                    <svg-icon icon-class="plus" />
                  </button-icon>
                  <!-- <button-icon @click="openMenu" title="Menu"
                    ><svg-icon icon-class="more"
                  /></button-icon> -->
                </div>
              </div>
            </div>
            <div class="progress-bar">
              <span>{{ formatTrackTime(progress) || '0:00' }}</span>
              <div class="slider">
                <vue-slider
                  v-model="progress"
                  :min="0"
                  :max="player.currentTrackDuration"
                  :interval="1"
                  :drag-on-click="true"
                  :duration="0"
                  :dot-size="12"
                  :height="2"
                  :tooltip-formatter="formatTrackTime"
                  :lazy="true"
                  :silent="true"
                ></vue-slider>
              </div>
              <span>{{ formatTrackTime(player.currentTrackDuration) }}</span>
            </div>
            <div class="media-controls">
              <button-icon
                v-show="!player.isPersonalFM"
                :title="
                  player.repeatMode === 'one'
                    ? $t('player.repeatTrack')
                    : $t('player.repeat')
                "
                :class="{ active: player.repeatMode !== 'off' }"
                @click="switchRepeatMode"
              >
                <svg-icon
                  v-show="player.repeatMode !== 'one'"
                  icon-class="repeat"
                />
                <svg-icon
                  v-show="player.repeatMode === 'one'"
                  icon-class="repeat-1"
                />
              </button-icon>
              <div class="middle">
                <button-icon
                  v-show="!player.isPersonalFM"
                  :title="$t('player.previous')"
                  @click="playPrevTrack"
                >
                  <svg-icon icon-class="previous" />
                </button-icon>
                <button-icon
                  v-show="player.isPersonalFM"
                  title="不喜欢"
                  @click="moveToFMTrash"
                >
                  <svg-icon icon-class="thumbs-down" />
                </button-icon>
                <button-icon
                  id="play"
                  :title="$t(playing ? 'player.pause' : 'player.play')"
                  @click="playOrPause"
                >
                  <svg-icon :icon-class="playing ? 'pause' : 'play'" />
                </button-icon>
                <button-icon :title="$t('player.next')" @click="playNextTrack">
                  <svg-icon icon-class="next" />
                </button-icon>
              </div>
              <button-icon
                v-show="!player.isPersonalFM"
                :title="$t('player.shuffle')"
                :class="{ active: player.shuffle }"
                @click="switchShuffle"
              >
                <svg-icon icon-class="shuffle" />
              </button-icon>
              <button-icon
                v-show="isShowLyricTypeSwitch"
                :title="$t(lyricDisplayModeTitle)"
                @click="switchLyricType"
              >
                <span class="lyric-switch-icon">{{
                  $t(lyricDisplayModeLabel)
                }}</span>
              </button-icon>
            </div>
          </div>
        </div>
      </div>
      <div class="right-side">
        <transition name="slide-fade">
          <button-icon
            v-show="!noLyric && !shouldAutoScrollLyrics"
            class="back-to-current-lyric"
            title="回到当前歌词"
            @click="resumeLyricsAutoScroll"
          >
            <svg-icon icon-class="arrow-down" />
          </button-icon>
        </transition>
        <transition name="slide-fade">
          <div
            v-show="!noLyric"
            ref="lyricsContainer"
            class="lyrics-container"
            :style="lyricFontSize"
            @scroll="handleLyricsScroll"
            @wheel.passive="pauseLyricsAutoScroll"
            @touchstart.passive="pauseLyricsAutoScroll"
            @mousedown="pauseLyricsAutoScroll"
          >
            <div
              class="lyrics-edge-spacer"
              :style="{ height: lyricsEdgeSpacerHeight }"
            ></div>
            <div
              v-for="(line, index) in lyricToShow"
              :id="`line${index}`"
              :key="index"
              class="line"
              :class="{
                highlight: highlightLyricIndex === index,
              }"
              @click="clickLyricLine(line.time)"
              @dblclick="clickLyricLine(line.time, true)"
            >
              <div class="content">
                <span
                  v-if="line.contents[0]"
                  @click.right="openLyricMenu($event, line, 0)"
                  >{{ line.contents[0] }}</span
                >
                <br />
                <span
                  v-if="line.contents[1] && showSecondaryLyric"
                  class="translation"
                  @click.right="openLyricMenu($event, line, 1)"
                  >{{ line.contents[1] }}</span
                >
              </div>
            </div>
            <div
              class="lyrics-edge-spacer"
              :style="{ height: lyricsEdgeSpacerHeight }"
            ></div>
            <ContextMenu v-if="!noLyric" ref="lyricMenu">
              <div class="item" @click="copyLyric(false)">{{
                $t('contextMenu.copyLyric')
              }}</div>
              <div
                v-if="
                  rightClickLyric &&
                  rightClickLyric.contents[1] &&
                  showSecondaryLyric
                "
                class="item"
                @click="copyLyric(true)"
                >{{ $t('contextMenu.copyLyricWithTranslation') }}</div
              >
            </ContextMenu>
          </div>
        </transition>
      </div>
      <div class="close-button" @click="toggleLyrics">
        <button>
          <svg-icon icon-class="arrow-down" />
        </button>
      </div>
      <div class="close-button" style="left: 24px" @click="fullscreen">
        <button>
          <svg-icon v-if="isFullscreen" icon-class="fullscreen-exit" />
          <svg-icon v-else icon-class="fullscreen" />
        </button>
      </div>
    </div>
  </transition>
</template>

<script>
// The lyrics page of Apple Music is so gorgeous, so I copy the design.
// Some of the codes are from https://github.com/sl1673495/vue-netease-music

import { mapState, mapMutations, mapActions } from 'vuex';
import VueSlider from 'vue-slider-component';
import ContextMenu from '@/components/ContextMenu.vue';
import { formatTrackTime } from '@/utils/common';
import { getLyric, getCloudLyric } from '@/api/track';
import { lyricParser, copyLyric, parseLyric } from '@/utils/lyrics';
import {
  getLyricDisplayModes,
  getNextLyricDisplayMode,
  LYRIC_DISPLAY_MODE,
} from '@/utils/lyricDisplayMode';
import ButtonIcon from '@/components/ButtonIcon.vue';
import { Vibrant } from 'node-vibrant/browser';
import Color from 'color';
import { isAccountLoggedIn } from '@/utils/auth';
import { hasListSource, getListSourcePath } from '@/utils/playList';
import locale from '@/locale';
import { getWheelAdjustedVolume } from '@/utils/volume';

export default {
  name: 'Lyrics',
  components: {
    VueSlider,
    ButtonIcon,
    ContextMenu,
  },
  data() {
    return {
      lyricsInterval: null,
      lyric: [],
      tlyric: [],
      romalyric: [],
      lyricType: 'translation', // or 'romaPronunciation'
      highlightLyricIndex: -1,
      isAutoScrollingLyrics: false,
      shouldAutoScrollLyrics: true,
      lyricsAutoScrollTimer: null,
      lyricsAutoResumeTimer: null,
      lyricsEdgeSpacerHeight: '50%',
      minimize: true,
      background: '',
      date: this.formatTime(new Date()),
      isFullscreen: !!document.fullscreenElement,
      rightClickLyric: null,
      updateLyricsEdgeSpacerOnResize: null,
    };
  },
  computed: {
    ...mapState(['player', 'playerVersion', 'settings', 'showLyrics']),
    currentTrack() {
      const version = this.playerVersion;
      if (version < 0) return this.player.currentTrack;
      return this.player.currentTrack;
    },
    volume: {
      get() {
        return this.player.volume;
      },
      set(value) {
        this.player.volume = value;
      },
    },
    imageUrl() {
      const picUrl = this.currentTrack?.al?.picUrl;
      return picUrl ? `${picUrl}?param=1024y1024` : '';
    },
    playing() {
      void this.playerVersion;
      return this.player.playing;
    },
    progress: {
      get() {
        void this.playerVersion;
        return this.player.progress;
      },
      set(value) {
        this.player.progress = value;
      },
    },
    bgImageUrl() {
      const picUrl = this.currentTrack?.al?.picUrl;
      return picUrl ? `${picUrl}?param=512y512` : '';
    },
    isShowLyricTypeSwitch() {
      return (
        this.settings.showLyricsTranslation === true &&
        this.lyricDisplayModes.length > 1
      );
    },
    lyricDisplayModes() {
      return getLyricDisplayModes({
        hasTranslation: this.tlyric.length > 0,
        hasPronunciation: this.romalyric.length > 0,
      });
    },
    lyricDisplayModeLabel() {
      return {
        [LYRIC_DISPLAY_MODE.TRANSLATION]:
          'player.secondaryLyricTranslationShort',
        [LYRIC_DISPLAY_MODE.PRONUNCIATION]:
          'player.secondaryLyricPronunciationShort',
        [LYRIC_DISPLAY_MODE.NONE]: 'player.secondaryLyricHiddenShort',
      }[this.lyricType];
    },
    lyricDisplayModeTitle() {
      return {
        [LYRIC_DISPLAY_MODE.TRANSLATION]: 'player.translationLyric',
        [LYRIC_DISPLAY_MODE.PRONUNCIATION]: 'player.PronunciationLyric',
        [LYRIC_DISPLAY_MODE.NONE]: 'player.secondaryLyricHidden',
      }[this.lyricType];
    },
    showSecondaryLyric() {
      return (
        this.settings.showLyricsTranslation === true &&
        this.lyricType !== LYRIC_DISPLAY_MODE.NONE
      );
    },
    desktopLyricsEnabled() {
      return this.settings.enableDesktopLyrics === true;
    },
    desktopLyricsTranslationEnabled() {
      return this.showSecondaryLyric;
    },
    lyricToShow() {
      if (this.lyricType === LYRIC_DISPLAY_MODE.PRONUNCIATION) {
        return this.lyricWithRomaPronunciation;
      }
      if (this.lyricType === LYRIC_DISPLAY_MODE.TRANSLATION) {
        return this.lyricWithTranslation;
      }
      return this.lyricWithoutSecondary;
    },
    lyricWithoutSecondary() {
      return this.lyric
        .filter(({ content }) => Boolean(content))
        .map(({ time, content }) => ({
          time,
          content,
          contents: [content],
        }));
    },
    lyricWithTranslation() {
      let ret = [];
      // 空内容的去除
      const lyricFiltered = this.lyric.filter(({ content }) =>
        Boolean(content)
      );
      // content统一转换数组形式
      if (lyricFiltered.length) {
        lyricFiltered.forEach(l => {
          const { rawTime, time, content } = l;
          const lyricItem = { time, content, contents: [content] };
          const sameTimeTLyric = this.tlyric.find(
            ({ rawTime: tLyricRawTime }) => tLyricRawTime === rawTime
          );
          if (sameTimeTLyric) {
            const { content: tLyricContent } = sameTimeTLyric;
            if (content) {
              lyricItem.contents.push(tLyricContent);
            }
          }
          ret.push(lyricItem);
        });
      } else {
        ret = lyricFiltered.map(({ time, content }) => ({
          time,
          content,
          contents: [content],
        }));
      }
      return ret;
    },
    lyricWithRomaPronunciation() {
      let ret = [];
      // 空内容的去除
      const lyricFiltered = this.lyric.filter(({ content }) =>
        Boolean(content)
      );
      // content统一转换数组形式
      if (lyricFiltered.length) {
        lyricFiltered.forEach(l => {
          const { rawTime, time, content } = l;
          const lyricItem = { time, content, contents: [content] };
          const sameTimeRomaLyric = this.romalyric.find(
            ({ rawTime: tLyricRawTime }) => tLyricRawTime === rawTime
          );
          if (sameTimeRomaLyric) {
            const { content: romaLyricContent } = sameTimeRomaLyric;
            if (content) {
              lyricItem.contents.push(romaLyricContent);
            }
          }
          ret.push(lyricItem);
        });
      } else {
        ret = lyricFiltered.map(({ time, content }) => ({
          time,
          content,
          contents: [content],
        }));
      }
      return ret;
    },
    lyricFontSize() {
      return {
        fontSize: `${this.$store.state.settings.lyricFontSize || 28}px`,
      };
    },
    noLyric() {
      return this.lyric.length == 0;
    },
    artist() {
      return this.currentTrack?.ar
        ? this.currentTrack.ar[0]
        : { id: 0, name: 'unknown' };
    },
    album() {
      return this.currentTrack?.al || { id: 0, name: 'unknown' };
    },
    theme() {
      return this.settings.lyricsBackground === true ? 'dark' : 'auto';
    },
  },
  watch: {
    currentTrack() {
      this.shouldAutoScrollLyrics = true;
      this.highlightLyricIndex = -1;
      this.clearDesktopLyrics();
      clearTimeout(this.lyricsAutoResumeTimer);
      Promise.resolve(this.getLyric()).then(() => {
        this.$nextTick(() => this.syncCurrentLyricPosition(true));
      });
      this.getCoverColor();
    },
    showLyrics(show) {
      if (show) {
        this.shouldAutoScrollLyrics = true;
        this.$nextTick(() => this.updateLyricsEdgeSpacer());
        this.setLyricsInterval();
        this.$store.commit('enableScrolling', false);
      } else {
        if (!this.desktopLyricsEnabled) clearInterval(this.lyricsInterval);
        clearTimeout(this.lyricsAutoScrollTimer);
        clearTimeout(this.lyricsAutoResumeTimer);
        this.$store.commit('enableScrolling', true);
      }
    },
    desktopLyricsEnabled(enabled) {
      if (enabled) {
        this.setLyricsInterval();
        this.syncCurrentLyricPosition(true);
      } else {
        this.clearDesktopLyrics();
        if (!this.showLyrics) clearInterval(this.lyricsInterval);
      }
    },
    desktopLyricsTranslationEnabled() {
      this.publishDesktopLyrics();
    },
    lyricType() {
      this.publishDesktopLyrics();
    },
  },
  created() {
    this.getLyric();
    if (this.desktopLyricsEnabled) this.setLyricsInterval();
    this.getCoverColor();
    this.initDate();
    document.addEventListener('keydown', e => {
      if (e.key === 'F11') {
        e.preventDefault();
        this.fullscreen();
      }
    });
    document.addEventListener('fullscreenchange', () => {
      this.isFullscreen = !!document.fullscreenElement;
    });
    this.updateLyricsEdgeSpacerOnResize = () => this.updateLyricsEdgeSpacer();
    window.addEventListener('resize', this.updateLyricsEdgeSpacerOnResize);
  },
  beforeUnmount: function () {
    if (this.timer) {
      clearInterval(this.timer);
    }
  },
  unmounted() {
    this.clearDesktopLyrics();
    clearInterval(this.lyricsInterval);
    clearTimeout(this.lyricsAutoScrollTimer);
    clearTimeout(this.lyricsAutoResumeTimer);
    window.removeEventListener('resize', this.updateLyricsEdgeSpacerOnResize);
  },
  methods: {
    ...mapMutations(['toggleLyrics', 'updateModal']),
    ...mapActions(['likeATrack']),
    initDate() {
      var _this = this;
      clearInterval(this.timer);
      this.timer = setInterval(function () {
        _this.date = _this.formatTime(new Date());
      }, 1000);
    },
    formatTime(value) {
      let hour = value.getHours().toString();
      let minute = value.getMinutes().toString();
      let second = value.getSeconds().toString();
      return (
        hour.padStart(2, '0') +
        ':' +
        minute.padStart(2, '0') +
        ':' +
        second.padStart(2, '0')
      );
    },
    fullscreen() {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        document.documentElement.requestFullscreen();
      }
    },
    addToPlaylist() {
      if (!isAccountLoggedIn()) {
        this.showToast(locale.t('toast.needToLogin'));
        return;
      }
      this.$store.dispatch('fetchLikedPlaylist');
      this.updateModal({
        modalName: 'addTrackToPlaylistModal',
        key: 'show',
        value: true,
      });
      this.updateModal({
        modalName: 'addTrackToPlaylistModal',
        key: 'selectedTrackID',
        value: this.currentTrack?.id,
      });
    },
    playPrevTrack() {
      this.player.playPrevTrack();
    },
    playOrPause() {
      this.player.playOrPause();
    },
    playNextTrack() {
      if (this.player.isPersonalFM) {
        this.player.playNextFMTrack();
      } else {
        this.player.playNextTrack();
      }
    },
    getLyric() {
      if (!this.currentTrack.id) return;
      const trackId = this.currentTrack.id;
      if (
        this.currentTrack.pc !== null &&
        this.currentTrack.cd === null &&
        this.$store.state.data.user?.userId
      ) {
        //云盘未设置关联的歌曲获取其内置歌词
        return getCloudLyric(trackId, this.$store.state.data.user?.userId).then(
          data => {
            this.tlyric = [];
            this.romalyric = [];
            this.lyric = data?.lrc?.length > 0 ? parseLyric(data.lrc) : [];
            this.player.updateMprisLyrics(this.lyric, trackId);
            this.resetLyricType();
            return true;
          }
        );
      }
      return getLyric(trackId).then(data => {
        if (!data?.lrc?.lyric) {
          this.lyric = [];
          this.tlyric = [];
          this.romalyric = [];
          this.player.updateMprisLyrics([], trackId);
          this.resetLyricType();
          return false;
        } else {
          let { lyric, tlyric, romalyric } = lyricParser(data);
          lyric = lyric.filter(
            l => !/^作(词|曲)\s*(:|：)\s*无$/.exec(l.content)
          );
          let includeAM =
            lyric.length <= 10 &&
            lyric.map(l => l.content).includes('纯音乐，请欣赏');
          if (includeAM) {
            let reg = /^作(词|曲)\s*(:|：)\s*/;
            let author = this.currentTrack?.ar[0]?.name;
            lyric = lyric.filter(l => {
              let regExpArr = l.content.match(reg);
              return (
                !regExpArr || l.content.replace(regExpArr[0], '') !== author
              );
            });
          }
          if (lyric.length === 1 && includeAM) {
            this.lyric = [];
            this.tlyric = [];
            this.romalyric = [];
            this.player.updateMprisLyrics([], trackId);
            this.resetLyricType();
            return false;
          } else {
            this.lyric = lyric;
            this.tlyric = tlyric;
            this.romalyric = romalyric;
            this.player.updateMprisLyrics(this.lyric, trackId);
            this.resetLyricType();
            return true;
          }
        }
      });
    },
    resetLyricType() {
      this.lyricType = this.lyricDisplayModes[0] || LYRIC_DISPLAY_MODE.NONE;
    },
    switchLyricType() {
      this.lyricType = getNextLyricDisplayMode(
        this.lyricDisplayModes,
        this.lyricType
      );
    },
    formatTrackTime(value) {
      return formatTrackTime(value);
    },
    clickLyricLine(value, startPlay = false) {
      // TODO: 双击选择还会选中文字，考虑搞个右键菜单复制歌词
      let jumpFlag = false;
      this.lyric.filter(function (item) {
        if (item.content == '纯音乐，请欣赏') {
          jumpFlag = true;
        }
      });
      if (window.getSelection().toString().length === 0 && !jumpFlag) {
        this.shouldAutoScrollLyrics = true;
        this.player.seek(value);
      }
      if (startPlay === true) {
        this.player.play();
      }
    },
    openLyricMenu(e, lyric, idx) {
      this.rightClickLyric = { ...lyric, idx };
      this.$refs.lyricMenu.openMenu(e);
      e.preventDefault();
    },
    copyLyric(withTranslation) {
      if (this.rightClickLyric) {
        const idx = this.rightClickLyric.idx;
        if (!withTranslation) {
          copyLyric(this.rightClickLyric.contents[idx]);
        } else {
          copyLyric(this.rightClickLyric.contents.join(' '));
        }
      }
    },
    setLyricsInterval() {
      clearInterval(this.lyricsInterval);
      this.lyricsInterval = setInterval(() => {
        if (this.syncCurrentLyricPosition()) {
          this.scrollCurrentLyricIntoCenter();
        }
      }, 50);
    },
    syncCurrentLyricPosition(force = false) {
      const progress = this.player.seek(null, false) ?? 0;
      const oldHighlightLyricIndex = this.highlightLyricIndex;
      this.highlightLyricIndex = this.lyric.findIndex((l, index) => {
        const nextLyric = this.lyric[index + 1];
        return (
          progress >= l.time && (nextLyric ? progress < nextLyric.time : true)
        );
      });
      const lyricChanged =
        force || oldHighlightLyricIndex !== this.highlightLyricIndex;
      if (lyricChanged) this.publishDesktopLyrics();
      return (
        this.shouldAutoScrollLyrics &&
        this.highlightLyricIndex >= 0 &&
        lyricChanged
      );
    },
    publishDesktopLyrics() {
      if (!this.desktopLyricsEnabled) return;
      const lyric = this.lyric[this.highlightLyricIndex];
      const secondaryLyrics =
        this.lyricType === LYRIC_DISPLAY_MODE.PRONUNCIATION
          ? this.romalyric
          : this.tlyric;
      const secondaryLyric = lyric
        ? secondaryLyrics.find(item => item.rawTime === lyric.rawTime)
            ?.content || ''
        : '';
      window.electronAPI?.desktopLyrics?.update({
        line: lyric?.content || '',
        translation: this.desktopLyricsTranslationEnabled ? secondaryLyric : '',
      });
    },
    clearDesktopLyrics() {
      window.electronAPI?.desktopLyrics?.update({
        line: '',
        translation: '',
      });
    },
    handleLyricsScroll() {
      if (this.isAutoScrollingLyrics) {
        clearTimeout(this.lyricsAutoScrollTimer);
        this.lyricsAutoScrollTimer = setTimeout(() => {
          this.isAutoScrollingLyrics = false;
        }, 120);
        return;
      }
      this.pauseLyricsAutoScroll();
    },
    pauseLyricsAutoScroll() {
      this.isAutoScrollingLyrics = false;
      this.shouldAutoScrollLyrics = false;
      clearTimeout(this.lyricsAutoResumeTimer);
      if (
        this.settings.lyricsAutoResumeWhenVisible &&
        this.isCurrentLyricVisible()
      ) {
        this.shouldAutoScrollLyrics = true;
        return;
      }
      const resumeDelay = Number(this.settings.lyricsAutoResumeDelay ?? 5000);
      if (resumeDelay <= 0) return;
      this.lyricsAutoResumeTimer = setTimeout(() => {
        this.resumeLyricsAutoScroll();
      }, resumeDelay);
    },
    resumeLyricsAutoScroll() {
      clearTimeout(this.lyricsAutoResumeTimer);
      this.shouldAutoScrollLyrics = true;
      this.updateLyricsEdgeSpacer();
      this.scrollCurrentLyricIntoCenter();
    },
    isCurrentLyricVisible() {
      const container = this.$refs.lyricsContainer;
      const el = document.getElementById(`line${this.highlightLyricIndex}`);
      if (!container || !el) return false;

      const containerRect = container.getBoundingClientRect();
      const lyricRect = el.getBoundingClientRect();
      return (
        lyricRect.top >= containerRect.top &&
        lyricRect.bottom <= containerRect.bottom
      );
    },
    scrollCurrentLyricIntoCenter() {
      const container = this.$refs.lyricsContainer;
      const el = document.getElementById(`line${this.highlightLyricIndex}`);
      if (!container || !el) return;

      clearTimeout(this.lyricsAutoScrollTimer);
      this.isAutoScrollingLyrics = true;
      this.updateLyricsEdgeSpacer(el);

      const containerRect = container.getBoundingClientRect();
      const lyricRect = el.getBoundingClientRect();
      const top =
        container.scrollTop +
        lyricRect.top +
        lyricRect.height / 2 -
        containerRect.top -
        container.clientHeight / 2;
      container.scrollTo({
        top,
        behavior: 'smooth',
      });
      this.lyricsAutoScrollTimer = setTimeout(() => {
        this.isAutoScrollingLyrics = false;
      }, 120);
    },
    updateLyricsEdgeSpacer(el = null) {
      const container = this.$refs.lyricsContainer;
      if (!container) return;

      const lyricEl =
        el || document.getElementById(`line${this.highlightLyricIndex}`);
      const spacerHeight = Math.max(
        0,
        (container.clientHeight - (lyricEl?.clientHeight || 0)) / 2
      );
      this.lyricsEdgeSpacerHeight = `${spacerHeight}px`;
    },
    moveToFMTrash() {
      this.player.moveToFMTrash();
    },
    switchRepeatMode() {
      this.player.switchRepeatMode();
    },
    switchShuffle() {
      this.player.switchShuffle();
    },
    getCoverColor() {
      if (this.settings.lyricsBackground !== true) return;
      const picUrl = this.currentTrack?.al?.picUrl;
      if (!picUrl) {
        this.background = '';
        return;
      }
      const cover = `${picUrl}?param=256y256`;
      Vibrant.from(cover, { colorCount: 1 })
        .getPalette()
        .then(palette => {
          const originColor = Color.rgb(palette.DarkMuted._rgb);
          const color = originColor.darken(0.1).rgb().string();
          const color2 = originColor.lighten(0.28).rotate(-30).rgb().string();
          this.background = `linear-gradient(to top left, ${color}, ${color2})`;
        })
        .catch(error => {
          this.background = '';
          console.warn('Failed to load lyrics cover colors', error);
        });
    },
    hasList() {
      return hasListSource();
    },
    getListPath() {
      return getListSourcePath();
    },
    mute() {
      this.player.mute();
    },
    handleVolumeWheel(event) {
      this.volume = getWheelAdjustedVolume(this.volume, event.deltaY);
    },
  },
};
</script>

<style lang="scss" scoped>
.lyrics-page {
  position: fixed;
  top: 0;
  right: 0;
  left: 0;
  bottom: 0;
  z-index: 200;
  background: var(--color-body-bg);
  display: flex;
  clip: rect(auto, auto, auto, auto);
}

.lyrics-background {
  --contrast-lyrics-background: 75%;
  --brightness-lyrics-background: 150%;
}

[data-theme='dark'] .lyrics-background {
  --contrast-lyrics-background: 125%;
  --brightness-lyrics-background: 50%;
}

.lyrics-background {
  filter: blur(50px) contrast(var(--contrast-lyrics-background))
    brightness(var(--brightness-lyrics-background));
  position: absolute;
  height: 100vh;
  width: 100vw;

  .top-right,
  .bottom-left {
    z-index: 0;
    width: 140vw;
    height: 140vw;
    opacity: 0.6;
    position: absolute;
    background-size: cover;
  }

  .top-right {
    right: 0;
    top: 0;
    mix-blend-mode: luminosity;
  }

  .bottom-left {
    left: 0;
    bottom: 0;
    animation-direction: reverse;
    animation-delay: 10s;
  }
}

.dynamic-background > div {
  animation: rotate 150s linear infinite;
}

@keyframes rotate {
  0% {
    transform: rotate(0deg);
  }

  100% {
    transform: rotate(360deg);
  }
}

.gradient-background {
  position: absolute;
  height: 100vh;
  width: 100vw;
}

.left-side {
  flex: 1;
  display: flex;
  justify-content: flex-end;
  margin-right: 32px;
  margin-top: 24px;
  align-items: center;
  transition: all 0.5s;

  z-index: 1;

  .date {
    max-width: 54vh;
    margin: 24px 0;
    color: var(--color-text);
    text-align: center;
    font-size: 4rem;
    font-weight: 600;
    opacity: 0.88;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;
    overflow: hidden;
  }

  .controls {
    max-width: 54vh;
    margin-top: 24px;
    color: var(--color-text);

    .title {
      margin-top: 8px;
      font-size: 1.4rem;
      font-weight: 600;
      opacity: 0.88;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 1;
      overflow: hidden;
    }

    .subtitle {
      margin-top: 4px;
      font-size: 1rem;
      opacity: 0.58;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 1;
      overflow: hidden;
    }

    .top-part {
      display: flex;
      justify-content: space-between;

      .top-right {
        display: flex;
        justify-content: space-between;

        .volume-control {
          margin: 0 10px;
          display: flex;
          align-items: center;

          .volume-bar {
            width: 84px;
          }
        }

        .buttons {
          display: flex;
          align-items: center;

          button {
            margin: 0 0 0 4px;
          }

          .svg-icon {
            height: 18px;
            width: 18px;
          }
        }
      }
    }

    .progress-bar {
      margin-top: 22px;
      display: flex;
      align-items: center;
      justify-content: space-between;

      .slider {
        width: 100%;
        flex-grow: grow;
        padding: 0 10px;
      }

      span {
        font-size: 15px;
        opacity: 0.58;
        min-width: 28px;
      }
    }

    .media-controls {
      display: flex;
      justify-content: center;
      margin-top: 18px;
      align-items: center;

      button {
        margin: 0;
      }

      .svg-icon {
        opacity: 0.38;
        height: 14px;
        width: 14px;
      }

      .active .svg-icon {
        opacity: 0.88;
      }

      .middle {
        padding: 0 16px;
        display: flex;
        align-items: center;

        button {
          margin: 0 8px;
        }

        button#play .svg-icon {
          height: 28px;
          width: 28px;
          padding: 2px;
        }

        .svg-icon {
          opacity: 0.88;
          height: 22px;
          width: 22px;
        }
      }

      .lyric-switch-icon {
        color: var(--color-text);
        font-size: 14px;
        line-height: 14px;
        opacity: 0.88;
      }
    }
  }
}

.cover {
  position: relative;

  .cover-container {
    position: relative;
  }

  img {
    border-radius: 0.75em;
    width: 54vh;
    height: 54vh;
    user-select: none;
    object-fit: cover;
  }

  .shadow {
    position: absolute;
    top: 12px;
    height: 54vh;
    width: 54vh;
    filter: blur(16px) opacity(0.6);
    transform: scale(0.92, 0.96);
    z-index: -1;
    background-size: cover;
    border-radius: 0.75em;
  }
}

.right-side {
  flex: 1;
  font-weight: 600;
  color: var(--color-text);
  margin-right: 24px;
  position: relative;
  z-index: 0;

  .back-to-current-lyric {
    position: absolute;
    bottom: 24px;
    right: 24px;
    z-index: 2;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--color-secondary-bg-for-transparent);
    backdrop-filter: blur(12px);

    .svg-icon {
      width: 18px;
      height: 18px;
      opacity: 0.88;
      transform: rotate(180deg);
    }
  }

  .lyrics-container {
    height: 100%;
    display: flex;
    flex-direction: column;
    padding-left: 78px;
    max-width: 460px;
    overflow-y: auto;
    transition: 0.5s;
    scrollbar-width: none; // firefox

    .lyrics-edge-spacer {
      flex: 0 0 auto;
    }

    .line {
      margin: 2px 0;
      padding: 12px 18px;
      transition: 0.5s;
      border-radius: 12px;

      &:hover {
        background: var(--color-secondary-bg-for-transparent);
      }

      .content {
        transform-origin: center left;
        transform: scale(0.95);
        transition: all 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        user-select: none;

        span {
          opacity: 0.28;
          cursor: default;
          font-size: 1em;
          transition: all 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        }

        span.translation {
          opacity: 0.2;
          font-size: 0.925em;
        }
      }
    }

    .line#line-1:hover {
      background: unset;
    }

    .translation {
      margin-top: 0.1em;
    }

    .highlight div.content {
      transform: scale(1);

      span {
        opacity: 0.98;
        display: inline-block;
      }

      span.translation {
        opacity: 0.65;
      }
    }
  }

  ::-webkit-scrollbar {
    display: none;
  }

  .lyrics-container .line:last-child {
    margin-bottom: 0;
  }
}

.close-button {
  position: fixed;
  top: 24px;
  right: 24px;
  z-index: 300;
  border-radius: 0.75rem;
  height: 44px;
  width: 44px;
  display: flex;
  justify-content: center;
  align-items: center;
  opacity: 0.28;
  transition: 0.2s;
  -webkit-app-region: no-drag;

  .svg-icon {
    color: var(--color-text);
    padding-top: 5px;
    height: 22px;
    width: 22px;
  }

  &:hover {
    background: var(--color-secondary-bg-for-transparent);
    opacity: 0.88;
  }
}

.lyrics-page.no-lyric {
  .left-side {
    transition: all 0.5s;
    transform: translateX(27vh);
    margin-right: 0;
  }
}

@media (max-aspect-ratio: 10/9) {
  .left-side {
    display: none;
  }

  .right-side .lyrics-container {
    max-width: 100%;
  }
}

@media screen and (min-width: 1200px) {
  .right-side .lyrics-container {
    max-width: 600px;
  }
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.4s;
}

.slide-up-enter,
.slide-up-leave-to

/* .fade-leave-active below version 2.1.8 */ {
  transform: translateY(100%);
}

.slide-fade-enter-active {
  transition: all 0.5s ease;
}

.slide-fade-leave-active {
  transition: all 0.5s cubic-bezier(0.2, 0.2, 0, 1);
}

.slide-fade-enter,
.slide-fade-leave-to {
  transform: translateX(27vh);
  opacity: 0;
}
</style>
