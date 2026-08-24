/* global __static */
import path from 'path';
import { app, nativeImage, Tray, Menu, nativeTheme } from 'electron';
import { isLinux } from '@/utils/platform';
import { normalizeShortcuts } from '@/utils/shortcuts';
import { showMainWindow } from './showMainWindow.js';
import { getMenuIconFileName, resolveTrayIconTheme } from './trayIconTheme.js';

function createMenuIcon(name) {
  return nativeImage.createFromPath(
    path.join(
      __static,
      'img/icons',
      getMenuIconFileName(name, nativeTheme.shouldUseDarkColors)
    )
  );
}

function applyMenuState(contextMenu, isPlaying, isLiked) {
  contextMenu.getMenuItemById('play').visible = !isPlaying;
  contextMenu.getMenuItemById('pause').visible = isPlaying;
  contextMenu.getMenuItemById('like').visible = !isLiked;
  contextMenu.getMenuItemById('unlike').visible = isLiked;
}

function createMenuTemplate(win, store, desktopLyrics) {
  const shortcuts = normalizeShortcuts(store.get('settings.shortcuts'));
  const accelerator = id => {
    const binding = shortcuts.find(shortcut => shortcut.id === id)?.local;
    return binding?.enabled ? binding.accelerator : undefined;
  };

  return [
    {
      label: '打开主界面',
      click: () => {
        showMainWindow(win);
      },
    },
    {
      type: 'separator',
    },
    {
      label: '播放',
      icon: createMenuIcon('play'),
      click: () => {
        win.webContents.send('play');
      },
      id: 'play',
      accelerator: accelerator('play'),
    },
    {
      label: '暂停',
      icon: createMenuIcon('pause'),
      click: () => {
        win.webContents.send('play');
      },
      id: 'pause',
      visible: false,
      accelerator: accelerator('play'),
    },
    {
      label: '上一首',
      icon: createMenuIcon('left'),
      accelerator: accelerator('previous'),
      click: () => {
        win.webContents.send('previous');
      },
    },
    {
      label: '下一首',
      icon: createMenuIcon('right'),
      accelerator: accelerator('next'),
      click: () => {
        win.webContents.send('next');
      },
    },
    {
      label: '循环播放',
      icon: createMenuIcon('repeat'),
      accelerator: accelerator('repeat'),
      click: () => {
        win.webContents.send('repeat');
      },
    },
    {
      label: '加入喜欢',
      icon: createMenuIcon('like'),
      accelerator: accelerator('like'),
      click: () => {
        win.webContents.send('like');
      },
      id: 'like',
    },
    {
      label: '取消喜欢',
      icon: createMenuIcon('unlike'),
      accelerator: accelerator('like'),
      click: () => {
        win.webContents.send('like');
      },
      id: 'unlike',
      visible: false,
    },
    {
      label: '桌面歌词',
      submenu: [
        {
          label: '显示/隐藏桌面歌词',
          accelerator: accelerator('toggleDesktopLyrics'),
          click: () => desktopLyrics?.toggle(),
        },
        {
          label: '锁定/解锁桌面歌词',
          accelerator: accelerator('toggleDesktopLyricsLocked'),
          click: () => desktopLyrics?.toggleLocked(),
        },
      ],
    },
    {
      label: '退出',
      icon: createMenuIcon('exit'),
      accelerator: 'CmdOrCtrl+W',
      click: () => {
        app.exit();
      },
    },
  ];
}

// linux下托盘的实现方式比较迷惑
// right-click无法在linux下使用
// click在默认行为下会弹出一个contextMenu，里面的唯一选项才会调用click事件
// setContextMenu应该是目前唯一能在linux下使用托盘菜单api
// 但是无法区分鼠标左右键

// 发现openSUSE KDE环境可以区分鼠标左右键
// 添加左键支持
// 2022.05.17
class YPMTrayLinuxImpl {
  constructor(tray, win, emitter, store, desktopLyrics) {
    this.tray = tray;
    this.win = win;
    this.emitter = emitter;
    this.store = store;
    this.desktopLyrics = desktopLyrics;
    this.template = undefined;
    this.isPlaying = false;
    this.isLiked = false;
    this.rebuildContextMenu();
    this.handleEvents();
  }

  rebuildContextMenu() {
    // Linux 下鼠标左右键都可能呼出 contextMenu，
    // 因此菜单与单击事件都提供打开主界面的入口。
    this.template = createMenuTemplate(
      this.win,
      this.store,
      this.desktopLyrics
    );
    this.contextMenu = Menu.buildFromTemplate(this.template);
    applyMenuState(this.contextMenu, this.isPlaying, this.isLiked);
    this.tray.setContextMenu(this.contextMenu);
  }

  handleEvents() {
    this.tray.on('click', () => {
      showMainWindow(this.win);
    });

    this.emitter.on('updateTooltip', title => this.tray.setToolTip(title));
    this.emitter.on('updatePlayState', isPlaying => {
      this.isPlaying = isPlaying;
      applyMenuState(this.contextMenu, this.isPlaying, this.isLiked);
      this.tray.setContextMenu(this.contextMenu);
    });
    this.emitter.on('updateLikeState', isLiked => {
      this.isLiked = isLiked;
      applyMenuState(this.contextMenu, this.isPlaying, this.isLiked);
      this.tray.setContextMenu(this.contextMenu);
    });
    this.emitter.on('updateIcon', () => {
      this.updateIcon();
    });
    this.onNativeThemeUpdated = () => {
      this.rebuildContextMenu();
      this.updateIcon();
    };
    nativeTheme.on('updated', this.onNativeThemeUpdated);
    app.once('before-quit', () => {
      nativeTheme.removeListener('updated', this.onNativeThemeUpdated);
    });
  }

  updateIcon() {
    let trayIconSetting = this.store.get('settings.trayIconTheme') || 'auto';
    const iconTheme = resolveTrayIconTheme(
      trayIconSetting,
      nativeTheme.shouldUseDarkColors
    );

    let icon = nativeImage
      .createFromPath(path.join(__static, `img/icons/menu-${iconTheme}@88.png`))
      .resize({
        height: 20,
        width: 20,
      });

    this.tray.setImage(icon);
  }
}

class YPMTrayWindowsImpl {
  constructor(tray, win, emitter, store, desktopLyrics) {
    this.tray = tray;
    this.win = win;
    this.emitter = emitter;
    this.store = store;
    this.desktopLyrics = desktopLyrics;
    this.template = createMenuTemplate(win, store, desktopLyrics);

    this.isPlaying = false;
    this.curDisplayPlaying = false;

    this.isLiked = false;
    this.curDisplayLiked = false;

    this.rebuildContextMenu();
    this.handleEvents();
  }

  rebuildContextMenu() {
    this.template = createMenuTemplate(
      this.win,
      this.store,
      this.desktopLyrics
    );
    this.contextMenu = Menu.buildFromTemplate(this.template);
    applyMenuState(this.contextMenu, this.isPlaying, this.isLiked);
    this.curDisplayPlaying = this.isPlaying;
    this.curDisplayLiked = this.isLiked;
  }

  handleEvents() {
    this.tray.on('click', () => {
      showMainWindow(this.win);
    });

    this.tray.on('right-click', () => {
      if (this.isPlaying !== this.curDisplayPlaying) {
        this.curDisplayPlaying = this.isPlaying;
        this.contextMenu.getMenuItemById('play').visible = !this.isPlaying;
        this.contextMenu.getMenuItemById('pause').visible = this.isPlaying;
      }

      if (this.isLiked !== this.curDisplayLiked) {
        this.curDisplayLiked = this.isLiked;
        this.contextMenu.getMenuItemById('like').visible = !this.isLiked;
        this.contextMenu.getMenuItemById('unlike').visible = this.isLiked;
      }

      this.tray.popUpContextMenu(this.contextMenu);
    });

    this.emitter.on('updateTooltip', title => this.tray.setToolTip(title));
    this.emitter.on(
      'updatePlayState',
      isPlaying => (this.isPlaying = isPlaying)
    );
    this.emitter.on('updateLikeState', isLiked => (this.isLiked = isLiked));
    this.emitter.on('updateIcon', () => {
      this.updateIcon();
    });
    this.onNativeThemeUpdated = () => {
      this.rebuildContextMenu();
      this.updateIcon();
    };
    nativeTheme.on('updated', this.onNativeThemeUpdated);
    app.once('before-quit', () => {
      nativeTheme.removeListener('updated', this.onNativeThemeUpdated);
    });
  }

  updateIcon() {
    let trayIconSetting = this.store.get('settings.trayIconTheme') || 'auto';
    const iconTheme = resolveTrayIconTheme(
      trayIconSetting,
      nativeTheme.shouldUseDarkColors
    );

    let icon = nativeImage
      .createFromPath(path.join(__static, `img/icons/menu-${iconTheme}@88.png`))
      .resize({
        height: 20,
        width: 20,
      });

    this.tray.setImage(icon);
  }
}

export function createTray(win, eventEmitter, store, desktopLyrics) {
  let trayIconSetting = store.get('settings.trayIconTheme') || 'auto';
  const iconTheme = resolveTrayIconTheme(
    trayIconSetting,
    nativeTheme.shouldUseDarkColors
  );

  let icon = nativeImage
    .createFromPath(path.join(__static, `img/icons/menu-${iconTheme}@88.png`))
    .resize({
      height: 20,
      width: 20,
    });

  let tray = new Tray(icon);
  tray.setToolTip('XuMP');

  return isLinux
    ? new YPMTrayLinuxImpl(tray, win, eventEmitter, store, desktopLyrics)
    : new YPMTrayWindowsImpl(tray, win, eventEmitter, store, desktopLyrics);
}
