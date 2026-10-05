import cloneDeep from 'lodash/cloneDeep';

/**
 * 功能卡片注册表。
 * 每张卡片都是独立单元，可通过 设置 → 界面布局 放置到首页栏目或音乐库中。
 * nameKey 为 i18n 键；CARD 类型的卡片以卡片形式渲染（无标题行，如每日推荐/私人FM）。
 */
export const HOME_WIDGET_DEFS = [
  { id: 'appleMusic', nameKey: 'home.byAppleMusic' },
  { id: 'recommendPlaylist', nameKey: 'home.recommendPlaylist' },
  { id: 'podcasts', nameKey: 'podcast.title' },
  { id: 'dailyTracks', nameKey: 'home.dailyTracks', card: true },
  { id: 'personalFM', nameKey: 'home.personalFM', card: true },
  { id: 'recommendArtists', nameKey: 'home.recommendArtist' },
  { id: 'newAlbums', nameKey: 'home.newAlbum' },
  { id: 'toplists', nameKey: 'home.charts' },
];

/** 可以以卡片形态放到音乐库顶部的卡片 */
export const LIBRARY_CARD_IDS = HOME_WIDGET_DEFS.filter(w => w.card).map(
  w => w.id
);

export const NAV_ITEM_IDS = ['home', 'explore', 'library', 'streaming'];

export const DEFAULT_SECTION_ID = 'forYou';

export function getDefaultUiLayout() {
  return {
    nav: {
      position: 'top',
      items: NAV_ITEM_IDS.map(id => ({ id, visible: true, label: '' })),
    },
    home: [
      { type: 'widget', id: 'appleMusic' },
      { type: 'widget', id: 'recommendPlaylist' },
      { type: 'widget', id: 'podcasts' },
      {
        type: 'section',
        id: DEFAULT_SECTION_ID,
        title: '',
        widgets: ['dailyTracks', 'personalFM'],
      },
      { type: 'widget', id: 'recommendArtists' },
      { type: 'widget', id: 'newAlbums' },
      { type: 'widget', id: 'toplists' },
    ],
    library: [],
  };
}

const isNonEmptyString = value => typeof value === 'string' && value !== '';

function normalizeNav(rawNav) {
  const nav = {
    position: rawNav?.position === 'bottom' ? 'bottom' : 'top',
    items: [],
  };
  const seen = new Set();
  const rawItems = Array.isArray(rawNav?.items) ? rawNav.items : [];
  for (const raw of rawItems) {
    if (!raw || !NAV_ITEM_IDS.includes(raw.id) || seen.has(raw.id)) continue;
    seen.add(raw.id);
    nav.items.push({
      id: raw.id,
      visible: raw.visible !== false,
      label: isNonEmptyString(raw.label) ? raw.label : '',
    });
  }
  // 新版本新增的导航项自动补到末尾，保证一定存在
  for (const id of NAV_ITEM_IDS) {
    if (!seen.has(id)) nav.items.push({ id, visible: true, label: '' });
  }
  return nav;
}

function normalizeHome(rawHome) {
  const validWidgetIds = new Set(HOME_WIDGET_DEFS.map(w => w.id));
  const used = new Set();
  const home = [];
  const blocks = Array.isArray(rawHome) ? rawHome : [];
  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue;
    if (block.type === 'widget') {
      if (!validWidgetIds.has(block.id) || used.has(block.id)) continue;
      used.add(block.id);
      home.push({ type: 'widget', id: block.id });
    } else if (block.type === 'section') {
      const widgets = (
        Array.isArray(block.widgets) ? block.widgets : []
      ).filter(id => validWidgetIds.has(id) && !used.has(id));
      widgets.forEach(id => used.add(id));
      home.push({
        type: 'section',
        id: isNonEmptyString(block.id) ? block.id : `section-${home.length}`,
        title: typeof block.title === 'string' ? block.title : '',
        widgets,
      });
    }
  }
  return { home, used };
}

/**
 * 规范化用户保存的界面布局：
 * - 非法/未知的数据回退到默认值；
 * - 卡片去重（一张卡片只会出现在一个位置，先出现者生效）；
 * - 未出现在任何位置的卡片视为被用户移除，不再强制补回（恢复默认可找回）。
 */
export function normalizeUiLayout(layout) {
  const defaults = getDefaultUiLayout();
  if (!layout || typeof layout !== 'object') return defaults;

  const nav = normalizeNav(layout.nav);
  const { home, used } = normalizeHome(layout.home);

  const library = [];
  const rawLibrary = Array.isArray(layout.library) ? layout.library : [];
  for (const id of rawLibrary) {
    if (!LIBRARY_CARD_IDS.includes(id) || used.has(id)) continue;
    used.add(id);
    library.push(id);
  }

  return { nav, home, library };
}

/** 返回尚未被放置到首页/音乐库任何位置的卡片定义 */
export function unassignedWidgets(layout) {
  const normalized = normalizeUiLayout(layout);
  const used = new Set(normalized.library);
  for (const block of normalized.home) {
    if (block.type === 'widget') used.add(block.id);
    else block.widgets.forEach(id => used.add(id));
  }
  return HOME_WIDGET_DEFS.filter(w => !used.has(w.id));
}

export function cloneUiLayout(layout) {
  return cloneDeep(normalizeUiLayout(layout));
}
