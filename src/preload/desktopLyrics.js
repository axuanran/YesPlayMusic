import { ipcRenderer } from 'electron';

const sendCommand = (type, value) => {
  const payload = value === undefined ? { type } : { type, value };
  ipcRenderer.send('desktop-lyrics:command', payload);
};

const setText = (id, value) => {
  const element = document.getElementById(id);
  if (element) element.textContent = typeof value === 'string' ? value : '';
};

const applySettings = settings => {
  if (!settings || typeof settings !== 'object') return;
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
    '--lyrics-background-opacity',
    String(settings.backgroundOpacity)
  );
  document.body.classList.toggle('is-locked', settings.locked === true);
  document.body.classList.toggle(
    'hide-secondary',
    settings.showSecondary !== true
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

  ipcRenderer.on('desktop-lyrics:render', (_event, payload) => {
    applyState(payload);
  });
  ipcRenderer.on('desktop-lyrics:settings', (_event, settings) => {
    applySettings(settings);
  });
  sendCommand('ready');
});
