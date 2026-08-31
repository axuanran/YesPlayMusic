export function getContextMenuTargetIndex(key, currentIndex, itemCount) {
  if (itemCount <= 0) return null;
  switch (key) {
    case 'ArrowDown':
      return currentIndex < 0 ? 0 : (currentIndex + 1) % itemCount;
    case 'ArrowUp':
      return currentIndex < 0
        ? itemCount - 1
        : (currentIndex - 1 + itemCount) % itemCount;
    case 'Home':
      return 0;
    case 'End':
      return itemCount - 1;
    default:
      return null;
  }
}
