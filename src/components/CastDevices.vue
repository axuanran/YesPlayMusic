<template>
  <div v-if="castState.open" class="cast-panel" @click.stop>
    <div class="cast-head">
      <span class="title">推送到设备</span>
      <div>
        <button class="link" :disabled="busy" @click="doRefresh">
          {{ busy ? '搜索中…' : '重新搜索' }}
        </button>
        <button class="link close" @click="castState.open = false">✕</button>
      </div>
    </div>

    <p class="hint-block">
      勾选设备即进入投屏模式：主播放器的
      <b>播放 / 暂停、上一首 / 下一首、进度条、音量、音质</b>
      全部控制该设备，本地播放自动静音。
    </p>

    <div class="cast-opts">
      <span class="quality-note" :title="qualityNoteTitle">
        推送音质：<b>{{ pushQualityLabel }}</b>
        <em>（跟随播放控制条的音质按钮）</em>
      </span>
      <label :title="directHint">
        <input
          type="checkbox"
          :checked="castState.direct"
          @change="toggleDirect"
        />
        直连模式（设备直接取网易 CDN）
      </label>
    </div>

    <p v-if="castState.error" class="err">{{ castState.error }}</p>

    <ul v-if="visibleDevices.length" class="devices">
      <li
        v-for="d in visibleDevices"
        :key="d.id"
        :class="{ selected: isOn(d.id), active: castState.active[d.id] }"
      >
        <label class="row">
          <input
            v-model="castState.selected"
            type="checkbox"
            :value="d.id"
            @change="onSelect(d.id)"
          />
          <span class="proto" :title="d.protocol">{{
            protoLabel(d.protocol)
          }}</span>
          <span class="name">{{ d.name }}</span>
          <span v-if="d.model" class="model">{{ d.model }}</span>
          <span v-if="!d.caps.lossless_passthrough" class="tag">转码</span>
          <span v-if="d.caps.native_group" class="tag green">原生同步</span>
          <span
            v-if="d.protocol === 'heos'"
            class="tag warn"
            title="Denon/Marantz HEOS 对外部 HTTPS 直链兼容性有限，已自动改用本机网关的明文 HTTP 流（带 Content-Length / Range）。若仍无声，请改用同台音箱的 DLNA 条目"
            >HEOS（走网关）</span
          >
        </label>

        <div v-if="isOn(d.id)" class="device-status">
          <span class="hint">主播放器已接管该设备</span>
          <span v-if="deviceStatus[d.id]" class="status-line">
            <span :class="['dot', deviceStatus[d.id].state]"></span>
            {{ stateLabel(deviceStatus[d.id].state) }}
            <span class="pos">
              {{ formatMs(deviceStatus[d.id].position_ms) }} /
              {{ formatMs(deviceStatus[d.id].duration_ms) }}
            </span>
            <span
              v-if="d.caps.seek === false"
              class="tag warn"
              title="该协议不支持远程拖动进度条"
            >
              不可拖动进度
            </span>
          </span>
        </div>
      </li>
    </ul>
    <p v-else class="empty">
      没有找到设备 — 确认音箱/播放器与电脑在同一局域网，且 ncm-castd 已启动。
    </p>

    <div v-if="castState.selected.length > 1" class="group">
      <button @click="makeGroup">多设备同步播放</button>
      <button class="link danger" @click="stopAll">全部停止</button>
      <span v-if="castState.nativeSync" class="hint">
        该协议原生支持分组（HEOS），同步由设备自己保证。
      </span>
      <span v-else class="hint">软件同步：每 5 秒校正一次漂移。</span>
    </div>
    <div v-else-if="castState.selected.length === 1" class="group">
      <button class="link danger" @click="stopAll">停止设备播放</button>
      <span class="hint"
        >播放控制已统一到主播放器（进度条 / 上一首 / 下一首 / 音量）。</span
      >
    </div>
  </div>
</template>

<script>
import * as cast from '@/utils/cast';
import {
  castQualityLabel,
  isDowngradedForCast,
  qualityLabel,
} from '@/utils/audioQuality';
import { mapState } from 'vuex';

export default {
  name: 'CastDevices',
  data() {
    return {
      castState: cast.castState,
      busy: false,
      vol: {},
      savedVolume: null,
      unsubscribe: null,
      // Per-device status polled from the daemon: { [id]: { state, position_ms, duration_ms, ... } }.
      // DLNA renderers report position/duration via the AVTransport service;
      // HEOS renderers report them via the player/get_now_playing_media command.
      deviceStatus: {},
      statusTimer: null,
    };
  },
  computed: {
    // `store.state.player` is a bare class instance in this fork, so `player`
    // itself is NOT deeply reactive. Components subscribe to changes by reading
    // the version counters the Player bumps (see `_setCurrentTrack` /
    // `_setDisplayTrackTarget`). Without `playerTrackVersion` here the computed
    // stayed cached forever, so `trackID` below never changed on a track
    // switch, its watcher never fired, and the device was only ever pushed the
    // track it received when it was first ticked — the root cause of
    // "切歌了设备还是播同一首 / 拖动进度条拖的是上一首".
    ...mapState(['player', 'playerTrackVersion', 'settings']),
    currentTrack() {
      void this.playerTrackVersion;
      return this.player.currentTrack;
    },
    /**
     * The push tier is no longer set here — it is derived from the player-bar
     * quality control (`castState.quality` is kept in sync from there), so both
     * local playback and casting follow one setting.
     */
    pushQualityLabel() {
      return castQualityLabel(this.castState.quality);
    },
    qualityNoteTitle() {
      const local = qualityLabel(this.settings.musicQuality);
      return isDowngradedForCast(this.settings.musicQuality)
        ? `播放条音质为「${local}」，该档位投屏时降级为无损推送`
        : `播放条音质为「${local}」，与推送音质一致`;
    },
    /**
     * Devices to show. A Denon HEOS speaker also advertises itself over DLNA
     * from the same address — the DLNA path works, the HEOS one often stays
     * silent for external URLs, so we hide the HEOS duplicate and keep DLNA.
     * HEOS entries are kept when nothing else covers that address.
     */
    visibleDevices() {
      const upnpAddrs = new Set(
        this.castState.devices
          .filter(d => d.protocol === 'upnp')
          .map(d => d.addr)
      );
      return this.castState.devices.filter(
        d => !(d.protocol === 'heos' && upnpAddrs.has(d.addr))
      );
    },
    trackID() {
      return this.currentTrack?.id ?? 0;
    },
    directHint() {
      return this.castState.direct
        ? '设备直接向网易 CDN 取流，不需要连回本机。当前：直连。'
        : '设备向本机网关取流（音质更稳、支持 Range 与需登录的曲目）。' +
            '若设备能发现、能连接但始终没有声音（防火墙 / 360 局域网隐身 / 路由器 AP 隔离），' +
            '勾选此项即可。';
    },
  },
  watch: {
    // Once a device is selected, EVERY track change is pushed to it — no
    // separate "auto" switch. Selecting a device is the opt-in.
    trackID(newId, oldId) {
      if (!this.castState.selected.length) return;
      if (!this.currentTrack?.name || !this.currentTrack?.id) return;
      if (newId === oldId) return;
      // The renderer restarts the new track at 0. Discard the stale position /
      // duration mirror first, otherwise the player bar keeps showing (and
      // seeking) the previous track's timeline until the next 1s poll.
      for (const id of this.castState.selected) {
        delete this.deviceStatus[id];
        const prev = this.castState.statuses[id];
        if (prev) {
          this.castState.statuses[id] = {
            ...prev,
            position_ms: 0,
            duration_ms: this.currentTrack.dt || prev.duration_ms || 0,
          };
        }
      }
      this.pushAll();
    },
    // Enter cast mode (mute local, start polling) when the first device is
    // picked; leave it when the last one is unticked.
    'castState.selected.length'(n) {
      if (n > 0) {
        this.enterCast();
        this.startStatusPoll();
      } else {
        this.exitCast();
        this.stopStatusPoll();
      }
    },
    // Re-push the NetEase cookie every time the user opens the panel.
    // The component mounts once on app start, but the user may not be logged
    // into YPM at that point — logging in later would otherwise leave the
    // daemon with no cookie and silent playback failure.
    'castState.open'(on) {
      if (on) this.syncCookie();
    },
  },
  async created() {
    await this.syncCookie();
  },
  async mounted() {
    await this.doRefresh();
    if (this.castState.selected.length) {
      this.enterCast();
      this.startStatusPoll();
    }
    this.unsubscribe = cast.subscribe(e => {
      if (e.type === 'status') {
        // Vue 3: assign directly; reactive state no longer needs $set.
        this.castState.active[e.id] = e.status?.state === 'playing';
      }
      if (e.type === 'device_found') {
        if (!this.castState.devices.some(d => d.id === e.device.id))
          this.castState.devices.push(e.device);
      }
      if (e.type === 'device_lost') {
        this.castState.devices = this.castState.devices.filter(
          d => d.id !== e.id
        );
        this.castState.selected = this.castState.selected.filter(
          id => id !== e.id
        );
      }
    });
  },
  beforeUnmount() {
    if (this.unsubscribe) this.unsubscribe();
    this.stopStatusPoll();
    this.exitCast();
  },
  methods: {
    protoLabel: cast.protoLabel,
    isOn(id) {
      return this.castState.selected.includes(id);
    },
    /**
     * Direct mode is the escape hatch for "everything works but there is no
     * sound": the renderer then fetches NetEase's CDN itself and never has to
     * open a connection back to this PC.
     */
    async toggleDirect(e) {
      try {
        await cast.setDirect(e.target.checked);
      } catch (err) {
        this.castState.error = `切换直连模式失败：${err.message}`;
      }
    },
    /** Give the daemon the cookie YPM already holds, so it can sign URLs. */
    async syncCookie() {
      try {
        const pushed = await cast.pushCookie();
        if (!pushed) {
          this.castState.error =
            '未检测到网易云登录 Cookie，推送可能无法出声。' +
            '请在 YesPlayMusic 的「设置 → 登录」里用手机 App 扫码登录，' +
            '或在「Cookie 登录」里粘贴 MUSIC_U（必须包含 MUSIC_U=…）。';
        }
      } catch (e) {
        this.castState.error = `推送服务连接失败：${e.message}`;
      }
    },
    async doRefresh() {
      this.busy = true;
      this.castState.error = '';
      try {
        await cast.refresh();
      } catch (e) {
        // Say it plainly instead of failing silently.
        this.castState.error = `无法连接推送服务（ncm-castd）：${e.message}`;
      } finally {
        this.busy = false;
      }
    },
    /**
     * Mute the local YPM <audio> while casting and remember the level to
     * restore. The local element keeps running (silently) so the queue still
     * advances — that advance is what pushes the next track to the device.
     */
    enterCast() {
      if (this.savedVolume === null) {
        this.savedVolume = this.player.volume;
        this.castState.savedLocalVolume = this.savedVolume;
        this.player.volume = 0;
      }
    },
    exitCast() {
      if (this.savedVolume !== null) {
        this.player.volume = this.savedVolume;
        this.castState.savedLocalVolume = null;
        this.savedVolume = null;
      }
    },
    /**
     * The (muted) local <audio> element is the progress conductor: the queue
     * only advances — and therefore the next track only gets pushed to the
     * device — while it is actually running. If the user ticks a device while
     * local playback is paused, the speaker would play a single song and then
     * stay paused forever ("音乐播放完…切完就暂停，不会继续播放"). So whenever we
     * start or continue casting, make sure the conductor is playing.
     */
    ensureConductor() {
      if (!this.currentTrack?.id) return;
      if (!this.player.playing) this.player.play?.();
    },
    /**
     * Tick = connect the device then push whatever the player currently holds.
     * Untick = drop the session. Selecting a device is enough to start casting.
     */
    async onSelect(id) {
      try {
        if (this.isOn(id)) {
          this.enterCast();
          await cast.connect(id);
          this.ensureConductor();
          await this.castOne(id);
          this.startStatusPoll();
        } else {
          this.castState.active[id] = false;
          await cast.disconnect(id).catch(() => {});
        }
      } catch (e) {
        this.castState.error = `设备操作失败：${e.message}`;
      }
    },
    /**
     * Push the current track to every selected device. If the device is
     * already playing, send Stop first — some renderers (notably the Denon
     * Home line under DLNA) silently ignore SetAVTransportURI-while-Playing
     * and keep playing the old URL, which was the root cause of the
     * "切歌了设备还是播同一首" report.
     */
    async pushAll() {
      const track = cast.toTrack(this.currentTrack);
      if (!track.id) return;
      await Promise.all(
        this.castState.selected.map(id =>
          this.castState.active[id] ? cast.stop(id).catch(() => {}) : null
        )
      );
      try {
        await cast.play(this.castState.selected, track);
        this.enterCast();
        this.ensureConductor();
        this.startStatusPoll();
      } catch (e) {
        this.castState.error = `推送失败：${e.message}`;
      }
    },
    /** Push to a single device (used when the user just selected it). */
    async castOne(id) {
      // Nothing playing yet — that's fine, the next play() will push.
      if (!this.currentTrack?.name || !this.currentTrack?.id) return;
      try {
        await cast.play([id], cast.toTrack(this.currentTrack));
        this.startStatusPoll();
      } catch (e) {
        this.castState.error = `推送失败：${e.message}`;
      }
    },
    async stopAll() {
      try {
        await Promise.all(this.castState.selected.map(id => cast.stop(id)));
      } catch (e) {
        this.castState.error = `停止失败：${e.message}`;
        return;
      }
      for (const id of this.castState.selected) {
        this.castState.active[id] = false;
        delete this.deviceStatus[id];
        delete this.castState.statuses[id];
      }
      // Keep the selection so the next play resumes on the device, but stop
      // the local timeline too so the two stay in lockstep.
      this.player.pause?.();
    },
    async makeGroup() {
      try {
        await cast.group(this.castState.selected);
      } catch (e) {
        this.castState.error = e.message;
      }
    },
    /**
     * Poll the daemon for status of every selected device. Two consumers:
     *   - this.deviceStatus: drives the per-device dot/time in this panel.
     *   - castState.statuses: read by Player.vue's progress bar and the
     *     play/pause icon, so the main player UI mirrors the remote device
     *     instead of the local `<audio>` element while casting.
     */
    startStatusPoll() {
      if (this.statusTimer) return;
      const tick = async () => {
        for (const id of this.castState.selected) {
          try {
            const s = await cast.status(id);
            this.deviceStatus[id] = s;
            this.castState.statuses[id] = s;
            this.castState.active[id] = s.state === 'playing';
          } catch {
            /* device session may have died between polls — ignore */
          }
        }
      };
      tick();
      this.statusTimer = setInterval(tick, 1000);
    },
    stopStatusPoll() {
      if (this.statusTimer) {
        clearInterval(this.statusTimer);
        this.statusTimer = null;
      }
    },
    stateLabel(s) {
      return { playing: '播放中', paused: '已暂停', stopped: '已停止' }[s] || s;
    },
    formatMs(ms) {
      if (!ms || ms < 0) return '0:00';
      const total = Math.floor(ms / 1000);
      return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
    },
  },
};
</script>

<style lang="scss" scoped>
.cast-panel {
  position: fixed;
  right: 16px;
  bottom: 92px;
  z-index: 1000;
  width: 380px;
  max-height: 60vh;
  overflow-y: auto;
  padding: 14px 16px;
  border-radius: 12px;
  background: var(--color-body-bg, #fff);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
  color: var(--color-text);
  font-size: 14px;
}

.cast-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;

  .title {
    font-weight: 700;
  }
}

.hint-block {
  margin: 0 0 10px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--color-primary-bg, #eef);
  color: var(--color-text);
  font-size: 12px;
  line-height: 1.5;
  opacity: 0.9;

  b {
    color: var(--color-primary, #335eea);
  }
}

.cast-opts {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 12px;
  margin-bottom: 10px;
  font-size: 12px;
  opacity: 0.85;

  label {
    display: flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
  }

  .quality-note {
    b {
      color: var(--color-primary, #335eea);
    }
    em {
      font-style: normal;
      opacity: 0.7;
    }
  }
}

.devices {
  list-style: none;
  padding: 0;
  margin: 0;
}

.devices li {
  padding: 6px 0;
  border-bottom: 1px solid var(--color-secondary-bg, #eee);
}

.devices li.active .name {
  font-weight: 700;
}

.row {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.proto {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--color-primary-bg, #eef);
  color: var(--color-primary, #335eea);
}

.model,
.tag {
  font-size: 11px;
  opacity: 0.6;
}

.tag.green {
  color: #3a3;
  opacity: 1;
}
.tag.warn {
  color: #c80;
  opacity: 1;
  border: 1px solid #c80;
}
.device-status {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 4px 0 0 22px;
  font-size: 11px;
  opacity: 0.85;
  flex-wrap: wrap;
}
.status-line {
  display: flex;
  align-items: center;
  gap: 6px;
}
.status-line .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #aaa;
  display: inline-block;
}
.status-line .dot.playing {
  background: #3a3;
}
.status-line .dot.paused {
  background: #c80;
}
.status-line .dot.stopped {
  background: #aaa;
}
.status-line .pos {
  font-variant-numeric: tabular-nums;
  opacity: 0.8;
}

.group {
  margin-top: 10px;
}

.hint {
  font-size: 12px;
  opacity: 0.7;
  margin-left: 8px;
}

button.link {
  background: none;
  border: none;
  color: var(--color-primary, #335eea);
  cursor: pointer;
  font-size: 12px;
  padding: 2px 4px;
}

button.link.close {
  color: var(--color-text);
  opacity: 0.6;
}

.err {
  color: #d33;
  font-size: 12px;
}

.empty {
  font-size: 12px;
  opacity: 0.7;
}
</style>
