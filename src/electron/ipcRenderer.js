import store from '@/store';
import { toggleRepeatLyricLine } from '@/utils/repeatLyricLine';
import {
  CONTROL_MAX_RESULT_BYTES,
  createControlHandlers,
} from './controlHandlers';
import { createRadioEngine } from './assistant/radioEngine';
import { registerRadioEngine } from './assistant/radioRegistry';

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
    case 'queueMove':
      if (
        command.queue === 'priority' &&
        Number.isInteger(command.from) &&
        Number.isInteger(command.to)
      ) {
        playerInstance.movePlayNextTrack(command.from, command.to);
      }
      break;
    case 'queueClear':
      if (command.queue === 'priority') {
        playerInstance.clearPlayNextList();
      } else if (command.queue === 'upcoming') {
        playerInstance.clearUpcomingTracks();
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

  // 单句循环的状态和强制跳回都由歌词页驱动（它持有解析后的歌词）
  appEvents?.onRepeatLyricLine(() => {
    toggleRepeatLyricLine();
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

  // Teachable AI radio (docs/ai-music-assistant-plan.md, Phase 1). Candidates
  // come from the daily recommendation list for now; the LLM only picks from
  // those real candidates and the program validates, enqueues and refills.
  const radio = createRadioEngine({
    getCandidates: async ({ limit }) => {
      const { dailyRecommendTracks } = await import('@/api/playlist');
      const result = await dailyRecommendTracks();
      return (result.data?.dailySongs ?? []).slice(0, limit).map(track => ({
        id: track.id,
        name: track.name,
        artists: (track.ar ?? []).map(artist => artist.name).join('/'),
        album: track.al?.name ?? '',
        durationMs: track.dt ?? null,
      }));
    },
    enqueue: ids => {
      for (const id of ids) player.addTrackToPlayNext(id);
    },
    getQueue: () => ({ priority: [...(player.playNextList ?? [])] }),
    llmChat: args => globalThis.window?.electronAPI?.assistant?.llmChat?.(args),
    getPreferences: () =>
      globalThis.window?.electronAPI?.assistant?.getPreferences?.(),
    onError: (phase, error) => console.warn(`[radio] ${phase}:`, error),
  });
  registerRadioEngine(radio);

  // local control channel: scripts/agents (scripts/xumpctl.mjs) ask for state
  // or playback changes through the main process
  const controlHandlers = createControlHandlers({ store, player, radio });
  const control = window.electronAPI?.control;
  // contextBridge cannot clone Vue reactive proxies, so replies go out as plain
  // data, and the preload sanitizer drops oversized arrays silently - check the
  // size here so a truncated answer becomes an explicit error instead
  const toPlain = value =>
    value === undefined ? null : JSON.parse(JSON.stringify(value));
  const hasOversizedArray = (value, depth = 0) => {
    if (Array.isArray(value)) {
      return (
        value.length > 256 ||
        value.some(item => hasOversizedArray(item, depth + 1))
      );
    }
    if (value && typeof value === 'object' && depth < 8) {
      return Object.values(value).some(item =>
        hasOversizedArray(item, depth + 1)
      );
    }
    return false;
  };
  control?.onRequest?.((payload = {}) => {
    const { id, method, params } = payload;
    const handler = Object.hasOwn(controlHandlers, method)
      ? controlHandlers[method]
      : null;
    if (typeof handler !== 'function') {
      control.reply(
        id,
        { code: 'unknown_method', message: `unknown method "${method}"` },
        null
      );
      return;
    }
    Promise.resolve()
      .then(() => handler(params))
      .then(result => {
        const plain = toPlain(result);
        if (
          hasOversizedArray(plain) ||
          JSON.stringify(plain).length > CONTROL_MAX_RESULT_BYTES
        ) {
          control.reply(
            id,
            {
              code: 'result_too_large',
              message:
                'result exceeds the control channel limit, request a smaller page',
            },
            null
          );
          return;
        }
        control.reply(id, null, plain);
      })
      .catch(error =>
        control.reply(
          id,
          {
            code: error?.code || 'internal_error',
            message: String(error?.message || error),
          },
          null
        )
      );
  });
  // tell the main process that the control channel can be used now
  if (typeof control?.onRequest === 'function') control.ready?.();
}
