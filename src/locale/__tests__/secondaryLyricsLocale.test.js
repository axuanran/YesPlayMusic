import { describe, expect, it } from 'vitest';
import en from '../lang/en.js';
import tr from '../lang/tr.js';
import zhCN from '../lang/zh-CN.js';
import zhTW from '../lang/zh-TW.js';

const locales = [en, tr, zhCN, zhTW];
const shortLabelKeys = [
  'secondaryLyricTranslationShort',
  'secondaryLyricPronunciationShort',
  'secondaryLyricHiddenShort',
];

describe('secondary lyric localization', () => {
  it('provides every display-mode label in each bundled locale', () => {
    locales.forEach(locale => {
      shortLabelKeys.forEach(key => {
        expect(locale.player[key]).toBeTruthy();
      });
    });
  });

  it('does not expose Chinese labels in the English locale', () => {
    shortLabelKeys.forEach(key => {
      expect(en.player[key]).not.toMatch(/[\u3400-\u9fff]/u);
    });
    expect(en.player).toMatchObject({
      secondaryLyricTranslationShort: 'TR',
      secondaryLyricPronunciationShort: 'PR',
      secondaryLyricHiddenShort: 'OFF',
    });
  });
});
