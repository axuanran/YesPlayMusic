import { describe, expect, it } from 'vitest';
import { isDesktopLyricPlaceholder } from '../desktopLyricsText.js';

describe('desktop lyric placeholder filtering', () => {
  it.each([
    '纯音乐，请欣赏',
    '純音樂，請欣賞。',
    '此歌曲为没有填词的纯音乐，请您欣赏',
    '暂无歌词',
    '暫無歌詞，敬請欣賞',
    'Instrumental',
    'No lyrics',
    'Music only.',
  ])('identifies %s as a placeholder', value => {
    expect(isDesktopLyricPlaceholder(value)).toBe(true);
  });

  it.each([
    'Instrumental Love',
    '这不是一首纯音乐，请听我唱',
    'No lyrics could explain how I feel',
    '',
    null,
  ])('preserves real lyric content: %s', value => {
    expect(isDesktopLyricPlaceholder(value)).toBe(false);
  });
});
