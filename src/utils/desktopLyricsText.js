const PLACEHOLDER_PATTERNS = [
  /^(?:纯音乐|純音樂)[\s，,。.!！]*(?:请欣赏|請欣賞)?[\s。.!！]*$/u,
  /^此歌曲(?:为|為)(?:没有填词|沒有填詞)的(?:纯音乐|純音樂)[\s，,。.!！]*(?:请您欣赏|請您欣賞)[\s。.!！]*$/u,
  /^(?:暂无|暫無|无|無)(?:歌词|歌詞)(?:[\s，,。.!！]*(?:敬请欣赏|敬請欣賞))?[\s。.!！]*$/u,
  /^(?:instrumental|no lyrics|music only)[\s.!]*$/iu,
];

export function isDesktopLyricPlaceholder(value) {
  if (typeof value !== 'string') return false;
  const text = value.trim();
  return (
    text.length > 0 && PLACEHOLDER_PATTERNS.some(pattern => pattern.test(text))
  );
}
