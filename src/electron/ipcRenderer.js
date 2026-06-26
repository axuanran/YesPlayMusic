import store from '@/store';

const player = store.state.player;

export function ipcRenderer(vueInstance) {
  const self = vueInstance;
  // 添加专有的类名
  document.body.setAttribute('data-electron', 'yes');
  const appEvents = window.electronAPI?.appEvents;

  // listens to the main process 'changeRouteTo' event and changes the route from
  // inside this Vue instance, according to what path the main process requires.
  // responds to Menu click() events at the main process and changes the route accordingly.

  appEvents?.onChangeRouteTo(path => {
    self.$router.push(path);
    if (store.state.showLyrics) {
      store.commit('toggleLyrics');
    }
  });

  appEvents?.onSearch(() => {
    // 触发数据响应
    self.$refs.navbar.$refs.searchInput.focus();
    self.$refs.navbar.inputFocus = true;
  });

  appEvents?.onPlay(() => {
    player.playOrPause();
  });

  appEvents?.onNext(() => {
    if (player.isPersonalFM) {
      player.playNextFMTrack();
    } else {
      player.playNextTrack();
    }
  });

  appEvents?.onPrevious(() => {
    player.playPrevTrack();
  });

  appEvents?.onIncreaseVolume(() => {
    if (player.volume + 0.1 >= 1) {
      return (player.volume = 1);
    }
    player.volume += 0.1;
  });

  appEvents?.onDecreaseVolume(() => {
    if (player.volume - 0.1 <= 0) {
      return (player.volume = 0);
    }
    player.volume -= 0.1;
  });

  appEvents?.onLike(() => {
    store.dispatch('likeATrack', player.currentTrack.id);
  });

  appEvents?.onRepeat(() => {
    player.switchRepeatMode();
  });

  appEvents?.onShuffle(() => {
    player.switchShuffle();
  });

  appEvents?.onRouterGo(where => {
    self.$refs.navbar.go(where);
  });

  appEvents?.onNextUp(() => {
    self.$refs.player.goToNextTracksPage();
  });

  appEvents?.onRememberCloseAppOption(value => {
    store.commit('updateSettings', {
      key: 'closeAppOption',
      value,
    });
  });

  appEvents?.onSetPosition(position => {
    player._howler.seek(position);
  });
}
