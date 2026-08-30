const RELEASES_URL = 'https://github.com/axuanran/YesPlayMusic/releases';

export async function showUpdateAvailableDialog({
  dialog,
  mainWindow,
  openExternal,
  version,
}) {
  try {
    const result = await dialog.showMessageBox(mainWindow, {
      title: `发现新版本 v${version}`,
      message: `发现新版本 v${version}`,
      detail: '是否前往 GitHub 下载新版本安装包？',
      buttons: ['下载', '取消'],
      cancelId: 1,
      defaultId: 0,
      type: 'question',
      noLink: true,
    });
    if (result.response !== 0) return false;
    await openExternal(RELEASES_URL);
    return true;
  } finally {
    if (mainWindow && !mainWindow.isDestroyed?.()) {
      mainWindow.setEnabled?.(true);
      mainWindow.focus?.();
    }
  }
}
