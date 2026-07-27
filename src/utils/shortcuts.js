const createBinding = (accelerator, enabled = true) => ({
  accelerator,
  enabled,
});

const defaultShortcuts = [
  {
    id: 'play',
    name: '播放/暂停',
    local: createBinding('CommandOrControl+P'),
    global: createBinding('Alt+CommandOrControl+P'),
  },
  {
    id: 'next',
    name: '下一首',
    local: createBinding('CommandOrControl+Right'),
    global: createBinding('Alt+CommandOrControl+Right'),
  },
  {
    id: 'previous',
    name: '上一首',
    local: createBinding('CommandOrControl+Left'),
    global: createBinding('Alt+CommandOrControl+Left'),
  },
  {
    id: 'increaseVolume',
    name: '增加音量',
    local: createBinding('CommandOrControl+Up'),
    global: createBinding('Alt+CommandOrControl+Up'),
  },
  {
    id: 'decreaseVolume',
    name: '减少音量',
    local: createBinding('CommandOrControl+Down'),
    global: createBinding('Alt+CommandOrControl+Down'),
  },
  {
    id: 'like',
    name: '喜欢歌曲',
    local: createBinding('CommandOrControl+L'),
    global: createBinding('Alt+CommandOrControl+L'),
  },
  {
    id: 'repeat',
    name: '切换循环模式',
    local: createBinding('Alt+R'),
    global: createBinding('', false),
  },
  {
    id: 'shuffle',
    name: '切换随机播放',
    local: createBinding('Alt+S'),
    global: createBinding('', false),
  },
  {
    id: 'minimize',
    name: '隐藏/显示播放器',
    local: createBinding('CommandOrControl+M'),
    global: createBinding('Alt+CommandOrControl+M'),
  },
  {
    id: 'toggleDesktopLyrics',
    name: '显示/隐藏桌面歌词',
    local: createBinding('', false),
    global: createBinding('Alt+CommandOrControl+D', false),
  },
];

const normalizeBinding = (binding, legacyAccelerator, fallback) => {
  const source =
    binding && typeof binding === 'object' && !Array.isArray(binding)
      ? binding
      : {};
  const accelerator =
    typeof source.accelerator === 'string'
      ? source.accelerator
      : typeof legacyAccelerator === 'string'
        ? legacyAccelerator
        : fallback.accelerator;

  return {
    accelerator,
    enabled:
      typeof source.enabled === 'boolean' ? source.enabled : fallback.enabled,
  };
};

export function normalizeShortcuts(shortcuts) {
  const savedShortcuts = Array.isArray(shortcuts) ? shortcuts : [];

  return defaultShortcuts.map(fallback => {
    const saved = savedShortcuts.find(shortcut => shortcut?.id === fallback.id);
    return {
      id: fallback.id,
      name:
        typeof saved?.name === 'string' && saved.name
          ? saved.name
          : fallback.name,
      local: normalizeBinding(saved?.local, saved?.shortcut, fallback.local),
      global: normalizeBinding(
        saved?.global,
        saved?.globalShortcut,
        fallback.global
      ),
    };
  });
}

export function getShortcut(shortcuts, id) {
  return normalizeShortcuts(shortcuts).find(shortcut => shortcut.id === id);
}

export default defaultShortcuts;
