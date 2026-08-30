import { ipcRenderer } from 'electron';

let appliedSettings = { locked: true };
let opacityIndicatorTimer = null;
let activeResizePointerId = null;
let resizeMoveFrame = null;
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
  setText('line', payload.line);
  setText('translation', payload.translation);
  setText('play', payload.playing ? '暂停' : '播放');
  if (payload.settings) applySettings(payload.settings);
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

  document.getElementById('settings')?.addEventListener('click', () => {
    sendCommand('openSettings');
  });
  document.getElementById('volume')?.addEventListener('input', event => {
    const value = Number(event.target.value) / 100;
    if (Number.isFinite(value)) sendCommand('setVolume', value);
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
