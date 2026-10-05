import { describe, expect, it } from 'vitest';
import {
  getDefaultUiLayout,
  HOME_WIDGET_DEFS,
  normalizeUiLayout,
  unassignedWidgets,
} from '../uiLayout';

describe('normalizeUiLayout', () => {
  it('returns defaults for undefined or invalid layouts', () => {
    const defaults = getDefaultUiLayout();
    expect(normalizeUiLayout(undefined)).toEqual(defaults);
    expect(normalizeUiLayout(null)).toEqual(defaults);
    expect(normalizeUiLayout('nope')).toEqual(defaults);
  });

  it('default layout contains every registered widget exactly once', () => {
    const layout = getDefaultUiLayout();
    const placed = new Set();
    for (const block of layout.home) {
      if (block.type === 'widget') placed.add(block.id);
      else block.widgets.forEach(id => placed.add(id));
    }
    layout.library.forEach(id => placed.add(id));
    const ids = HOME_WIDGET_DEFS.map(w => w.id);
    expect(placed.size).toBe(ids.length);
    ids.forEach(id => expect(placed.has(id)).toBe(true));
  });

  it('keeps user ordering and drops unknown widgets', () => {
    const layout = normalizeUiLayout({
      home: [
        { type: 'widget', id: 'toplists' },
        { type: 'widget', id: 'unknownWidget' },
        { type: 'widget', id: 'recommendPlaylist' },
      ],
      library: [],
    });
    expect(layout.home.map(b => (b.type === 'widget' ? b.id : null))).toEqual([
      'toplists',
      'recommendPlaylist',
    ]);
  });

  it('deduplicates widgets across sections and zones (first wins)', () => {
    const layout = normalizeUiLayout({
      home: [
        { type: 'widget', id: 'dailyTracks' },
        {
          type: 'section',
          id: 'forYou',
          title: '',
          widgets: ['dailyTracks', 'personalFM'],
        },
      ],
      library: ['personalFM', 'notACard'],
    });
    const homeWidgets = layout.home.flatMap(b =>
      b.type === 'widget' ? [b.id] : b.widgets
    );
    expect(homeWidgets).toEqual(['dailyTracks', 'personalFM']);
    // personalFM 已在首页出现，音乐库中不重复收录；非卡片不能进音乐库
    expect(layout.library).toEqual([]);
  });

  it('appends missing nav items and drops unknown ones', () => {
    const layout = normalizeUiLayout({
      nav: {
        position: 'bottom',
        items: [
          { id: 'library', visible: false, label: '我的' },
          { id: 'bogus' },
          { id: 'home', visible: true, label: '' },
          { id: 'home' },
        ],
      },
      home: [],
      library: [],
    });
    expect(layout.nav.position).toBe('bottom');
    expect(layout.nav.items.map(i => i.id)).toEqual([
      'library',
      'home',
      'explore',
      'streaming',
    ]);
    expect(layout.nav.items[0]).toEqual({
      id: 'library',
      visible: false,
      label: '我的',
    });
  });

  it('normalizes invalid position to top', () => {
    const layout = normalizeUiLayout({
      nav: { position: 'sideways', items: [] },
      home: [],
      library: [],
    });
    expect(layout.nav.position).toBe('top');
  });
});

describe('unassignedWidgets', () => {
  it('excludes widgets placed in home or library', () => {
    const layout = {
      home: [
        { type: 'widget', id: 'appleMusic' },
        {
          type: 'section',
          id: 'forYou',
          title: '',
          widgets: ['dailyTracks'],
        },
      ],
      library: ['personalFM'],
    };
    const rest = unassignedWidgets(layout).map(w => w.id);
    expect(rest).not.toContain('appleMusic');
    expect(rest).not.toContain('dailyTracks');
    expect(rest).not.toContain('personalFM');
    expect(rest).toContain('toplists');
  });
});
