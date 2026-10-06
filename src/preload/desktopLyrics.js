import { ipcRenderer } from 'electron';

let appliedSettings = { locked: true };
let opacityIndicatorTimer = null;
let activeResizePointerId = null;
let resizeMoveFrame = null;
let renderedLines = null;
let renderedActiveIndex = -2;
let userScrollUntil = 0;
const WHEEL_SEEK_STEP_SECONDS = 5;
// auto-follow stays paused this long after the user scrolls the lyric list
const USER_SCROLL_FOLLOW_PAUSE_MS = 3000;
const VERTICAL_ALIGNMENTS = Object.freeze({
  bottom: 'flex-end',
  center: 'center',
  top: 'flex-start',
});

const sendCommand = (type, value) => {
  const payload = value === undefined ? { type } : { type, value };
  ipcRenderer.send('desktop-lyrics:command', payload);
};

const setText = (id, value) => {
  const element = document.getElementById(id);
  if (element) element.textContent = typeof value === 'string' ? value : '';
};

const linesEqual = (left, right) => {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index++) {
    const a = left[index];
    const b = right[index];
    if (
      a?.time !== b?.time ||
      a?.content !== b?.content ||
      a?.translation !== b?.translation
    ) {
      return false;
    }
  }
  return true;
};

// The list carries one leading and one trailing spacer whose height tracks
// half of the viewport, so the first and the last lyric can be scrolled to
// the visual center instead of stopping at the top/bottom edge.
const ITEM_OFFSET = 1;

const updateLineSpacers = container => {
  // base the spacers on the viewport (#lyrics fills the window), not on the
  // container itself — otherwise short lists would keep growing their own
  // scroll height on every update
  const viewportHeight =
    container.parentElement?.clientHeight || container.clientHeight;
  const spacerHeight = `${Math.round(viewportHeight / 2)}px`;
  for (const spacer of container.querySelectorAll('.lyric-spacer')) {
    spacer.style.height = spacerHeight;
  }
};

const scrollActiveLineIntoView = (container, index) => {
  const item = container.children[index + ITEM_OFFSET];
  if (!item) return;
  const top = item.offsetTop - (container.clientHeight - item.offsetHeight) / 2;
  container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
};

// Only the center band of the list stays clickable (no-drag) so the window
// remains draggable near its edges; the band follows the scrolled position.
const CLICKABLE_BAND_RATIO = 0.5;
let dragZoneFrame = null;

const updateItemDragZones = container => {
  dragZoneFrame = null;
  if (!container) return;
  const clickableAllowed = appliedSettings.dragMode !== 'window';
  const height = container.clientHeight;
  const bandTop = ((1 - CLICKABLE_BAND_RATIO) / 2) * height;
  const bandBottom = bandTop + CLICKABLE_BAND_RATIO * height;
  for (const item of container.querySelectorAll('.lyric-item')) {
    const center = item.offsetTop - container.scrollTop + item.offsetHeight / 2;
    item.classList.toggle(
      'is-clickable',
      clickableAllowed && center >= bandTop && center <= bandBottom
    );
  }
};

const scheduleDragZoneUpdate = () => {
  if (dragZoneFrame !== null) return;
  dragZoneFrame = requestAnimationFrame(() =>
    updateItemDragZones(document.getElementById('lines'))
  );
};

// Multi-line mode renders the whole (bounded) lyric list and keeps the active
// line centered and highlighted as playback advances.
const renderLines = (lines, active) => {
  const container = document.getElementById('lines');
  if (!container || !Array.isArray(lines)) return;
  if (!linesEqual(lines, renderedLines)) {
    renderedLines = lines;
    renderedActiveIndex = -2;
    container.textContent = '';
    const fragment = document.createDocumentFragment();
    lines.forEach(line => {
      const item = document.createElement('div');
      item.className = 'lyric-item';
      item.dataset.time = String(Number(line?.time) || 0);
      const primary = document.createElement('div');
      primary.className = 'lyric-item-primary';
      primary.textContent =
        typeof line?.content === 'string' ? line.content : '';
      item.appendChild(primary);
      if (typeof line?.translation === 'string' && line.translation) {
        const secondary = document.createElement('div');
        secondary.className = 'lyric-item-secondary';
        secondary.textContent = line.translation;
        item.appendChild(secondary);
      }
      fragment.appendChild(item);
    });
    const topSpacer = document.createElement('div');
    topSpacer.className = 'lyric-spacer';
    const bottomSpacer = document.createElement('div');
    bottomSpacer.className = 'lyric-spacer';
    container.appendChild(topSpacer);
    container.appendChild(fragment);
    container.appendChild(bottomSpacer);
  }
  updateLineSpacers(container);
  const clamped =
    lines.length === 0 ? -1 : Math.max(-1, Math.min(active, lines.length - 1));
  if (renderedActiveIndex === clamped) return;
  if (
    renderedActiveIndex >= 0 &&
    container.children[renderedActiveIndex + ITEM_OFFSET]
  ) {
    container.children[renderedActiveIndex + ITEM_OFFSET].classList.remove(
      'is-active'
    );
  }
  if (clamped >= 0 && container.children[clamped + ITEM_OFFSET]) {
    container.children[clamped + ITEM_OFFSET].classList.add('is-active');
    // while the user is browsing the list, don't yank the scroll position
    // back on every line change
    if (Date.now() >= userScrollUntil) {
      scrollActiveLineIntoView(container, clamped);
    }
  }
  renderedActiveIndex = clamped;
  scheduleDragZoneUpdate();
};

const showOpacityIndicator = value => {
  const indicator = document.getElementById('opacity-indicator');
  if (!indicator) return;
  indicator.textContent = `背景 ${Math.round(value * 100)}%`;
  indicator.classList.add('is-visible');
  clearTimeout(opacityIndicatorTimer);
  opacityIndicatorTimer = setTimeout(() => {
    indicator.classList.remove('is-visible');
  }, 800);
};

const applySettings = settings => {
  if (!settings || typeof settings !== 'object') return;
  const previousOpacity = Number(appliedSettings.backgroundOpacity);
  appliedSettings = {
    ...appliedSettings,
    ...settings,
  };
  const root = document.documentElement;
  root.style.setProperty('--lyrics-font-size', `${settings.fontSize}px`);
  root.style.setProperty(
    '--lyrics-secondary-font-size',
    `${settings.secondaryFontSize}px`
  );
  root.style.setProperty('--lyrics-text-color', settings.textColor);
  root.style.setProperty('--lyrics-secondary-color', settings.secondaryColor);
  root.style.setProperty('--lyrics-text-align', settings.textAlign);
  root.style.setProperty(
    '--lyrics-vertical-align',
    VERTICAL_ALIGNMENTS[settings.verticalPosition] || VERTICAL_ALIGNMENTS.center
  );
  root.style.setProperty(
    '--lyrics-background-opacity',
    String(settings.backgroundOpacity)
  );
  const nextOpacity = Number(settings.backgroundOpacity);
  if (
    Number.isFinite(previousOpacity) &&
    Number.isFinite(nextOpacity) &&
    previousOpacity !== nextOpacity
  ) {
    showOpacityIndicator(nextOpacity);
  }
  document.body.classList.toggle('is-locked', settings.locked === true);
  document.body.classList.toggle(
    'hide-secondary',
    settings.showSecondary !== true
  );
  document.body.classList.toggle(
    'wrap-lines',
    settings.overflowMode === 'wrap'
  );
  setText('lock', settings.locked ? '解锁' : '锁定');
};

const applyState = payload => {
  if (!payload || typeof payload !== 'object') return;
  setText('play', payload.playing ? '暂停' : '播放');
  const repeatButton = document.getElementById('repeat');
  if (repeatButton) {
    repeatButton.classList.toggle('is-active', payload.repeatLyric === true);
  }
  if (payload.settings) applySettings(payload.settings);
  const lines = Array.isArray(payload.lines) ? payload.lines : [];
  const lineCount = Number(appliedSettings.lineCount) || 1;
  const multiLine = lineCount > 1 && lines.length > 0;
  document.body.classList.toggle('multi-line', multiLine);
  if (multiLine) {
    setText('line', '');
    setText('translation', '');
    renderLines(lines, Number.isInteger(payload.active) ? payload.active : -1);
  } else {
    setText('line', payload.line);
    setText('translation', payload.translation);
  }
  const volume = document.getElementById('volume');
  if (volume && Number.isFinite(payload.volume)) {
    volume.value = String(Math.round(payload.volume * 100));
  }
};

window.addEventListener('DOMContentLoaded', () => {
  for (const type of ['previous', 'play', 'next', 'lock', 'hide']) {
    document
      .getElementById(type)
      ?.addEventListener('click', () => sendCommand(type));
  }

  document.getElementById('repeat')?.addEventListener('click', () => {
    sendCommand('repeatLyricLine');
  });

  document.getElementById('settings')?.addEventListener('click', () => {
    sendCommand('openSettings');
  });
  document.getElementById('volume')?.addEventListener('input', event => {
    const value = Number(event.target.value) / 100;
    if (Number.isFinite(value)) sendCommand('setVolume', value);
  });
  document.getElementById('lines')?.addEventListener('click', event => {
    if (appliedSettings.locked === true) return;
    // in 'window' drag mode the lyrics are part of the drag surface
    if (appliedSettings.dragMode === 'window') return;
    const item = event.target?.closest?.('.lyric-item');
    // only lines inside the center band are clickable; the rest is a drag area
    if (!item || !item.classList?.contains?.('is-clickable')) return;
    const time = Number(item.dataset?.time);
    if (Number.isFinite(time) && time >= 0) sendCommand('seekTo', time);
  });
  document
    .getElementById('lines')
    ?.addEventListener('scroll', scheduleDragZoneUpdate, { passive: true });
  window.addEventListener(
    'wheel',
    event => {
      // Locked windows use setIgnoreMouseEvents(..., { forward: true }), so
      // wheel events still reach this page. They must be consumed entirely:
      // otherwise Ctrl+wheel (and trackpad pinch, which synthesizes Ctrl+
      // wheel) applies as PAGE ZOOM and the lyrics enlarge step by step —
      // even though the window was never touched — until they overflow the
      // window edges.
      if (appliedSettings.locked === true) {
        event.preventDefault();
        return;
      }
      const deltaY = Number(event.deltaY);
      if (!Number.isFinite(deltaY) || deltaY === 0) return;
      // 'classic' (default): plain wheel scrubs playback, Ctrl+wheel adjusts
      // the background opacity. 'scroll': a plain wheel over the multi-line
      // list scrolls it natively (browsing); everywhere else it behaves like
      // 'classic'.
      // preventDefault always runs for handled gestures: Chromium would
      // otherwise treat Ctrl+wheel (and trackpad pinch) as page zoom and
      // progressively enlarge the lyrics.
      const scrollMode = appliedSettings.wheelBehavior === 'scroll';
      if (scrollMode && !event.ctrlKey && event.target?.closest?.('#lines')) {
        // browsing: pause auto-follow for a few seconds so the list is not
        // yanked back to the active line on every line change
        userScrollUntil = Date.now() + USER_SCROLL_FOLLOW_PAUSE_MS;
        return;
      }
      event.preventDefault();
      if (event.ctrlKey) {
        sendCommand('adjustBackgroundOpacity', -deltaY);
      } else {
        sendCommand(
          'seek',
          deltaY > 0 ? WHEEL_SEEK_STEP_SECONDS : -WHEEL_SEEK_STEP_SECONDS
        );
      }
    },
    { capture: true, passive: false }
  );
  // no keyboard shortcut must be able to zoom the page either
  window.addEventListener('keydown', event => {
    if (event.ctrlKey && ['=', '-', '0'].includes(event.key)) {
      event.preventDefault();
    }
  });
  window.addEventListener('resize', () => {
    const container = document.getElementById('lines');
    if (container) updateLineSpacers(container);
    scheduleDragZoneUpdate();
  });
  document.addEventListener('pointerdown', event => {
    const handle = event.target?.closest?.('[data-resize-edge]');
    if (!handle || appliedSettings.locked === true || event.button !== 0) {
      return;
    }
    activeResizePointerId = event.pointerId;
    handle.setPointerCapture?.(event.pointerId);
    sendCommand('startResize', handle.dataset.resizeEdge);
    event.preventDefault();
    event.stopPropagation();
  });
  document.addEventListener('pointermove', event => {
    if (event.pointerId !== activeResizePointerId || resizeMoveFrame !== null) {
      return;
    }
    resizeMoveFrame = requestAnimationFrame(() => {
      resizeMoveFrame = null;
      sendCommand('moveResize');
    });
  });
  const endResize = event => {
    if (
      activeResizePointerId === null ||
      (event?.pointerId !== undefined &&
        event.pointerId !== activeResizePointerId)
    ) {
      return;
    }
    activeResizePointerId = null;
    if (resizeMoveFrame !== null) cancelAnimationFrame(resizeMoveFrame);
    resizeMoveFrame = null;
    sendCommand('endResize');
  };
  document.addEventListener('pointerup', endResize);
  document.addEventListener('pointercancel', endResize);
  window.addEventListener('blur', endResize);
  ipcRenderer.on('desktop-lyrics:render', (_event, payload) => {
    applyState(payload);
  });
  ipcRenderer.on('desktop-lyrics:settings', (_event, settings) => {
    applySettings(settings);
  });
  sendCommand('ready');
});
