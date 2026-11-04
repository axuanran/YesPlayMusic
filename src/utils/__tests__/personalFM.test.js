import { describe, expect, it } from 'vitest';
import {
  normalizePersonalFMOptions,
  normalizePersonalFMTracks,
  PERSONAL_FM_SCENES,
} from '../personalFM';
import en from '@/locale/lang/en';
import zhCN from '@/locale/lang/zh-CN';
import zhTW from '@/locale/lang/zh-TW';
import tr from '@/locale/lang/tr';

describe('personal roaming recommendations', () => {
  it('accepts scene selections and recovers invalid saved settings', () => {
    expect(normalizePersonalFMOptions('SCENE_RCMD', 'FOCUS')).toEqual({
      mode: 'SCENE_RCMD',
      submode: 'FOCUS',
    });
    expect(normalizePersonalFMOptions('obsolete', 'obsolete')).toEqual({
      mode: 'DEFAULT',
      submode: 'EXERCISE',
    });
  });

  it('deduplicates numeric and string IDs while supporting both track formats', () => {
    const album = { id: 4, picUrl: 'cover' };
    const artists = [{ id: 5 }];
    expect(
      normalizePersonalFMTracks(
        {
          data: [
            null,
            {},
            { id: 0 },
            { id: 1 },
            { id: '1' },
            { id: 2, al: album, ar: artists },
            { id: 3 },
          ],
        },
        ['3']
      )
    ).toEqual([
      { id: 1, album: {}, artists: [] },
      { id: 2, al: album, ar: artists, album, artists },
    ]);
  });

  it.each([
    undefined,
    {},
    { data: null },
    { data: {} },
    { code: 500, data: [{ id: 1 }] },
  ])('ignores malformed or failed responses', result => {
    expect(normalizePersonalFMTracks(result)).toEqual([]);
  });

  it.each([en, zhCN, zhTW, tr])(
    'has translated labels for all supported scenes',
    locale => {
      for (const scene of PERSONAL_FM_SCENES)
        expect(locale.roaming.scenes[scene]).toBeTruthy();
    }
  );
});
