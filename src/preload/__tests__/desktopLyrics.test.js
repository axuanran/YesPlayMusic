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

const unlockedSettings = {
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
};

describe('desktop lyrics preload', () => {
  let bodyClasses;
  let documentListeners;
  let elements;
  let ipcListeners;
  let windowListeners;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    bodyClasses = new Set();
    documentListeners = new Map();
    elements = new Map();
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
      getElementById: vi.fn(id => elements.get(id) ?? null),
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

  it('routes an unlocked Ctrl+wheel to opacity adjustment', () => {
    ipcListeners.get('desktop-lyrics:settings')({}, unlockedSettings);
    const event = {
      ctrlKey: true,
      deltaY: -120,
      preventDefault: vi.fn(),
      target: null,
    };

    windowListeners.get('wheel')(event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(mocks.ipcRenderer.send).toHaveBeenCalledWith(
      'desktop-lyrics:command',
      { type: 'adjustBackgroundOpacity', value: 120 }
    );
  });

  it('routes a plain wheel to playback seek in the default classic mode', () => {
    ipcListeners.get('desktop-lyrics:settings')({}, unlockedSettings);
    const overListTarget = {
      closest: selector => (selector === '#lines' ? {} : null),
    };
    const event = {
      deltaY: 120,
      preventDefault: vi.fn(),
      target: overListTarget,
    };

    windowListeners.get('wheel')(event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(mocks.ipcRenderer.send).toHaveBeenCalledWith(
      'desktop-lyrics:command',
      { type: 'seek', value: 5 }
    );
  });

  it('lets a plain wheel scroll the list natively in scroll mode', () => {
    ipcListeners.get('desktop-lyrics:settings')(
      {},
      { ...unlockedSettings, wheelBehavior: 'scroll' }
    );
    const overListTarget = {
      closest: selector => (selector === '#lines' ? {} : null),
    };
    const event = {
      deltaY: 120,
      preventDefault: vi.fn(),
      target: overListTarget,
    };

    windowListeners.get('wheel')(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(mocks.ipcRenderer.send).not.toHaveBeenCalledWith(
      'desktop-lyrics:command',
      expect.objectContaining({ type: 'seek' })
    );
  });

  it('keeps modifier combos working over the list in scroll mode', () => {
    ipcListeners.get('desktop-lyrics:settings')(
      {},
      { ...unlockedSettings, wheelBehavior: 'scroll' }
    );
    const overListTarget = {
      closest: selector => (selector === '#lines' ? {} : null),
    };

    // over the list a plain wheel browses; seeking uses the wheel elsewhere
    const seekEvent = {
      deltaY: -120,
      preventDefault: vi.fn(),
      target: null,
    };
    windowListeners.get('wheel')(seekEvent);
    expect(seekEvent.preventDefault).toHaveBeenCalledOnce();
    expect(mocks.ipcRenderer.send).toHaveBeenCalledWith(
      'desktop-lyrics:command',
      { type: 'seek', value: -5 }
    );

    const opacityEvent = {
      ctrlKey: true,
      deltaY: 120,
      preventDefault: vi.fn(),
      target: overListTarget,
    };
    windowListeners.get('wheel')(opacityEvent);
    expect(opacityEvent.preventDefault).toHaveBeenCalledOnce();
    expect(mocks.ipcRenderer.send).toHaveBeenCalledWith(
      'desktop-lyrics:command',
      { type: 'adjustBackgroundOpacity', value: -120 }
    );
  });

  it('swallows forwarded wheel input while locked without side effects', () => {
    // locked windows receive forwarded wheel events; the page must consume
    // them so Chromium cannot apply Ctrl+wheel as page zoom
    const event = { deltaY: -120, preventDefault: vi.fn() };

    windowListeners.get('wheel')(event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(mocks.ipcRenderer.send).not.toHaveBeenCalledWith(
      'desktop-lyrics:command',
      expect.objectContaining({ type: 'adjustBackgroundOpacity' })
    );
    expect(mocks.ipcRenderer.send).not.toHaveBeenCalledWith(
      'desktop-lyrics:command',
      expect.objectContaining({ type: 'seek' })
    );
  });

  it('blocks keyboard zoom shortcuts', () => {
    const event = { ctrlKey: true, key: '=', preventDefault: vi.fn() };

    windowListeners.get('keydown')(event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it('seeks to a lyric line when it is clicked while unlocked', () => {
    ipcListeners.get('desktop-lyrics:settings')({}, unlockedSettings);
    const lineListeners = new Map();
    const item = {
      dataset: { time: '42.5' },
      classList: { contains: () => true },
      closest: () => item,
    };
    elements.set('lines', {
      addEventListener: (event, listener) => {
        lineListeners.set(event, listener);
      },
    });

    // re-register listeners against the mocked #lines element
    windowListeners.get('DOMContentLoaded')();
    lineListeners.get('click')({ target: item });

    expect(mocks.ipcRenderer.send).toHaveBeenCalledWith(
      'desktop-lyrics:command',
      { type: 'seekTo', value: 42.5 }
    );
  });

  it('ignores clicks on lines outside the clickable center band', () => {
    ipcListeners.get('desktop-lyrics:settings')({}, unlockedSettings);
    const lineListeners = new Map();
    const item = {
      dataset: { time: '42.5' },
      classList: { contains: () => false },
      closest: () => item,
    };
    elements.set('lines', {
      addEventListener: (event, listener) => {
        lineListeners.set(event, listener);
      },
    });

    windowListeners.get('DOMContentLoaded')();
    lineListeners.get('click')({ target: item });

    expect(mocks.ipcRenderer.send).not.toHaveBeenCalledWith(
      'desktop-lyrics:command',
      expect.objectContaining({ type: 'seekTo' })
    );
  });

  it('ignores lyric line clicks in whole-window drag mode', () => {
    ipcListeners.get('desktop-lyrics:settings')(
      {},
      {
        ...unlockedSettings,
        dragMode: 'window',
      }
    );
    const lineListeners = new Map();
    const item = {
      dataset: { time: '42.5' },
      classList: { contains: () => true },
      closest: () => item,
    };
    elements.set('lines', {
      addEventListener: (event, listener) => {
        lineListeners.set(event, listener);
      },
    });

    windowListeners.get('DOMContentLoaded')();
    lineListeners.get('click')({ target: item });

    expect(mocks.ipcRenderer.send).not.toHaveBeenCalledWith(
      'desktop-lyrics:command',
      expect.objectContaining({ type: 'seekTo' })
    );
  });

  it('ignores lyric line clicks while locked', () => {
    const lineListeners = new Map();
    const item = {
      dataset: { time: '42.5' },
      classList: { contains: () => true },
      closest: () => item,
    };
    elements.set('lines', {
      addEventListener: (event, listener) => {
        lineListeners.set(event, listener);
      },
    });

    windowListeners.get('DOMContentLoaded')();
    lineListeners.get('click')({ target: item });

    expect(mocks.ipcRenderer.send).not.toHaveBeenCalledWith(
      'desktop-lyrics:command',
      expect.objectContaining({ type: 'seekTo' })
    );
  });

  it('sends the repeat-lyric-line command when the repeat button is clicked', () => {
    const repeatListeners = new Map();
    elements.set('repeat', {
      addEventListener: (event, listener) => {
        repeatListeners.set(event, listener);
      },
    });

    // re-register listeners against the mocked #repeat element
    windowListeners.get('DOMContentLoaded')();
    repeatListeners.get('click')();

    expect(mocks.ipcRenderer.send).toHaveBeenCalledWith(
      'desktop-lyrics:command',
      { type: 'repeatLyricLine' }
    );
  });

  it('marks the repeat button active while repeatLyric is on', () => {
    const classes = new Set();
    elements.set('repeat', {
      classList: {
        toggle: (name, enabled) => {
          if (enabled) classes.add(name);
          else classes.delete(name);
        },
      },
    });

    ipcListeners.get('desktop-lyrics:render')({}, { repeatLyric: true });
    expect(classes.has('is-active')).toBe(true);

    ipcListeners.get('desktop-lyrics:render')({}, { repeatLyric: false });
    expect(classes.has('is-active')).toBe(false);
  });
});
