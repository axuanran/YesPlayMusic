const finiteNumber = (value, fallback = 0) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function getContextMenuLayout({
  bottomInset = 0,
  margin = 8,
  menuHeight,
  menuWidth,
  topInset = 0,
  viewportHeight,
  viewportLeft = 0,
  viewportTop = 0,
  viewportWidth,
  x,
  y,
}) {
  const width = Math.max(0, finiteNumber(viewportWidth));
  const height = Math.max(0, finiteNumber(viewportHeight));
  const originLeft = finiteNumber(viewportLeft);
  const originTop = finiteNumber(viewportTop);
  const safeMargin = Math.max(0, finiteNumber(margin));
  const minLeft = originLeft + Math.min(safeMargin, width);
  const maxRight = Math.max(minLeft, originLeft + width - safeMargin);
  const minTop = Math.min(
    originTop + Math.max(0, finiteNumber(topInset)) + safeMargin,
    originTop + height
  );
  const maxBottom = Math.max(
    minTop,
    originTop + height - Math.max(0, finiteNumber(bottomInset)) - safeMargin
  );
  const maxWidth = Math.max(0, maxRight - minLeft);
  const maxHeight = Math.max(0, maxBottom - minTop);
  const renderedWidth = Math.min(
    Math.max(0, finiteNumber(menuWidth)),
    maxWidth
  );
  const renderedHeight = Math.min(
    Math.max(0, finiteNumber(menuHeight)),
    maxHeight
  );

  return {
    left: clamp(
      finiteNumber(x, minLeft),
      minLeft,
      Math.max(minLeft, maxRight - renderedWidth)
    ),
    maxHeight,
    maxWidth,
    top: clamp(
      finiteNumber(y, minTop),
      minTop,
      Math.max(minTop, maxBottom - renderedHeight)
    ),
  };
}
