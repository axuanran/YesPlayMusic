<template>
  <div class="daily-recommend-card" @click="goToDailyTracks">
    <img
      :src="coverUrl"
      loading="eager"
      fetchpriority="high"
      decoding="async"
      @error="handleCoverError"
    />
    <div class="container">
      <div class="title-box">
        <div class="title">
          <span>每</span><span>日</span><span>推</span><span>荐</span>
        </div>
      </div>
    </div>
    <button class="play-button" @click.stop="playDailyTracks">
      <svg-icon icon-class="play" />
    </button>
  </div>
</template>

<script>
import locale from '@/locale';
import { mapMutations, mapState, mapActions } from 'vuex';
import { dailyRecommendTracks } from '@/api/playlist';
import { isAccountLoggedIn } from '@/utils/auth';
import sample from 'lodash/sample';
import { createSizedCoverUrl } from '@/utils/coverImageUrl';

const DAILY_CARD_COVER_SIZE = 640;
const defaultCovers = [
  'https://p2.music.126.net/0-Ybpa8FrDfRgKYCTJD8Xg==/109951164796696795.jpg',
  'https://p2.music.126.net/QxJA2mr4hhb9DZyucIOIQw==/109951165422200291.jpg',
  'https://p1.music.126.net/AhYP9TET8l-VSGOpWAKZXw==/109951165134386387.jpg',
];

export default {
  name: 'DailyTracksCard',
  data() {
    return { failedCover: false };
  },
  computed: {
    ...mapState(['dailyTracks']),
    coverUrl() {
      if (this.failedCover) return sample(defaultCovers);
      const song = this.dailyTracks[0];
      return createSizedCoverUrl(
        song?.al?.picUrl || song?.album?.picUrl || sample(defaultCovers),
        DAILY_CARD_COVER_SIZE
      );
    },
  },
  created() {
    if (this.dailyTracks.length === 0) this.loadDailyTracks();
  },
  methods: {
    ...mapActions(['showToast']),
    ...mapMutations(['updateDailyTracks']),
    handleCoverError() {
      this.failedCover = true;
    },
    loadDailyTracks() {
      if (!isAccountLoggedIn()) return;
      dailyRecommendTracks().then(result => {
        this.updateDailyTracks(result.data.dailySongs || []);
      }).catch(() => {});
    },
    goToDailyTracks() {
      this.$router.push({ name: 'dailySongs' });
    },
    playDailyTracks() {
      if (!isAccountLoggedIn()) {
        this.showToast(locale.global.t('toast.needToLogin'));
        return;
      }
      this.$store.state.player.replacePlaylist(
        this.dailyTracks.map(t => t.id),
        '/daily/songs',
        'url',
        this.dailyTracks[0].id
      );
    },
  },
};
</script>

<style lang="scss" scoped>
.daily-recommend-card {
  border-radius: 1rem;
  height: 198px;
  cursor: pointer;
  position: relative;
  overflow: hidden;
}
img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.container {
  height: 198px;
  width: 50%;
  display: flex;
  align-items: center;
  background: linear-gradient(to left, transparent, rgba(0,0,0,.28));
}
.title-box {
  margin-left: 25px;
  color: white;
  height: 148px;
  width: 148px;
}
.title {
  display: grid;
  grid-template-columns: 1fr 1fr;
  place-items: center;
  height: 100%;
  font-size: 64px;
  font-weight: 600;
}
.play-button {
  position: absolute;
  right: 1.6rem;
  bottom: 1.4rem;
  border-radius: 50%;
  width: 44px;
  height: 44px;
}
</style>
