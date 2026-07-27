import { globalShortcut } from 'electron';
import clc from 'cli-color';
import { normalizeShortcuts } from '@/utils/shortcuts';
import { showMainWindow } from './showMainWindow.js';

const log = text => {
  console.log(`${clc.blueBright('[globalShortcut.js]')} ${text}`);
};

const createHandlers = win => ({
  play: () => win.webContents.send('play'),
  next: () => win.webContents.send('next'),
  previous: () => win.webContents.send('previous'),
  increaseVolume: () => win.webContents.send('increaseVolume'),
  decreaseVolume: () => win.webContents.send('decreaseVolume'),
  like: () => win.webContents.send('like'),
  repeat: () => win.webContents.send('repeat'),
  shuffle: () => win.webContents.send('shuffle'),
  minimize: () => {
    if (win.isVisible()) {
      win.hide();
    } else {
      showMainWindow(win);
    }
  },
});

export function registerGlobalShortcuts(win, store) {
  globalShortcut.unregisterAll();

  if (store.get('settings.enableGlobalShortcut') === false) {
    log('global shortcuts disabled');
    return [];
  }

  const shortcuts = normalizeShortcuts(store.get('settings.shortcuts'));
  const handlers = createHandlers(win);
  const results = [];

  for (const shortcut of shortcuts) {
    const binding = shortcut.global;
    const handler = handlers[shortcut.id];
    if (!binding.enabled || !binding.accelerator || !handler) continue;

    let registered = false;
    try {
      registered = globalShortcut.register(binding.accelerator, handler);
    } catch (error) {
      log(
        `failed to register ${shortcut.id} (${binding.accelerator}): ${
          error?.message || error
        }`
      );
    }
    if (!registered) {
      log(`shortcut unavailable: ${shortcut.id} (${binding.accelerator})`);
    }
    results.push({
      accelerator: binding.accelerator,
      id: shortcut.id,
      registered,
    });
  }

  return results;
}
