import { describe, expect, it, vi } from 'vitest';
import { showUpdateAvailableDialog } from '../updateDialog.js';

const createWindow = () => ({
  focus: vi.fn(),
  isDestroyed: vi.fn(() => false),
  setEnabled: vi.fn(),
});

const expectRestored = window => {
  expect(window.setEnabled).toHaveBeenCalledWith(true);
  expect(window.focus).toHaveBeenCalledOnce();
};

describe('update available dialog', () => {
  it('parents the dialog and restores the window after cancellation', async () => {
    const mainWindow = createWindow();
    const dialog = {
      showMessageBox: vi.fn(async () => ({ response: 1 })),
    };
    const openExternal = vi.fn();

    await expect(
      showUpdateAvailableDialog({
        dialog,
        mainWindow,
        openExternal,
        version: '1.2.3',
      })
    ).resolves.toBe(false);

    expect(dialog.showMessageBox).toHaveBeenCalledWith(
      mainWindow,
      expect.objectContaining({ cancelId: 1, defaultId: 0 })
    );
    expect(openExternal).not.toHaveBeenCalled();
    expectRestored(mainWindow);
  });

  it('opens the release page only after download is selected', async () => {
    const mainWindow = createWindow();
    const dialog = {
      showMessageBox: vi.fn(async () => ({ response: 0 })),
    };
    const openExternal = vi.fn(async () => undefined);

    await expect(
      showUpdateAvailableDialog({
        dialog,
        mainWindow,
        openExternal,
        version: '1.2.3',
      })
    ).resolves.toBe(true);

    expect(openExternal).toHaveBeenCalledWith(
      'https://github.com/axuanran/YesPlayMusic/releases'
    );
    expectRestored(mainWindow);
  });

  it('restores the window when the dialog rejects', async () => {
    const mainWindow = createWindow();
    const error = new Error('dialog failed');
    const dialog = {
      showMessageBox: vi.fn(async () => {
        throw error;
      }),
    };

    await expect(
      showUpdateAvailableDialog({
        dialog,
        mainWindow,
        openExternal: vi.fn(),
        version: '1.2.3',
      })
    ).rejects.toBe(error);
    expectRestored(mainWindow);
  });
});
