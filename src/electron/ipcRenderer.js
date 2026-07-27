import store from '@/store';

const player = store.state.player;

export function handleMprisCommand(playerInstance, command) {
  if (!command || typeof command !== 'object') return;

  switch (command.type) {
    case 'play':
      if (!playerInstance.playing) playerInstance.play();
      break;
    case 'pause':
      if (playerInstance.playing) playerInstance.pause();
      break;
    case 'playPause':
      playerInstance.playOrPause();
      break;
    case 'stop':
      playerInstance.pause();
      playerInstance.seek(0);
      playerInstance.updateMprisState({
        playing: false,
        position: 0,
        stopped: true,
      });
      break;
    case 'next':
      if (playerInstance.isPersonalFM) {
        playerInstance.playNextFMTrack();
      } else {
        playerInstance.playNextTrack();
      }
      break;
    case 'previous':
      playerInstance.playPrevTrack();
      break;
    case 'seek':
      if (Number.isFinite(command.offset)) {
        playerInstance.seek(
          Math.max(0, playerInstance.seek() + command.offset)
        );
      }
      break;
    case 'setPosition':
      if (Number.isFinite(command.position) && command.position >= 0) {
        playerInstance.seek(command.position);
      }
      break;
    case 'setLoopStatus':
      if (['off', 'on', 'one'].includes(command.mode)) {
        playerInstance.repeatMode = command.mode;
        playerInstance.updateMprisState({
          loopStatus: playerInstance.repeatMode,
        });
      }
      break;
    case 'setShuffle':
      if (typeof command.enabled === 'boolean') {
        playerInstance.shuffle = command.enabled;
        playerInstance.updateMprisState({ shuffle: playerInstance.shuffle });
      }
      break;
    case 'setVolume':
      if (Number.isFinite(command.volume)) {
        playerInstance.volume = Math.min(1, Math.max(0, command.volume));
      }
      break;
    case 'setRate':
      if (Number.isFinite(command.rate)) {
        playerInstance.playbackRate = command.rate;
      }
      break;
  }
}

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

  appEvents?.onSetVolume(volume => {
    if (Number.isFinite(volume)) {
      player.volume = Math.min(1, Math.max(0, volume));
    }
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
    player.seek(position);
  });

  appEvents?.onMprisCommand(command => handleMprisCommand(player, command));
}
