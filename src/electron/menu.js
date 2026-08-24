import { normalizeShortcuts } from '@/utils/shortcuts';
import { showMainWindow } from './showMainWindow.js';
const { app, Menu } = require('electron');
// import { autoUpdater } from "electron-updater"
// const version = app.getVersion();

const isMac = process.platform === 'darwin';

export function createMenu(win, store, desktopLyrics) {
  const shortcuts = normalizeShortcuts(store.get('settings.shortcuts'));
  const accelerator = id => {
    const binding = shortcuts.find(shortcut => shortcut.id === id)?.local;
    return binding?.enabled ? binding.accelerator : undefined;
  };

  let menu = null;
  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { type: 'separator' },
              {
                label: 'Preferences...',
                accelerator: 'CmdOrCtrl+,',
                click: () => {
                  win.webContents.send('changeRouteTo', '/settings');
                },
                role: 'preferences',
              },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideothers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ]
      : []),
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        ...(isMac
          ? [
              { role: 'delete' },
              { role: 'selectAll' },
              { type: 'separator' },
              {
                label: 'Speech',
                submenu: [{ role: 'startspeaking' }, { role: 'stopspeaking' }],
              },
            ]
          : [{ role: 'delete' }, { type: 'separator' }, { role: 'selectAll' }]),
        {
          label: 'Search',
          accelerator: 'CmdOrCtrl+F',
          click: () => {
            win.webContents.send('search');
          },
        },
      ],
    },
    {
      label: 'Controls',
      submenu: [
        {
          label: 'Play',
          accelerator: accelerator('play'),
          click: () => {
            win.webContents.send('play');
          },
        },
        {
          label: 'Next',
          accelerator: accelerator('next'),
          click: () => {
            win.webContents.send('next');
          },
        },
        {
          label: 'Previous',
          accelerator: accelerator('previous'),
          click: () => {
            win.webContents.send('previous');
          },
        },
        {
          label: 'Increase Volume',
          accelerator: accelerator('increaseVolume'),
          click: () => {
            win.webContents.send('increaseVolume');
          },
        },
        {
          label: 'Decrease Volume',
          accelerator: accelerator('decreaseVolume'),
          click: () => {
            win.webContents.send('decreaseVolume');
          },
        },
        {
          label: 'Like',
          accelerator: accelerator('like'),
          click: () => {
            win.webContents.send('like');
          },
        },
        {
          label: 'Repeat',
          accelerator: accelerator('repeat'),
          click: () => {
            win.webContents.send('repeat');
          },
        },
        {
          label: 'Shuffle',
          accelerator: accelerator('shuffle'),
          click: () => {
            win.webContents.send('shuffle');
          },
        },
        { type: 'separator' },
        {
          label: 'Lock/Unlock Desktop Lyrics',
          accelerator: accelerator('toggleDesktopLyricsLocked'),
          click: () => desktopLyrics?.toggleLocked(),
        },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'close' },
        { role: 'minimize', accelerator: accelerator('minimize') },
        { role: 'zoom' },
        { role: 'reload' },
        { role: 'forcereload' },
        { role: 'toggledevtools' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(isMac
          ? [
              { type: 'separator' },
              { role: 'front' },
              { type: 'separator' },
              {
                role: 'window',
                id: 'window',
                label: 'XuMP',
                type: 'checkbox',
                checked: true,
                click: () => {
                  const current = menu.getMenuItemById('window');
                  if (current.checked === false) {
                    win.hide();
                  } else {
                    showMainWindow(win);
                  }
                },
              },
            ]
          : [{ role: 'close' }]),
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'GitHub',
          click: async () => {
            const { shell } = require('electron');
            await shell.openExternal(
              'https://github.com/axuanran/YesPlayMusic'
            );
          },
        },
        {
          label: 'Electron',
          click: async () => {
            const { shell } = require('electron');
            await shell.openExternal('https://electronjs.org');
          },
        },
        {
          label: '开发者工具',
          accelerator: 'F12',
          click: () => {
            win.webContents.openDevTools();
          },
        },
      ],
    },
  ];
  // for window
  // if (process.platform === "win32") {
  //   template.push({
  //     label: "Help",
  //     submenu: [
  //       {
  //         label: `Current version v${version}`,
  //         enabled: false,
  //       },
  //       {
  //         label: "Check for update",
  //         accelerator: "Ctrl+U",
  //         click: (item, focusedWindow) => {
  //           win = focusedWindow;
  //           updateSource = "menu";
  //           autoUpdater.checkForUpdates();
  //         },
  //       },
  //     ],
  //   });
  // }

  menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}
