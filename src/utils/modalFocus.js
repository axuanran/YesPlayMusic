export const MODAL_FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function getModalFocusableElements(container) {
  if (!container) return [];
  return Array.from(
    container.querySelectorAll(MODAL_FOCUSABLE_SELECTOR)
  ).filter(
    element => !element.hidden && element.getAttribute('aria-hidden') !== 'true'
  );
}

export function trapModalTab(event, container, activeElement) {
  if (event.key !== 'Tab') return false;
  const focusable = getModalFocusableElements(container);
  if (focusable.length === 0) {
    event.preventDefault();
    container?.focus();
    return true;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (
    event.shiftKey &&
    (activeElement === first || !container.contains(activeElement))
  ) {
    event.preventDefault();
    last.focus();
    return true;
  }
  if (
    !event.shiftKey &&
    (activeElement === last || !container.contains(activeElement))
  ) {
    event.preventDefault();
    first.focus();
    return true;
  }
  return false;
}
