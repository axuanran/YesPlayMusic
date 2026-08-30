import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ipcRenderer: {
    on: vi.fn(),
    send: vi.fn(),
  },
}));

vi.mock('electron', () => ({
  ipcRenderer: mocks.ipcRenderer,
}));

describe('desktop lyrics preload', () => {
  let bodyClasses;
  let documentListeners;
  let ipcListeners;
  let windowListeners;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    bodyClasses = new Set();
    documentListeners = new Map();
    ipcListeners = new Map();
    windowListeners = new Map();
    mocks.ipcRenderer.on.mockImplementation((channel, listener) => {
      ipcListeners.set(channel, listener);
    });

    vi.stubGlobal('document', {
      addEventListener: vi.fn((event, listener) => {
        documentListeners.set(event, listener);
      }),
      body: {
        classList: {
          toggle: (name, enabled) => {
            if (enabled) bodyClasses.add(name);
            else bodyClasses.delete(name);
          },
        },
      },
      documentElement: {
        style: { setProperty: vi.fn() },
      },
      getElementById: vi.fn(() => null),
    });
    vi.stubGlobal('window', {
      addEventListener: vi.fn((event, listener) => {
        windowListeners.set(event, listener);
      }),
    });
    vi.stubGlobal('requestAnimationFrame', vi.fn());
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    await import('../desktopLyrics');
    windowListeners.get('DOMContentLoaded')();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('routes an unlocked renderer wheel event to opacity adjustment', () => {
    ipcListeners.get('desktop-lyrics:settings')(
      {},
      {
        backgroundOpacity: 0.1,
        fontSize: 32,
        locked: false,
        overflowMode: 'ellipsis',
        secondaryColor: '#d6e0ff',
        secondaryFontSize: 18,
        showSecondary: true,
        textAlign: 'center',
        textColor: '#ffffff',
        verticalPosition: 'center',
      }
    );
    const event = { deltaY: -120, preventDefault: vi.fn() };

    windowListeners.get('wheel')(event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(mocks.ipcRenderer.send).toHaveBeenCalledWith(
      'desktop-lyrics:command',
      { type: 'adjustBackgroundOpacity', value: 120 }
    );
  });

  it('does not consume wheel input while the window is locked', () => {
    const event = { deltaY: -120, preventDefault: vi.fn() };

    windowListeners.get('wheel')(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(mocks.ipcRenderer.send).not.toHaveBeenCalledWith(
      'desktop-lyrics:command',
      expect.objectContaining({ type: 'adjustBackgroundOpacity' })
    );
  });
});
