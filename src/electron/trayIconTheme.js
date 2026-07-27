const MENU_ICON_NAMES = new Set([
  'play',
  'pause',
  'left',
  'right',
  'repeat',
  'like',
  'unlike',
  'exit',
]);

export function resolveTrayIconTheme(setting, shouldUseDarkColors) {
  if (setting === 'light' || setting === 'dark') return setting;
  return shouldUseDarkColors ? 'light' : 'dark';
}

export function getMenuIconFileName(name, shouldUseDarkColors) {
  if (!MENU_ICON_NAMES.has(name)) {
    throw new Error(`Unsupported tray menu icon: ${name}`);
  }
  return `${name}${shouldUseDarkColors ? '-dark' : ''}.png`;
}
