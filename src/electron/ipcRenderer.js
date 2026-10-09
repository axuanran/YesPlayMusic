import store from '@/store';
import { toggleRepeatLyricLine } from '@/utils/repeatLyricLine';
import * as cast from '@/utils/cast';
import {
  CONTROL_MAX_RESULT_BYTES,
  createControlHandlers,
} from './controlHandlers';
import { createRadioEngine } from './assistant/radioEngine';
import { registerRadioEngine } from './assistant/radioRegistry';

const player = store.state.player;

// The local <audio> runs on a SECONDS timeline while the device reports
// milliseconds; stop just short of the end so a seek can never trigger
// `ended` (which would advance the queue).
const SEEK_END_GUARD_SECONDS = 0.5;

/**
 * Seek whatever is actually audible. While a device is selected that is the
 * remote renderer — the local element is mute-only and merely conducts the
 * queue — but its position is moved too so the two timelines stay in step.
 */
const seekAudible = (playerInstance, seconds) => {
  const value = Math.max(0, Number(seconds) || 0);
  cast.seekActive(value * 1000).catch(() => {});
  const duration = playerInstance.currentTrackDuration || 0;
  playerInstance.progress =
    duration > 0
      ? Math.min(value, Math.max(0, duration - SEEK_END_GUARD_SECONDS))
      : value;
};

/**
 * Play/pause whatever is actually audible, keeping the muted local conductor
 * running in lockstep (it is what advances the queue on end-of-track).
 */
const playOrPauseAudible = playerInstance => {
  cast.deviceTransport('toggle', playerInstance.currentTrack).then(playing => {
    if (playing === true) playerInstance.play?.();
    else if (playing === false) playerInstance.pause?.();
  });
};

export function handleMprisCommand(playerInstance, command) {
  if (!command || typeof command !== 'object') return;

  // While a device is selected the audible renderer is the remote one, so
  // every transport command that arrives here — the desktop-lyrics overlay's
  // wheel seek, MPRIS, media keys — has to be relayed to it. Otherwise it
  // would only move the muted local <audio> and the speaker would keep
  // playing, which reads as "the controls do nothing".
  if (cast.controlsDevice()) {
    switch (command.type) {
      case 'play':
        cast.deviceTransport('play', playerInstance.currentTrack);
        return;
      case 'pause':
        cast.deviceTransport('pause');
        return;
      case 'playPause':
        playOrPauseAudible(playerInstance);
        return;
      case 'stop':
        cast.deviceTransport('stop');
        playerInstance.pause?.();
        playerInstance.updateMprisState({
          playing: false,
          position: 0,
          stopped: true,
        });
        return;
      case 'seek':
        if (Number.isFinite(command.offset)) {
          seekAudible(
            playerInstance,
            cast.activePositionMs() / 1000 + command.offset
          );
        }
        return;
      case 'setPosition':
        if (Number.isFinite(command.position) && command.position >= 0) {
          seekAudible(playerInstance, command.position);
        }
        return;
      case 'setVolume':
        if (Number.isFinite(command.volume)) {
          cast.setDeviceVolume(command.volume);
        }
        return;
      default:
        break;
    }
  }

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
    // The desktop-lyrics overlay's play/pause button lands here.
    if (cast.controlsDevice()) {
      playOrPauseAudible(player);
      return;
    }
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
    if (cast.controlsDevice()) {
      cast.nudgeDeviceVolume(0.1);
      return;
    }
    if (player.volume + 0.1 >= 1) {
      return (player.volume = 1);
    }
    player.volume += 0.1;
  });

  appEvents?.onDecreaseVolume(() => {
    if (cast.controlsDevice()) {
      cast.nudgeDeviceVolume(-0.1);
      return;
    }
    if (player.volume - 0.1 <= 0) {
      return (player.volume = 0);
    }
    player.volume -= 0.1;
  });

  appEvents?.onSetVolume(volume => {
    if (Number.isFinite(volume)) {
      const value = Math.min(1, Math.max(0, volume));
      // The desktop-lyrics slider arrives here: while casting it must move the
      // speaker's volume, not the (pinned to 0) local element.
      if (cast.controlsDevice()) {
        cast.setDeviceVolume(value);
        return;
      }
      player.volume = value;
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
    // Clicking a lyric line in the desktop overlay seeks to that line's time.
    if (cast.controlsDevice() && Number.isFinite(position)) {
      seekAudible(player, position);
      return;
    }
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
