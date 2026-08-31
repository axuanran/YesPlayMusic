<template>
  <Modal
    class="add-track-to-playlist-modal"
    :show="show"
    :close="close"
    :show-footer="false"
    :title="$t('addToPlaylistModal.title')"
    width="25vw"
  >
    <template #default>
      <div class="new-playlist-button" @click="newPlaylist"
        ><svg-icon icon-class="plus" />{{
          $t('addToPlaylistModal.newPlaylist')
        }}</div
      >
      <div v-if="loading && ownPlaylists.length === 0" class="empty-state">
        {{ $t('addToPlaylistModal.loading') }}
      </div>
      <div
        v-else-if="!loading && ownPlaylists.length === 0"
        class="empty-state"
      >
        {{ $t('addToPlaylistModal.empty') }}
      </div>
      <div
        v-for="playlist in ownPlaylists"
        :key="playlist.id"
        class="playlist"
        @click="addTrackToPlaylist(playlist.id)"
      >
        <img :src="resizeImage(playlist.coverImgUrl, 224)" loading="lazy" />
        <div class="info">
          <div class="title">{{ playlist.name }}</div>
          <div class="track-count">
            {{
              $t('addToPlaylistModal.trackCount', {
                count: playlist.trackCount,
              })
            }}
          </div>
        </div>
      </div>
    </template>
  </Modal>
</template>

<script>
import { mapActions, mapMutations, mapState } from 'vuex';
import Modal from '@/components/Modal.vue';
import locale from '@/locale';
import { addOrRemoveTrackFromPlaylist } from '@/api/playlist';
import { getWritableUserPlaylists } from '@/utils/userPlaylists';

export default {
  name: 'ModalAddTrackToPlaylist',
  components: {
    Modal,
  },
  data() {
    return {
      playlists: [],
      loading: false,
    };
  },
  computed: {
    ...mapState(['modals', 'data', 'liked']),
    show: {
      get() {
        return this.modals.addTrackToPlaylistModal.show;
      },
      set(value) {
        this.updateModal({
          modalName: 'addTrackToPlaylistModal',
          key: 'show',
          value,
        });
        if (value) {
          this.$store.commit('enableScrolling', false);
        } else {
          this.$store.commit('enableScrolling', true);
        }
      },
    },
    ownPlaylists() {
      return getWritableUserPlaylists(
        this.liked.playlists,
        this.data.user?.userId,
        this.data.likedSongPlaylistID
      );
    },
  },
  watch: {
    show: {
      immediate: true,
      handler(value) {
        if (value) this.loadPlaylists();
      },
    },
  },
  methods: {
    ...mapMutations(['updateModal']),
    ...mapActions(['showToast', 'fetchLikedPlaylist', 'fetchUserProfile']),
    async loadPlaylists() {
      if (this.loading) return;
      this.loading = true;
      try {
        if (!this.data.user?.userId) await this.fetchUserProfile();
        await this.fetchLikedPlaylist();
      } catch (error) {
        console.error('[playlist] failed to load user playlists', error);
        this.showToast(this.$t('addToPlaylistModal.loadFailed'));
      } finally {
        this.loading = false;
      }
    },
    close() {
      this.show = false;
    },
    addTrackToPlaylist(playlistID) {
      addOrRemoveTrackFromPlaylist({
        op: 'add',
        pid: playlistID,
        tracks: this.modals.addTrackToPlaylistModal.selectedTrackID,
      }).then(data => {
        if (data.body.code === 200) {
          this.show = false;
          this.showToast(locale.global.t('toast.savedToPlaylist'));
        } else {
          this.showToast(data.body.message);
        }
      });
    },
    newPlaylist() {
      this.updateModal({
        modalName: 'newPlaylistModal',
        key: 'afterCreateAddTrackID',
        value: this.modals.addTrackToPlaylistModal.selectedTrackID,
      });
      this.close();
      this.updateModal({
        modalName: 'newPlaylistModal',
        key: 'show',
        value: true,
      });
    },
  },
};
</script>

<style lang="scss" scoped>
.new-playlist-button {
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 16px;
  font-weight: 500;
  color: var(--color-text);
  background: var(--color-secondary-bg-for-transparent);
  border-radius: 8px;
  height: 48px;
  margin-bottom: 16px;
  margin-right: 6px;
  margin-left: 6px;
  cursor: pointer;
  transition: 0.2s;
  .svg-icon {
    width: 16px;
    height: 16px;
    margin-right: 8px;
  }
  &:hover {
    color: var(--color-primary);
    background: var(--color-primary-bg-for-transparent);
  }
}

.empty-state {
  padding: 28px 8px;
  text-align: center;
  opacity: 0.68;
}

.playlist {
  display: flex;
  padding: 6px;
  border-radius: 8px;
  cursor: pointer;
  &:hover {
    background: var(--color-secondary-bg-for-transparent);
  }
  img {
    border-radius: 8px;
    height: 42px;
    width: 42px;
    margin-right: 12px;
    border: 1px solid rgba(0, 0, 0, 0.04);
  }
  .info {
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
  .title {
    font-size: 16px;
    font-weight: 500;
    color: var(--color-text);
    padding-right: 16px;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;
    overflow: hidden;
    word-break: break-all;
  }
  .track-count {
    margin-top: 2px;
    font-size: 13px;
    opacity: 0.68;
    color: var(--color-text);
  }
}
</style>
