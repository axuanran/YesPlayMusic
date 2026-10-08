<template>
  <div class="settings-page" @click="clickOutside">
    <div class="container">
      <header class="settings-header">
        <h1 id="settings-general">{{ $t('settings.settings') }}</h1>
        <nav
          class="settings-section-nav"
          :aria-label="$t('settings.sectionNavigation')"
        >
          <button
            v-for="section in settingsSections"
            :key="section.id"
            type="button"
            @click="scrollToSettingsSection(section.id)"
          >
            {{ section.label }}
          </button>
        </nav>
      </header>

      <div v-if="showUserInfo" class="user">
        <div class="left">
          <img class="avatar" :src="data.user.avatarUrl" loading="lazy" />
          <div class="info">
            <div class="nickname">{{ data.user.nickname }}</div>
            <div class="extra-info">
              <span v-if="data.user.vipType !== 0" class="vip"
                ><img
                  class="cvip"
                  src="data:image/png;base64,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"
                  loading="lazy"
                />
                <span class="text">黑胶VIP</span>
              </span>
              <span v-else class="text">{{ data.user.signature }}</span>
            </div>
          </div>
        </div>
        <div class="right">
          <button @click="logout">
            <svg-icon icon-class="logout" />
            {{ $t('settings.logout') }}
          </button>
        </div>
      </div>

      <div class="item">
        <div class="left">
          <div class="title"> {{ $t('settings.language') }} </div>
        </div>
        <div class="right">
          <select v-model="lang">
            <option value="en">🇬🇧 English</option>
            <option value="tr">🇹🇷 Türkçe</option>
            <option value="zh-CN">🇨🇳 简体中文</option>
            <option value="zh-TW">繁體中文</option>
          </select>
        </div>
      </div>
      <div class="item">
        <div class="left">
          <div class="title"> {{ $t('settings.appearance.text') }} </div>
        </div>
        <div class="right">
          <select v-model="appearance">
            <option value="auto">{{ $t('settings.appearance.auto') }}</option>
            <option value="light"
              >🌞 {{ $t('settings.appearance.light') }}</option
            >
            <option value="dark"
              >🌚 {{ $t('settings.appearance.dark') }}</option
            >
          </select>
        </div>
      </div>
      <div class="item">
        <div class="left">
          <div class="title"> {{ $t('settings.themeColor.text') }} </div>
        </div>
        <div class="right">
          <select v-model="themeColor">
            <option value="default">
              {{ $t('settings.themeColor.default') }}
            </option>
            <option value="sunset">
              {{ $t('settings.themeColor.sunset') }}
            </option>
            <option value="ocean">
              {{ $t('settings.themeColor.ocean') }}
            </option>
            <option value="forest">
              {{ $t('settings.themeColor.forest') }}
            </option>
          </select>
        </div>
      </div>
      <div v-if="isElectron" class="item">
        <div class="left">
          <div class="title"> {{ $t('settings.trayIcon.text') }} </div>
        </div>
        <div class="right">
          <select v-model="trayIconTheme">
            <option value="auto">{{ $t('settings.trayIcon.auto') }}</option>
            <option value="light">{{ $t('settings.trayIcon.light') }}</option>
            <option value="dark">{{ $t('settings.trayIcon.dark') }}</option>
          </select>
        </div>
      </div>
      <div class="item">
        <div class="left">
          <div class="title">
            {{ $t('settings.MusicGenrePreference.text') }}
          </div>
          <div class="description">
            {{ $t('settings.MusicGenrePreference.description') }}
          </div>
        </div>
        <div class="right">
          <select v-model="musicLanguage">
            <option value="all">{{
              $t('settings.MusicGenrePreference.none')
            }}</option>
            <option value="zh">{{
              $t('settings.MusicGenrePreference.mandarin')
            }}</option>
            <option value="ea">{{
              $t('settings.MusicGenrePreference.western')
            }}</option>
            <option value="jp">{{
              $t('settings.MusicGenrePreference.japanese')
            }}</option>
            <option value="kr">{{
              $t('settings.MusicGenrePreference.korean')
            }}</option>
          </select>
        </div>
      </div>

      <!-- <h3>音质</h3> -->
      <div class="item">
        <div class="left">
          <div class="title"> {{ $t('settings.musicQuality.text') }} </div>
        </div>
        <div class="right">
          <select v-model="musicQuality">
            <option value="standard">standard</option>
            <option value="exhigh">exhigh</option>
            <option value="lossless">lossless</option>
            <option value="hires">hires</option>
            <option value="jyeffect">jyeffect</option>
            <option value="sky">sky</option>
            <option value="jymaster">jymaster</option>
          </select>
        </div>
      </div>
      <div v-if="isElectron" class="item">
        <div class="left">
          <div class="title"> {{ $t('settings.deviceSelector') }} </div>
        </div>
        <div class="right">
          <select v-model="outputDevice">
            <option
              v-for="device in allOutputDevices"
              :key="device.deviceId"
              :value="device.deviceId"
              :selected="device.deviceId == outputDevice"
            >
              {{ device.label }}
            </option>
          </select>
        </div>
      </div>

      <h3 v-if="isElectron || isCapacitor" id="settings-cache">
        {{ $t('settings.cacheSection') }}
      </h3>
      <div v-if="isElectron || isCapacitor" class="item">
        <div class="left">
          <div class="title">
            {{ $t('settings.automaticallyCacheSongs') }}
          </div>
        </div>
        <div class="right">
          <div class="toggle">
            <input
              id="automatically-cache-songs"
              v-model="automaticallyCacheSongs"
              type="checkbox"
              name="automatically-cache-songs"
            />
            <label for="automatically-cache-songs"></label>
          </div>
        </div>
      </div>
      <div v-if="isElectron" class="item">
        <div class="left">
          <div class="title"> {{ $t('settings.cacheLimit.text') }} </div>
        </div>
        <div class="right">
          <select v-model="cacheLimit">
            <option :value="false">
              {{ $t('settings.cacheLimit.none') }}
            </option>
            <option :value="512"> 500MB </option>
            <option :value="1024"> 1GB </option>
            <option :value="2048"> 2GB </option>
            <option :value="4096"> 4GB </option>
            <option :value="8192"> 8GB </option>
          </select>
        </div>
      </div>
      <div v-if="isElectron" class="item">
        <div class="left">
          <div class="title">{{ $t('settings.cacheLocation') }}</div>
        </div>
        <div class="right cache-location">
          <span class="path" :title="cacheLocationTitle">{{
            cacheLocationText
          }}</span>
          <button @click="openCacheLocation">
            {{ $t('settings.openCacheLocation') }}
          </button>
          <button
            v-if="cacheLocation && cacheLocation.isCustom"
            :disabled="relocatingCache"
            @click="restoreCacheLocation"
          >
            {{ $t('settings.restoreCacheLocation') }}
          </button>
          <button :disabled="relocatingCache" @click="changeCacheLocation">
            {{
              relocatingCache
                ? $t('settings.cacheLocationRestarting')
                : $t('settings.changeCacheLocation')
            }}
          </button>
        </div>
      </div>
      <div v-if="isElectron || isCapacitor" class="item">
        <div class="left">
          <div class="title">
            {{
              $t('settings.cacheCount', {
                song: tracksCache.length,
                size: tracksCache.size,
              })
            }}</div
          >
        </div>
        <div class="right">
          <button
            v-if="isElectron"
            :disabled="clearingCache"
            @click="showCachedTracks"
          >
            {{ $t('settings.viewCachedTracks') }}
          </button>
          <button :disabled="clearingCache" @click="clearCache()">
            {{
              clearingCache
                ? $t('settings.clearingCache')
                : $t('settings.clearAllDiskCache')
            }}
          </button>
        </div>
      </div>

      <h3 v-if="isElectron" id="settings-streaming">
        {{ $t('streaming.serverSettings') }}
      </h3>
      <StreamingServerSettings v-if="isElectron" />

      <h3 id="settings-plugins">{{ $t('settings.pluginSection') }}</h3>
      <div
        v-for="plugin in builtinPlugins"
        :key="plugin.id"
        class="item plugin-item"
      >
        <div class="left">
          <div class="title">{{ plugin.name }}</div>
          <div class="description">
            {{ plugin.description }}
          </div>
          <div v-if="plugin.capabilities.length" class="plugin-meta">
            能力：{{ plugin.capabilities.join(' / ') }}
          </div>
          <div v-if="getPluginHealthMessage(plugin)" class="plugin-error">
            {{ getPluginHealthMessage(plugin) }}
          </div>
        </div>
        <div class="right plugin-actions">
          <button
            v-if="plugin.routes && plugin.routes.length"
            :disabled="!isPluginEnabled(plugin)"
            @click="$router.push({ name: plugin.routes[0].name })"
          >
            打开
          </button>
          <div class="toggle">
            <input
              :id="`plugin-${plugin.id}`"
              :checked="isPluginEnabled(plugin)"
              type="checkbox"
              :name="`plugin-${plugin.id}`"
              @change="togglePlugin(plugin, $event.target.checked)"
            />
            <label :for="`plugin-${plugin.id}`"></label>
          </div>
        </div>
      </div>

      <h3 id="settings-lyrics">{{ $t('settings.lyric') }}</h3>
      <div class="item">
        <div class="left">
          <div class="title">{{ $t('settings.showLyricsTranslation') }}</div>
        </div>
        <div class="right">
          <div class="toggle">
            <input
              id="show-lyrics-translation"
              v-model="showLyricsTranslation"
              type="checkbox"
              name="show-lyrics-translation"
            />
            <label for="show-lyrics-translation"></label>
          </div>
        </div>
      </div>
      <div v-if="isElectron" class="item">
        <div class="left">
          <div class="title">
            {{ $t('settings.autoMatchLocalLyrics.title') }}
          </div>
          <div class="description">
            {{ $t('settings.autoMatchLocalLyrics.description') }}
          </div>
        </div>
        <div class="right">
          <div class="toggle">
            <input
              id="auto-match-local-lyrics"
              v-model="autoMatchLocalLyrics"
              type="checkbox"
              name="auto-match-local-lyrics"
            />
            <label for="auto-match-local-lyrics"></label>
          </div>
        </div>
      </div>
      <div class="item">
        <div class="left">
          <div class="title">{{ $t('settings.lyricsBackground.text') }}</div>
        </div>
        <div class="right">
          <select v-model="lyricsBackground">
            <option :value="false">
              {{ $t('settings.lyricsBackground.off') }}
            </option>
            <option :value="true">
              {{ $t('settings.lyricsBackground.on') }}
            </option>
            <option value="blur"> 模糊封面 </option>
            <option value="dynamic">
              {{ $t('settings.lyricsBackground.dynamic') }}
            </option>
          </select>
        </div>
      </div>
      <div class="item">
        <div class="left">
          <div class="title"> {{ $t('settings.showLyricsTime') }} </div>
        </div>
        <div class="right">
          <div class="toggle">
            <input
              id="show-lyrics-time"
              v-model="showLyricsTime"
              type="checkbox"
              name="show-lyrics-time"
            />
            <label for="show-lyrics-time"></label>
          </div>
        </div>
      </div>
      <div class="item">
        <div class="left">
          <div class="title"> {{ $t('settings.lyricFontSize.text') }} </div>
        </div>
        <div class="right">
          <select v-model="lyricFontSize">
            <option value="16">
              {{ $t('settings.lyricFontSize.small') }} - 16px
            </option>
            <option value="22">
              {{ $t('settings.lyricFontSize.medium') }} - 22px
            </option>
            <option value="28">
              {{ $t('settings.lyricFontSize.large') }} - 28px
            </option>
            <option value="36">
              {{ $t('settings.lyricFontSize.xlarge') }} - 36px
            </option>
          </select>
        </div>
      </div>
      <div class="item">
        <div class="left">
          <div class="title">
            {{ $t('settings.lyricsAutoResumeDelay.text') }}
          </div>
        </div>
        <div class="right">
          <select v-model="lyricsAutoResumeDelay">
            <option :value="0">
              {{ $t('settings.lyricsAutoResumeDelay.off') }}
            </option>
            <option :value="3000">3s</option>
            <option :value="5000">5s</option>
            <option :value="10000">10s</option>
            <option :value="30000">30s</option>
          </select>
        </div>
      </div>
      <div v-if="isElectron" class="item">
        <div class="left">
          <div class="title">
            {{ $t('settings.desktopLyrics.title') }}
          </div>
          <div class="description">
            {{ $t('settings.desktopLyrics.description') }}
          </div>
        </div>
        <div class="right">
          <div class="toggle">
            <input
              id="enable-desktop-lyrics"
              v-model="enableDesktopLyrics"
              type="checkbox"
              name="enable-desktop-lyrics"
            />
            <label for="enable-desktop-lyrics"></label>
          </div>
        </div>
      </div>
      <template v-if="isElectron && enableDesktopLyrics">
        <div class="item">
          <div class="left">
            <div class="title">
              {{ $t('settings.desktopLyrics.styleTemplates') }}
            </div>
            <div class="description">
              {{ $t('settings.desktopLyrics.styleTemplatesDescription') }}
            </div>
          </div>
          <div class="right desktop-lyrics-template-controls">
            <select v-model="selectedDesktopLyricsStyleTemplate">
              <option
                v-for="template in desktopLyricsStyleTemplates"
                :key="template.id"
                :value="template.id"
              >
                {{ template.name }}
              </option>
            </select>
            <button @click="applyDesktopLyricsStyleTemplate">
              {{ $t('settings.desktopLyrics.applyTemplate') }}
            </button>
            <button
              v-if="selectedDesktopLyricsStyleTemplate.startsWith('custom:')"
              @click="deleteDesktopLyricsStyleTemplate"
            >
              {{ $t('settings.desktopLyrics.deleteTemplate') }}
            </button>
          </div>
        </div>
        <div class="item">
          <div class="left">
            <div class="title">
              {{ $t('settings.desktopLyrics.saveTemplate') }}
            </div>
          </div>
          <div class="right desktop-lyrics-template-controls">
            <input
              v-model.trim="desktopLyricsStyleTemplateName"
              class="text-input margin-right-0"
              type="text"
              maxlength="40"
              :placeholder="$t('settings.desktopLyrics.templateName')"
              @keyup.enter="saveDesktopLyricsStyleTemplate"
            />
            <button @click="saveDesktopLyricsStyleTemplate">
              {{ $t('settings.desktopLyrics.saveTemplate') }}
            </button>
          </div>
        </div>
        <div class="item">
          <div class="left">
            <div class="title">
              {{ $t('settings.desktopLyrics.exportImport') }}
            </div>
            <div class="description">
              {{ $t('settings.desktopLyrics.exportImportDescription') }}
            </div>
          </div>
          <div class="right desktop-lyrics-actions">
            <button @click="exportDesktopLyricsStyle">
              {{ $t('settings.desktopLyrics.exportStyle') }}
            </button>
            <button @click="triggerDesktopLyricsStyleImport">
              {{ $t('settings.desktopLyrics.importStyle') }}
            </button>
            <input
              ref="desktopLyricsStyleImportInput"
              type="file"
              accept="application/json,.json"
              style="display: none"
              @change="importDesktopLyricsStyle"
            />
          </div>
        </div>
        <div class="item">
          <div class="left">
            <div class="title">
              {{ $t('settings.desktopLyrics.locked') }}
            </div>
          </div>
          <div class="right">
            <div class="toggle">
              <input
                id="desktop-lyrics-locked"
                v-model="desktopLyricsLocked"
                type="checkbox"
              />
              <label for="desktop-lyrics-locked"></label>
            </div>
          </div>
        </div>
        <div class="item">
          <div class="left">
            <div class="title">
              {{ $t('settings.desktopLyrics.secondaryFontSize') }}
            </div>
          </div>
          <div class="right">
            <select v-model.number="desktopLyricsSecondaryFontSize">
              <option
                v-for="size in [12, 14, 16, 18, 20, 24, 28, 32]"
                :key="size"
                :value="size"
              >
                {{ size }}px
              </option>
            </select>
          </div>
        </div>
        <div class="item">
          <div class="left">
            <div class="title">
              {{ $t('settings.desktopLyrics.lineCount') }}
            </div>
            <div class="description">
              {{ $t('settings.desktopLyrics.lineCountDescription') }}
            </div>
          </div>
          <div class="right">
            <div class="toggle">
              <input
                id="desktop-lyrics-multiline"
                v-model="desktopLyricsMultiLine"
                type="checkbox"
              />
              <label for="desktop-lyrics-multiline"></label>
            </div>
          </div>
        </div>
        <div class="item">
          <div class="left">
            <div class="title">
              {{ $t('settings.desktopLyrics.wheelBehavior') }}
            </div>
            <div class="description">
              {{ $t('settings.desktopLyrics.wheelBehaviorDescription') }}
            </div>
          </div>
          <div class="right">
            <select v-model="desktopLyricsWheelBehavior">
              <option value="classic">
                {{ $t('settings.desktopLyrics.wheelBehaviorClassic') }}
              </option>
              <option value="scroll">
                {{ $t('settings.desktopLyrics.wheelBehaviorScroll') }}
              </option>
            </select>
          </div>
        </div>
        <div class="item">
          <div class="left">
            <div class="title">
              {{ $t('settings.desktopLyrics.dragMode') }}
            </div>
            <div class="description">
              {{ $t('settings.desktopLyrics.dragModeDescription') }}
            </div>
          </div>
          <div class="right">
            <select v-model="desktopLyricsDragMode">
              <option value="lyrics">
                {{ $t('settings.desktopLyrics.dragModeLyrics') }}
              </option>
              <option value="window">
                {{ $t('settings.desktopLyrics.dragModeWindow') }}
              </option>
            </select>
          </div>
        </div>
        <div class="item">
          <div class="left">
            <div class="title">
              {{ $t('settings.desktopLyrics.colors') }}
            </div>
          </div>
          <div class="right desktop-lyrics-colors">
            <input
              v-model="desktopLyricsTextColor"
              type="color"
              :title="$t('settings.desktopLyrics.primaryColor')"
            />
            <input
              v-model="desktopLyricsSecondaryColor"
              type="color"
              :title="$t('settings.desktopLyrics.secondaryColor')"
            />
          </div>
        </div>
        <div class="item">
          <div class="left">
            <div class="title">
              {{ $t('settings.desktopLyrics.alwaysOnTop') }}
            </div>
          </div>
          <div class="right">
            <div class="toggle">
              <input
                id="desktop-lyrics-always-on-top"
                v-model="desktopLyricsAlwaysOnTop"
                type="checkbox"
              />
              <label for="desktop-lyrics-always-on-top"></label>
            </div>
          </div>
        </div>
        <div v-if="isWindows" class="item">
          <div class="left">
            <div class="title">
              {{ $t('settings.desktopLyrics.allDesktops') }}
            </div>
            <div class="description">
              {{ $t('settings.desktopLyrics.allDesktopsDescription') }}
            </div>
          </div>
          <div class="right">
            <div class="toggle">
              <input
                id="desktop-lyrics-all-desktops"
                v-model="desktopLyricsAllDesktops"
                type="checkbox"
              />
              <label for="desktop-lyrics-all-desktops"></label>
            </div>
          </div>
        </div>
        <div class="item">
          <div class="left">
            <div class="title">
              {{ $t('settings.desktopLyrics.showSecondary') }}
            </div>
          </div>
          <div class="right">
            <div class="toggle">
              <input
                id="desktop-lyrics-show-secondary"
                v-model="desktopLyricsShowSecondary"
                type="checkbox"
              />
              <label for="desktop-lyrics-show-secondary"></label>
            </div>
          </div>
        </div>
        <div class="item">
          <div class="left">
            <div class="title">
              {{ $t('settings.desktopLyrics.fontSize') }}
            </div>
          </div>
          <div class="right">
            <select v-model.number="desktopLyricsFontSize">
              <option
                v-for="size in [24, 28, 32, 36, 42, 48, 56, 64]"
                :key="size"
                :value="size"
              >
                {{ size }}px
              </option>
            </select>
          </div>
        </div>
        <div class="item">
          <div class="left">
            <div class="title">
              {{ $t('settings.desktopLyrics.textAlign') }}
            </div>
          </div>
          <div class="right">
            <select v-model="desktopLyricsTextAlign">
              <option value="left">{{
                $t('settings.desktopLyrics.left')
              }}</option>
              <option value="center">{{
                $t('settings.desktopLyrics.center')
              }}</option>
              <option value="right">{{
                $t('settings.desktopLyrics.right')
              }}</option>
            </select>
          </div>
        </div>
        <div class="item">
          <div class="left">
            <div class="title">
              {{ $t('settings.desktopLyrics.overflowBehavior') }}
            </div>
          </div>
          <div class="right">
            <select v-model="desktopLyricsOverflowMode">
              <option value="ellipsis">{{
                $t('settings.desktopLyrics.ellipsis')
              }}</option>
              <option value="wrap">{{
                $t('settings.desktopLyrics.wrap')
              }}</option>
            </select>
          </div>
        </div>
        <div class="item">
          <div class="left">
            <div class="title">
              {{ $t('settings.desktopLyrics.verticalPosition') }}
            </div>
          </div>
          <div class="right">
            <select v-model="desktopLyricsVerticalPosition">
              <option value="top">{{
                $t('settings.desktopLyrics.top')
              }}</option>
              <option value="center">{{
                $t('settings.desktopLyrics.center')
              }}</option>
              <option value="bottom">{{
                $t('settings.desktopLyrics.bottom')
              }}</option>
            </select>
          </div>
        </div>
        <div class="item">
          <div class="left">
            <div class="title">
              {{ $t('settings.desktopLyrics.backgroundOpacity') }}
            </div>
          </div>
          <div class="right">
            <input
              v-model.number="desktopLyricsBackgroundOpacity"
              type="range"
              min="0"
              max="1"
              step="0.1"
            />
          </div>
        </div>
        <div class="item">
          <div class="left">
            <div class="title">
              {{ $t('settings.desktopLyrics.recovery') }}
            </div>
          </div>
          <div class="right desktop-lyrics-actions">
            <button @click="restoreDesktopLyricsWindow">
              {{ $t('settings.desktopLyrics.restoreWindow') }}
            </button>
            <button @click="resetDesktopLyricsStyle">
              {{ $t('settings.desktopLyrics.resetStyle') }}
            </button>
          </div>
        </div>
      </template>

      <h3 id="settings-customization">
        {{ $t('settings.customization') }}
      </h3>
      <div class="item">
        <div class="left">
          <div class="title">
            {{ $t('settings.performanceMode.title') }}
          </div>
          <div class="description">
            {{ $t('settings.performanceMode.description') }}
          </div>
        </div>
        <div class="right">
          <select v-model="performanceMode">
            <option value="off">{{
              $t('settings.performanceMode.off')
            }}</option>
            <option value="balanced">
              {{ $t('settings.performanceMode.balanced') }}
            </option>
            <option value="aggressive">
              {{ $t('settings.performanceMode.aggressive') }}
            </option>
          </select>
        </div>
      </div>
      <div class="item">
        <div class="left">
          <div class="title">
            {{
              isLastfmConnected
                ? `已连接到 Last.fm (${lastfm.name})`
                : '连接 Last.fm '
            }}</div
          >
        </div>
        <div class="right">
          <button v-if="isLastfmConnected" @click="lastfmDisconnect()"
            >断开连接
          </button>
          <button v-else @click="lastfmConnect()"> 授权连接 </button>
        </div>
      </div>
      <div v-if="isElectron" class="item">
        <div class="left">
          <div class="title">
            {{ $t('settings.enableDiscordRichPresence') }}</div
          >
        </div>
        <div class="right">
          <div class="toggle">
            <input
              id="enable-discord-rich-presence"
              v-model="enableDiscordRichPresence"
              type="checkbox"
              name="enable-discord-rich-presence"
            />
            <label for="enable-discord-rich-presence"></label>
          </div>
        </div>
      </div>

      <h3 id="settings-layout">{{ $t('settings.layoutSection') }}</h3>
      <div class="item">
        <div class="left">
          <div class="title">{{ $t('settings.navBar') }}</div>
        </div>
        <div class="right">
          <select v-model="navPosition">
            <option value="top">{{ $t('settings.navPosition.top') }}</option>
            <option value="bottom">{{
              $t('settings.navPosition.bottom')
            }}</option>
          </select>
        </div>
      </div>
      <div class="item">
        <div class="left">
          <div class="title">{{ $t('settings.navItems') }}</div>
          <div class="description">
            {{ $t('settings.navItemsDescription') }}
          </div>
        </div>
        <div class="right">
          <div class="layout-editor">
            <div
              v-for="(item, i) in layout.nav.items"
              :key="item.id"
              class="layout-row"
            >
              <button
                type="button"
                class="layout-btn"
                :disabled="i === 0"
                @click="moveNavItem(i, -1)"
              >
                ↑
              </button>
              <button
                type="button"
                class="layout-btn"
                :disabled="i === layout.nav.items.length - 1"
                @click="moveNavItem(i, 1)"
              >
                ↓
              </button>
              <span class="layout-name">{{ $t(`nav.${item.id}`) }}</span>
              <input
                v-model="item.label"
                class="layout-input"
                :placeholder="$t('settings.customLabelPlaceholder')"
                @input="commitLayout"
              />
              <label class="layout-toggle">
                <input
                  v-model="item.visible"
                  type="checkbox"
                  @change="commitLayout"
                />
                {{ $t('settings.showNavItem') }}
              </label>
            </div>
          </div>
        </div>
      </div>
      <div class="item">
        <div class="left">
          <div class="title">{{ $t('settings.homeLayout') }}</div>
          <div class="description">
            {{ $t('settings.homeLayoutDescription') }}
          </div>
        </div>
        <div class="right">
          <div class="layout-editor">
            <div
              v-for="(block, i) in layout.home"
              :key="block.id"
              class="layout-block"
            >
              <div class="layout-row">
                <button
                  type="button"
                  class="layout-btn"
                  :disabled="i === 0"
                  @click="moveHomeBlock(i, -1)"
                >
                  ↑
                </button>
                <button
                  type="button"
                  class="layout-btn"
                  :disabled="i === layout.home.length - 1"
                  @click="moveHomeBlock(i, 1)"
                >
                  ↓
                </button>
                <input
                  v-if="block.type === 'section'"
                  v-model="block.title"
                  class="layout-input"
                  :placeholder="$t('settings.sectionTitlePlaceholder')"
                  @input="commitLayout"
                />
                <span v-else class="layout-name">{{
                  widgetName(block.id)
                }}</span>
                <button
                  type="button"
                  class="layout-btn"
                  @click="removeHomeBlock(i)"
                >
                  ×
                </button>
              </div>
              <div v-if="block.type === 'section'" class="layout-subrows">
                <div
                  v-for="(wId, j) in block.widgets"
                  :key="wId"
                  class="layout-row sub"
                >
                  <button
                    type="button"
                    class="layout-btn"
                    :disabled="j === 0"
                    @click="moveSectionWidget(block, j, -1)"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    class="layout-btn"
                    :disabled="j === block.widgets.length - 1"
                    @click="moveSectionWidget(block, j, 1)"
                  >
                    ↓
                  </button>
                  <span class="layout-name">{{ widgetName(wId) }}</span>
                  <button
                    type="button"
                    class="layout-btn"
                    @click="removeSectionWidget(block, j)"
                  >
                    ×
                  </button>
                </div>
                <select
                  v-if="unassigned.length"
                  class="layout-add-select"
                  @change="
                    addWidgetToSection(block, $event.target.value);
                    $event.target.value = '';
                  "
                >
                  <option value="" disabled>
                    {{ $t('settings.addWidget') }}
                  </option>
                  <option v-for="w in unassigned" :key="w.id" :value="w.id">
                    {{ widgetName(w.id) }}
                  </option>
                </select>
              </div>
            </div>
            <div class="layout-add-row">
              <select
                v-if="unassigned.length"
                class="layout-add-select"
                @change="
                  addHomeWidgetBlock($event.target.value);
                  $event.target.value = '';
                "
              >
                <option value="" disabled>
                  {{ $t('settings.addWidget') }}
                </option>
                <option v-for="w in unassigned" :key="w.id" :value="w.id">
                  {{ widgetName(w.id) }}
                </option>
              </select>
              <button type="button" class="layout-btn" @click="addSection">
                {{ $t('settings.addSection') }}
              </button>
            </div>
          </div>
        </div>
      </div>
      <div class="item">
        <div class="left">
          <div class="title">{{ $t('settings.libraryCards') }}</div>
          <div class="description">
            {{ $t('settings.libraryCardsDescription') }}
          </div>
        </div>
        <div class="right">
          <div class="layout-editor">
            <div
              v-for="(wId, i) in layout.library"
              :key="wId"
              class="layout-row"
            >
              <button
                type="button"
                class="layout-btn"
                :disabled="i === 0"
                @click="moveLibraryCard(i, -1)"
              >
                ↑
              </button>
              <button
                type="button"
                class="layout-btn"
                :disabled="i === layout.library.length - 1"
                @click="moveLibraryCard(i, 1)"
              >
                ↓
              </button>
              <span class="layout-name">{{ widgetName(wId) }}</span>
              <button
                type="button"
                class="layout-btn"
                @click="removeLibraryCard(i)"
              >
                ×
              </button>
            </div>
            <select
              v-if="unassignedCards.length"
              class="layout-add-select"
              @change="
                addLibraryCard($event.target.value);
                $event.target.value = '';
              "
            >
              <option value="" disabled>{{ $t('settings.addWidget') }}</option>
              <option v-for="w in unassignedCards" :key="w.id" :value="w.id">
                {{ widgetName(w.id) }}
              </option>
            </select>
          </div>
        </div>
      </div>
      <div class="item">
        <div class="left">
          <div class="title">{{ $t('settings.resetLayout') }}</div>
        </div>
        <div class="right">
          <button type="button" @click="resetLayout">
            {{ $t('settings.resetLayoutButton') }}
          </button>
        </div>
      </div>

      <h3 id="settings-others">{{ $t('settings.others') }}</h3>
      <div v-if="isElectron" class="item">
        <div class="left">
          <div class="title">
            {{ $t('settings.amllWsProtocol.title') }}
          </div>
          <div class="description">
            {{ $t('settings.amllWsProtocol.description') }}
          </div>
        </div>
        <div class="right">
          <div class="toggle">
            <input
              id="enable-amll-ws-protocol"
              v-model="enableAmllWsProtocol"
              type="checkbox"
              name="enable-amll-ws-protocol"
            />
            <label for="enable-amll-ws-protocol"></label>
          </div>
        </div>
      </div>
      <div class="item">
        <div class="left">
          <div class="title">
            {{ $t('settings.showPlaybackRateControl') }}
          </div>
        </div>
        <div class="right">
          <div class="toggle">
            <input
              id="show-playback-rate-control"
              v-model="showPlaybackRateControl"
              type="checkbox"
              name="show-playback-rate-control"
            />
            <label for="show-playback-rate-control"></label>
          </div>
        </div>
      </div>
      <div v-if="isElectron && !isMac" class="item">
        <div class="left">
          <div class="title"> {{ $t('settings.closeAppOption.text') }} </div>
        </div>
        <div class="right">
          <select v-model="closeAppOption">
            <option value="ask">
              {{ $t('settings.closeAppOption.ask') }}
            </option>
            <option value="exit">
              {{ $t('settings.closeAppOption.exit') }}
            </option>
            <option value="minimizeToTray">
              {{ $t('settings.closeAppOption.minimizeToTray') }}
            </option>
          </select>
        </div>
      </div>

      <div v-if="isElectron && isLinux" class="item">
        <div class="left">
          <div class="title"> {{ $t('settings.enableCustomTitlebar') }} </div>
        </div>
        <div class="right">
          <div class="toggle">
            <input
              id="enable-custom-titlebar"
              v-model="enableCustomTitlebar"
              type="checkbox"
              name="enable-custom-titlebar"
            />
            <label for="enable-custom-titlebar"></label>
          </div>
        </div>
      </div>

      <div v-if="isElectron" class="item">
        <div class="left">
          <div class="title"> {{ $t('settings.showLibraryDefault') }}</div>
        </div>
        <div class="right">
          <div class="toggle">
            <input
              id="show-library-default"
              v-model="showLibraryDefault"
              type="checkbox"
              name="show-library-default"
            />
            <label for="show-library-default"></label>
          </div>
        </div>
      </div>

      <div class="item">
        <div class="left">
          <div class="title">
            {{ $t('settings.showPlaylistsByAppleMusic') }}</div
          >
        </div>
        <div class="right">
          <div class="toggle">
            <input
              id="show-playlists-by-apple-music"
              v-model="showPlaylistsByAppleMusic"
              type="checkbox"
              name="show-playlists-by-apple-music"
            />
            <label for="show-playlists-by-apple-music"></label>
          </div>
        </div>
      </div>

      <div class="item">
        <div class="left">
          <div class="title">{{ $t('settings.subTitleDefault') }}</div>
        </div>
        <div class="right">
          <div class="toggle">
            <input
              id="sub-title-default"
              v-model="subTitleDefault"
              type="checkbox"
              name="sub-title-default"
            />
            <label for="sub-title-default"></label>
          </div>
        </div>
      </div>

      <div class="item">
        <div class="left">
          <div class="title">{{ $t('settings.enableReversedMode') }}</div>
        </div>
        <div class="right">
          <div class="toggle">
            <input
              id="enable-reversed-mode"
              v-model="enableReversedMode"
              type="checkbox"
              name="enable-reversed-mode"
            />
            <label for="enable-reversed-mode"></label>
          </div>
        </div>
      </div>

      <div class="item">
        <div class="left">
          <div class="title" style="transform: scaleX(-1)">🐈️ 🏳️‍🌈</div>
        </div>
        <div class="right">
          <div class="toggle">
            <input
              id="nyancat-style"
              v-model="nyancatStyle"
              type="checkbox"
              name="nyancat-style"
            />
            <label for="nyancat-style"></label>
          </div>
        </div>
      </div>

      <div v-if="isElectron">
        <h3 id="settings-proxy">{{ $t('settings.proxySection') }}</h3>
        <div class="item">
          <div class="left">
            <div class="title"> 代理协议 </div>
          </div>
          <div class="right">
            <select v-model="proxyProtocol">
              <option value="noProxy"> 关闭代理 </option>
              <option value="HTTP"> HTTP 代理 </option>
              <option value="HTTPS"> HTTPS 代理 </option>
              <!-- <option value="SOCKS"> SOCKS 代理 </option> -->
            </select>
          </div>
        </div>
        <div id="proxy-form" :class="{ disabled: proxyProtocol === 'noProxy' }">
          <input
            v-model="proxyServer"
            class="text-input"
            placeholder="服务器地址"
            :disabled="proxyProtocol === 'noProxy'"
          /><input
            v-model="proxyPort"
            class="text-input"
            placeholder="端口"
            type="number"
            min="1"
            max="65535"
            :disabled="proxyProtocol === 'noProxy'"
          />
          <button @click="sendProxyConfig">更新代理</button>
        </div>
      </div>
      <div v-if="isElectron">
        <h3 id="settings-real-ip">Real IP</h3>
        <div class="item">
          <div class="left">
            <div class="title"> Real IP </div>
          </div>
          <div class="right">
            <div class="toggle">
              <input
                id="enable-real-ip"
                v-model="enableRealIP"
                type="checkbox"
                name="enable-real-ip"
              />
              <label for="enable-real-ip"></label>
            </div>
          </div>
        </div>
        <div id="real-ip" :class="{ disabled: !enableRealIP }">
          <input
            v-model="realIP"
            class="text-input"
            placeholder="IP地址"
            :disabled="!enableRealIP"
          />
        </div>
      </div>

      <div v-if="isElectron">
        <h3 id="settings-shortcuts">
          {{ $t('settings.shortcutSection') }}
        </h3>
        <div class="item">
          <div class="left">
            <div class="title"> {{ $t('settings.enableGlobalShortcut') }}</div>
          </div>
          <div class="right">
            <div class="toggle">
              <input
                id="enable-enable-global-shortcut"
                v-model="enableGlobalShortcut"
                type="checkbox"
                name="enable-enable-global-shortcut"
              />
              <label for="enable-enable-global-shortcut"></label>
            </div>
          </div>
        </div>
        <div
          id="shortcut-table"
          :class="{ 'global-disabled': !enableGlobalShortcut }"
          tabindex="0"
          @keydown="handleShortcutKeydown"
        >
          <div class="row row-head">
            <div class="col">功能</div>
            <div class="col">快捷键</div>
            <div class="col">全局快捷键</div>
          </div>
          <div
            v-for="shortcut in settings.shortcuts"
            :key="shortcut.id"
            class="row"
          >
            <div class="col">{{ shortcut.name }}</div>
            <div class="col">
              <div class="shortcut-binding">
                <input
                  :id="`shortcut-${shortcut.id}-local-enabled`"
                  type="checkbox"
                  :checked="shortcut.local.enabled"
                  @change="
                    updateShortcutEnabled(
                      shortcut.id,
                      'local',
                      $event.target.checked
                    )
                  "
                />
                <div
                  class="keyboard-input"
                  :class="{
                    active:
                      shortcutInput.id === shortcut.id &&
                      shortcutInput.scope === 'local',
                    disabled: !shortcut.local.enabled,
                  }"
                  @click.stop="readyToRecordShortcut(shortcut.id, 'local')"
                >
                  {{
                    shortcutInput.id === shortcut.id &&
                    shortcutInput.scope === 'local' &&
                    recordedShortcutComputed !== ''
                      ? formatShortcut(recordedShortcutComputed)
                      : formatShortcut(shortcut.local.accelerator)
                  }}
                </div>
              </div>
            </div>
            <div class="col">
              <div class="shortcut-binding">
                <input
                  :id="`shortcut-${shortcut.id}-global-enabled`"
                  type="checkbox"
                  :checked="shortcut.global.enabled"
                  :disabled="!enableGlobalShortcut"
                  @change="
                    updateShortcutEnabled(
                      shortcut.id,
                      'global',
                      $event.target.checked
                    )
                  "
                />
                <div
                  class="keyboard-input"
                  :class="{
                    active:
                      shortcutInput.id === shortcut.id &&
                      shortcutInput.scope === 'global' &&
                      enableGlobalShortcut,
                    disabled: !shortcut.global.enabled || !enableGlobalShortcut,
                  }"
                  @click.stop="readyToRecordShortcut(shortcut.id, 'global')"
                  >{{
                    shortcutInput.id === shortcut.id &&
                    shortcutInput.scope === 'global' &&
                    recordedShortcutComputed !== ''
                      ? formatShortcut(recordedShortcutComputed)
                      : formatShortcut(shortcut.global.accelerator)
                  }}</div
                >
              </div>
            </div>
          </div>
          <button
            class="restore-default-shortcut"
            @click="restoreDefaultShortcuts"
            >恢复默认快捷键</button
          >
        </div>
      </div>

      <div v-if="isElectron">
        <h3 id="settings-mcp">
          {{ $t('settings.mcp.sectionTitle') }}
        </h3>
        <div class="item">
          <div class="left">
            <div class="title">
              {{ $t('settings.mcp.enable') }}
            </div>
            <div class="description">
              {{ $t('settings.mcp.description') }}
            </div>
          </div>
          <div class="right">
            <div class="toggle">
              <input
                id="enable-mcp-server"
                v-model="mcpServerEnabled"
                type="checkbox"
                name="enable-mcp-server"
              />
              <label for="enable-mcp-server"></label>
            </div>
          </div>
        </div>
        <template v-if="mcpServerEnabled">
          <div class="item">
            <div class="left">
              <div class="title">{{ $t('settings.mcp.host') }}</div>
            </div>
            <div class="right">
              <input
                v-model.trim="mcpServerHost"
                class="text-input"
                type="text"
                spellcheck="false"
                :placeholder="$t('settings.mcp.hostPlaceholder')"
              />
            </div>
          </div>
          <div class="item">
            <div class="left">
              <div class="title">{{ $t('settings.mcp.port') }}</div>
            </div>
            <div class="right">
              <input
                class="text-input"
                type="number"
                min="1"
                max="65535"
                :value="mcpServerPort"
                @change="setMcpServerPort($event.target.value)"
              />
            </div>
          </div>
          <div class="item">
            <div class="left">
              <div class="title">{{ $t('settings.mcp.status') }}</div>
            </div>
            <div class="right">
              <span class="mcp-server-status">{{ mcpServerStatusText }}</span>
            </div>
          </div>
        </template>
      </div>

      <div class="footer">
        <p class="author"
          >EDIT BY
          <a href="http://github.com/axuanran" target="_blank">AXUANRAN</a></p
        >
        <p class="version">v{{ version }}</p>

        <a
          v-if="!isElectron"
          href="https://vercel.com/?utm_source=ohmusic&utm_campaign=oss"
        >
          <img
            height="36"
            src="https://www.datocms-assets.com/31049/1618983297-powered-by-vercel.svg"
          />
        </a>
      </div>
    </div>

    <Modal
      :show="showCacheLocationModal"
      :close="cancelCacheRelocation"
      :title="$t('settings.cacheLocationModal.title')"
      width="30rem"
      min-width="calc(min(30rem, 92vw))"
    >
      <template #default>
        <p class="cache-location-message">
          {{
            $t('settings.cacheLocationModal.message', {
              dir: pendingCacheDir,
            })
          }}
        </p>
        <p class="cache-location-note">
          {{ $t('settings.cacheLocationModal.moveNote') }}
        </p>
        <p class="cache-location-warning">
          {{ $t('settings.cacheLocationModal.deleteWarning') }}
        </p>
      </template>
      <template #footer>
        <button
          class="primary"
          :disabled="relocatingCache"
          @click="confirmCacheRelocation('move')"
        >
          {{ $t('settings.cacheLocationModal.move') }}
        </button>
        <button
          class="danger"
          :disabled="relocatingCache"
          @click="confirmCacheRelocation('delete')"
        >
          {{ $t('settings.cacheLocationModal.delete') }}
        </button>
        <button :disabled="relocatingCache" @click="cancelCacheRelocation">
          {{ $t('settings.cacheLocationModal.cancel') }}
        </button>
      </template>
    </Modal>
  </div>
</template>

<script>
import { mapState, mapActions, mapMutations } from 'vuex';
import { isLooseLoggedIn, doLogout } from '@/utils/auth';
import { auth as lastfmAuth } from '@/api/lastfm';
import {
  changeAppearance,
  changeThemeColor,
  bytesToSize,
} from '@/utils/common';
import {
  clearAllDiskCache,
  clearDB,
  countDBSize,
  enforceTrackCacheLimit,
  onTrackCacheChanged,
} from '@/utils/db';
import { getResolverConfig, updateResolverConfig } from '@/api/audioResolver';
import pkg from '../../package.json';
import { isCapacitor, isElectron } from '@/utils/env';
import { isLinux, isMac, isWindows } from '@/utils/platform';
import { getBuiltinPlugins, setPluginEnabled, syncPlugins } from '@/plugins';
import {
  getDefaultUiLayout,
  HOME_WIDGET_DEFS,
  normalizeUiLayout,
  unassignedWidgets,
} from '@/utils/uiLayout';
import StreamingServerSettings from '@/components/StreamingServerSettings.vue';
import Modal from '@/components/Modal.vue';
import {
  adaptDesktopLyricsStyleImport,
  BUILTIN_DESKTOP_LYRICS_STYLE_TEMPLATES,
  getDesktopLyricsStyle,
  mergeDesktopLyricsSettings,
  normalizeDesktopLyricsSettings,
  parseDesktopLyricsStyleBundle,
  serializeDesktopLyricsStyle,
} from '@/utils/desktopLyricsSettings';

const electronSettings = window.electronAPI?.settings;

const validShortcutCodes = ['=', '-', '~', '[', ']', ';', "'", ',', '.', '/'];

function normalizeMusicQuality(value) {
  if (typeof value === 'string') {
    if (
      [
        'standard',
        'exhigh',
        'lossless',
        'hires',
        'jyeffect',
        'sky',
        'jymaster',
      ].includes(value)
    ) {
      return value;
    }
    if (value === 'flac') return 'lossless';
    if (value === 'higher') return 'exhigh';
  }
  if (value === 999000) return 'jymaster';
  if (value === 350000) return 'lossless';
  if (value === 320000) return 'exhigh';
  if (value === 192000 || value === 128000) return 'standard';
  return 'exhigh';
}

function mapMusicQualityToResolverLevel(value) {
  const normalized = normalizeMusicQuality(value);
  if (normalized === 'standard') return 'standard';
  if (normalized === 'exhigh') return 'exhigh';
  if (normalized === 'lossless') return 'lossless';
  if (normalized === 'hires') return 'hires';
  if (normalized === 'jyeffect') return 'jyeffect';
  if (normalized === 'sky') return 'sky';
  if (normalized === 'jymaster') return 'jymaster';
  return 'exhigh';
}

async function syncResolverDefaultQuality(level) {
  try {
    const currentData = await getResolverConfig();
    await updateResolverConfig({
      ...(currentData.config || {}),
      audio: {
        ...((currentData.config || {}).audio || {}),
        defaultQuality: level,
      },
    });
  } catch (error) {
    console.warn('Failed to sync resolver default quality', error);
  }
}

// module-level helper — used in computed section where `this` is unavailable
const setting = (key, defaults) => ({
  get() {
    const val = this.settings[key];
    return val === undefined && defaults !== undefined ? defaults : val;
  },
  set(value) {
    this.$store.commit('updateSettings', { key, value });
  },
});

const desktopLyricsSetting = (key, fallback) => ({
  get() {
    return this.normalizedDesktopLyricsSettings[key] ?? fallback;
  },
  set(value) {
    this.updateDesktopLyricsSettings({ [key]: value });
  },
});

export default {
  name: 'Settings',
  components: { StreamingServerSettings, Modal },
  data() {
    return {
      tracksCache: {
        size: '0KB',
        length: 0,
      },
      clearingCache: false,
      cacheLocation: null,
      relocatingCache: false,
      showCacheLocationModal: false,
      pendingCacheDir: '',
      removeTrackCacheListener: null,
      nativeCacheListener: null,
      lastfmChecker: null,
      mcpServerStatus: null,
      removeMcpStatusListener: null,
      allOutputDevices: [
        {
          deviceId: 'default',
          label: 'settings.permissionRequired',
        },
      ],
      shortcutInput: {
        id: '',
        scope: '',
        recording: false,
      },
      selectedDesktopLyricsStyleTemplate: 'builtin:classic',
      desktopLyricsStyleTemplateName: '',
      recordedShortcut: [],
      builtinPlugins: getBuiltinPlugins(),
      /** 界面布局编辑草稿；编辑动作修改草稿后统一提交 */
      layoutDraft: null,
    };
  },
  computed: {
    ...mapState(['player', 'settings', 'data', 'lastfm']),
    isElectron() {
      return isElectron;
    },
    isCapacitor() {
      return isCapacitor;
    },
    isMac() {
      return isMac;
    },
    isLinux() {
      return isLinux;
    },
    isWindows() {
      return isWindows;
    },
    normalizedDesktopLyricsSettings() {
      return normalizeDesktopLyricsSettings(
        this.settings.desktopLyrics,
        this.settings.enableDesktopLyrics
      );
    },
    /** 规范化后的界面布局（编辑草稿，初始时从设置载入） */
    layout() {
      return this.layoutDraft ?? normalizeUiLayout(this.settings?.layout);
    },
    /** 尚未放置到首页/音乐库的卡片 */
    unassigned() {
      return unassignedWidgets(this.layoutDraft ?? this.settings?.layout);
    },
    /** 可放到音乐库的未分配卡片（仅卡片型） */
    unassignedCards() {
      return this.unassigned.filter(w => w.card);
    },
    navPosition: {
      get() {
        return this.layout.nav.position;
      },
      set(value) {
        this.layout.nav.position = value === 'bottom' ? 'bottom' : 'top';
        this.commitLayout();
      },
    },
    settingsSections() {
      return [
        {
          id: 'settings-general',
          label: this.$t('settings.generalSection'),
        },
        ...(this.isElectron || this.isCapacitor
          ? [
              {
                id: 'settings-cache',
                label: this.$t('settings.cacheSection'),
              },
            ]
          : []),
        ...(this.isElectron
          ? [
              {
                id: 'settings-streaming',
                label: this.$t('streaming.serverSettings'),
              },
            ]
          : []),
        {
          id: 'settings-plugins',
          label: this.$t('settings.pluginSection'),
        },
        {
          id: 'settings-lyrics',
          label: this.$t('settings.lyric'),
        },
        {
          id: 'settings-customization',
          label: this.$t('settings.customization'),
        },
        {
          id: 'settings-layout',
          label: this.$t('settings.layoutSection'),
        },
        {
          id: 'settings-others',
          label: this.$t('settings.others'),
        },
        ...(this.isElectron
          ? [
              {
                id: 'settings-proxy',
                label: this.$t('settings.proxySection'),
              },
              { id: 'settings-real-ip', label: 'Real IP' },
              {
                id: 'settings-shortcuts',
                label: this.$t('settings.shortcutSection'),
              },
              {
                id: 'settings-mcp',
                label: this.$t('settings.mcp.sectionTitle'),
              },
            ]
          : []),
      ];
    },
    desktopLyricsStyleTemplates() {
      const builtins = BUILTIN_DESKTOP_LYRICS_STYLE_TEMPLATES.map(template => ({
        ...template,
        id: `builtin:${template.id}`,
        name: this.$t(`settings.desktopLyrics.builtinTemplates.${template.id}`),
      }));
      const custom = this.normalizedDesktopLyricsSettings.styleTemplates.map(
        template => ({
          ...template,
          id: `custom:${template.id}`,
        })
      );
      return [...builtins, ...custom];
    },
    version() {
      return pkg.version;
    },
    showUserInfo() {
      return isLooseLoggedIn() && this.data.user.nickname;
    },
    recordedShortcutComputed() {
      let shortcut = [];
      this.recordedShortcut.map(e => {
        if (e.keyCode >= 65 && e.keyCode <= 90) {
          // A-Z
          shortcut.push(e.code.replace('Key', ''));
        } else if (e.key === 'Meta') {
          // ⌘ Command on macOS
          shortcut.push('Command');
        } else if (['Alt', 'Control', 'Shift'].includes(e.key)) {
          shortcut.push(e.key);
        } else if (e.keyCode >= 48 && e.keyCode <= 57) {
          // 0-9
          shortcut.push(e.code.replace('Digit', ''));
        } else if (e.keyCode >= 112 && e.keyCode <= 123) {
          // F1-F12
          shortcut.push(e.code);
        } else if (
          ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(e.key)
        ) {
          // Arrows
          shortcut.push(e.code.replace('Arrow', ''));
        } else if (validShortcutCodes.includes(e.key)) {
          shortcut.push(e.key);
        }
      });
      const sortTable = {
        Control: 1,
        Shift: 2,
        Alt: 3,
        Command: 4,
      };
      shortcut = shortcut.sort((a, b) => {
        if (!sortTable[a] || !sortTable[b]) return 0;
        if (sortTable[a] - sortTable[b] <= -1) {
          return -1;
        } else if (sortTable[a] - sortTable[b] >= 1) {
          return 1;
        } else {
          return 0;
        }
      });
      shortcut = shortcut.join('+');
      return shortcut;
    },

    lang: {
      get() {
        return this.settings.lang;
      },
      set(lang) {
        this.$i18n.locale = lang;
        this.$store.commit('changeLang', lang);
      },
    },
    musicLanguage: setting('musicLanguage', 'all'),
    appearance: {
      get() {
        if (this.settings.appearance === undefined) return 'auto';
        return this.settings.appearance;
      },
      set(value) {
        this.$store.commit('updateSettings', {
          key: 'appearance',
          value,
        });
        changeAppearance(value);
        const resolvedAppearance =
          value === 'auto'
            ? document.body?.getAttribute('data-theme') || 'light'
            : value;
        changeThemeColor(this.themeColor, resolvedAppearance);
      },
    },
    themeColor: {
      get() {
        if (this.settings.themeColor === undefined) return 'default';
        return this.settings.themeColor;
      },
      set(value) {
        this.$store.commit('updateSettings', {
          key: 'themeColor',
          value,
        });
        const resolvedAppearance =
          this.settings.appearance === 'auto'
            ? document.body?.getAttribute('data-theme') || 'light'
            : this.settings.appearance;
        changeThemeColor(value, resolvedAppearance);
      },
    },
    trayIconTheme: {
      get() {
        if (this.settings.trayIconTheme === undefined) return 'auto';
        return this.settings.trayIconTheme;
      },
      set(value) {
        this.$store.commit('updateSettings', {
          key: 'trayIconTheme',
          value,
        });
        if (this.isElectron) {
          electronSettings?.updateTrayIcon(value);
        }
      },
    },
    musicQuality: {
      get() {
        return normalizeMusicQuality(this.settings.musicQuality);
      },
      set(value) {
        if (value === this.settings.musicQuality) return;
        this.$store.commit('changeMusicQuality', value);
        this.clearCache();
        syncResolverDefaultQuality(mapMusicQualityToResolverLevel(value));
      },
    },
    lyricFontSize: {
      get() {
        if (this.settings.lyricFontSize === undefined) return 28;
        return this.settings.lyricFontSize;
      },
      set(value) {
        this.$store.commit('changeLyricFontSize', value);
      },
    },
    outputDevice: {
      get() {
        const isValidDevice = this.allOutputDevices.find(
          device => device.deviceId === this.settings.outputDevice
        );
        if (
          this.settings.outputDevice === undefined ||
          isValidDevice === undefined
        )
          return 'default'; // Default deviceId
        return this.settings.outputDevice;
      },
      set(deviceId) {
        if (deviceId === this.settings.outputDevice || deviceId === undefined)
          return;
        this.$store.commit('changeOutputDevice', deviceId);
        this.player.setOutputDevice();
      },
    },
    showPlaylistsByAppleMusic: setting('showPlaylistsByAppleMusic', true),
    showPlaybackRateControl: setting('showPlaybackRateControl', false),
    nyancatStyle: setting('nyancatStyle', false),
    performanceMode: {
      get() {
        if (this.settings.performanceMode) return this.settings.performanceMode;
        return this.settings.lowPerformanceMode ? 'balanced' : 'off';
      },
      set(value) {
        this.$store.commit('updateSettings', {
          key: 'performanceMode',
          value,
        });
        this.$store.commit('updateSettings', {
          key: 'lowPerformanceMode',
          value: value !== 'off',
        });
      },
    },
    automaticallyCacheSongs: {
      get() {
        if (this.settings.automaticallyCacheSongs === undefined) return false;
        return this.settings.automaticallyCacheSongs;
      },
      set(value) {
        this.$store.commit('updateSettings', {
          key: 'automaticallyCacheSongs',
          value,
        });
        if (value === false) {
          this.clearCache();
        }
      },
    },
    showLyricsTranslation: setting('showLyricsTranslation'),
    autoMatchLocalLyrics: setting('autoMatchLocalLyrics', true),
    lyricsBackground: setting('lyricsBackground', false),
    lyricsAutoResumeDelay: setting('lyricsAutoResumeDelay', 3000),
    showLyricsTime: setting('showLyricsTime'),
    enableDesktopLyrics: {
      get() {
        return this.normalizedDesktopLyricsSettings.enabled;
      },
      set(value) {
        this.updateDesktopLyricsSettings({
          enabled: value,
          visible: value,
        });
      },
    },
    desktopLyricsLocked: desktopLyricsSetting('locked', true),
    desktopLyricsAlwaysOnTop: desktopLyricsSetting('alwaysOnTop', true),
    desktopLyricsShowSecondary: desktopLyricsSetting('showSecondary', true),
    desktopLyricsFontSize: desktopLyricsSetting('fontSize', 32),
    desktopLyricsSecondaryFontSize: desktopLyricsSetting(
      'secondaryFontSize',
      18
    ),
    desktopLyricsMultiLine: {
      get() {
        return (this.normalizedDesktopLyricsSettings.lineCount ?? 1) > 1;
      },
      set(value) {
        this.updateDesktopLyricsSettings({ lineCount: value === true ? 3 : 1 });
      },
    },
    desktopLyricsWheelBehavior: desktopLyricsSetting(
      'wheelBehavior',
      'classic'
    ),
    desktopLyricsDragMode: desktopLyricsSetting('dragMode', 'lyrics'),
    desktopLyricsAllDesktops: desktopLyricsSetting('allDesktops', false),
    desktopLyricsTextColor: desktopLyricsSetting('textColor', '#ffffff'),
    desktopLyricsSecondaryColor: desktopLyricsSetting(
      'secondaryColor',
      '#d6e0ff'
    ),
    desktopLyricsTextAlign: desktopLyricsSetting('textAlign', 'center'),
    desktopLyricsOverflowMode: desktopLyricsSetting('overflowMode', 'ellipsis'),
    desktopLyricsVerticalPosition: desktopLyricsSetting(
      'verticalPosition',
      'center'
    ),
    desktopLyricsBackgroundOpacity: desktopLyricsSetting(
      'backgroundOpacity',
      0
    ),
    closeAppOption: setting('closeAppOption'),
    enableDiscordRichPresence: setting('enableDiscordRichPresence'),
    enableAmllWsProtocol: setting('enableAmllWsProtocol', false),
    subTitleDefault: setting('subTitleDefault'),
    enableReversedMode: {
      get() {
        if (this.settings.enableReversedMode === undefined) return false;
        return this.settings.enableReversedMode;
      },
      set(value) {
        this.$store.commit('updateSettings', {
          key: 'enableReversedMode',
          value,
        });
        if (value === false) {
          this.$store.state.player.reversed = false;
        }
      },
    },
    enableGlobalShortcut: setting('enableGlobalShortcut', false),
    mcpServerEnabled: {
      get() {
        return this.settings.mcpServer?.enabled === true;
      },
      set(value) {
        this.updateMcpServerSettings({ enabled: value === true });
      },
    },
    mcpServerHost: {
      get() {
        return this.settings.mcpServer?.host || '127.0.0.1';
      },
      set(value) {
        this.updateMcpServerSettings({ host: value });
      },
    },
    mcpServerPort() {
      return this.settings.mcpServer?.port || 27233;
    },
    mcpServerStatusText() {
      const status = this.mcpServerStatus;
      if (status?.running && status.url) {
        return this.$t('settings.mcp.runningAt', { url: status.url });
      }
      if (status?.error) {
        return this.$t('settings.mcp.error', { error: status.error });
      }
      return this.$t('settings.mcp.stopped');
    },
    showLibraryDefault: setting('showLibraryDefault', false),
    cacheLimit: {
      get() {
        return this.settings.cacheLimit ?? false;
      },
      set(value) {
        this.$store.commit('updateSettings', {
          key: 'cacheLimit',
          value,
        });
        this.applyCacheLimit(value);
      },
    },
    cacheLocationText() {
      const location = this.cacheLocation;
      if (!location) return this.$t('settings.cacheLocationDefault');
      return location.isCustom
        ? location.location
        : this.$t('settings.cacheLocationDefault');
    },
    cacheLocationTitle() {
      const location = this.cacheLocation;
      if (!location) return '';
      return location.isCustom
        ? location.location
        : location.defaultLocation || '';
    },
    proxyProtocol: {
      get() {
        return this.settings.proxyConfig?.protocol || 'noProxy';
      },
      set(value) {
        const config = {
          ...(this.settings.proxyConfig || {}),
          protocol: value,
        };
        if (value === 'noProxy') {
          electronSettings?.removeProxy();
          this.showToast('已关闭代理');
        }
        this.$store.commit('updateSettings', {
          key: 'proxyConfig',
          value: config,
        });
      },
    },
    proxyServer: {
      get() {
        return this.settings.proxyConfig?.server || '';
      },
      set(value) {
        const config = {
          ...(this.settings.proxyConfig || {}),
          server: value,
        };
        this.$store.commit('updateSettings', {
          key: 'proxyConfig',
          value: config,
        });
      },
    },
    enableRealIP: setting('enableRealIP', false),
    realIP: setting('realIP', ''),
    proxyPort: {
      get() {
        return this.settings.proxyConfig?.port || '';
      },
      set(value) {
        const config = {
          ...(this.settings.proxyConfig || {}),
          port: value,
        };
        this.$store.commit('updateSettings', {
          key: 'proxyConfig',
          value: config,
        });
      },
    },
    enableCustomTitlebar: {
      get() {
        return this.settings.linuxEnableCustomTitlebar;
      },
      set(value) {
        this.$store.commit('updateSettings', {
          key: 'linuxEnableCustomTitlebar',
          value,
        });
      },
    },
    isLastfmConnected() {
      return this.lastfm.key !== undefined;
    },
  },
  watch: {
    // 布局在其他地方被修改（如恢复默认）时，同步编辑草稿
    'settings.layout': {
      handler(value) {
        const next = normalizeUiLayout(value);
        if (JSON.stringify(next) !== JSON.stringify(this.layoutDraft)) {
          this.layoutDraft = next;
        }
      },
    },
  },
  created() {
    this.layoutDraft = normalizeUiLayout(this.settings?.layout);
    if (isCapacitor) {
      this.listenNativeCache();
    } else {
      this.removeTrackCacheListener = onTrackCacheChanged(
        this.updateTracksCache
      );
    }
    this.countDBSize('tracks');
    if (isElectron) {
      this.getAllOutputDevices();
      this.listenMcpServerStatus();
      this.loadCacheLocation();
    }
  },
  beforeUnmount() {
    this.removeTrackCacheListener?.();
    this.nativeCacheListener?.remove();
    this.removeMcpStatusListener?.();
    clearInterval(this.lastfmChecker);
    this.lastfmChecker = null;
    this.exitRecordShortcut();
  },
  methods: {
    ...mapActions(['showToast']),
    ...mapMutations(['updateModal']),
    // ===== 界面布局编辑 =====
    widgetName(id) {
      const def = HOME_WIDGET_DEFS.find(w => w.id === id);
      return def ? this.$t(def.nameKey) : id;
    },
    commitLayout() {
      this.$store.commit('updateSettings', {
        key: 'layout',
        value: normalizeUiLayout(this.layoutDraft),
      });
    },
    resetLayout() {
      this.layoutDraft = getDefaultUiLayout();
      this.commitLayout();
    },
    moveItem(list, i, offset) {
      const j = i + offset;
      if (j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
    },
    moveNavItem(i, offset) {
      this.moveItem(this.layout.nav.items, i, offset);
      this.commitLayout();
    },
    moveHomeBlock(i, offset) {
      this.moveItem(this.layout.home, i, offset);
      this.commitLayout();
    },
    removeHomeBlock(i) {
      this.layout.home.splice(i, 1);
      this.commitLayout();
    },
    addHomeWidgetBlock(id) {
      if (!id) return;
      this.layout.home.push({ type: 'widget', id });
      this.commitLayout();
    },
    addSection() {
      this.layout.home.push({
        type: 'section',
        id: `custom-${Date.now()}`,
        title: this.$t('settings.newSection'),
        widgets: [],
      });
      this.commitLayout();
    },
    moveSectionWidget(block, j, offset) {
      this.moveItem(block.widgets, j, offset);
      this.commitLayout();
    },
    removeSectionWidget(block, j) {
      block.widgets.splice(j, 1);
      this.commitLayout();
    },
    addWidgetToSection(block, id) {
      if (!id) return;
      block.widgets.push(id);
      this.commitLayout();
    },
    moveLibraryCard(i, offset) {
      this.moveItem(this.layout.library, i, offset);
      this.commitLayout();
    },
    removeLibraryCard(i) {
      this.layout.library.splice(i, 1);
      this.commitLayout();
    },
    addLibraryCard(id) {
      if (!id) return;
      this.layout.library.push(id);
      this.commitLayout();
    },
    listenMcpServerStatus() {
      const api = window.electronAPI?.mcpServer;
      if (!api) return;
      this.removeMcpStatusListener = api.onStatus?.(status => {
        this.mcpServerStatus = status;
      });
      api
        .getStatus?.()
        .then(status => {
          this.mcpServerStatus = status;
        })
        .catch(() => {});
    },
    updateMcpServerSettings(patch) {
      this.$store.commit('updateSettings', {
        key: 'mcpServer',
        value: {
          enabled: false,
          host: '127.0.0.1',
          port: 27233,
          ...(this.settings.mcpServer || {}),
          ...patch,
        },
      });
    },
    setMcpServerPort(value) {
      const port = Number(value);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        this.showToast(this.$t('settings.mcp.invalidPort'));
        return;
      }
      this.updateMcpServerSettings({ port });
    },
    scrollToSettingsSection(id) {
      const target = document.getElementById(id);
      if (!target) return;
      if (target.matches('h1, h2, h3')) {
        target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
      }
      target.scrollIntoView({
        behavior: 'auto',
        block: 'start',
      });
    },

    showCachedTracks() {
      this.updateModal({
        modalName: 'cachedTracksModal',
        key: 'show',
        value: true,
      });
    },
    async loadCacheLocation() {
      try {
        this.cacheLocation =
          (await window.electronAPI?.cache?.getLocation?.()) || null;
      } catch (error) {
        console.error('[cache-location] failed to load cache location', error);
      }
    },
    async openCacheLocation() {
      try {
        const failure = await window.electronAPI?.cache?.openLocation?.();
        if (failure)
          this.showToast(this.$t('settings.cacheLocationOpenFailed'));
      } catch (error) {
        console.error('[cache-location] failed to open cache location', error);
        this.showToast(this.$t('settings.cacheLocationOpenFailed'));
      }
    },
    async changeCacheLocation() {
      if (this.relocatingCache) return;
      const dir = await window.electronAPI?.cache?.chooseLocation?.();
      if (!dir) return;
      this.pendingCacheDir = dir;
      this.showCacheLocationModal = true;
    },
    cacheLocationErrorText(code) {
      const key = {
        invalid: 'settings.cacheLocationInvalid',
        same: 'settings.cacheLocationSame',
        nested: 'settings.cacheLocationNested',
      }[code];
      return key ? this.$t(key) : this.$t('settings.cacheLocationFailed');
    },
    async confirmCacheRelocation(mode) {
      if (this.relocatingCache) return;
      this.relocatingCache = true;
      try {
        const result = await window.electronAPI?.cache?.setLocation?.({
          dir: this.pendingCacheDir,
          mode,
        });
        if (result && result.ok === false) {
          this.relocatingCache = false;
          this.showCacheLocationModal = false;
          this.showToast(this.cacheLocationErrorText(result.code));
        }
        // result.ok === true → the app relaunches right away; nothing to do.
      } catch (error) {
        console.error('[cache-location] relocation failed', error);
        this.relocatingCache = false;
        this.showCacheLocationModal = false;
        this.showToast(this.$t('settings.cacheLocationFailed'));
      }
    },
    cancelCacheRelocation() {
      if (this.relocatingCache) return;
      this.showCacheLocationModal = false;
      this.pendingCacheDir = '';
    },
    async restoreCacheLocation() {
      if (this.relocatingCache) return;
      this.relocatingCache = true;
      try {
        const result = await window.electronAPI?.cache?.setLocation?.({
          dir: null,
          mode: 'move',
        });
        if (result && result.ok === false) {
          this.relocatingCache = false;
          this.showToast(this.cacheLocationErrorText(result.code));
        }
        // ok → the app relaunches immediately
      } catch (error) {
        console.error('[cache-location] restore failed', error);
        this.relocatingCache = false;
        this.showToast(this.$t('settings.cacheLocationFailed'));
      }
    },
    updateDesktopLyricsSettings(patch) {
      const value = mergeDesktopLyricsSettings(
        this.settings.desktopLyrics,
        patch,
        this.settings.enableDesktopLyrics
      );
      this.$store.commit('updateSettings', {
        key: 'desktopLyrics',
        value,
      });
      if (this.settings.enableDesktopLyrics !== value.enabled) {
        this.$store.commit('updateSettings', {
          key: 'enableDesktopLyrics',
          value: value.enabled,
        });
      }
    },
    applyDesktopLyricsStyleTemplate() {
      const template = this.desktopLyricsStyleTemplates.find(
        candidate => candidate.id === this.selectedDesktopLyricsStyleTemplate
      );
      if (!template) return;
      this.updateDesktopLyricsSettings(template.style);
      this.showToast(this.$t('settings.desktopLyrics.templateApplied'));
    },
    saveDesktopLyricsStyleTemplate() {
      const name = this.desktopLyricsStyleTemplateName.trim();
      if (!name) {
        this.showToast(this.$t('settings.desktopLyrics.templateNameRequired'));
        return;
      }
      const settings = normalizeDesktopLyricsSettings(
        this.settings.desktopLyrics,
        this.settings.enableDesktopLyrics
      );
      if (settings.styleTemplates.length >= 20) {
        this.showToast(this.$t('settings.desktopLyrics.templateLimitReached'));
        return;
      }
      const id = `style-${Date.now().toString(36)}`;
      this.updateDesktopLyricsSettings({
        styleTemplates: [
          ...settings.styleTemplates,
          {
            id,
            name,
            style: getDesktopLyricsStyle(settings),
          },
        ],
      });
      this.selectedDesktopLyricsStyleTemplate = `custom:${id}`;
      this.desktopLyricsStyleTemplateName = '';
      this.showToast(this.$t('settings.desktopLyrics.templateSaved'));
    },
    deleteDesktopLyricsStyleTemplate() {
      if (!this.selectedDesktopLyricsStyleTemplate.startsWith('custom:')) {
        return;
      }
      const id = this.selectedDesktopLyricsStyleTemplate.slice(7);
      const settings = normalizeDesktopLyricsSettings(
        this.settings.desktopLyrics,
        this.settings.enableDesktopLyrics
      );
      this.updateDesktopLyricsSettings({
        styleTemplates: settings.styleTemplates.filter(
          template => template.id !== id
        ),
      });
      this.selectedDesktopLyricsStyleTemplate = 'builtin:classic';
      this.showToast(this.$t('settings.desktopLyrics.templateDeleted'));
    },
    exportDesktopLyricsStyle() {
      const { x, y } = this.normalizedDesktopLyricsSettings;
      const json = serializeDesktopLyricsStyle(this.settings.desktopLyrics, {
        // recorded so an import can rescale fonts/geometry for the local
        // display density and reproduce the same relative placement
        dpi: window.devicePixelRatio,
        window: Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null,
        workArea: {
          x: window.screen.availLeft,
          y: window.screen.availTop,
          width: window.screen.availWidth,
          height: window.screen.availHeight,
        },
      });
      const timestamp = new Date()
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\..+$/, '')
        .replace('T', '-');
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `desktop-lyrics-style-${timestamp}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.showToast(this.$t('settings.desktopLyrics.styleExported'));
    },
    triggerDesktopLyricsStyleImport() {
      this.$refs.desktopLyricsStyleImportInput?.click();
    },
    async importDesktopLyricsStyle(event) {
      const input = event.target;
      const file = input.files?.[0];
      input.value = '';
      if (!file) return;
      try {
        const bundle = parseDesktopLyricsStyleBundle(await file.text());
        const patch = adaptDesktopLyricsStyleImport(bundle, {
          dpi: window.devicePixelRatio,
          workArea: {
            x: window.screen.availLeft,
            y: window.screen.availTop,
            width: window.screen.availWidth,
            height: window.screen.availHeight,
          },
        });
        if (!patch) throw new Error('invalid desktop lyrics style file');
        this.updateDesktopLyricsSettings(patch);
        this.showToast(this.$t('settings.desktopLyrics.styleImported'));
      } catch (error) {
        console.warn('Failed to import desktop lyrics style', error);
        this.showToast(this.$t('settings.desktopLyrics.styleImportFailed'));
      }
    },
    restoreDesktopLyricsWindow() {
      // restore both the placement (center, lower-middle of the screen) and
      // the default "classic" look in one action
      window.electronAPI?.desktopLyrics?.resetPosition();
      window.electronAPI?.desktopLyrics?.resetStyle();
    },
    resetDesktopLyricsStyle() {
      window.electronAPI?.desktopLyrics?.resetStyle();
    },
    getAllOutputDevices() {
      navigator.mediaDevices.enumerateDevices().then(devices => {
        this.allOutputDevices = devices.filter(device => {
          return device.kind == 'audiooutput';
        });
        if (
          this.allOutputDevices.length > 0 &&
          this.allOutputDevices[0].label !== ''
        ) {
          this.withoutAudioPriviledge = false;
        } else {
          this.allOutputDevices = [
            {
              deviceId: 'default',
              label: 'settings.permissionRequired',
            },
          ];
        }
      });
    },
    logout() {
      doLogout();
      this.$router.push({ name: 'home' });
    },
    updateTracksCache(data) {
      this.tracksCache = {
        size: bytesToSize(data?.bytes || 0),
        length: data?.length || 0,
      };
    },
    async getNativeAudioPlugin() {
      const { BackgroundAudio } = await import('@/mobile/AndroidAudioEngine');
      return BackgroundAudio;
    },
    async listenNativeCache() {
      try {
        const plugin = await this.getNativeAudioPlugin();
        this.nativeCacheListener = await plugin.addListener(
          'cacheChanged',
          this.updateTracksCache
        );
      } catch (error) {
        console.error('[android-audio-cache] failed to listen', error);
      }
    },
    async countDBSize() {
      try {
        if (isCapacitor) {
          const plugin = await this.getNativeAudioPlugin();
          this.updateTracksCache(await plugin.getCacheStatus());
          return;
        }
        this.updateTracksCache(await countDBSize());
      } catch (error) {
        console.error('[track-cache] failed to count cache', error);
      }
    },
    async applyCacheLimit(limitMiB) {
      try {
        const before = await countDBSize();
        const after = await enforceTrackCacheLimit(limitMiB);
        this.updateTracksCache(after);
        console.info(
          `[track-cache] limit applied: ${before.bytes} -> ` +
            `${after.bytes} logical bytes; removed ${after.deleted} tracks`
        );
      } catch (error) {
        console.error('[track-cache] failed to apply cache limit', error);
        this.showToast(this.$t('settings.cacheLimitApplyFailed'));
      }
    },
    async clearCache() {
      if (this.clearingCache) return;
      this.clearingCache = true;

      try {
        if (isCapacitor) {
          const plugin = await this.getNativeAudioPlugin();
          const before = await plugin.getCacheStatus();
          const after = await plugin.clearCache();
          this.updateTracksCache(after);
          this.showToast(
            this.$t('settings.cacheClearSuccess', {
              before: bytesToSize(before.bytes),
              after: bytesToSize(after.bytes),
            })
          );
          return;
        }
        const before = await countDBSize();
        const diskCacheApi = window.electronAPI?.cache;
        const shouldClearDiskCache = Boolean(diskCacheApi?.clearDiskCache);

        if (shouldClearDiskCache) {
          await clearAllDiskCache(() => diskCacheApi.clearDiskCache());
        } else {
          await clearDB();
        }

        const after = await countDBSize();
        this.updateTracksCache(after);
        console.info(
          `[track-cache] manual clear: ${before.bytes} -> ` +
            `${after.bytes} logical bytes`
        );
        this.showToast(
          this.$t('settings.cacheClearSuccess', {
            before: bytesToSize(before.bytes),
            after: bytesToSize(after.bytes),
          })
        );
      } catch (error) {
        console.error('[track-cache] manual clear failed', error);
        this.showToast(
          this.$t('settings.cacheClearFailed', {
            error: error?.message || String(error),
          })
        );
      } finally {
        this.clearingCache = false;
      }
    },
    isPluginEnabled(plugin) {
      const saved = this.settings.plugins?.[plugin.id];
      return saved?.enabled ?? plugin.enabledByDefault === true;
    },
    getPluginHealthMessage(plugin) {
      if (plugin.health?.setupError) {
        return `启动失败：${plugin.health.setupError}`;
      }
      if (plugin.health?.disposeError) {
        return `清理失败：${plugin.health.disposeError}`;
      }
      return '';
    },
    togglePlugin(plugin, enabled) {
      setPluginEnabled(this.$store, plugin.id, enabled);
      this.builtinPlugins = getBuiltinPlugins();
      if (window.yesplaymusicPluginContext) {
        syncPlugins(window.yesplaymusicPluginContext);
      }
      this.showToast('插件状态已保存，路由类插件刷新或重启后完全生效');
    },
    lastfmConnect() {
      lastfmAuth();
      clearInterval(this.lastfmChecker);
      this.lastfmChecker = setInterval(() => {
        const session = localStorage.getItem('lastfm');
        if (!session) return;
        this.$store.commit('updateLastfm', JSON.parse(session));
        clearInterval(this.lastfmChecker);
        this.lastfmChecker = null;
      }, 1000);
    },
    lastfmDisconnect() {
      localStorage.removeItem('lastfm');
      this.$store.commit('updateLastfm', {});
    },
    sendProxyConfig() {
      if (this.proxyProtocol === 'noProxy') return;
      const config = this.settings.proxyConfig;
      if (
        config.server === '' ||
        !config.port ||
        config.protocol === 'noProxy'
      ) {
        electronSettings?.removeProxy();
      } else {
        electronSettings?.setProxy(config);
      }
      this.showToast('已更新代理设置');
    },
    clickOutside() {
      this.exitRecordShortcut();
    },
    formatShortcut(shortcut) {
      if (typeof shortcut !== 'string' || shortcut === '') return '—';
      shortcut = shortcut
        .replaceAll('+', ' + ')
        .replace('Up', '↑')
        .replace('Down', '↓')
        .replace('Right', '→')
        .replace('Left', '←');
      if (this.settings.lang === 'zh-CN') {
        shortcut = shortcut.replace('Space', '空格');
      } else if (this.settings.lang === 'zh-TW') {
        shortcut = shortcut.replace('Space', '空白鍵');
      }
      if (isMac) {
        return shortcut
          .replace('CommandOrControl', '⌘')
          .replace('Command', '⌘')
          .replace('Alt', '⌥')
          .replace('Control', '⌃')
          .replace('Shift', '⇧');
      }
      return shortcut.replace('CommandOrControl', 'Ctrl');
    },
    readyToRecordShortcut(id, scope) {
      const shortcut = this.settings.shortcuts.find(item => item.id === id);
      if (
        !shortcut?.[scope]?.enabled ||
        (scope === 'global' && this.enableGlobalShortcut === false)
      ) {
        return;
      }
      this.shortcutInput = { id, scope, recording: true };
      this.recordedShortcut = [];
      electronSettings?.switchGlobalShortcutStatusTemporary('disable');
    },
    handleShortcutKeydown(e) {
      if (this.shortcutInput.recording === false) return;
      e.preventDefault();
      if (this.recordedShortcut.find(s => s.keyCode === e.keyCode)) return;
      this.recordedShortcut.push(e);
      if (
        (e.keyCode >= 65 && e.keyCode <= 90) || // A-Z
        (e.keyCode >= 48 && e.keyCode <= 57) || // 0-9
        (e.keyCode >= 112 && e.keyCode <= 123) || // F1-F12
        ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(e.key) || // Arrows
        validShortcutCodes.includes(e.key)
      ) {
        this.saveShortcut();
      }
    },
    handleShortcutKeyup(e) {
      if (this.recordedShortcut.find(s => s.keyCode === e.keyCode)) {
        this.recordedShortcut = this.recordedShortcut.filter(
          s => s.keyCode !== e.keyCode
        );
      }
    },
    saveShortcut() {
      const { id, scope } = this.shortcutInput;
      const payload = {
        accelerator: this.recordedShortcutComputed,
        id,
        scope,
      };
      this.$store.commit('updateShortcut', payload);
      electronSettings?.updateShortcut(payload);
      this.showToast('快捷键已保存');
      this.recordedShortcut = [];
    },
    exitRecordShortcut() {
      if (this.shortcutInput.recording === false) return;
      this.shortcutInput = { id: '', scope: '', recording: false };
      this.recordedShortcut = [];
      electronSettings?.switchGlobalShortcutStatusTemporary('enable');
    },
    updateShortcutEnabled(id, scope, enabled) {
      if (this.shortcutInput.id === id && this.shortcutInput.scope === scope) {
        this.exitRecordShortcut();
      }
      const payload = { enabled, id, scope };
      this.$store.commit('updateShortcut', payload);
      electronSettings?.updateShortcut(payload);
    },
    restoreDefaultShortcuts() {
      this.$store.commit('restoreDefaultShortcuts');
      electronSettings?.restoreDefaultShortcuts();
    },
  },
};
</script>

<style lang="scss" scoped>
.settings-page {
  display: flex;
  justify-content: center;
  margin-top: 32px;
}
.container {
  width: 720px;
  margin-top: 24px;
}

/* ===== 界面布局编辑器 ===== */
.layout-editor {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  min-width: 0;
}

.layout-block {
  padding: 6px;
  border: 1px solid rgba(128, 128, 128, 0.18);
  border-radius: 8px;
}

.layout-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;

  &.sub {
    padding-left: 22px;
    opacity: 0.92;
  }
}

.layout-subrows {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 4px;
}

.layout-btn {
  flex: 0 0 auto;
  min-width: 28px;
  height: 28px;
  padding: 0 6px;
  color: var(--color-text);
  border-radius: 6px;
  font-size: 14px;
  opacity: 0.68;

  &:hover:not(:disabled) {
    opacity: 1;
    background: var(--color-secondary-bg);
  }

  &:disabled {
    opacity: 0.25;
    cursor: default;
  }
}

.layout-name {
  flex: 0 0 auto;
  color: var(--color-text);
  font-size: 14px;
  font-weight: 600;
}

.layout-input {
  flex: 1;
  min-width: 0;
  height: 28px;
  padding: 0 8px;
  color: var(--color-text);
  background: var(--color-secondary-bg);
  border: none;
  border-radius: 6px;
  font-size: 13px;
}

.layout-toggle {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 4px;
  color: var(--color-text);
  font-size: 13px;
  opacity: 0.78;
  user-select: none;
}

.layout-add-row {
  display: flex;
  gap: 8px;
  margin-top: 2px;
}

.layout-add-select {
  max-width: 180px;
  height: 28px;
  color: var(--color-text);
  background: var(--color-secondary-bg);
  border: none;
  border-radius: 6px;
  font-size: 13px;
}

.settings-header {
  margin-bottom: 36px;
}

.settings-header h1 {
  margin: 0 0 18px;
  color: var(--color-text);
  font-size: 38px;
  line-height: 1.15;
}

.settings-section-nav {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 2px 2px 8px;
  scrollbar-width: none;
  scroll-snap-type: x proximity;
}

.settings-section-nav::-webkit-scrollbar {
  display: none;
}

.settings-section-nav button {
  flex: 0 0 auto;
  min-height: 34px;
  padding: 6px 12px;
  border: 1px solid rgba(128, 128, 128, 0.12);
  border-radius: 999px;
  background: var(--color-secondary-bg);
  color: var(--color-text);
  font-size: 13px;
  font-weight: 600;
  opacity: 0.72;
  scroll-snap-align: start;
  transition:
    color 0.2s,
    background-color 0.2s,
    opacity 0.2s;
}

.settings-section-nav button:hover,
.settings-section-nav button:focus-visible {
  transform: none;
  color: var(--color-primary);
  background: var(--color-primary-bg);
  opacity: 1;
}
h2 {
  margin-top: 48px;
  font-size: 36px;
  color: var(--color-text);
}

h3 {
  margin-top: 48px;
  padding-bottom: 12px;
  font-size: 26px;
  color: var(--color-text);
  border-bottom: 1px solid rgba(128, 128, 128, 0.18);
}

h1[id],
h3[id] {
  scroll-margin-top: 84px;
}

.user {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--color-secondary-bg);
  color: var(--color-text);
  padding: 16px 20px;
  border-radius: 16px;
  margin-bottom: 48px;
  img.avatar {
    border-radius: 50%;
    height: 64px;
    width: 64px;
  }
  img.cvip {
    height: 13px;
    margin-right: 4px;
  }
  .left {
    display: flex;
    align-items: center;
    .info {
      margin-left: 24px;
    }
    .nickname {
      font-size: 20px;
      font-weight: 600;
      margin-bottom: 2px;
    }
    .extra-info {
      font-size: 13px;
      .text {
        opacity: 0.68;
      }
      .vip {
        display: flex;
        align-items: center;
      }
    }
  }
  .right {
    .svg-icon {
      height: 18px;
      width: 18px;
      margin-right: 4px;
    }
    button {
      display: flex;
      align-items: center;
      font-size: 18px;
      font-weight: 600;
      text-decoration: none;
      border-radius: 10px;
      padding: 8px 12px;
      opacity: 0.68;
      color: var(--color-text);
      transition: 0.2s;
      margin: {
        right: 12px;
        left: 12px;
      }
      &:hover {
        opacity: 1;
        background: #eaeffd;
        color: #335eea;
      }
      &:active {
        opacity: 1;
        transform: scale(0.92);
        transition: 0.2s;
      }
    }
  }
}

.item {
  margin: 24px 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--color-text);

  .title {
    font-size: 16px;
    font-weight: 500;
    opacity: 0.78;
  }

  .description {
    font-size: 14px;
    margin-top: 0.5em;
    opacity: 0.7;
  }

  .plugin-meta {
    font-size: 13px;
    margin-top: 0.5em;
    opacity: 0.58;
  }

  .plugin-error {
    font-size: 13px;
    margin-top: 0.5em;
    color: #e04f5f;
  }
}

.cache-location {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;

  .path {
    max-width: 300px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
    font-weight: 500;
    opacity: 0.58;
  }
}

.cache-location-message {
  margin: 0 0 8px 0;
  word-break: break-all;
}

.cache-location-note,
.cache-location-warning {
  margin: 4px 0 0 0;
  font-size: 13px;
  opacity: 0.68;
}

.cache-location-warning {
  color: #d33a31;
  opacity: 0.9;
}

button.danger {
  color: #d33a31;
}

select {
  min-width: 192px;
  max-width: 600px;
  font-weight: 600;
  border: none;
  padding: 8px 12px 8px 12px;
  border-radius: 8px;
  color: var(--color-text);
  background: var(--color-secondary-bg);
  appearance: none;
  &:focus {
    outline: none;
    color: var(--color-primary);
    background: var(--color-primary-bg);
  }
}

button {
  color: var(--color-text);
  background: var(--color-secondary-bg);
  padding: 8px 12px 8px 12px;
  font-weight: 600;
  border-radius: 8px;
  transition: 0.2s;
  &:hover {
    transform: scale(1.06);
  }
  &:active {
    transform: scale(0.94);
  }
}

.desktop-lyrics-actions,
.desktop-lyrics-colors,
.desktop-lyrics-template-controls {
  display: flex;
  gap: 8px;
  align-items: center;
}

.desktop-lyrics-template-controls {
  flex-wrap: wrap;
  justify-content: flex-end;
}

.desktop-lyrics-template-controls input {
  width: 180px;
}

.desktop-lyrics-colors input {
  width: 42px;
  height: 34px;
  padding: 2px;
  border: 0;
  border-radius: 8px;
  background: var(--color-secondary-bg);
}

input.text-input.margin-right-0 {
  margin-right: 0;
}
input.text-input {
  background: var(--color-secondary-bg);
  border: none;
  margin-right: 22px;
  padding: 8px 12px 8px 12px;
  border-radius: 8px;
  color: var(--color-text);
  font-weight: 600;
  font-size: 16px;
}
input::-webkit-outer-spin-button,
input::-webkit-inner-spin-button {
  -webkit-appearance: none;
}
input[type='number'] {
  -moz-appearance: textfield;
}

.mcp-server-status {
  color: var(--color-text);
  font-size: 14px;
  opacity: 0.78;
  word-break: break-all;
}

#proxy-form,
#real-ip {
  display: flex;
  align-items: center;
}
#proxy-form.disabled,
#real-ip.disabled {
  opacity: 0.47;
  button:hover {
    transform: unset;
  }
}

#shortcut-table {
  font-size: 14px;
  /* border: 1px solid black; */
  user-select: none;
  color: var(--color-text);
  .row {
    display: flex;
  }
  .row.row-head {
    opacity: 0.58;
    font-size: 13px;
    font-weight: 500;
  }
  .col {
    min-width: 192px;
    padding: 8px;
    display: flex;
    align-items: center;
    /* border: 1px solid red; */
    &:first-of-type {
      padding-left: 0;
      min-width: 128px;
    }
  }
  .keyboard-input {
    font-weight: 600;
    background-color: var(--color-secondary-bg);
    padding: 8px 12px 8px 12px;
    border-radius: 0.5rem;
    min-width: 146px;
    min-height: 34px;
    box-sizing: border-box;
    &.active {
      color: var(--color-primary);
      background-color: var(--color-primary-bg);
    }
    &.disabled {
      cursor: default;
      opacity: 0.48;
    }
  }
  .shortcut-binding {
    display: flex;
    align-items: center;
    gap: 8px;
    input {
      accent-color: var(--color-primary);
      cursor: pointer;
      height: 16px;
      margin: 0;
      width: 16px;
      &:disabled {
        cursor: default;
      }
    }
  }
  .restore-default-shortcut {
    margin-top: 12px;
  }
  &.global-disabled {
    .row .col:last-child {
      opacity: 0.48;
    }
    .row.row-head .col:last-child {
      opacity: 1;
    }
  }
  &:focus {
    outline: none;
  }
}

.footer {
  text-align: center;
  margin-top: 6rem;
  color: var(--color-text);
  font-weight: 600;
  .author {
    font-size: 0.9rem;
  }
  .version {
    font-size: 0.88rem;
    opacity: 0.58;
    margin-top: -10px;
  }
}

.beforeAnimation {
  -webkit-transition: 0.2s cubic-bezier(0.24, 0, 0.5, 1);
  transition: 0.2s cubic-bezier(0.24, 0, 0.5, 1);
}
.afterAnimation {
  box-shadow:
    0 0 0 1px hsla(0, 0%, 0%, 0.1),
    0 4px 0px 0 hsla(0, 0%, 0%, 0.04),
    0 4px 9px hsla(0, 0%, 0%, 0.13),
    0 3px 3px hsla(0, 0%, 0%, 0.05);
  -webkit-transition: 0.35s cubic-bezier(0.54, 1.6, 0.5, 1);
  transition: 0.35s cubic-bezier(0.54, 1.6, 0.5, 1);
}
.toggle {
  margin: auto;
}
.toggle input {
  opacity: 0;
  position: absolute;
}
.toggle input + label {
  position: relative;
  display: inline-block;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
  -webkit-transition: 0.4s ease;
  transition: 0.4s ease;
  height: 32px;
  width: 52px;
  background: var(--color-secondary-bg);
  border-radius: 8px;
}
.toggle input + label:before {
  content: '';
  position: absolute;
  display: block;
  -webkit-transition: 0.2s cubic-bezier(0.24, 0, 0.5, 1);
  transition: 0.2s cubic-bezier(0.24, 0, 0.5, 1);
  height: 32px;
  width: 52px;
  top: 0;
  left: 0;
  border-radius: 8px;
}
.toggle input + label:after {
  content: '';
  position: absolute;
  display: block;
  box-shadow:
    0 0 0 1px hsla(0, 0%, 0%, 0.02),
    0 4px 0px 0 hsla(0, 0%, 0%, 0.01),
    0 4px 9px hsla(0, 0%, 0%, 0.08),
    0 3px 3px hsla(0, 0%, 0%, 0.03);
  -webkit-transition: 0.35s cubic-bezier(0.54, 1.6, 0.5, 1);
  transition: 0.35s cubic-bezier(0.54, 1.6, 0.5, 1);
  background: #fff;
  height: 20px;
  width: 20px;
  top: 6px;
  left: 6px;
  border-radius: 6px;
}
.toggle input:checked + label:before {
  background: var(--color-primary-gradient);
  -webkit-transition: width 0.2s cubic-bezier(0, 0, 0, 0.1);
  transition: width 0.2s cubic-bezier(0, 0, 0, 0.1);
}
.toggle input:checked + label:after {
  left: 26px;
}

@media (max-width: 768px) {
  .settings-page {
    margin-top: 8px;
  }

  .container {
    width: 100%;
    margin-top: 0;
  }
  .settings-header {
    margin-bottom: 28px;
  }

  .settings-header h1 {
    font-size: 32px;
  }

  .settings-section-nav {
    margin-right: -16px;
    padding-right: 16px;
  }

  h2 {
    margin-top: 24px;
    font-size: 30px;
  }

  h3 {
    margin-top: 36px;
    font-size: 22px;
  }

  .user {
    padding: 14px;
    margin-bottom: 32px;

    img.avatar {
      width: 50px;
      height: 50px;
    }

    .left .info {
      margin-left: 12px;
    }

    .right button {
      margin: 0;
      padding: 8px;
      font-size: 0;
    }
  }

  .item {
    align-items: flex-start;
    gap: 14px;

    > :first-child {
      min-width: 0;
      flex: 1;
    }
  }

  select {
    min-width: 118px;
    max-width: 46vw;
  }

  input.text-input {
    width: 46vw;
    margin-right: 0;
    box-sizing: border-box;
  }

  #proxy-form,
  #real-ip,
  .desktop-lyrics-actions,
  .desktop-lyrics-colors,
  .desktop-lyrics-template-controls {
    align-items: stretch;
    flex-direction: column;
  }

  #shortcut-table {
    overflow-x: auto;
  }
}
</style>
